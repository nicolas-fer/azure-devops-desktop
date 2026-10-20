// Tela Branches: abas Minhas/Todas/Obsoletas; ahead/behind da default, PR associado, faixa de build
// (statuses do último commit), ações: nova branch, excluir, bloquear, comparar, criar PR e favoritar (local).
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { GitPullRequest as PrIcon, Lock, Unlock, Star, Trash2, GitCompare, Plus } from 'lucide-react'
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
  MineToggle,
  Modal,
  PageHeader,
  Select,
  Standings,
  Table,
  Tabs,
  Toolbar,
  TimeAgo,
  type Column,
  type Zone
} from '@/components/ui'
import { ado, adoList, seg, webUrl } from '@/lib/api'
import { isMe, useMe, useScope } from '@/lib/context'
import { RepoGate, RepoSwitcher, useRefs, useReposBase } from './repoParts'
import {
  ZERO,
  branchHead,
  firstLine,
  refName,
  repoKey,
  repoPath,
  shortHash,
  shortRef,
  updateRefs,
  setBranchLock,
  useAdoList,
  useRepoMutation,
  type GitBranchStat,
  type GitPullRequest,
  type GitRef,
  type GitRepo,
  type GitStatus
} from './repoApi'

const OBSOLETE_DAYS = 90
const FAV_KEY = 'devops-desktop:repos:favBranches'

type Tab = 'minhas' | 'todas' | 'obsoletas'

interface BranchRow {
  name: string
  objectId: string
  creator?: { id: string; displayName: string; uniqueName?: string }
  stat?: GitBranchStat
  pr?: GitPullRequest
  locked: boolean
  isDefault: boolean
  mine: boolean
  zone: Zone
  lastDate?: string
  stale: boolean
}

function readFavs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function BranchesScreen() {
  return <RepoGate>{(repo) => <BranchesView repo={repo} />}</RepoGate>
}

function BranchesView({ repo }: { repo: GitRepo }) {
  const { org, project } = useScope()
  const base = useReposBase()
  const navigate = useNavigate()
  const me = useMe(org)
  const [tab, setTab] = useState<Tab>('todas')
  const [zoneFilter, setZoneFilter] = useState<Zone | null>(null)
  const [mineOnly, setMineOnly] = useState(false)
  const [favs, setFavs] = useState<string[]>(readFavs)
  const [createOpen, setCreateOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareSel, setCompareSel] = useState('')
  const [target, setTarget] = useState<{ kind: 'delete' | 'lock'; row: BranchRow } | null>(null)
  const defaultBranch = (repo.defaultBranch ?? 'refs/heads/main').replace(/^refs\/heads\//, '')

  const refs = useRefs(org, project, repo.name, 'heads')
  const stats = useAdoList<GitBranchStat>(org, project, ['branch-stats', repo.name], {
    path: `${repoPath(project, repo.name)}/stats/branches`
  })
  const prs = useAdoList<GitPullRequest>(org, project, ['branch-prs', repo.name], {
    path: `${repoPath(project, repo.name)}/pullrequests`,
    query: { 'searchCriteria.status': 'active', $top: 500 }
  })

  const headsList = useMemo(() => refs.data ?? [], [refs.data])
  const statuses = useQueries({
    queries: headsList.slice(0, 80).map((r) => ({
      queryKey: repoKey(org, project, 'branch-status', repo.name, r.objectId),
      queryFn: () => adoList<GitStatus>({ org, path: `${repoPath(project, repo.name)}/commits/${r.objectId}/statuses` }),
      staleTime: 60_000
    }))
  })
  // Zona de build: pelos statuses do último commit de cada branch (sem status = idle).
  const statusByObj = new Map<string, Zone>()
  headsList.slice(0, 80).forEach((r, i) => {
    const s = statuses[i]?.data
    if (!s || s.length === 0) return
    const hasFail = s.some((x) => x.state === 'failure' || x.state === 'error')
    const hasPending = s.some((x) => x.state === 'pending')
    const allOk = s.every((x) => x.state === 'succeeded')
    statusByObj.set(r.objectId, hasFail ? 'fail' : hasPending ? 'progress' : allOk ? 'done' : 'idle')
  })

  const statBy = new Map((stats.data ?? []).map((s) => [s.name, s]))
  const prBy = new Map<string, GitPullRequest>()
  for (const p of prs.data ?? []) prBy.set(shortRef(p.sourceRefName), p)
  const now = Date.now()
  const rows: BranchRow[] = headsList.map((r) => {
    const short = shortRef(r.name)
    const stat = statBy.get(short)
    const lastDate = stat?.commit.committer.date
    const stale = !!lastDate && now - new Date(lastDate).getTime() > OBSOLETE_DAYS * 86400_000
    return {
      name: short,
      objectId: r.objectId,
      creator: r.creator,
      stat,
      pr: prBy.get(short),
      locked: !!r.isLocked,
      isDefault: short === defaultBranch,
      mine: isMe(me.data, r.creator ?? undefined),
      zone: statusByObj.get(r.objectId) ?? 'idle',
      lastDate,
      stale
    }
  })

  const tabRows = rows.filter((r) => (tab === 'minhas' ? r.mine : tab === 'obsoletas' ? r.stale : true))
  const shown = tabRows.filter((r) => (!zoneFilter || r.zone === zoneFilter) && (!mineOnly || r.mine))
  const counts = {
    fail: tabRows.filter((r) => r.zone === 'fail').length,
    progress: tabRows.filter((r) => r.zone === 'progress').length,
    done: tabRows.filter((r) => r.zone === 'done').length,
    idle: tabRows.filter((r) => r.zone === 'idle').length
  }

  const toggleFav = (name: string) => {
    const next = favs.includes(name) ? favs.filter((f) => f !== name) : [...favs, name]
    setFavs(next)
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(next))
    } catch {
      /* sem localStorage */
    }
  }

  const columns: Column<BranchRow>[] = [
    {
      key: 'name',
      header: 'Branch',
      sortValue: (r) => r.name,
      render: (r) => (
        <span className="inline-flex min-w-0 items-center gap-2">
          <button type="button" className="shrink-0 text-muted hover:text-fg" title="Favorita (local)" onClick={(e) => { e.stopPropagation(); toggleFav(r.name) }}>
            <Star className={`size-3.5 ${favs.includes(r.name) ? 'fill-current text-fg' : ''}`} />
          </button>
          <Code>{r.name}</Code>
          {r.isDefault && <span className="text-[11px] text-muted">padrão</span>}
          {r.locked && <Lock className="size-3 text-muted" aria-label="Bloqueada" />}
        </span>
      )
    },
    {
      key: 'last',
      header: 'Último commit',
      sortValue: (r) => r.lastDate ?? '',
      render: (r) => (
        <span className="block max-w-[320px] truncate text-muted" title={r.stat?.commit.comment}>
          {firstLine(r.stat?.commit.comment) || shortHash(r.objectId)}
        </span>
      )
    },
    {
      key: 'author',
      header: 'Autor',
      sortValue: (r) => r.stat?.commit.author.name ?? '',
      render: (r) =>
        r.stat ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Avatar name={r.stat.commit.author.name} size={18} />
            {r.stat.commit.author.name}
          </span>
        ) : null
    },
    {
      key: 'date',
      header: 'Atualizada',
      sortValue: (r) => r.lastDate ?? '',
      render: (r) => <span className="narrow whitespace-nowrap text-muted"><TimeAgo date={r.lastDate} /></span>
    },
    {
      key: 'ahead',
      header: 'Ahead / behind',
      align: 'right',
      sortValue: (r) => (r.stat?.aheadCount ?? 0) + (r.stat?.behindCount ?? 0),
      render: (r) =>
        r.isDefault ? (
          <span className="text-muted">—</span>
        ) : r.stat ? (
          <span className="narrow whitespace-nowrap">
            <span className="text-done-ink">+{r.stat.aheadCount}</span> <span className="text-fail-ink">−{r.stat.behindCount}</span>
          </span>
        ) : (
          <span className="text-muted">…</span>
        )
    },
    {
      key: 'pr',
      header: 'PR',
      render: (r) =>
        r.pr ? (
          <button
            type="button"
            className="narrow inline-flex items-center gap-1 font-semibold hover:underline"
            onClick={() => navigate(`${base}/pullrequest/${seg(repo.name)}/${r.pr!.pullRequestId}`)}
          >
            <PrIcon className="size-3.5" />!{r.pr.pullRequestId}
          </button>
        ) : (
          <span className="text-muted">—</span>
        )
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="ghost"
            icon={<GitCompare className="size-3.5" />}
            disabled={r.isDefault}
            onClick={() => { setCompareOpen(true); setCompareSel(r.name) }}
          >
            Comparar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={r.isDefault}
            onClick={() => navigate(`${base}/pullrequest/${seg(repo.name)}/new?source=${encodeURIComponent(r.name)}`)}
          >
            Criar PR
          </Button>
          <Button size="sm" variant="ghost" icon={r.locked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />} onClick={() => setTarget({ kind: 'lock', row: r })}>
            {r.locked ? 'Desbloquear' : 'Bloquear'}
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} disabled={r.isDefault} onClick={() => setTarget({ kind: 'delete', row: r })}>
            Excluir
          </Button>
        </div>
      )
    }
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Branches"
        subtitle={repo.name}
        actions={
          <>
            <RepoSwitcher screen="branches" repo={repo} />
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
              Nova branch
            </Button>
            <ExternalButton url={webUrl(org, `${seg(project)}/_git/${seg(repo.name)}/branches`)} />
          </>
        }
      >
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'minhas', label: 'Minhas', count: rows.filter((r) => r.mine).length },
            { key: 'todas', label: 'Todas', count: rows.length },
            { key: 'obsoletas', label: 'Obsoletas', count: rows.filter((r) => r.stale).length }
          ]}
        />
      </PageHeader>
      <Toolbar className="py-2">
        <Standings
          items={[
            { key: 'fail', label: 'Build com falha', zone: 'fail', count: counts.fail },
            { key: 'progress', label: 'Em execução', zone: 'progress', count: counts.progress },
            { key: 'done', label: 'Build ok', zone: 'done', count: counts.done },
            { key: 'idle', label: 'Sem build', zone: 'idle', count: counts.idle }
          ]}
          value={zoneFilter}
          onSelect={(k) => setZoneFilter(k)}
        />
        <div className="flex-1" />
        <MineToggle active={mineOnly} onChange={setMineOnly} label="Minhas" count={tabRows.filter((r) => r.mine).length} />
      </Toolbar>
      <div className="scroll min-h-0 flex-1 overflow-auto">
        {refs.isLoading || stats.isLoading ? (
          <Loading label="Carregando branches…" />
        ) : refs.isError ? (
          <ErrorBox error={refs.error} onRetry={() => refs.refetch()} />
        ) : stats.isError ? (
          <ErrorBox error={stats.error} onRetry={() => stats.refetch()} />
        ) : shown.length === 0 ? (
          <Empty title="Nenhuma branch nesta lista" />
        ) : (
          <Table<BranchRow>
            rows={shown}
            columns={columns}
            rowKey={(r) => r.name}
            zone={(r) => r.zone}
            mine={(r) => r.mine}
            className="h-full"
          />
        )}
      </div>
      <CreateBranchModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        org={org}
        project={project}
        repo={repo.name}
        branches={headsList}
        defaultBranch={defaultBranch}
      />
      <CompareModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        org={org}
        project={project}
        repo={repo.name}
        branches={headsList.map((r) => shortRef(r.name))}
        base={defaultBranch}
        target={compareSel}
        onTarget={setCompareSel}
      />
      <BranchActionModal
        target={target}
        onClose={() => setTarget(null)}
        org={org}
        project={project}
        repo={repo.name}
      />
    </div>
  )
}

function CreateBranchModal({
  open,
  onClose,
  org,
  project,
  repo,
  branches,
  defaultBranch
}: {
  open: boolean
  onClose: () => void
  org: string
  project: string
  repo: string
  branches: GitRef[]
  defaultBranch: string
}) {
  const [name, setName] = useState('')
  const [from, setFrom] = useState(defaultBranch)
  const [sha, setSha] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const create = useRepoMutation(org, project, async () => {
    const newObjectId = sha.trim() || (await branchHead(org, project, repo, from))
    if (!newObjectId) throw new Error('Base não encontrada.')
    return updateRefs(org, project, repo, [{ name: refName(name.trim()), oldObjectId: ZERO, newObjectId }])
  })
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova branch"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={create.isPending} disabled={!name.trim() || (!from && !sha.trim())} onClick={() => {
            setErr(null)
            create.mutate(undefined, {
              onSuccess: () => { setName(''); setSha(''); onClose() },
              onError: (e) => setErr(e instanceof Error ? e.message : String(e))
            })
          }}>
            Criar branch
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="feature/minha-branch" />
        </Field>
        <Field label="Base (branch)">
          <Select value={from} onChange={(e) => setFrom(e.target.value)} disabled={!!sha.trim()}>
            {branches.map((r) => (
              <option key={r.name} value={shortRef(r.name)}>
                {shortRef(r.name)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ou a partir de um commit" hint="Cole o hash completo do commit para usar como base.">
          <Input value={sha} onChange={(e) => setSha(e.target.value)} placeholder="40 caracteres" className="font-mono text-[12px]" />
        </Field>
        {err && <div className="text-[12px] text-fail-ink">{err}</div>}
      </div>
    </Modal>
  )
}

function CompareModal({
  open,
  onClose,
  org,
  project,
  repo,
  branches,
  base,
  target,
  onTarget
}: {
  open: boolean
  onClose: () => void
  org: string
  project: string
  repo: string
  branches: string[]
  base: string
  target: string
  onTarget: (v: string) => void
}) {
  const diff = useQuery({
    queryKey: repoKey(org, project, 'compare', repo, base, target),
    enabled: open && !!target,
    queryFn: () =>
      ado<{ changes: { changeType: string; item: { path: string } }[]; aheadCount: number; behindCount: number; changeCounts: Record<string, number> }>({
        org,
        path: `${repoPath(project, repo)}/diffs/commits`,
        query: {
          baseVersion: base,
          baseVersionType: 'branch',
          targetVersion: target,
          targetVersionType: 'branch',
          $top: 500
        }
      })
  })
  return (
    <Modal open={open} onClose={onClose} title={`Comparar ${target || '…'} com ${base}`} width={680}>
      <div className="flex flex-col gap-3">
        <Field label="Branch de destino">
          <Select value={target} onChange={(e) => onTarget(e.target.value)}>
            <option value="">Escolha uma branch</option>
            {branches
              .filter((b) => b !== base)
              .map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
          </Select>
        </Field>
        {diff.isLoading && target && <Loading label="Calculando diferenças…" />}
        {diff.isError && <ErrorBox error={diff.error} onRetry={() => diff.refetch()} />}
        {diff.data && (
          <>
            <div className="narrow text-[12px] text-muted">
              <span className="text-done-ink">+{diff.data.aheadCount} commits à frente</span> ·{' '}
              <span className="text-fail-ink">−{diff.data.behindCount} atrás</span>
            </div>
            <ul className="max-h-80 overflow-auto rounded-sm border border-border">
              {diff.data.changes.length === 0 && <li className="px-3 py-2 text-muted">Nenhuma diferença.</li>}
              {diff.data.changes.map((c) => (
                <li key={c.item.path} className="flex items-center gap-2 border-b border-border px-3 py-1 last:border-b-0">
                  <span className="narrow w-16 text-[11px] uppercase text-muted">{c.changeType}</span>
                  <span className="truncate font-mono text-[12px]">{c.item.path}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  )
}

function BranchActionModal({
  target,
  onClose,
  org,
  project,
  repo
}: {
  target: { kind: 'delete' | 'lock'; row: BranchRow } | null
  onClose: () => void
  org: string
  project: string
  repo: string
}) {
  const [err, setErr] = useState<string | null>(null)
  const act = useRepoMutation(org, project, async () => {
    if (!target) return
    const r = target.row
    if (target.kind === 'delete') {
      return updateRefs(org, project, repo, [{ name: refName(r.name), oldObjectId: r.objectId, newObjectId: ZERO }])
    }
    return setBranchLock(org, project, repo, r.name, !r.locked)
  })
  if (!target) return null
  const isDelete = target.kind === 'delete'
  return (
    <Modal
      open
      onClose={onClose}
      title={isDelete ? 'Excluir branch' : target.row.locked ? 'Desbloquear branch' : 'Bloquear branch'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant={isDelete ? 'danger' : 'primary'}
            loading={act.isPending}
            onClick={() => {
              setErr(null)
              act.mutate(undefined, {
                onSuccess: onClose,
                onError: (e) => setErr(e instanceof Error ? e.message : String(e))
              })
            }}
          >
            {isDelete ? 'Excluir' : target.row.locked ? 'Desbloquear' : 'Bloquear'}
          </Button>
        </>
      }
    >
      <p>
        {isDelete
          ? 'A branch será removida do repositório. Commits continuam acessíveis pelo hash.'
          : target.row.locked
            ? 'Qualquer um poderá enviar commits para esta branch.'
            : 'Ninguém poderá enviar commits para esta branch enquanto estiver bloqueada.'}
      </p>
      <p className="mt-2">
        Branch: <Code>{target.row.name}</Code>
      </p>
      {err && <div className="mt-2 text-[12px] text-fail-ink">{err}</div>}
    </Modal>
  )
}
