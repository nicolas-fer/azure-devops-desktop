// Environments: lista com a última implantação por zona e detalhe com recursos e histórico de implantações.
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Server } from 'lucide-react'
import { Badge, Empty, ErrorBox, Input, Loading, PageHeader, Person, Section, StateLabel, Standings, Table, TimeAgo, Toolbar, formatDate, type Column, type Zone } from '@/components/ui'
import { useScope } from '@/lib/context'
import { envRecordZone, formatMs, pipelinesBase, runDurationMs } from './lib'
import { useEnvLastRecords, useEnvRecords, useEnvironment, useEnvironments } from './queries'
import type { EnvDeploymentRecord, Environment } from './types'

const ENV_LABEL: Record<Zone, string> = { done: 'Concluída', fail: 'Com falha', progress: 'Em andamento', review: 'Aguardando aprovação', new: 'Sem implantação', idle: 'Cancelada' }
const ZONE_ORDER: Zone[] = ['done', 'progress', 'fail', 'new', 'idle']

/** Zona de um registro de implantação; sem registro, "novo" (nunca implantado). */
const recZone = (r?: EnvDeploymentRecord | null): Zone => envRecordZone(r) ?? 'new'

export function EnvironmentsList() {
  const { org, project } = useScope()
  const base = pipelinesBase(org, project)
  const navigate = useNavigate()
  const envs = useEnvironments(org, project)
  const list = envs.data ?? []
  const last = useEnvLastRecords(
    org,
    project,
    list.map((e) => e.id)
  )
  const [zone, setZone] = useState<Zone | null>(null)
  const [search, setSearch] = useState('')

  const rows = useMemo(
    () =>
      list.map((e, i) => ({ env: e, rec: last[i]?.data ?? null, zone: recZone(last[i]?.data ?? null), loading: last[i]?.isLoading ?? false })),
    [list, last]
  )
  const counts = useMemo(() => {
    const c: Partial<Record<Zone, number>> = {}
    for (const r of rows) c[r.zone] = (c[r.zone] ?? 0) + 1
    return c
  }, [rows])
  const shown = rows.filter((r) => (!zone || r.zone === zone) && (!search.trim() || r.env.name.toLowerCase().includes(search.trim().toLowerCase())))

  type Row = (typeof rows)[number]
  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Environment',
      width: '32%',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{r.env.name}</div>
          {r.env.description && <div className="truncate text-[12px] text-muted">{r.env.description}</div>}
        </div>
      )
    },
    {
      key: 'last',
      header: 'Última implantação',
      render: (r) =>
        r.loading ? (
          <span className="text-muted">…</span>
        ) : r.rec ? (
          <span className="block truncate">
            {r.rec.definition?.name ?? 'Pipeline'}
            {r.rec.stageName ? ` · ${r.rec.stageName}` : ''}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )
    },
    {
      key: 'status',
      header: 'Status',
      width: 150,
      render: (r) => <StateLabel zone={r.zone}>{ENV_LABEL[r.zone]}</StateLabel>
    },
    {
      key: 'resources',
      header: 'Recursos',
      width: 100,
      align: 'right',
      render: (r) => <span className="narrow font-medium">{r.env.resources?.length ?? 0}</span>
    },
    {
      key: 'when',
      header: 'Modificado',
      width: 120,
      render: (r) => <span className="text-[12px] text-muted"><TimeAgo date={r.env.lastModifiedOn} /></span>
    }
  ]

  return (
    <>
      <PageHeader title="Environments" subtitle={envs.data ? `${list.length} environment(s)` : undefined} />
      <Toolbar className="bg-bg">
        {envs.data && list.length > 0 && (
          <Standings
            items={ZONE_ORDER.filter((z) => counts[z]).map((z) => ({ key: z, label: ENV_LABEL[z], zone: z, count: counts[z]! }))}
            value={zone}
            onSelect={setZone}
          />
        )}
        <div className="flex-1" />
        <Input className="w-56" placeholder="Filtrar environments" value={search} onChange={(e) => setSearch(e.target.value)} />
      </Toolbar>
      {envs.isLoading && <Loading label="Carregando environments…" />}
      {envs.isError && <ErrorBox error={envs.error} onRetry={() => envs.refetch()} />}
      {envs.data && list.length === 0 && <Empty title="Nenhum environment neste projeto" icon={<Server className="size-6" />} />}
      {envs.data && list.length > 0 &&
        (shown.length === 0 ? (
          <Empty title="Nenhum environment corresponde ao filtro" />
        ) : (
          <Table persistKey="pipelines.environments" rows={shown} columns={columns} rowKey={(r) => r.env.id} zone={(r) => r.zone} onRowClick={(r) => navigate(`${base}/environments/${r.env.id}`)} />
        ))}
    </>
  )
}

export function EnvironmentDetail() {
  const { environmentId } = useParams()
  const id = Number(environmentId)
  const { org, project } = useScope()
  const base = pipelinesBase(org, project)
  const env = useEnvironment(org, project, id)
  const records = useEnvRecords(org, project, id, 30)

  if (env.isLoading) return <Loading label="Carregando environment…" />
  if (env.isError) return <ErrorBox error={env.error} onRetry={() => env.refetch()} />
  if (!env.data) return <Empty title="Environment não encontrado" />
  const e: Environment = env.data
  const latest = records.data?.[0] ?? null

  return (
    <>
      <PageHeader
        title={e.name}
        subtitle={e.description}
        breadcrumb={
          <>
            <Link className="hover:text-fg" to={base}>Pipelines</Link>
            <span>/</span>
            <Link className="hover:text-fg" to={`${base}/environments`}>Environments</Link>
          </>
        }
        actions={<StateLabel zone={recZone(latest)}>{ENV_LABEL[recZone(latest)]}</StateLabel>}
      />
      <div className="grid gap-4 p-6 xl:grid-cols-[320px_1fr]">
        <Section title={`Recursos (${e.resources?.length ?? 0})`}>
          {(e.resources?.length ?? 0) === 0 ? (
            <div className="px-3 py-4 text-muted">Nenhum recurso (Kubernetes ou VM) vinculado a este environment.</div>
          ) : (
            <ul className="divide-y divide-border">
              {e.resources!.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                  <Badge>{r.type}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Histórico de implantações">
          {records.isLoading && <Loading label="Carregando implantações…" />}
          {records.isError && <ErrorBox error={records.error} onRetry={() => records.refetch()} />}
          {records.data && records.data.length === 0 && <div className="px-3 py-4 text-muted">Nenhuma implantação registrada.</div>}
          {records.data && records.data.length > 0 && (
            <DeployTable records={records.data} />
          )}
        </Section>
      </div>
    </>
  )
}

function DeployTable({ records }: { records: EnvDeploymentRecord[] }) {
  const cols: Column<EnvDeploymentRecord>[] = [
    { key: 'pipeline', header: 'Pipeline', render: (r) => <span className="truncate">{r.definition?.name ?? '—'}</span> },
    {
      key: 'stage',
      header: 'Stage / job',
      render: (r) => <span className="truncate text-muted">{[r.stageName, r.jobName].filter(Boolean).join(' · ') || '—'}</span>
    },
    { key: 'status', header: 'Status', width: 140, render: (r) => <StateLabel zone={recZone(r)}>{ENV_LABEL[recZone(r)]}</StateLabel> },
    {
      key: 'dur',
      header: 'Duração',
      width: 90,
      align: 'right',
      render: (r) => <span className="narrow font-medium">{formatMs(runDurationMs({ startTime: r.startTime ?? undefined, finishTime: r.finishTime ?? undefined }))}</span>
    },
    {
      key: 'when',
      header: 'Quando',
      width: 130,
      render: (r) => <span className="text-[12px] whitespace-nowrap text-muted">{formatDate(r.finishTime ?? r.startTime, 'dd/MM HH:mm')}</span>
    },
    {
      key: 'owner',
      header: 'Responsável',
      width: 170,
      render: (r) => (r.owner?.displayName ? <Person identity={{ id: '', displayName: r.owner.displayName }} size={18} /> : <span className="text-muted">—</span>)
    }
  ]
  return <Table persistKey="pipelines.environments.deployments" rows={records} columns={cols} rowKey={(r) => r.id} zone={recZone} />
}

