// Detalhe do run (rota run/:buildId): cabeçalho, aprovações, diagrama de estágios, árvore de tasks, log e abas.
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, Check, ChevronDown, ChevronRight, Download, ExternalLink, GitBranch, Lock, RotateCcw, Trash2, Unlock, X } from 'lucide-react'
import {
  Badge,
  Button,
  Code,
  Empty,
  ErrorBox,
  Field,
  IdCell,
  Input,
  Loading,
  PageHeader,
  Person,
  Section,
  StateLabel,
  Tabs,
  TimeAgo,
  ZoneSquare,
  formatDate,
  formatDuration
} from '@/components/ui'
import { ado, openExternal, saveBase64, seg, webUrl } from '@/lib/api'
import { useScope, isMe, useMe } from '@/lib/context'
import { ConfirmModal, InlineNote, LogViewer } from './common'
import { errorText } from './errors'
import {
  buildWebUrl,
  folderLabel,
  formatMs,
  isRunning,
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
import {
  useBuild,
  useBuildArtifacts,
  useBuildChanges,
  useBuildLog,
  useBuildTests,
  useBuildWorkItems,
  useDefinition,
  usePipelineApprovals,
  useTimeline,
  useWorkItemTitles
} from './queries'
import type { Build, BuildArtifact, PipelineApproval, TimelineRecord } from './types'

type DetailTab = 'logs' | 'summary' | 'tests' | 'links'

/** Índice da timeline: filhos por parentId, com Phase transparente (Stage → Phase → Job → Task). */
function useTree(records: TimelineRecord[]) {
  return useMemo(() => {
    const byParent = new Map<string, TimelineRecord[]>()
    for (const r of records) {
      const k = r.parentId ?? ''
      byParent.set(k, [...(byParent.get(k) ?? []), r])
    }
    for (const list of byParent.values()) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const kids = (id: string) => byParent.get(id) ?? []
    const stages = kids('').filter((r) => r.type === 'Stage')
    const jobsOf = (stage: TimelineRecord) =>
      kids(stage.id).flatMap((c) => (c.type === 'Phase' ? kids(c.id).filter((j) => j.type === 'Job') : c.type === 'Job' ? [c] : []))
    const tasksOf = (job: TimelineRecord) => kids(job.id).filter((t) => t.type === 'Task')
    return { stages, jobsOf, tasksOf }
  }, [records])
}

export function RunDetail() {
  const { buildId } = useParams()
  const id = Number(buildId)
  const { org, project } = useScope()
  const base = pipelinesBase(org, project)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const me = useMe(org)

  const build = useBuild(org, project, id)
  const b = build.data
  const running = isRunning(b)
  const def = useDefinition(org, project, b?.definition?.id)
  const timeline = useTimeline(org, project, id, running)
  const approvals = usePipelineApprovals(org, project)
  const myApprovals = (approvals.data ?? []).filter((a) => approvalBelongsTo(a, id))

  const records = timeline.data?.records ?? []
  const { stages, jobsOf, tasksOf } = useTree(records)
  const failedStages = stages.filter((s) => s.result === 'failed' && s.identifier)

  const [tab, setTab] = useState<DetailTab>('logs')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<null | 'cancel' | 'rerun' | 'delete'>(null)
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // Task selecionada; por padrão a primeira que falhou, depois a em execução, depois a última com log.
  const allTasks = records.filter((r) => r.type === 'Task')
  const defaultTask = allTasks.find((t) => t.result === 'failed') ?? allTasks.find((t) => t.state === 'inProgress') ?? [...allTasks].reverse().find((t) => t.log)
  const selected = allTasks.find((t) => t.id === selectedId) ?? defaultTask ?? null
  const selectedRunning = !!selected && selected.state === 'inProgress'
  const log = useBuildLog(org, project, id, selected?.log?.id, running && selectedRunning)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [org, project, 'pipelines', 'build', id] })
    qc.invalidateQueries({ queryKey: [org, project, 'pipelines', 'timeline', id] })
    qc.invalidateQueries({ queryKey: [org, project, 'pipelines', 'approvals'] })
  }

  const cancel = useMutation({
    mutationFn: () => ado({ org, path: `${seg(project)}/_apis/build/builds/${id}`, method: 'PATCH', body: { status: 'cancelling' } }),
    onSuccess: () => {
      setConfirm(null)
      setNote({ kind: 'ok', text: 'Cancelamento solicitado.' })
      invalidate()
    }
  })

  const retryFailed = useMutation({
    mutationFn: async () => {
      for (const s of failedStages) {
        await ado({
          org,
          path: `${seg(project)}/_apis/build/builds/${id}/stages/${encodeURIComponent(s.identifier!)}`,
          method: 'PATCH',
          body: { state: 'retry' },
          apiVersion: '7.1-preview.1'
        })
      }
      return failedStages.length
    },
    onSuccess: (n) => {
      setNote({ kind: 'ok', text: `${n} stage(s) reexecutado(s).` })
      invalidate()
    }
  })

  const rerun = useMutation({
    mutationFn: async () => {
      const r = await ado<{ id: number }>({
        org,
        path: `${seg(project)}/_apis/build/builds`,
        method: 'POST',
        body: { definition: { id: b!.definition!.id }, sourceBranch: b!.sourceBranch, sourceVersion: b!.sourceVersion, parameters: b!.parameters }
      })
      return r.id
    },
    onSuccess: (newId) => {
      setConfirm(null)
      qc.invalidateQueries({ queryKey: [org, project, 'pipelines'] })
      navigate(`${base}/run/${newId}`)
    }
  })

  const retain = useMutation({
    mutationFn: () => ado({ org, path: `${seg(project)}/_apis/build/builds/${id}`, method: 'PATCH', body: { keepForever: !b?.keepForever } }),
    onSuccess: () => {
      setNote({ kind: 'ok', text: b?.keepForever ? 'Retenção removida.' : 'Execução retida.' })
      invalidate()
    }
  })

  const remove = useMutation({
    mutationFn: () => ado({ org, path: `${seg(project)}/_apis/build/builds/${id}`, method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [org, project, 'pipelines'] })
      navigate(b?.definition ? `${base}/list/${b.definition.id}` : `${base}/list`)
    }
  })

  const zipLogs = useMutation({
    mutationFn: () =>
      ado<string>({
        org,
        path: `${seg(project)}/_apis/build/builds/${id}/logs`,
        responseType: 'base64',
        headers: { Accept: 'application/zip' }
      }),
    onSuccess: (data) => saveBase64(`build-${b?.buildNumber ?? id}-logs.zip`, data, 'application/zip'),
    onError: (e) => setNote({ kind: 'err', text: `Falha ao baixar logs: ${errorText(e)}` })
  })

  if (build.isLoading) return <Loading label="Carregando execução…" />
  if (build.isError) return <ErrorBox error={build.error} onRetry={() => build.refetch()} />
  if (!b) return <Empty title="Execução não encontrada" />

  const repoName = b.repository?.name
  const sha = b.sourceVersion
  const finished = !running

  return (
    <>
      <PageHeader
        title={<span className="narrow">#{b.buildNumber}</span>}
        subtitle={b.definition?.name}
        breadcrumb={
          <>
            <Link className="hover:text-fg" to={base}>Pipelines</Link>
            {folderLabel(def.data?.path) && (
              <>
                <span>/</span>
                <span>{folderLabel(def.data?.path)}</span>
              </>
            )}
            {b.definition && (
              <>
                <span>/</span>
                <Link className="hover:text-fg" to={`${base}/list/${b.definition.id}`}>{b.definition.name}</Link>
              </>
            )}
          </>
        }
        actions={
          <>
            {running ? (
              <Button variant="danger" icon={<Ban className="size-3.5" />} onClick={() => setConfirm('cancel')}>
                Cancelar
              </Button>
            ) : (
              <>
                <Button
                  disabled={failedStages.length === 0}
                  loading={retryFailed.isPending}
                  icon={<RotateCcw className="size-3.5" />}
                  title={failedStages.length === 0 ? 'Nenhum stage falhou' : undefined}
                  onClick={() => retryFailed.mutate()}
                >
                  Reexecutar falhados
                </Button>
                <Button onClick={() => setConfirm('rerun')}>Executar novamente</Button>
              </>
            )}
            <Button variant="ghost" size="sm" icon={b.keepForever ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />} loading={retain.isPending} onClick={() => retain.mutate()}>
              {b.keepForever ? 'Liberar retenção' : 'Reter'}
            </Button>
            <Button variant="ghost" size="sm" icon={<Download className="size-3.5" />} loading={zipLogs.isPending} onClick={() => zipLogs.mutate()}>
              Baixar logs
            </Button>
            {finished && (
              <Button variant="ghost" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirm('delete')}>
                Excluir
              </Button>
            )}
            <Button variant="ghost" size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => openExternal(buildWebUrl(org, project, id))}>
              Abrir no navegador
            </Button>
          </>
        }
      >
        <Tabs
          tabs={[
            { key: 'logs', label: 'Logs' },
            { key: 'summary', label: 'Resumo', count: records.reduce((n, r) => n + (r.issues?.length ?? 0), 0) || undefined },
            { key: 'tests', label: 'Testes' },
            { key: 'links', label: 'Work items e commits' }
          ]}
          value={tab}
          onChange={setTab}
        />
      </PageHeader>

      {/* Cabeçalho do run */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-surface px-6 py-3">
        <StateLabel zone={runZone(b)}>{runStateLabel(b)}</StateLabel>
        <span className="flex items-center gap-2 text-muted">
          Disparado por <Person identity={b.requestedFor ?? b.requestedBy ?? null} size={18} />
          {isMe(me.data, b.requestedFor) && <span className="text-[12px] font-semibold text-mine-ink">(você)</span>}
        </span>
        {b.reason && <Badge>{reasonLabel(b.reason)}</Badge>}
        {b.keepForever && <Badge>Retida</Badge>}
        {b.sourceBranch && (
          <Code>
            <GitBranch className="mr-1 inline size-3" />
            {shortRef(b.sourceBranch)}
          </Code>
        )}
        {sha && (
          <Link className="text-[12px] text-accent underline-offset-2 hover:underline" to={repoName ? `/${org}/${seg(project)}/repos/commits/${seg(repoName)}?c=${sha}` : `/${org}/${seg(project)}/repos/commits`} title={`Commit ${sha}`}>
            <span className="mono">{sha7(sha)}</span>
            {repoName ? ` · ${repoName}` : ''}
          </Link>
        )}
        <span className="narrow text-[13px]">
          Duração <b className="font-semibold">{running ? formatDuration(b.startTime ?? b.queueTime, null) : formatMs(runDurationMs(b))}</b>
        </span>
        <span className="text-[12px] text-muted">
          Iniciado <TimeAgo date={b.startTime ?? b.queueTime} /> · {formatDate(b.startTime ?? b.queueTime, 'dd/MM HH:mm')}
        </span>
      </div>

      {note && (
        <div className="px-6 pt-3">
          <InlineNote kind={note.kind}>{note.text}</InlineNote>
        </div>
      )}
      {(retryFailed.isError || rerun.isError || cancel.isError || retain.isError || remove.isError) && (
        <div className="px-6 pt-3">
          <ErrorBox error={retryFailed.error ?? rerun.error ?? cancel.error ?? retain.error ?? remove.error} />
        </div>
      )}

      {/* Aprovações pendentes deste run */}
      {myApprovals.length > 0 && (
        <div className="px-6 pt-4">
          <PendingApprovals approvals={myApprovals} onDone={() => { setNote({ kind: 'ok', text: 'Decisão registrada.' }); invalidate() }} />
        </div>
      )}

      {/* Diagrama de estágios em linha */}
      <div className="border-b border-border bg-bg px-6 py-4">
        {timeline.isLoading && <Loading label="Carregando estágios…" />}
        {timeline.isError && <ErrorBox error={timeline.error} onRetry={() => timeline.refetch()} />}
        {timeline.data && stages.length === 0 && <div className="text-muted">Esta execução não tem estágios na timeline.</div>}
        {timeline.data && stages.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {stages.map((s) => (
              <StageCard
                key={s.id}
                stage={s}
                jobs={jobsOf(s)}
                onPickTask={(taskId) => {
                  setSelectedId(taskId)
                  setTab('logs')
                }}
                tasksOf={tasksOf}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {tab === 'logs' && (
          <>
            {/* Árvore Stage → Job → Task */}
            <aside className="w-80 shrink-0 overflow-auto border-r border-border bg-surface">
              {timeline.data && stages.length > 0 && (
                <Tree
                  stages={stages}
                  jobsOf={jobsOf}
                  tasksOf={tasksOf}
                  selected={selected?.id ?? null}
                  collapsed={collapsed}
                  onToggle={(k) =>
                    setCollapsed((s) => {
                      const n = new Set(s)
                      if (n.has(k)) n.delete(k)
                      else n.add(k)
                      return n
                    })
                  }
                  onSelect={setSelectedId}
                />
              )}
            </aside>
            <section className="flex min-w-0 flex-1 flex-col gap-2 p-4">
              {selected ? (
                <>
                  <div className="flex items-center gap-2 text-[13px]">
                    <ZoneSquare zone={recordZone(selected)} />
                    <span className="font-semibold">{selected.name}</span>
                    <span className="text-muted">{recordStateLabel(selected)}</span>
                    <span className="narrow text-muted">{formatMs(runDurationMs({ startTime: selected.startTime, finishTime: selected.finishTime }))}</span>
                  </div>
                  <div className="min-h-[360px] flex-1">
                    {!selected.log ? (
                      <Empty title="Esta task não gerou log" />
                    ) : log.isLoading ? (
                      <Loading label="Carregando log…" />
                    ) : log.isError ? (
                      <ErrorBox error={log.error} onRetry={() => log.refetch()} />
                    ) : (
                      <LogViewer text={log.data} running={running && selectedRunning} emptyLabel="Log vazio" />
                    )}
                  </div>
                </>
              ) : (
                <Empty title="Selecione uma task para ver o log" />
              )}
            </section>
          </>
        )}

        {tab === 'summary' && (
          <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-6">
            <IssuesSection records={records} />
            <ArtifactsSection org={org} project={project} buildId={id} onNote={setNote} />
          </div>
        )}

        {tab === 'tests' && (
          <div className="min-w-0 flex-1 overflow-auto p-6">
            <TestsSection org={org} project={project} buildId={id} />
          </div>
        )}

        {tab === 'links' && (
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 overflow-auto p-6 xl:grid-cols-2">
            <WorkItemsSection org={org} project={project} buildId={id} />
            <ChangesSection org={org} project={project} buildId={id} build={b} />
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirm === 'cancel'}
        title="Cancelar execução?"
        message={`A execução #${b.buildNumber} será cancelada. Os jobs em andamento serão interrompidos.`}
        confirmLabel="Cancelar execução"
        danger
        pending={cancel.isPending}
        error={cancel.error}
        onConfirm={() => cancel.mutate()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === 'rerun'}
        title="Executar novamente?"
        message={`Uma nova execução do pipeline será criada na branch ${shortRef(b.sourceBranch) || '—'}, no mesmo commit.`}
        confirmLabel="Executar"
        pending={rerun.isPending}
        error={rerun.error}
        onConfirm={() => rerun.mutate()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === 'delete'}
        title="Excluir execução?"
        message={`A execução #${b.buildNumber} e seus logs serão excluídos permanentemente.`}
        confirmLabel="Excluir"
        danger
        pending={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirm(null)}
      />
    </>
  )
}

function reasonLabel(reason: string) {
  const map: Record<string, string> = {
    manual: 'Manual',
    individualCI: 'CI (push)',
    batchedCI: 'CI em lote',
    schedule: 'Agendado',
    pullRequest: 'Pull request',
    buildCompletion: 'Conclusão de build',
    triggered: 'Disparado',
    validateShelveset: 'Validação',
    checkInShelveset: 'Shelveset',
    resourceTrigger: 'Trigger de recurso'
  }
  return map[reason] ?? reason
}

/** Aprovação pertence a este run se o owner/pipeline id for o id do build. */
function approvalBelongsTo(a: PipelineApproval, buildId: number) {
  return a.pipeline?.owner?.id === buildId || a.pipeline?.id === buildId
}

function StageCard({
  stage,
  jobs,
  tasksOf,
  onPickTask
}: {
  stage: TimelineRecord
  jobs: TimelineRecord[]
  tasksOf: (j: TimelineRecord) => TimelineRecord[]
  onPickTask: (taskId: string) => void
}) {
  const z = recordZone(stage)
  return (
    <div className="flex w-56 shrink-0 flex-col border border-border bg-surface">
      <span className={`block h-1 ${zoneBgFor(z)}`} />
      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
        <span className="min-w-0 flex-1 truncate font-semibold" title={stage.name}>{stage.name}</span>
        <span className="narrow text-[12px] text-muted">{formatMs(runDurationMs({ startTime: stage.startTime, finishTime: stage.finishTime }))}</span>
      </div>
      <div className="px-3 pb-2">
        <StateLabel zone={z}>{recordStateLabel(stage)}</StateLabel>
      </div>
      <ul className="border-t border-border">
        {jobs.map((j) => {
          const jz = recordZone(j)
          const firstTask = tasksOf(j).find((t) => t.result === 'failed') ?? tasksOf(j)[0]
          return (
            <li key={j.id}>
              <button
                type="button"
                disabled={!firstTask}
                onClick={() => firstTask && onPickTask(firstTask.id)}
                className="flex w-full items-center gap-2 px-3 py-1 text-left text-[12px] hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <ZoneSquare zone={jz} />
                <span className="min-w-0 flex-1 truncate">{j.name}</span>
                <span className="narrow text-muted">{formatMs(runDurationMs({ startTime: j.startTime, finishTime: j.finishTime }))}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Tree({
  stages,
  jobsOf,
  tasksOf,
  selected,
  collapsed,
  onToggle,
  onSelect
}: {
  stages: TimelineRecord[]
  jobsOf: (s: TimelineRecord) => TimelineRecord[]
  tasksOf: (j: TimelineRecord) => TimelineRecord[]
  selected: string | null
  collapsed: Set<string>
  onToggle: (k: string) => void
  onSelect: (taskId: string) => void
}) {
  const chev = (k: string) => (collapsed.has(k) ? <ChevronRight className="size-3.5 text-muted" /> : <ChevronDown className="size-3.5 text-muted" />)
  return (
    <ul className="py-1 text-[13px]">
      {stages.map((s) => (
        <li key={s.id}>
          <button type="button" onClick={() => onToggle(s.id)} className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-surface-2">
            {chev(s.id)}
            <ZoneSquare zone={recordZone(s)} />
            <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
          </button>
          {!collapsed.has(s.id) &&
            jobsOf(s).map((j) => (
              <div key={j.id}>
                <button type="button" onClick={() => onToggle(j.id)} className="flex w-full items-center gap-2 py-1 pr-3 pl-7 text-left hover:bg-surface-2">
                  {chev(j.id)}
                  <ZoneSquare zone={recordZone(j)} />
                  <span className="min-w-0 flex-1 truncate">{j.name}</span>
                  <span className="narrow text-[12px] text-muted">{formatMs(runDurationMs({ startTime: j.startTime, finishTime: j.finishTime }))}</span>
                </button>
                {!collapsed.has(j.id) &&
                  tasksOf(j).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onSelect(t.id)}
                      className={`flex w-full items-center gap-2 py-1 pr-3 pl-12 text-left hover:bg-surface-2 ${selected === t.id ? 'bg-surface-2 font-semibold' : ''}`}
                    >
                      <ZoneSquare zone={recordZone(t)} />
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      <span className="narrow text-[12px] text-muted">{formatMs(runDurationMs({ startTime: t.startTime, finishTime: t.finishTime }))}</span>
                    </button>
                  ))}
              </div>
            ))}
        </li>
      ))}
    </ul>
  )
}

function PendingApprovals({ approvals, onDone }: { approvals: PipelineApproval[]; onDone: () => void }) {
  const { org, project } = useScope()
  const [comment, setComment] = useState('')
  const decide = useMutation({
    mutationFn: ({ a, status }: { a: PipelineApproval; status: 'approved' | 'rejected' }) =>
      ado({
        org,
        path: `${seg(project)}/_apis/pipelines/approvals`,
        method: 'PATCH',
        body: [{ approvalId: a.id, status, comment }],
        apiVersion: '7.1-preview.1'
      }),
    onSuccess: () => {
      setComment('')
      onDone()
    }
  })
  return (
    <Section title={`Aprovações pendentes (${approvals.length})`}>
      <div className="flex flex-col gap-3 p-3">
        <Field label="Comentário (opcional)">
          <Input value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        {approvals.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-3 border-l-2 border-zone-progress pl-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{a.resource?.name ?? 'Aprovação de environment'}</div>
              <div className="text-[12px] text-muted">{a.instructions ?? `Aprovadores: ${a.steps?.map((s) => s.assignedApprover.displayName).join(', ') ?? '—'}`}</div>
            </div>
            <Button variant="success" size="sm" icon={<Check className="size-3.5" />} loading={decide.isPending} onClick={() => decide.mutate({ a, status: 'approved' })}>
              Aprovar
            </Button>
            <Button variant="danger" size="sm" icon={<X className="size-3.5" />} loading={decide.isPending} onClick={() => decide.mutate({ a, status: 'rejected' })}>
              Rejeitar
            </Button>
          </div>
        ))}
        {decide.isError && <ErrorBox error={decide.error} />}
      </div>
    </Section>
  )
}

function IssuesSection({ records }: { records: TimelineRecord[] }) {
  const issues = records.flatMap((r) => (r.issues ?? []).map((i) => ({ ...i, owner: r.name })))
  if (issues.length === 0) return <Empty title="Nenhum erro ou aviso nesta execução" />
  return (
    <Section title={`Erros e avisos (${issues.length})`}>
      <ul className="divide-y divide-border">
        {issues.map((i, n) => (
          <li key={n} className="flex items-start gap-3 px-3 py-2">
            <ZoneSquare zone={i.type === 'error' ? 'fail' : 'progress'} className="mt-1.5" />
            <div className="min-w-0">
              <div className="text-[12px] text-muted">
                {i.type === 'error' ? 'Erro' : 'Aviso'} · {i.owner}
              </div>
              <div className="break-words">{i.message}</div>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function ArtifactsSection({ org, project, buildId, onNote }: { org: string; project: string; buildId: number; onNote: (n: { kind: 'ok' | 'err'; text: string }) => void }) {
  const arts = useBuildArtifacts(org, project, buildId)
  const download = useMutation({
    mutationFn: async (a: BuildArtifact) => {
      const data = await ado<string>({
        org,
        path: a.resource.url,
        query: { format: 'zip' },
        responseType: 'base64',
        apiVersion: null
      })
      saveBase64(`${a.name}.zip`, data, 'application/zip')
    },
    onError: (e) => onNote({ kind: 'err', text: `Falha ao baixar artefato: ${errorText(e)}` })
  })
  return (
    <Section title="Artefatos">
      {arts.isLoading && <Loading label="Carregando artefatos…" />}
      {arts.isError && <ErrorBox error={arts.error} onRetry={() => arts.refetch()} />}
      {arts.data && arts.data.length === 0 && <div className="px-3 py-4 text-muted">Sem artefatos publicados.</div>}
      {arts.data && arts.data.length > 0 && (
        <ul className="divide-y divide-border">
          {arts.data.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{a.name}</span>
                <span className="ml-2 text-[12px] text-muted">{a.resource.type}</span>
              </span>
              <Button size="sm" icon={<Download className="size-3.5" />} loading={download.isPending && download.variables?.id === a.id} onClick={() => download.mutate(a)}>
                Baixar .zip
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function TestsSection({ org, project, buildId }: { org: string; project: string; buildId: number }) {
  const tests = useBuildTests(org, project, buildId)
  if (tests.isLoading) return <Loading label="Carregando testes…" />
  if (tests.isError) return <ErrorBox error={tests.error} onRetry={() => tests.refetch()} />
  const runs = tests.data ?? []
  if (runs.length === 0) return <Empty title="Nenhum resultado de teste publicado" />
  const total = runs.reduce((n, r) => n + (r.totalTests ?? 0), 0)
  const passed = runs.reduce((n, r) => n + (r.passedTests ?? 0), 0)
  const failed = runs.reduce((n, r) => n + Math.max(0, (r.totalTests ?? 0) - (r.passedTests ?? 0) - (r.incompleteTests ?? 0) - (r.notApplicableTests ?? 0) - (r.unanalyzedTests ?? 0)), 0)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-6">
        <Stat label="Total" value={total} />
        <Stat label="Passou" value={passed} tone="done" />
        <Stat label="Falhou" value={failed} tone={failed ? 'fail' : undefined} />
      </div>
      <Section title="Execuções de teste">
        <ul className="divide-y divide-border">
          {runs.map((r) => {
            const f = Math.max(0, (r.totalTests ?? 0) - (r.passedTests ?? 0) - (r.incompleteTests ?? 0) - (r.notApplicableTests ?? 0) - (r.unanalyzedTests ?? 0))
            return (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                <span className="narrow text-[12px] text-muted">{r.passedTests}/{r.totalTests} passou</span>
                {f > 0 && <Badge tone="danger">{f} falha(s)</Badge>}
              </li>
            )
          })}
        </ul>
      </Section>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'done' | 'fail' }) {
  return (
    <div className="flex flex-col">
      <span className="colhead">{label}</span>
      <span className={`narrow text-2xl font-bold ${tone === 'fail' ? 'text-fail-ink' : ''}`}>{value}</span>
    </div>
  )
}

function WorkItemsSection({ org, project, buildId }: { org: string; project: string; buildId: number }) {
  const wis = useBuildWorkItems(org, project, buildId)
  const ids = (wis.data ?? []).map((w) => w.id)
  const titles = useWorkItemTitles(org, project, ids)
  const byId = new Map((titles.data ?? []).map((w) => [w.id, w.fields]))
  return (
    <Section title={`Work items (${ids.length})`}>
      {wis.isLoading && <Loading label="Carregando work items…" />}
      {wis.isError && <ErrorBox error={wis.error} onRetry={() => wis.refetch()} />}
      {wis.data && ids.length === 0 && <div className="px-3 py-4 text-muted">Nenhum work item associado.</div>}
      <ul className="divide-y divide-border">
        {ids.map((wid) => {
          const f = byId.get(wid)
          return (
            <li key={wid}>
              <button
                type="button"
                onClick={() => openExternal(webUrl(org, `${encodeURIComponent(project)}/_workitems/edit/${wid}`))}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2"
              >
                <IdCell>#{wid}</IdCell>
                <span className="min-w-0 flex-1 truncate">{f?.['System.Title'] ?? (titles.isLoading ? '…' : '—')}</span>
                {f?.['System.State'] && <span className="text-[12px] text-muted">{f['System.State']}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

function ChangesSection({ org, project, buildId, build }: { org: string; project: string; buildId: number; build: Build }) {
  const changes = useBuildChanges(org, project, buildId)
  const repo = build.repository?.name
  return (
    <Section title={`Commits (${changes.data?.length ?? 0})`}>
      {changes.isLoading && <Loading label="Carregando commits…" />}
      {changes.isError && <ErrorBox error={changes.error} onRetry={() => changes.refetch()} />}
      {changes.data && changes.data.length === 0 && <div className="px-3 py-4 text-muted">Nenhum commit associado.</div>}
      <ul className="divide-y divide-border">
        {(changes.data ?? []).map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => repo && openExternal(webUrl(org, `${encodeURIComponent(project)}/_git/${encodeURIComponent(repo)}/commit/${c.id}`))}
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2"
            >
              <span className="mono text-[12px] text-muted">{sha7(c.id)}</span>
              <span className="min-w-0 flex-1 truncate">{(c.message ?? '').split('\n')[0]}</span>
              {c.author && <Person identity={{ id: '', displayName: c.author.displayName, uniqueName: c.author.uniqueName }} size={18} />}
            </button>
          </li>
        ))}
      </ul>
    </Section>
  )
}

