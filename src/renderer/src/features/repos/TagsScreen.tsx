// Tela Tags: tags anotadas e leves com commit, data e autor; criar (anotada ou leve) e excluir.
import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Trash2, Plus } from 'lucide-react'
import { Button, Code, Empty, ErrorBox, ExternalButton, Field, Input, Loading, Modal, PageHeader, Select, Table, TimeAgo, Badge, type Column } from '@/components/ui'
import { ado, seg, webUrl } from '@/lib/api'
import { useScope } from '@/lib/context'
import { RepoGate, RepoSwitcher, useRefs } from './repoParts'
import { ZERO, firstLine, refName, repoKey, repoPath, shortHash, shortRef, updateRefs, useRepoMutation, type GitCommit, type GitRef, type GitRepo } from './repoApi'

interface TagRow {
  name: string
  objectId: string
  commitId: string
  annotated: boolean
  commit?: GitCommit
}

export function TagsScreen() {
  return <RepoGate>{(repo) => <TagsView repo={repo} />}</RepoGate>
}

function TagsView({ repo }: { repo: GitRepo }) {
  const { org, project } = useScope()
  const tags = useRefs(org, project, repo.name, 'tags')
  const [createOpen, setCreateOpen] = useState(false)
  const [delTarget, setDelTarget] = useState<TagRow | null>(null)

  const list = tags.data ?? []
  const commitQueries = useQueries({
    queries: list.slice(0, 100).map((t) => {
      const commitId = t.peeledObjectId ?? t.objectId
      return {
        queryKey: repoKey(org, project, 'tag-commit', repo.name, commitId),
        queryFn: () => ado<GitCommit>({ org, path: `${repoPath(project, repo.name)}/commits/${commitId}` }),
        staleTime: 60_000
      }
    })
  })

  const rows: TagRow[] = useMemo(
    () =>
      list.map((t, i) => ({
        name: shortRef(t.name),
        objectId: t.objectId,
        commitId: t.peeledObjectId ?? t.objectId,
        annotated: !!t.peeledObjectId,
        commit: commitQueries[i]?.data
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list, commitQueries.map((q) => q.dataUpdatedAt).join()]
  )

  const columns: Column<TagRow>[] = [
    { key: 'name', header: 'Tag', sortValue: (r) => r.name, render: (r) => <Code>{r.name}</Code> },
    {
      key: 'type',
      header: 'Tipo',
      render: (r) => (r.annotated ? <Badge>anotada</Badge> : <Badge>leve</Badge>)
    },
    {
      key: 'commit',
      header: 'Commit',
      render: (r) => (
        <span className="inline-flex items-center gap-2">
          <Code>{shortHash(r.commitId)}</Code>
          <span className="max-w-[360px] truncate text-muted">{firstLine(r.commit?.comment)}</span>
        </span>
      )
    },
    {
      key: 'author',
      header: 'Autor',
      render: (r) => <span className="text-muted">{r.commit?.author.name ?? ''}</span>
    },
    {
      key: 'date',
      header: 'Data',
      sortValue: (r) => r.commit?.committer.date ?? '',
      render: (r) => <span className="narrow whitespace-nowrap text-muted"><TimeAgo date={r.commit?.committer.date} /></span>
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 className="size-3.5" />}
          onClick={(e) => {
            e.stopPropagation()
            setDelTarget(r)
          }}
        >
          Excluir
        </Button>
      )
    }
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Tags"
        subtitle={repo.name}
        actions={
          <>
            <RepoSwitcher screen="tags" repo={repo} />
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
              Nova tag
            </Button>
            <ExternalButton url={webUrl(org, `${seg(project)}/_git/${seg(repo.name)}/tags`)} />
          </>
        }
      />
      <div className="scroll min-h-0 flex-1 overflow-auto">
        {tags.isLoading ? (
          <Loading label="Carregando tags…" />
        ) : tags.isError ? (
          <ErrorBox error={tags.error} onRetry={() => tags.refetch()} />
        ) : rows.length === 0 ? (
          <Empty title="Nenhuma tag neste repositório" />
        ) : (
          <Table<TagRow> rows={rows} columns={columns} rowKey={(r) => r.name} />
        )}
      </div>
      <CreateTagModal open={createOpen} onClose={() => setCreateOpen(false)} org={org} project={project} repo={repo.name} />
      <DeleteTagModal target={delTarget} onClose={() => setDelTarget(null)} org={org} project={project} repo={repo.name} />
    </div>
  )
}

function CreateTagModal({
  open,
  onClose,
  org,
  project,
  repo
}: {
  open: boolean
  onClose: () => void
  org: string
  project: string
  repo: string
}) {
  const [name, setName] = useState('')
  const [from, setFrom] = useState('')
  const [sha, setSha] = useState('')
  const [message, setMessage] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const heads = useRefs(org, project, repo, 'heads')
  const create = useRepoMutation(org, project, async () => {
    let objectId = sha.trim()
    if (!objectId) {
      const ref = heads.data?.find((r: GitRef) => shortRef(r.name) === from)
      if (!ref) throw new Error('Escolha uma branch ou informe um commit.')
      objectId = ref.objectId
    }
    if (message.trim()) {
      return ado({
        org,
        method: 'POST',
        path: `${repoPath(project, repo)}/annotatedtags`,
        body: { name: name.trim(), taggedObject: { objectId }, message: message.trim() }
      })
    }
    return updateRefs(org, project, repo, [{ name: refName(name.trim(), 'tag'), oldObjectId: ZERO, newObjectId: objectId }])
  })
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova tag"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={create.isPending} disabled={!name.trim()} onClick={() => {
            setErr(null)
            create.mutate(undefined, {
              onSuccess: () => { setName(''); setMessage(''); setSha(''); onClose() },
              onError: (e) => setErr(e instanceof Error ? e.message : String(e))
            })
          }}>
            Criar tag
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="v1.2.0" />
        </Field>
        <Field label="Branch">
          <Select value={from} onChange={(e) => setFrom(e.target.value)} disabled={!!sha.trim()}>
            <option value="">Escolha…</option>
            {heads.data?.map((r) => (
              <option key={r.name} value={shortRef(r.name)}>
                {shortRef(r.name)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ou commit" hint="Hash completo do commit.">
          <Input value={sha} onChange={(e) => setSha(e.target.value)} className="font-mono text-[12px]" />
        </Field>
        <Field label="Mensagem" hint="Com mensagem, a tag é anotada. Sem mensagem, é leve.">
          <Input value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        {err && <div className="text-[12px] text-fail-ink">{err}</div>}
      </div>
    </Modal>
  )
}

function DeleteTagModal({ target, onClose, org, project, repo }: { target: TagRow | null; onClose: () => void; org: string; project: string; repo: string }) {
  const [err, setErr] = useState<string | null>(null)
  const del = useRepoMutation(org, project, async () => {
    if (!target) return
    return updateRefs(org, project, repo, [{ name: refName(target.name, 'tag'), oldObjectId: target.objectId, newObjectId: ZERO }])
  })
  if (!target) return null
  return (
    <Modal
      open
      onClose={onClose}
      title="Excluir tag"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="danger" loading={del.isPending} onClick={() => {
            setErr(null)
            del.mutate(undefined, { onSuccess: onClose, onError: (e) => setErr(e instanceof Error ? e.message : String(e)) })
          }}>
            Excluir
          </Button>
        </>
      }
    >
      <p>
        A tag <Code>{target.name}</Code> será removida do repositório.
      </p>
      {err && <div className="mt-2 text-[12px] text-fail-ink">{err}</div>}
    </Modal>
  )
}
