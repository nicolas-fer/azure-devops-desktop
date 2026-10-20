// Tela Pull requests: lista do projeto ou de um repositório. Abas Meus/Ativos/Concluídos/Abandonados,
// faixa de zona por status (prZone), roxo para PR meu ou revisão pedida a mim, revisores com marca de voto.
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Plus } from 'lucide-react'
import {
  Avatar,
  Badge,
  Button,
  Code,
  Empty,
  ErrorBox,
  ExternalButton,
  IdCell,
  Loading,
  PageHeader,
  Select,
  Standings,
  Tabs,
  TimeAgo,
  Toolbar,
  ZoneStripe,
  useResizableColumns,
  type Column,
  type Zone
} from '@/components/ui'
import { adoList, seg, webUrl } from '@/lib/api'
import { isMe, useMe, useScope } from '@/lib/context'
import { prZone, voteLabel, voteZone } from '@/lib/zones'
import { useRepos, repoKey, repoPath, shortRef, type GitPullRequest, type PrReviewer } from './repoApi'
import { useReposBase } from './repoParts'

type Tab = 'meus' | 'ativos' | 'concluidos' | 'abandonados'

const TABS: { key: Tab; label: string }[] = [
  { key: 'meus', label: 'Meus' },
  { key: 'ativos', label: 'Ativos' },
  { key: 'concluidos', label: 'Concluídos' },
  { key: 'abandonados', label: 'Abandonados' }
]

const STATUS_OF: Record<Exclude<Tab, 'meus'>, string> = { ativos: 'active', concluidos: 'completed', abandonados: 'abandoned' }

const zoneOf = (p: GitPullRequest): Zone => prZone(p.status, p.isDraft, p.mergeStatus)

export function PullRequestsScreen() {
  const { org, project } = useScope()
  const { repo } = useParams()
  const base = useReposBase()
  const navigate = useNavigate()
  const me = useMe(org)
  const repos = useRepos(org, project)
  const [tab, setTab] = useState<Tab>('meus')
  const [zoneFilter, setZoneFilter] = useState<Zone | null>(null)

  const scopePath = repo ? repoPath(project, repo) : seg(project) + '/_apis/git'
  const meId = me.data?.id

  const prs = useQuery({
    queryKey: repoKey(org, project, 'prs', repo ?? 'all', tab, meId ?? ''),
    enabled: !!meId || tab !== 'meus',
    queryFn: async () => {
      const fetchPrs = (query: Record<string, string | number>) =>
        adoList<GitPullRequest>({ org, path: `${scopePath}/pullrequests`, query: { $top: 300, ...query } })
      if (tab === 'meus') {
        const [created, reviewing] = await Promise.all([
          fetchPrs({ 'searchCriteria.status': 'active', 'searchCriteria.creatorId': meId! }),
          fetchPrs({ 'searchCriteria.status': 'active', 'searchCriteria.reviewerId': meId! })
        ])
        const seen = new Set<number>()
        return [...created, ...reviewing].filter((p) => (seen.has(p.pullRequestId) ? false : (seen.add(p.pullRequestId), true)))
      }
      return fetchPrs({ 'searchCriteria.status': STATUS_OF[tab] })
    }
  })

  const rows = prs.data ?? []
  const mineOf = (p: GitPullRequest) => isMe(me.data, p.createdBy) || p.reviewers.some((r) => isMe(me.data, r))
  const shown = rows.filter((p) => !zoneFilter || zoneOf(p) === zoneFilter)
  const counts = (z: Zone) => rows.filter((p) => zoneOf(p) === z).length

  const columns: Column<GitPullRequest>[] = [
    {
      key: 'id',
      header: '!ID',
      align: 'right',
      width: 72,
      sortValue: (p) => p.pullRequestId,
      render: (p) => <IdCell>!{p.pullRequestId}</IdCell>
    },
    {
      key: 'title',
      header: 'Título',
      sortValue: (p) => p.title,
      render: (p) => (
        <span className="flex min-w-0 items-center gap-2">
          {p.isDraft && <Badge>rascunho</Badge>}
          <span className="truncate font-medium">{p.title}</span>
        </span>
      )
    },
    {
      key: 'repo',
      header: 'Repositório',
      width: 120,
      sortValue: (p) => p.repository.name,
      render: (p) => (
        <span className="block max-w-[120px] truncate text-muted" title={p.repository.name}>
          {p.repository.name}
        </span>
      )
    },
    {
      key: 'branches',
      header: 'Branches',
      // Fração da largura: cresce com a janela para mostrar nomes completos (ex.: feature/minha-equipe/ajuste-relatorio)
      width: '32%',
      render: (p) => {
        const src = shortRef(p.sourceRefName)
        const dst = shortRef(p.targetRefName)
        return (
          <span className="flex min-w-0 max-w-full items-center gap-1.5" title={`${src} → ${dst}`}>
            {/* Só encolhem quando falta espaço; a origem absorve quase todo o corte e o destino (curto, ex.: staging) fica inteiro */}
            <Code className="min-w-0 shrink truncate">{src}</Code>
            <span className="shrink-0 text-muted">→</span>
            <Code className="max-w-[60%] shrink-0 truncate">{dst}</Code>
          </span>
        )
      }
    },
    {
      key: 'author',
      header: 'Autor',
      width: 170,
      sortValue: (p) => p.createdBy.displayName,
      render: (p) => (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Avatar identity={p.createdBy} size={20} />
          <span className="truncate">{p.createdBy.displayName}</span>
        </span>
      )
    },
    {
      key: 'reviewers',
      header: 'Revisores',
      width: 96,
      render: (p) => {
        const visible = p.reviewers.slice(0, 4)
        const extra = p.reviewers.length - visible.length
        return (
          <span className="inline-flex items-center">
            <span className="inline-flex -space-x-1.5">
              {visible.map((r) => (
                <ReviewerDot key={r.id} r={r} />
              ))}
            </span>
            {extra > 0 && <span className="narrow ml-1.5 text-[12px] text-muted">+{extra}</span>}
          </span>
        )
      }
    },
    {
      key: 'updated',
      header: 'Atualizado',
      width: 112,
      sortValue: (p) => p.closedDate ?? p.creationDate,
      render: (p) => (
        <span className="narrow whitespace-nowrap text-muted">
          <TimeAgo date={p.closedDate ?? p.creationDate} />
        </span>
      )
    }
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Pull requests"
        subtitle={repo ?? 'Todos os repositórios'}
        actions={
          <>
            <Select
              aria-label="Repositório"
              className="h-6 w-56 text-[12px]"
              value={repo ?? ''}
              onChange={(e) => navigate(e.target.value ? `${base}/pullrequests/${seg(e.target.value)}` : `${base}/pullrequests`)}
            >
              <option value="">Todos os repositórios</option>
              {repos.data?.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </Select>
            <Button
              variant="primary"
              icon={<Plus className="size-3.5" />}
              disabled={!repo}
              title={repo ? undefined : 'Escolha um repositório para criar a PR'}
              onClick={() => navigate(`${base}/pullrequest/${seg(repo!)}/new`)}
            >
              Nova PR
            </Button>
            <ExternalButton url={webUrl(org, `${seg(project)}/_git/${repo ? seg(repo) : ''}/pullrequests`)} />
          </>
        }
      >
        <Tabs
          value={tab}
          onChange={(k) => {
            setTab(k)
            setZoneFilter(null)
          }}
          tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: t.key === tab && prs.data ? shown.length : undefined }))}
        />
      </PageHeader>
      <Toolbar className="py-2">
        <Standings
          items={[
            { key: 'progress', label: 'Ativos', zone: 'progress', count: counts('progress') },
            { key: 'fail', label: 'Conflito / falha', zone: 'fail', count: counts('fail') },
            { key: 'new', label: 'Rascunho', zone: 'new', count: counts('new') },
            { key: 'done', label: 'Concluídos', zone: 'done', count: counts('done') },
            { key: 'idle', label: 'Abandonados', zone: 'idle', count: counts('idle') }
          ]}
          value={zoneFilter}
          onSelect={setZoneFilter}
        />
      </Toolbar>
      <div className="scroll min-h-0 flex-1 overflow-auto">
        {(prs.isLoading || me.isLoading) && <Loading label="Carregando pull requests…" />}
        {prs.isError && <ErrorBox error={prs.error} onRetry={() => prs.refetch()} />}
        {me.isError && <ErrorBox error={me.error} onRetry={() => me.refetch()} />}
        {prs.data && shown.length === 0 && <Empty title={tab === 'meus' ? 'Nenhuma PR sua ou pedindo sua revisão' : 'Nenhuma pull request aqui'} />}
        {prs.data && shown.length > 0 && (
          <FixedTable
            rows={shown}
            columns={columns}
            rowKey={(p) => `${p.repository.id}-${p.pullRequestId}`}
            zone={zoneOf}
            mine={mineOf}
            onRowClick={(p) => navigate(`${base}/pullrequest/${seg(p.repository.name)}/${p.pullRequestId}`)}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Tabela com layout fixo (table-fixed): só a coluna de título ocupa a sobra e as demais têm largura enxuta,
 * então a lista nunca rola na horizontal. Mesmo visual da Table de ui.tsx (faixa de zona, linha de 32px).
 */
function FixedTable({
  rows,
  columns,
  rowKey,
  zone,
  mine,
  onRowClick
}: {
  rows: GitPullRequest[]
  columns: Column<GitPullRequest>[]
  rowKey: (r: GitPullRequest) => string | number
  zone: (r: GitPullRequest) => Zone
  mine: (r: GitPullRequest) => boolean
  onRowClick: (r: GitPullRequest) => void
}) {
  const rz = useResizableColumns('repos.pullrequests', columns, 6)
  return (
    <div className={clsx('bg-surface', rz.custom ? 'overflow-x-auto' : 'overflow-x-hidden')}>
      <table className={clsx('w-full table-fixed border-collapse text-sm', rz.custom && '[&_td]:overflow-hidden')} style={rz.tableStyle}>
        <thead className="sticky top-0 z-[1] bg-surface">
          <tr className="border-b-2 border-rule-strong">
            <th className="w-1.5 p-0" />
            {columns.map((c) => (
              <th
                key={c.key}
                data-col={c.key}
                style={{ width: rz.width(c.key) }}
                className={clsx('colhead relative h-8 overflow-visible px-3 font-semibold', c.align === 'right' ? 'text-right' : 'text-left')}
              >
                {c.header}
                {rz.handle(c.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={() => onRowClick(r)}
              className="h-8 cursor-pointer border-b border-border transition-colors duration-100 hover:bg-surface-2"
            >
              <td className="w-1.5 p-0">
                <span className="flex h-8">
                  <ZoneStripe zone={zone(r)} mine={mine(r)} />
                </span>
              </td>
              {columns.map((c) => (
                <td key={c.key} className={clsx('overflow-hidden px-3 py-1 align-middle', c.align === 'right' && 'text-right')}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Revisor: avatar com marca de voto (faixa de zona pequena na base). */
export function ReviewerDot({ r, size = 20 }: { r: PrReviewer; size?: number }) {
  const z = voteZone(r.vote)
  return (
    <span className="relative inline-flex" title={`${r.displayName} · ${voteLabel(r.vote)}${r.isRequired ? ' · obrigatório' : ''}`}>
      <Avatar identity={r} size={size} />
      <span className="absolute -bottom-0.5 -right-0.5 flex">
        <ZoneStripe zone={z} />
      </span>
    </span>
  )
}
