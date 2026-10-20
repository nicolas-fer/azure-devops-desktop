// Releases (vsrm): definições à esquerda, releases com barras por environment, detalhe com aprovações, implantação e logs.
import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, FileText, Rocket, X } from 'lucide-react'
import {
  Button,
  Empty,
  ErrorBox,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Person,
  Section,
  StateLabel,
  Table,
  TimeAgo,
  ZoneSquare,
  formatDate,
  type Column,
  type Zone,
  cx
} from '@/components/ui'
import { ado, adoList, openExternal, seg, webUrl } from '@/lib/api'
import { useScope } from '@/lib/context'
import { ConfirmModal, InlineNote, LogViewer } from './common'
import { errorText } from './errors'
import { folderLabel, pipelinesBase, recordStateLabel, releaseEnvLabel, releaseEnvZone, releaseZone, zoneBgFor } from './lib'
import {
  useRelease,
  useReleaseApprovals,
  useReleaseDefinition,
  useReleaseDefinitions,
  useReleases
} from './queries'
import type { Release, ReleaseDefinition, ReleaseTask } from './types'

const REL_LABEL: Record<Zone, string> = { done: 'Concluída', fail: 'Com falha', progress: 'Em andamento', review: 'Aguardando aprovação', new: 'Não iniciada', idle: 'Abandonada' }

/** Lista de definições à esquerda e releases da definição escolhida à direita. */
export function ReleasesPage() {
  const { definitionId } = useParams()
  const { org, project } = useScope()
  const base = pipelinesBase(org, project)
  const navigate = useNavigate()
  const defs = useReleaseDefinitions(org, project)
  const id = definitionId ? Number(definitionId) : undefined
  const current = defs.data?.find((d) => d.id === id)
  const rels = useReleases(org, project, id)
  const [createOpen, setCreateOpen] = useState(false)

  if (defs.data && defs.data.length > 0 && !id) return <Navigate to={`${base}/releases/${defs.data[0]!.id}`} replace />

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-64 shrink-0 overflow-auto border-r border-border bg-surface">
        <div className="colhead border-b-2 border-rule-strong px-3 py-2">Definições de release</div>
        {defs.isLoading && <Loading label="Carregando definições…" />}
        {defs.isError && <ErrorBox error={defs.error} onRetry={() => defs.refetch()} />}
        {defs.data && defs.data.length === 0 && <div className="px-3 py-4 text-[12px] text-muted">Nenhuma definição de release.</div>}
        <ul>
          {(defs.data ?? []).map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => navigate(`${base}/releases/${d.id}`)}
                className={cx(
                  'flex w-full flex-col px-3 py-2 text-left hover:bg-surface-2',
                  d.id === id && 'bg-surface-2 font-semibold'
                )}
              >
                <span className="truncate">{d.name}</span>
                {folderLabel(d.path) && <span className="truncate text-[12px] text-muted">{folderLabel(d.path)}</span>}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {id && (
          <PageHeader
            title={current?.name ?? (defs.isLoading ? '…' : 'Releases')}
            breadcrumb={<span>Releases</span>}
            actions={
              <Button variant="primary" icon={<Rocket className="size-3.5" />} disabled={!current} onClick={() => setCreateOpen(true)}>
                Criar release
              </Button>
            }
          />
        )}
        {!id && defs.data?.length === 0 && <Empty title="Nenhuma definição de release neste projeto" />}
        {rels.isLoading && <Loading label="Carregando releases…" />}
        {rels.isError && <ErrorBox error={rels.error} onRetry={() => rels.refetch()} />}
        {rels.data && rels.data.length === 0 && <Empty title="Nenhuma release desta definição" />}
        {rels.data && rels.data.length > 0 && (
          <Table
            persistKey="pipelines.releases"
            rows={rels.data}
            rowKey={(r) => r.id}
            zone={(r) => releaseZone(r.environments, r.status)}
            onRowClick={(r) => navigate(`${base}/release/${r.id}`)}
            columns={releaseColumns}
          />
        )}
      </div>

      {createOpen && current && (
        <CreateReleaseModal definition={current} onClose={() => setCreateOpen(false)} onCreated={(rid) => navigate(`${base}/release/${rid}`)} />
      )}
    </div>
  )
}

const releaseColumns: Column<Release>[] = [
  { key: 'name', header: 'Release', width: '26%', render: (r) => <span className="truncate font-semibold">{r.name}</span> },
  {
    key: 'stages',
    header: 'Environments',
    render: (r) => (
      <span className="flex items-center gap-[3px]">
        {(r.environments ?? []).map((e) => (
          <span
            key={e.id}
            title={`${e.name}: ${releaseEnvLabel(e.status)}`}
            className={cx('inline-block h-2 w-7', zoneBgFor(releaseEnvZone(e.status)))}
          />
        ))}
      </span>
    )
  },
  { key: 'by', header: 'Criado por', width: 190, render: (r) => <Person identity={r.createdBy ?? null} size={18} /> },
  { key: 'when', header: 'Quando', width: 120, render: (r) => <span className="text-[12px] whitespace-nowrap text-muted"><TimeAgo date={r.createdOn} /></span> },
  {
    key: 'status',
    header: 'Status',
    width: 150,
    render: (r) => {
      const z = releaseZone(r.environments, r.status)
      return <StateLabel zone={z}>{REL_LABEL[z]}</StateLabel>
    }
  }
]

function CreateReleaseModal({ definition, onClose, onCreated }: { definition: ReleaseDefinition; onClose: () => void; onCreated: (id: number) => void }) {
  const { org, project } = useScope()
  const qc = useQueryClient()
  const [description, setDescription] = useState('')
  const full = useReleaseDefinition(org, project, definition.id)

  const create = useMutation({
    mutationFn: async () => {
      // Artefatos padrão: para cada artefato de build, usa o último build concluído com sucesso da definição de origem.
      const artifacts: { alias: string; instanceReference: { id: string; name: string } }[] = []
      for (const a of full.data?.artifacts ?? []) {
        if (a.type !== 'Build') continue
        const src = a.definitionReference?.definition?.id
        if (!src) continue
        const builds = await adoList<{ id: number; buildNumber: string }>({
          org,
          path: `${seg(project)}/_apis/build/builds`,
          query: { definitions: src, resultFilter: 'succeeded', $top: 1 }
        })
        const latest = builds[0]
        if (!latest) throw new Error(`Nenhum build concluído com sucesso para o artefato ${a.alias}`)
        artifacts.push({ alias: a.alias, instanceReference: { id: String(latest.id), name: latest.buildNumber } })
      }
      return ado<Release>({
        org,
        host: 'vsrm',
        path: `${seg(project)}/_apis/release/releases`,
        method: 'POST',
        body: { definitionId: definition.id, description, isDraft: false, reason: 'manual', artifacts }
      })
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: [org, project, 'releases'] })
      onCreated(r.id)
    }
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={`Criar release · ${definition.name}`}
      width={480}
      footer={
        <>
          <Button onClick={onClose} disabled={create.isPending}>Cancelar</Button>
          <Button variant="primary" loading={create.isPending} disabled={full.isLoading || !full.data} onClick={() => create.mutate()}>
            Criar release
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {full.isLoading && <Loading label="Lendo artefatos da definição…" />}
        {full.isError && <ErrorBox error={full.error} />}
        <Field label="Descrição (opcional)">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <p className="text-[12px] text-muted">
          Os artefatos usam o último build concluído com sucesso de cada origem da definição.
        </p>
        {create.isError && <ErrorBox error={create.error} />}
      </div>
    </Modal>
  )
}

/** Detalhe de um release: environments com status, aprovações pendentes, implantação e logs das tasks. */
export function ReleaseDetail() {
  const { releaseId } = useParams()
  const id = Number(releaseId)
  const { org, project } = useScope()
  const base = pipelinesBase(org, project)
  const qc = useQueryClient()
  const rel = useRelease(org, project, id)
  const approvals = useReleaseApprovals(org, project, id)
  const [deployEnv, setDeployEnv] = useState<{ id: number; name: string } | null>(null)
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [log, setLog] = useState<{ title: string; text: string | null; error?: unknown; loading: boolean } | null>(null)
  const [comment, setComment] = useState('')

  const refresh = () => {
    qc.invalidateQueries({ queryKey: [org, project, 'releases', 'release', id] })
    qc.invalidateQueries({ queryKey: [org, project, 'releases', 'approvals', id] })
  }

  const decide = useMutation({
    mutationFn: ({ approvalId, status }: { approvalId: number; status: 'approved' | 'rejected' }) =>
      ado({
        org,
        host: 'vsrm',
        path: `${seg(project)}/_apis/release/approvals/${approvalId}`,
        method: 'PATCH',
        body: { status, comments: comment }
      }),
    onSuccess: () => {
      setComment('')
      setNote({ kind: 'ok', text: 'Decisão registrada.' })
      refresh()
    },
    onError: (e) => setNote({ kind: 'err', text: errorText(e) })
  })

  const deploy = useMutation({
    mutationFn: (env: { id: number }) =>
      ado({
        org,
        host: 'vsrm',
        path: `${seg(project)}/_apis/release/releases/${id}/environments/${env.id}`,
        method: 'PATCH',
        body: { status: 'inProgress', comment: '' }
      }),
    onSuccess: () => {
      setDeployEnv(null)
      setNote({ kind: 'ok', text: 'Implantação iniciada.' })
      refresh()
    },
    onError: (e) => {
      setDeployEnv(null)
      setNote({ kind: 'err', text: errorText(e) })
    }
  })

  const openLog = async (t: ReleaseTask) => {
    if (!t.logUrl) return
    setLog({ title: t.name, text: null, loading: true })
    try {
      const text = await ado<string>({ path: t.logUrl, responseType: 'text', apiVersion: null })
      setLog({ title: t.name, text, loading: false })
    } catch (e) {
      setLog({ title: t.name, text: null, error: e, loading: false })
    }
  }

  // Atualiza o título da aba do log quando o release muda.
  useEffect(() => setLog(null), [id])

  if (rel.isLoading) return <Loading label="Carregando release…" />
  if (rel.isError) return <ErrorBox error={rel.error} onRetry={() => rel.refetch()} />
  if (!rel.data) return <Empty title="Release não encontrado" />
  const r = rel.data
  const z = releaseZone(r.environments, r.status)

  return (
    <>
      <PageHeader
        title={r.name}
        breadcrumb={
          <>
            <Link className="hover:text-fg" to={`${base}/releases${r.releaseDefinition ? `/${r.releaseDefinition.id}` : ''}`}>Releases</Link>
            {r.releaseDefinition && <span>/ {r.releaseDefinition.name}</span>}
          </>
        }
        actions={
          <>
            <StateLabel zone={z}>{REL_LABEL[z]}</StateLabel>
            <Button variant="ghost" size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => openExternal(webUrl(org, `${encodeURIComponent(project)}/_releaseProgress?_a=release-environment-logs&releaseId=${id}`))}>
              Abrir no navegador
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4 p-6">
        <div className="text-[13px] text-muted">
          Criado <TimeAgo date={r.createdOn} /> · {formatDate(r.createdOn, 'dd/MM/yyyy HH:mm')}
          {r.createdBy && <> · por {r.createdBy.displayName}</>}
          {r.description && <> · {r.description}</>}
        </div>

        {note && <InlineNote kind={note.kind}>{note.text}</InlineNote>}

        {approvals.isError && <ErrorBox error={approvals.error} onRetry={() => approvals.refetch()} />}
        {(approvals.data?.length ?? 0) > 0 && (
          <Section title={`Aprovações pendentes (${approvals.data!.length})`}>
            <div className="flex flex-col gap-3 p-3">
              <Field label="Comentário (opcional)">
                <Input value={comment} onChange={(e) => setComment(e.target.value)} />
              </Field>
              {approvals.data!.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-3 border-l-2 border-zone-progress pl-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {a.releaseEnvironment?.name ?? 'Environment'} · {a.approvalType === 'preDeploy' ? 'Aprovação pré-implantação' : 'Aprovação pós-implantação'}
                    </div>
                    {a.instructions && <div className="text-[12px] text-muted">{a.instructions}</div>}
                  </div>
                  <Button variant="success" size="sm" icon={<Check className="size-3.5" />} loading={decide.isPending} onClick={() => decide.mutate({ approvalId: a.id, status: 'approved' })}>
                    Aprovar
                  </Button>
                  <Button variant="danger" size="sm" icon={<X className="size-3.5" />} loading={decide.isPending} onClick={() => decide.mutate({ approvalId: a.id, status: 'rejected' })}>
                    Rejeitar
                  </Button>
                </div>
              ))}
            </div>
          </Section>
        )}

        {(r.environments ?? []).length === 0 && <Empty title="Este release não tem environments" />}
        {(r.environments ?? [])
          .slice()
          .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
          .map((env) => {
            const ez = releaseEnvZone(env.status)
            const steps = env.deploySteps ?? []
            const last = steps[steps.length - 1]
            const tasks = (last?.releaseDeployPhases ?? []).flatMap((p) => (p.deploymentJobs ?? []).flatMap((j) => j.tasks ?? []))
            const canDeploy = env.status === 'notStarted' || env.status === 'scheduled'
            return (
              <Section
                key={env.id}
                title={env.name}
                actions={
                  <div className="flex items-center gap-2">
                    <StateLabel zone={ez}>{releaseEnvLabel(env.status)}</StateLabel>
                    {canDeploy && (
                      <Button size="sm" variant="primary" icon={<Rocket className="size-3" />} onClick={() => setDeployEnv({ id: env.id, name: env.name })}>
                        Implantar
                      </Button>
                    )}
                  </div>
                }
              >
                {tasks.length === 0 ? (
                  <div className="px-3 py-3 text-[12px] text-muted">Sem tasks de implantação registradas ainda.</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {tasks.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 px-3 py-1.5">
                        <ZoneSquare zone={taskZone(t.status)} />
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                        <span className="text-[12px] text-muted">{recordStateLabel({ state: t.status === 'inProgress' ? 'inProgress' : 'completed', result: taskResult(t.status) })}</span>
                        <Button size="sm" variant="ghost" icon={<FileText className="size-3" />} disabled={!t.logUrl} onClick={() => openLog(t)}>
                          Ver log
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            )
          })}

        {log && (
          <div className="flex h-[360px] flex-col gap-2">
            <div className="flex items-center gap-2 text-[13px]">
              <span className="font-semibold">Log · {log.title}</span>
              <div className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => setLog(null)}>Fechar log</Button>
            </div>
            <div className="min-h-0 flex-1">
              {log.loading ? (
                <Loading label="Carregando log…" />
              ) : log.error ? (
                <ErrorBox error={log.error} />
              ) : (
                <LogViewer text={log.text ?? ''} />
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!deployEnv}
        title="Implantar environment?"
        message={`O environment ${deployEnv?.name ?? ''} será implantado agora (status inProgress).`}
        confirmLabel="Implantar"
        pending={deploy.isPending}
        error={deploy.error}
        onConfirm={() => deployEnv && deploy.mutate({ id: deployEnv.id })}
        onClose={() => setDeployEnv(null)}
      />
    </>
  )
}

function taskZone(status: string): Zone {
  switch (status) {
    case 'succeeded':
      return 'done'
    case 'failed':
      return 'fail'
    case 'inProgress':
      return 'progress'
    case 'canceled':
    case 'skipped':
      return 'idle'
    default:
      return 'new'
  }
}

function taskResult(status: string): string | null {
  switch (status) {
    case 'succeeded':
      return 'succeeded'
    case 'failed':
      return 'failed'
    case 'canceled':
      return 'canceled'
    case 'skipped':
      return 'skipped'
    default:
      return null
  }
}
