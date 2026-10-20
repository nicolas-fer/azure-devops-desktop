// Tela Commits: lista por branch com filtros e paginação; detalhe com metadados, pais,
// arquivos alterados, diff por arquivo (DiffViewer) e status de build vinculado.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, FilePlus, FileMinus, FilePen, File as FileIcon, Circle, CheckCircle2, XCircle } from 'lucide-react'
import {
  Avatar,
  Button,
  Code,
  Empty,
  ErrorBox,
  ExternalButton,
  Field,
  Input,
  Loading,
  PageHeader,
  Toolbar,
  Section,
  TimeAgo,
  cx,
  formatDate,
  useResizableColumns
} from '@/components/ui'
import { DiffViewer } from '@/components/CodeEditor'
import { ado, adoList, seg, webUrl } from '@/lib/api'
import { useScope } from '@/lib/context'
import { RepoGate, RepoSwitcher, VersionSelect, useVersion } from './repoParts'
import {
  firstLine,
  repoKey,
  repoPath,
  shortHash,
  versionQuery,
  versionToStr,
  type GitChange,
  type GitCommit,
  type GitRepo,
  type GitStatus,
  type Version
} from './repoApi'

const PAGE = 50

export function CommitsScreen() {
  return <RepoGate>{(repo) => <CommitsView repo={repo} />}</RepoGate>
}

function CommitsView({ repo }: { repo: GitRepo }) {
  const { org, project } = useScope()
  const rz = useResizableColumns('repos.commits', [
    { key: 'hash', width: 96 },
    { key: 'message' },
    { key: 'author', width: 192 },
    { key: 'date', width: 160 },
    { key: 'changes', width: 112 }
  ])
  const [params, setParams] = useSearchParams()
  const [version, setVersion] = useVersion(repo)
  const [author, setAuthor] = useState('')
  const [itemPath, setItemPath] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [applied, setApplied] = useState({ author: '', itemPath: '', from: '', to: '' })
  const [page, setPage] = useState(0)
  const selected = params.get('c')

  const commits = useQuery({
    queryKey: repoKey(org, project, 'commits', repo.name, versionToStr(version), applied, page),
    queryFn: () =>
      adoList<GitCommit>({
        org,
        path: `${repoPath(project, repo.name)}/commits`,
        query: {
          ...versionQuery(version, 'searchCriteria.itemVersion'),
          'searchCriteria.author': applied.author || undefined,
          'searchCriteria.itemPath': applied.itemPath || undefined,
          'searchCriteria.fromDate': applied.from ? new Date(applied.from + 'T00:00:00').toISOString() : undefined,
          'searchCriteria.toDate': applied.to ? new Date(applied.to + 'T23:59:59').toISOString() : undefined,
          $top: PAGE,
          $skip: page * PAGE
        }
      })
  })

  const select = (sha: string | null) => {
    const p = new URLSearchParams(params)
    if (sha) p.set('c', sha)
    else p.delete('c')
    setParams(p)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Commits"
        subtitle={repo.name}
        actions={
          <>
            <RepoSwitcher screen="commits" repo={repo} />
            <ExternalButton url={webUrl(org, `${seg(project)}/_git/${seg(repo.name)}/commits`)} />
          </>
        }
      >
        <div className="flex items-center gap-3 pb-2">
          <VersionSelect org={org} project={project} repo={repo.name} value={version} onChange={(v: Version) => { setVersion(v); setPage(0) }} />
        </div>
      </PageHeader>
      <Toolbar className="py-2">
        <Input className="h-7 w-44" placeholder="Autor" value={author} onChange={(e) => setAuthor(e.target.value)} />
        <Input className="h-7 w-56 font-mono text-[12px]" placeholder="Caminho (ex.: /src)" value={itemPath} onChange={(e) => setItemPath(e.target.value)} />
        <Field label="De" className="flex-row items-center gap-2">
          <Input type="date" className="h-7 w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Até" className="flex-row items-center gap-2">
          <Input type="date" className="h-7 w-36" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setPage(0)
            setApplied({ author: author.trim(), itemPath: itemPath.trim(), from, to })
          }}
        >
          Filtrar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setAuthor('')
            setItemPath('')
            setFrom('')
            setTo('')
            setPage(0)
            setApplied({ author: '', itemPath: '', from: '', to: '' })
          }}
        >
          Limpar
        </Button>
      </Toolbar>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="scroll min-h-0 flex-1 overflow-auto bg-surface">
            {commits.isLoading ? (
              <Loading label="Carregando commits…" />
            ) : commits.isError ? (
              <ErrorBox error={commits.error} onRetry={() => commits.refetch()} />
            ) : commits.data && commits.data.length === 0 ? (
              <Empty title="Nenhum commit encontrado" />
            ) : (
              <table className={cx('w-full border-collapse text-sm', rz.custom && '[&_td]:overflow-hidden')} style={rz.tableStyle}>
                <thead className="sticky top-0 z-[1] bg-surface">
                  <tr className="border-b-2 border-rule-strong">
                    <th data-col="hash" style={{ width: rz.width('hash') }} className="colhead relative h-8 overflow-visible w-24 px-3 text-left">Hash{rz.handle('hash')}</th>
                    <th data-col="message" style={{ width: rz.width('message') }} className="colhead relative h-8 overflow-visible px-3 text-left">Mensagem{rz.handle('message')}</th>
                    <th data-col="author" style={{ width: rz.width('author') }} className="colhead relative h-8 overflow-visible w-48 px-3 text-left">Autor{rz.handle('author')}</th>
                    <th data-col="date" style={{ width: rz.width('date') }} className="colhead relative h-8 overflow-visible w-40 px-3 text-left">Data{rz.handle('date')}</th>
                    <th data-col="changes" style={{ width: rz.width('changes') }} className="colhead relative h-8 overflow-visible w-28 px-3 text-right">Mudanças{rz.handle('changes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {commits.data?.map((c) => (
                    <tr
                      key={c.commitId}
                      onClick={() => select(c.commitId)}
                      className={cx('h-8 cursor-pointer border-b border-border hover:bg-surface-2', selected === c.commitId && 'bg-surface-2')}
                    >
                      <td className="px-3">
                        <Code>{shortHash(c.commitId)}</Code>
                      </td>
                      <td className="max-w-0 truncate px-3">{firstLine(c.comment)}</td>
                      <td className="px-3">
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <Avatar name={c.author.name} size={20} />
                          <span className="truncate">{c.author.name}</span>
                        </span>
                      </td>
                      <td className="narrow px-3 whitespace-nowrap text-muted">
                        <TimeAgo date={c.author.date} />
                      </td>
                      <td className="narrow px-3 text-right whitespace-nowrap text-[12px]">
                        <span className="text-done-ink">+{c.changeCounts?.Add ?? 0}</span>{' '}
                        <span className="text-progress-ink">~{c.changeCounts?.Edit ?? 0}</span>{' '}
                        <span className="text-fail-ink">−{c.changeCounts?.Delete ?? 0}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border bg-surface px-4 py-2">
            <span className="narrow text-[12px] text-muted">Página {page + 1}</span>
            <Button size="sm" variant="ghost" icon={<ChevronLeft className="size-3.5" />} disabled={page === 0 || commits.isFetching} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!commits.data || commits.data.length < PAGE || commits.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
        {selected && (
          <CommitDetail
            org={org}
            project={project}
            repo={repo.name}
            sha={selected}
            onClose={() => select(null)}
          />
        )}
      </div>
    </div>
  )
}

function CommitDetail({
  org,
  project,
  repo,
  sha,
  onClose
}: {
  org: string
  project: string
  repo: string
  sha: string
  onClose: () => void
}) {
  const [file, setFile] = useState<GitChange | null>(null)
  const commit = useQuery({
    queryKey: repoKey(org, project, 'commit', repo, sha),
    queryFn: () => ado<GitCommit>({ org, path: `${repoPath(project, repo)}/commits/${sha}` })
  })
  const changes = useQuery({
    queryKey: repoKey(org, project, 'commit-changes', repo, sha),
    queryFn: () => ado<{ changes: GitChange[]; changeCounts: Record<string, number> }>({ org, path: `${repoPath(project, repo)}/commits/${sha}/changes` })
  })
  const statuses = useQuery({
    queryKey: repoKey(org, project, 'commit-statuses', repo, sha),
    queryFn: () => adoList<GitStatus>({ org, path: `${repoPath(project, repo)}/commits/${sha}/statuses` })
  })
  const parent = commit.data?.parents?.[0]

  return (
    <aside className="flex w-[540px] shrink-0 flex-col overflow-hidden border-l border-border bg-surface">
      <div className="flex items-center gap-2 border-b-2 border-rule-strong px-4 py-2">
        <span className="colhead flex-1">Commit</span>
        <ExternalButton url={webUrl(org, `${seg(project)}/_git/${seg(repo)}/commit/${sha}`)} label="Abrir" />
        <Button size="sm" variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      </div>
      {commit.isLoading ? (
        <Loading />
      ) : commit.isError ? (
        <ErrorBox error={commit.error} onRetry={() => commit.refetch()} />
      ) : commit.data ? (
        <div className="scroll flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
          <div>
            <div className="text-base font-semibold whitespace-pre-wrap">{commit.data.comment}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <Code>{commit.data.commitId}</Code>
              <span>
                {commit.data.author.name} · {formatDate(commit.data.author.date)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[12px] text-muted">
              <span>Pais:</span>
              {commit.data.parents?.length ? commit.data.parents.map((p) => <Code key={p}>{shortHash(p)}</Code>) : <span>nenhum (commit inicial)</span>}
            </div>
          </div>

          <Section title="Status de build">
            {statuses.isLoading ? (
              <div className="px-3 py-2 text-muted">Carregando status…</div>
            ) : statuses.isError ? (
              <div className="px-3 py-2 text-[12px] text-muted">Status indisponível para este commit.</div>
            ) : statuses.data && statuses.data.length > 0 ? (
              <ul>
                {statuses.data.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 border-b border-border px-3 py-1.5 last:border-b-0">
                    <StatusIcon state={s.state} />
                    <span className="flex-1 truncate">{s.context?.name ?? s.description ?? 'Status'}</span>
                    <span className="text-[12px] text-muted">{s.description}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-3 py-2 text-[12px] text-muted">Nenhum status vinculado.</div>
            )}
          </Section>

          <Section
            title={`Arquivos alterados${changes.data ? ` · ${changes.data.changes.length}` : ''}`}
          >
            {changes.isLoading ? (
              <div className="px-3 py-2 text-muted">Carregando alterações…</div>
            ) : changes.isError ? (
              <ErrorBox error={changes.error} onRetry={() => changes.refetch()} />
            ) : (
              <ul>
                {changes.data?.changes.map((c) => (
                  <li key={c.item.path}>
                    <button
                      type="button"
                      onClick={() => setFile(c)}
                      className={cx(
                        'flex w-full items-center gap-2 border-b border-border px-3 py-1.5 text-left hover:bg-surface-2',
                        file?.item.path === c.item.path && 'bg-surface-2'
                      )}
                    >
                      <ChangeIcon type={c.changeType} />
                      <span className="flex-1 truncate font-mono text-[12px]">{c.item.path}</span>
                      <span className="text-[11px] text-muted">{c.changeType}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {file && (
            <FileDiff org={org} project={project} repo={repo} commitId={sha} parentId={parent} change={file} />
          )}
        </div>
      ) : null}
    </aside>
  )
}

function FileDiff({
  org,
  project,
  repo,
  commitId,
  parentId,
  change
}: {
  org: string
  project: string
  repo: string
  commitId: string
  parentId?: string
  change: GitChange
}) {
  const path = change.item.path
  const original = useQuery({
    queryKey: repoKey(org, project, 'diff-orig', repo, parentId ?? 'none', path),
    enabled: change.changeType !== 'add' && !!parentId,
    queryFn: () => fileText(org, project, repo, path, { type: 'commit', name: parentId! })
  })
  const modified = useQuery({
    queryKey: repoKey(org, project, 'diff-mod', repo, commitId, path),
    enabled: change.changeType !== 'delete',
    queryFn: () => fileText(org, project, repo, path, { type: 'commit', name: commitId })
  })
  if (original.isLoading || modified.isLoading) return <Loading label="Carregando diff…" />
  if (original.isError) return <ErrorBox error={original.error} />
  if (modified.isError) return <ErrorBox error={modified.error} />
  return (
    <Section title={<span className="font-mono normal-case">{path}</span>}>
      <div className="h-96">
        <DiffViewer original={original.data ?? ''} modified={modified.data ?? ''} path={path} sideBySide={false} />
      </div>
    </Section>
  )
}

/** Conteúdo de texto de um arquivo numa versão. Arquivo inexistente vira string vazia. */
export async function fileText(org: string, project: string, repo: string, path: string, v: Version): Promise<string> {
  try {
    const d = await ado<{ content?: string }>({
      org,
      path: `${repoPath(project, repo)}/items`,
      query: { path, includeContent: true, ...versionQuery(v) }
    })
    return d.content ?? ''
  } catch {
    return ''
  }
}

function ChangeIcon({ type }: { type: string }) {
  if (type.includes('add')) return <FilePlus className="size-3.5 text-done-ink" />
  if (type.includes('delete')) return <FileMinus className="size-3.5 text-fail-ink" />
  if (type.includes('edit')) return <FilePen className="size-3.5 text-progress-ink" />
  return <FileIcon className="size-3.5 text-muted" />
}

function StatusIcon({ state }: { state: string }) {
  if (state === 'succeeded') return <CheckCircle2 className="size-3.5 text-done-ink" />
  if (state === 'failure' || state === 'error') return <XCircle className="size-3.5 text-fail-ink" />
  return <Circle className="size-3.5 text-progress-ink" />
}

