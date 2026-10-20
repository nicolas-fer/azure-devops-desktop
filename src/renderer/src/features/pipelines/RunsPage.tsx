// Execuções de um pipeline (rota list/:definitionId): abas Execuções, Branches e Análise, no layout da tabela de classificação.
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { GitBranch, Pencil, Play } from 'lucide-react'
import {
  Avatar,
  Button,
  Code,
  Empty,
  ErrorBox,
  ExternalButton,
  IdCell,
  Loading,
  MineToggle,
  PageHeader,
  Select,
  Standings,
  StateLabel,
  Table,
  Tabs,
  Toolbar,
  TimeAgo,
  cx,
  type Column,
  type Zone
} from '@/components/ui'
import { useScope, isMe, useMe } from '@/lib/context'
import { useInView } from './common'
import { useBuildsPaged, useBuildsWindow, useDefinition, useTimeline } from './queries'
import { RunPipelineModal } from './RunPipelineModal'
import {
  commitMessage,
  definitionWebUrl,
  folderLabel,
  formatMs,
  isRunning,
  median,
  pipelinesBase,
  recordStateLabel,
  recordZone,
  runDurationMs,
  runStateLabel,
  runZone,
  sha7,
  shortRef,
  zoneBgFor
} from './lib'
import type { Build, TimelineRecord } from './types'

type MainTab = 'runs' | 'branches' | 'analytics'
type StatusKey = '' | 'succeeded' | 'failed' | 'inProgress' | 'canceled'

const STATUS_LABEL: Record<Exclude<StatusKey, ''>, string> = {
  succeeded: 'Sucesso',
  failed: 'Falhou',
  inProgress: 'Em execução',
  canceled: 'Cancelado'
}
const STATUS_ZONE: Record<Exclude<StatusKey, ''>, Zone> = { succeeded: 'done', failed: 'fail', inProgress: 'progress', canceled: 'idle' }

const DAY = 864e5
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function RunsPage() {
  const { definitionId } = useParams()
  const id = Number(definitionId)
  const { org, project } = useScope()
  const base = pipelinesBase(org, project)
  const navigate = useNavigate()
  const me = useMe(org)

  const def = useDefinition(org, project, id)
  const [tab, setTab] = useState<MainTab>('runs')
  const [status, setStatus] = useState<StatusKey>('')
  const [branch, setBranch] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [execOpen, setExecOpen] = useState(false)

  const requestedFor = mineOnly && me.data ? me.data.uniqueName || me.data.displayName : undefined
  const serverStatus = status === 'inProgress' ? { statusFilter: 'inProgress' } : status ? { resultFilter: status } : {}
  const paged = useBuildsPaged(org, project, { definitionId: id, branch: branch || undefined, requestedFor, ...serverStatus })
  const win = useBuildsWindow(org, project, id)
  const runs = paged.data?.pages.flatMap((p) => p.items) ?? []
  const winRuns = win.data ?? []

  const counts = useMemo(() => {
    const c: Partial<Record<StatusKey, number>> = {}
    for (const b of winRuns) {
      const z = runZone(b)
      const k: StatusKey = z === 'done' ? 'succeeded' : z === 'fail' ? 'failed' : z === 'progress' || z === 'new' ? 'inProgress' : 'canceled'
      c[k] = (c[k] ?? 0) + 1
    }
    return c
  }, [winRuns])

  // Sucesso e mediana dos últimos 7 dias.
  const week = useMemo(() => {
    const since = Date.now() - 7 * DAY
    const recent = winRuns.filter((b) => b.queueTime && new Date(b.queueTime).getTime() >= since)
    const done = recent.filter((b) => b.status === 'completed' && (b.result === 'succeeded' || b.result === 'failed' || b.result === 'partiallySucceeded'))
    const ok = done.filter((b) => b.result === 'succeeded').length
    const dur = median(recent.map(runDurationMs).filter((x): x is number => x !== null))
    return { rate: done.length ? Math.round((ok / done.length) * 100) : null, dur }
  }, [winRuns])

  const branches = useMemo(() => [...new Set(winRuns.map((b) => shortRef(b.sourceBranch)).filter(Boolean))].sort(), [winRuns])

  const columns: Column<Build>[] = [
    {
      key: 'who',
      header: '',
      width: 32,
      align: 'center',
      render: (b) => <Avatar identity={b.requestedFor ?? b.requestedBy ?? null} size={20} />
    },
    { key: 'number', header: 'Execução', width: 120, render: (b) => <IdCell>#{b.buildNumber}</IdCell> },
    {
      key: 'commit',
      header: 'Commit',
      render: (b) => (
        <span className="block truncate" title={commitMessage(b)}>
          {commitMessage(b) || (b.triggerInfo?.['ci.sourceSha'] ? sha7(b.triggerInfo['ci.sourceSha']) : sha7(b.sourceVersion)) || '—'}
        </span>
      )
    },
    {
      key: 'branch',
      header: 'Branch',
      width: 156,
      render: (b) => (
        <Code className="block max-w-full truncate">
          <GitBranch className="mr-1 inline size-3" />
          {shortRef(b.sourceBranch) || '—'}
        </Code>
      )
    },
    { key: 'stages', header: 'Estágios', width: 132, render: (b) => <StageBars build={b} /> },
    {
      key: 'status',
      header: 'Status',
      width: 116,
      render: (b) => <StateLabel zone={runZone(b)}>{runStateLabel(b)}</StateLabel>
    },
    {
      key: 'duration',
      header: 'Duração',
      width: 84,
      align: 'right',
      render: (b) => <span className="narrow font-medium">{formatMs(runDurationMs(b))}</span>
    },
    {
      key: 'when',
      header: 'Quando',
      width: 140,
      align: 'right',
      render: (b) => (
        <span className="block truncate text-[12px] whitespace-nowrap text-muted">
          <TimeAgo date={b.queueTime} />
        </span>
      )
    }
  ]

  const title = def.data?.name ?? (def.isError ? 'Pipeline' : '…')
  const folder = folderLabel(def.data?.path)
  const yamlPipeline = !!def.data?.process?.yamlFilename

  return (
    <>
      <PageHeader
        title={title}
        breadcrumb={
          <>
            <span>Pipelines</span>
            {folder && (
              <>
                <span>/</span>
                <span>{folder}</span>
              </>
            )}
          </>
        }
        actions={
          <>
            {yamlPipeline && (
              <Button icon={<Pencil className="size-3.5" />} onClick={() => navigate(`${base}/edit/${id}`)}>
                Editar YAML
              </Button>
            )}
            <Button variant="primary" icon={<Play className="size-3.5" />} disabled={!def.data} onClick={() => setExecOpen(true)}>
              Executar pipeline
            </Button>
            <ExternalButton url={definitionWebUrl(org, project, id)} />
          </>
        }
      >
        <Tabs
          tabs={[
            { key: 'runs', label: 'Execuções' },
            { key: 'branches', label: 'Branches', count: branches.length },
            { key: 'analytics', label: 'Análise' }
          ]}
          value={tab}
          onChange={setTab}
        />
      </PageHeader>

      {def.isLoading && <Loading label="Carregando pipeline…" />}
      {def.isError && <ErrorBox error={def.error} onRetry={() => def.refetch()} />}

      {def.data && tab === 'runs' && (
        <>
          <Toolbar className="bg-bg">
            <Standings
              items={(Object.keys(STATUS_LABEL) as Exclude<StatusKey, ''>[])
                .filter((k) => counts[k])
                .map((k) => ({ key: k, label: STATUS_LABEL[k], zone: STATUS_ZONE[k], count: counts[k]! }))}
              value={status || null}
              onSelect={(k) => setStatus((k ?? '') as StatusKey)}
            />
            <span className="colhead">
              Sucesso 7d <b className="narrow text-[13px] text-fg">{week.rate === null ? '—' : `${week.rate}%`}</b> · Mediana{' '}
              <b className="narrow text-[13px] text-fg">{formatMs(week.dur)}</b>
            </span>
            <div className="flex-1" />
            <MineToggle active={mineOnly} onChange={setMineOnly} label="Minhas execuções" />
            <Select className="w-44" aria-label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">Todas as branches</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
            <Select className="w-40" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as StatusKey)}>
              <option value="">Qualquer status</option>
              {(Object.keys(STATUS_LABEL) as Exclude<StatusKey, ''>[]).map((k) => (
                <option key={k} value={k}>
                  {STATUS_LABEL[k]}
                </option>
              ))}
            </Select>
          </Toolbar>

          {paged.isLoading && <Loading label="Carregando execuções…" />}
          {paged.isError && <ErrorBox error={paged.error} onRetry={() => paged.refetch()} />}
          {paged.data && runs.length === 0 && (
            <Empty title="Nenhuma execução encontrada">
              {status || branch || mineOnly ? 'Ajuste os filtros para ver outras execuções.' : 'Este pipeline ainda não foi executado.'}
            </Empty>
          )}
          {paged.data && runs.length > 0 && (
            <>
              <Table
                persistKey="pipelines.runs"
                rows={runs}
                columns={columns}
                rowKey={(b) => b.id}
                className="[&>table]:table-fixed"
                zone={runZone}
                mine={(b) => isMe(me.data, b.requestedFor)}
                onRowClick={(b) => navigate(`${base}/run/${b.id}`)}
              />
              {paged.hasNextPage && (
                <div className="flex justify-center py-3">
                  <Button loading={paged.isFetchingNextPage} onClick={() => paged.fetchNextPage()}>
                    Carregar mais execuções
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {def.data && tab === 'branches' && (
        <BranchesTab runs={winRuns} loading={win.isLoading} error={win.error} onRetry={() => win.refetch()} onPick={(b) => { setBranch(b); setTab('runs') }} />
      )}

      {def.data && tab === 'analytics' && (
        <AnalyticsTab runs={winRuns} loading={win.isLoading} error={win.error} onRetry={() => win.refetch()} />
      )}

      {execOpen && def.data && (
        <RunPipelineModal
          open
          definitionId={id}
          definitionName={def.data.name}
          onClose={() => setExecOpen(false)}
          onStarted={(buildId) => {
            setExecOpen(false)
            navigate(`${base}/run/${buildId}`)
          }}
        />
      )}
    </>
  )
}

/** Barras de estágio por zona. Carrega a timeline só quando a linha entra na tela. */
function StageBars({ build }: { build: Build }) {
  const { org, project } = useScope()
  const { ref, inView } = useInView<HTMLSpanElement>()
  const running = isRunning(build)
  const tl = useTimeline(org, project, build.id, running, inView)
  const stages = (tl.data?.records ?? [])
    .filter((r): r is TimelineRecord => r.type === 'Stage')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  return (
    <span ref={ref} className="flex items-center gap-[3px]">
      {!inView || (tl.isLoading && !tl.data) ? (
        <span className="h-2 w-16 rounded-sm bg-surface-2" aria-hidden />
      ) : stages.length === 0 ? (
        <span className="text-[12px] text-muted">—</span>
      ) : (
        stages.map((s) => {
          const z = recordZone(s)
          return (
            <span
              key={s.id}
              title={`${s.name}: ${recordStateLabel(s)}`}
              className={cx('inline-block h-2 w-7', zoneBgFor(z), s.state === 'pending' && 'bg-transparent border border-rule')}
            />
          )
        })
      )}
    </span>
  )
}

function BranchesTab({
  runs,
  loading,
  error,
  onRetry,
  onPick
}: {
  runs: Build[]
  loading: boolean
  error: unknown
  onRetry: () => void
  onPick: (branch: string) => void
}) {
  const { org, project } = useScope()
  const navigate = useNavigate()
  const base = pipelinesBase(org, project)
  const last = useMemo(() => {
    const m = new Map<string, Build>()
    for (const b of runs) {
      const k = shortRef(b.sourceBranch)
      if (!k) continue
      const cur = m.get(k)
      if (!cur || (b.queueTime ?? '') > (cur.queueTime ?? '')) m.set(k, b)
    }
    return [...m.entries()].sort((a, b) => (b[1].queueTime ?? '').localeCompare(a[1].queueTime ?? ''))
  }, [runs])

  if (loading) return <Loading label="Carregando branches…" />
  if (error) return <ErrorBox error={error} onRetry={onRetry} />
  if (last.length === 0) return <Empty title="Nenhuma branch com execuções nos últimos 14 dias" />
  return (
    <Table
      persistKey="pipelines.runs.branches"
      rows={last}
      rowKey={([k]) => k}
      zone={([, b]) => runZone(b)}
      onRowClick={([k]) => onPick(k)}
      columns={[
        { key: 'branch', header: 'Branch', width: '40%', render: ([k]) => <Code><GitBranch className="mr-1 inline size-3" />{k}</Code> },
        { key: 'run', header: 'Último run', width: 130, render: ([, b]) => <IdCell>#{b.buildNumber}</IdCell> },
        { key: 'status', header: 'Status', width: 130, render: ([, b]) => <StateLabel zone={runZone(b)}>{runStateLabel(b)}</StateLabel> },
        { key: 'when', header: 'Quando', width: 120, render: ([, b]) => <span className="text-[12px] text-muted"><TimeAgo date={b.queueTime} /></span> },
        { key: 'dur', header: 'Duração', width: 90, align: 'right', render: ([, b]) => <span className="narrow font-medium">{formatMs(runDurationMs(b))}</span> },
        {
          key: 'open',
          header: '',
          width: 90,
          align: 'right',
          render: ([, b]) => (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                navigate(`${base}/run/${b.id}`)
              }}
            >
              Ver run
            </Button>
          )
        }
      ]}
    />
  )
}

/** Análise: taxa de sucesso e duração mediana por dia nos últimos 14 dias, em barras de zona. */
function AnalyticsTab({ runs, loading, error, onRetry }: { runs: Build[]; loading: boolean; error: unknown; onRetry: () => void }) {
  const days = useMemo(() => {
    const out: { key: string; label: string; rate: number | null; dur: number | null; total: number }[] = []
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * DAY)
      const key = dayKey(d)
      const dayRuns = runs.filter((b) => b.queueTime && dayKey(new Date(b.queueTime)) === key)
      const done = dayRuns.filter((b) => b.status === 'completed' && (b.result === 'succeeded' || b.result === 'failed' || b.result === 'partiallySucceeded'))
      const ok = done.filter((b) => b.result === 'succeeded').length
      out.push({
        key,
        label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        rate: done.length ? Math.round((ok / done.length) * 100) : null,
        dur: median(dayRuns.filter((b) => b.status === 'completed').map(runDurationMs).filter((x): x is number => x !== null)),
        total: dayRuns.length
      })
    }
    return out
  }, [runs])

  if (loading) return <Loading label="Carregando análise…" />
  if (error) return <ErrorBox error={error} onRetry={onRetry} />
  if (runs.length === 0) return <Empty title="Sem execuções nos últimos 14 dias" />

  const maxDur = Math.max(1, ...days.map((d) => d.dur ?? 0))
  const zoneForRate = (r: number): Zone => (r >= 80 ? 'done' : r >= 50 ? 'progress' : 'fail')

  return (
    <div className="grid gap-6 p-6">
      <section>
        <div className="mb-2 flex items-baseline gap-3">
          <span className="colhead">Taxa de sucesso por dia</span>
          <span className="text-[12px] text-muted">últimos 14 dias · verde ≥ 80% · âmbar ≥ 50% · vermelho abaixo</span>
        </div>
        <div className="flex h-36 items-end gap-2 border-b-2 border-rule-strong pb-1">
          {days.map((d) => (
            <div key={d.key} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
              <span className="narrow text-center text-[12px] font-semibold">{d.rate === null ? '—' : `${d.rate}%`}</span>
              {d.rate === null ? (
                <span className="h-px w-full bg-rule" />
              ) : (
                <span className={cx('w-full rounded-t-[3px]', zoneBgFor(zoneForRate(d.rate)))} style={{ height: `${Math.max(4, d.rate)}%` }} />
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          {days.map((d) => (
            <span key={d.key} className="narrow flex-1 text-center text-[11px] text-muted">
              {d.label}
            </span>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-baseline gap-3">
          <span className="colhead">Duração mediana por dia</span>
          <span className="text-[12px] text-muted">só execuções concluídas</span>
        </div>
        <div className="flex h-36 items-end gap-2 border-b-2 border-rule-strong pb-1">
          {days.map((d) => (
            <div key={d.key} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
              <span className="narrow text-center text-[12px] font-semibold">{d.dur === null ? '—' : formatMs(d.dur)}</span>
              {d.dur === null ? (
                <span className="h-px w-full bg-rule" />
              ) : (
                <span className={cx('w-full rounded-t-[3px]', zoneBgFor('new'))} style={{ height: `${Math.max(4, (d.dur / maxDur) * 100)}%` }} />
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          {days.map((d) => (
            <span key={d.key} className="narrow flex-1 text-center text-[11px] text-muted">
              {d.label}
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}
