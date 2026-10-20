// Tela Pushes: lista de pushes com quem, quando, branches atualizadas e commits incluídos (expansível).
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Avatar, Button, Code, Empty, ErrorBox, ExternalButton, Input, Loading, PageHeader, TimeAgo, Toolbar, cx, formatDate, useResizableColumns } from '@/components/ui'
import { ado, adoList, seg, webUrl } from '@/lib/api'
import { useScope } from '@/lib/context'
import { RepoGate, RepoSwitcher } from './repoParts'
import { firstLine, repoKey, repoPath, shortHash, shortRef, type GitCommit, type GitPush, type GitRepo } from './repoApi'

const PAGE = 30

export function PushesScreen() {
  return <RepoGate>{(repo) => <PushesView repo={repo} />}</RepoGate>
}

function PushesView({ repo }: { repo: GitRepo }) {
  const { org, project } = useScope()
  const rz = useResizableColumns('repos.pushes', [{ key: 'id', width: 80 }, { key: 'who' }, { key: 'when' }, { key: 'branches' }], 32)
  const [branch, setBranch] = useState('')
  const [applied, setApplied] = useState('')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<number | null>(null)

  const pushes = useQuery({
    queryKey: repoKey(org, project, 'pushes', repo.name, applied, page),
    queryFn: () =>
      adoList<GitPush>({
        org,
        path: `${repoPath(project, repo.name)}/pushes`,
        query: {
          'searchCriteria.includeRefUpdates': true,
          'searchCriteria.refName': applied ? `refs/heads/${applied}` : undefined,
          $top: PAGE,
          $skip: page * PAGE
        }
      })
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Pushes"
        subtitle={repo.name}
        actions={
          <>
            <RepoSwitcher screen="pushes" repo={repo} />
            <ExternalButton url={webUrl(org, `${seg(project)}/_git/${seg(repo.name)}/pushes`)} />
          </>
        }
      />
      <Toolbar className="py-2">
        <Input
          className="h-7 w-64 font-mono text-[12px]"
          placeholder="Branch (ex.: develop)"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(0)
              setApplied(branch.trim())
            }
          }}
        />
        <Button size="sm" variant="primary" onClick={() => { setPage(0); setApplied(branch.trim()) }}>
          Filtrar
        </Button>
      </Toolbar>
      <div className="scroll min-h-0 flex-1 overflow-auto bg-surface">
        {pushes.isLoading ? (
          <Loading label="Carregando pushes…" />
        ) : pushes.isError ? (
          <ErrorBox error={pushes.error} onRetry={() => pushes.refetch()} />
        ) : pushes.data?.length === 0 ? (
          <Empty title="Nenhum push encontrado" />
        ) : (
          <table className={cx('w-full border-collapse text-sm', rz.custom && '[&_td]:overflow-hidden')} style={rz.tableStyle}>
            <thead className="sticky top-0 z-[1] bg-surface">
              <tr className="border-b-2 border-rule-strong">
                <th className="w-8" />
                <th data-col="id" style={{ width: rz.width('id') }} className="colhead relative h-8 overflow-visible w-20 px-3 text-right">ID{rz.handle('id')}</th>
                <th data-col="who" style={{ width: rz.width('who') }} className="colhead relative h-8 overflow-visible px-3 text-left">Quem{rz.handle('who')}</th>
                <th data-col="when" style={{ width: rz.width('when') }} className="colhead relative h-8 overflow-visible px-3 text-left">Quando{rz.handle('when')}</th>
                <th data-col="branches" style={{ width: rz.width('branches') }} className="colhead relative h-8 overflow-visible px-3 text-left">Branches atualizadas{rz.handle('branches')}</th>
              </tr>
            </thead>
            <tbody>
              {pushes.data?.map((p) => (
                <PushRow
                  key={p.pushId}
                  org={org}
                  project={project}
                  repo={repo.name}
                  push={p}
                  expanded={open === p.pushId}
                  onToggle={() => setOpen((o) => (o === p.pushId ? null : p.pushId))}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border bg-surface px-4 py-2">
        <span className="narrow text-[12px] text-muted">Página {page + 1}</span>
        <Button size="sm" variant="ghost" disabled={page === 0 || pushes.isFetching} onClick={() => setPage((p) => p - 1)}>
          Anterior
        </Button>
        <Button size="sm" variant="ghost" disabled={!pushes.data || pushes.data.length < PAGE || pushes.isFetching} onClick={() => setPage((p) => p + 1)}>
          Próxima
        </Button>
      </div>
    </div>
  )
}

function PushRow({
  org,
  project,
  repo,
  push,
  expanded,
  onToggle
}: {
  org: string
  project: string
  repo: string
  push: GitPush
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className="h-8 cursor-pointer border-b border-border hover:bg-surface-2" onClick={onToggle}>
        <td className="pl-2 text-muted">{expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</td>
        <td className="narrow px-3 text-right font-semibold">#{push.pushId}</td>
        <td className="px-3">
          <span className="inline-flex items-center gap-1.5">
            <Avatar identity={push.pushedBy} size={20} />
            {push.pushedBy.displayName}
          </span>
        </td>
        <td className="narrow px-3 whitespace-nowrap text-muted" title={formatDate(push.date)}>
          <TimeAgo date={push.date} />
        </td>
        <td className="px-3">
          <div className="flex flex-wrap gap-1">
            {push.refUpdates.map((r) => (
              <Code key={r.name}>{shortRef(r.name)}</Code>
            ))}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-surface-2">
          <td />
          <td colSpan={4} className="px-3 py-2">
            <PushCommits org={org} project={project} repo={repo} pushId={push.pushId} />
          </td>
        </tr>
      )}
    </>
  )
}

function PushCommits({ org, project, repo, pushId }: { org: string; project: string; repo: string; pushId: number }) {
  const detail = useQuery({
    queryKey: repoKey(org, project, 'push', repo, pushId),
    queryFn: () => ado<GitPush>({ org, path: `${repoPath(project, repo)}/pushes/${pushId}`, query: { includeCommits: 50 } })
  })
  if (detail.isLoading) return <Loading label="Carregando commits do push…" />
  if (detail.isError) return <ErrorBox error={detail.error} onRetry={() => detail.refetch()} />
  const commits: GitCommit[] = detail.data?.commits ?? []
  if (commits.length === 0) return <div className="text-muted">Nenhum commit neste push.</div>
  return (
    <ul className={cx('flex flex-col gap-1')}>
      {commits.map((c) => (
        <li key={c.commitId} className="flex items-center gap-3">
          <Code>{shortHash(c.commitId)}</Code>
          <span className="flex-1 truncate">{firstLine(c.comment)}</span>
          <span className="text-[12px] text-muted">{c.author.name}</span>
        </li>
      ))}
    </ul>
  )
}
