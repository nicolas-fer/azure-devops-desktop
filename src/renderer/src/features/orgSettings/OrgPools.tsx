import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adoList, seg } from '@/lib/api'
import { useScope } from '@/lib/context'
import { Badge, Empty, ErrorBox, Loading, PageHeader, Section, StateLabel, Standings, Table, type Zone } from '@/components/ui'

interface AgentPool {
  id: number
  name: string
  isHosted: boolean
  poolType?: string
  size?: number
  isLegacy?: boolean
}

interface Agent {
  id: number
  name: string
  version?: string
  enabled: boolean
  status: string
  provisioningState?: string
}

const agentZone = (a: Agent): Zone => (a.status === 'online' ? 'done' : 'idle')

/** Pools de agentes da organização e os agentes do pool selecionado (somente leitura). */
export function OrgPools() {
  const { org } = useScope()
  const pools = useQuery({
    queryKey: ['os', org, 'pools'],
    enabled: !!org,
    queryFn: () => adoList<AgentPool>({ org, path: '_apis/distributedtask/pools' })
  })
  const [selected, setSelected] = useState<AgentPool | null>(null)
  const agents = useQuery({
    queryKey: ['os', org, 'pool-agents', selected?.id],
    enabled: !!org && !!selected,
    queryFn: () => adoList<Agent>({ org, path: `_apis/distributedtask/pools/${seg(String(selected!.id))}/agents`, query: { includeCapabilities: false } })
  })
  const [filter, setFilter] = useState<'online' | 'offline' | null>(null)

  const counts = useMemo(() => {
    const all = agents.data ?? []
    const online = all.filter((a) => a.status === 'online').length
    return { online, offline: all.length - online }
  }, [agents.data])

  const shownAgents = useMemo(() => {
    const all = agents.data ?? []
    if (!filter) return all
    return all.filter((a) => (filter === 'online' ? a.status === 'online' : a.status !== 'online'))
  }, [agents.data, filter])

  return (
    <>
      <PageHeader title="Agent pools" subtitle={pools.data ? `${pools.data.length} pools` : undefined} />
      <div className="grid gap-4 p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {pools.isLoading && <Loading />}
          {pools.isError && <ErrorBox error={pools.error} onRetry={() => pools.refetch()} />}
          {pools.data &&
            (pools.data.length === 0 ? (
              <Empty title="Nenhum pool de agentes" />
            ) : (
              <Section title="Pools">
                <Table
                  persistKey="orgSettings.pools"
                  rows={pools.data}
                  rowKey={(p) => p.id}
                  onRowClick={(p) => {
                    setFilter(null)
                    setSelected(p)
                  }}
                  selectedKey={selected?.id}
                  columns={[
                    { key: 'name', header: 'Pool', render: (p) => <span className="font-semibold">{p.name}</span>, sortValue: (p) => p.name },
                    { key: 'kind', header: 'Tipo', render: (p) => <Badge>{p.isHosted ? 'Hospedado pela Microsoft' : 'Autogerenciado'}</Badge> },
                    { key: 'size', header: 'Agentes', align: 'right', render: (p) => <span className="narrow">{p.size ?? '—'}</span> }
                  ]}
                />
              </Section>
            ))}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {!selected && <Empty title="Selecione um pool">Os agentes do pool e o status de cada um aparecem aqui.</Empty>}
          {selected && (
            <>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <Standings
                  items={[
                    { key: 'online', label: 'Online', zone: 'done', count: counts.online },
                    { key: 'offline', label: 'Offline', zone: 'idle', count: counts.offline }
                  ]}
                  value={filter}
                  onSelect={setFilter}
                />
              </div>
              {agents.isLoading && <Loading label="Carregando agentes…" />}
              {agents.isError && <ErrorBox error={agents.error} onRetry={() => agents.refetch()} />}
              {agents.data &&
                (agents.data.length === 0 ? (
                  <Empty title="Nenhum agente neste pool" />
                ) : (
                  <Section title={`Agentes · ${selected.name}`}>
                    <Table
                      persistKey="orgSettings.pools.agents"
                      rows={shownAgents}
                      rowKey={(a) => a.id}
                      zone={agentZone}
                      columns={[
                        { key: 'name', header: 'Agente', render: (a) => <span className="font-semibold">{a.name}</span>, sortValue: (a) => a.name },
                        {
                          key: 'status',
                          header: 'Status',
                          render: (a) => (a.status === 'online' ? <StateLabel zone="done">Online</StateLabel> : <StateLabel zone="idle">Offline</StateLabel>)
                        },
                        { key: 'enabled', header: 'Habilitado', render: (a) => (a.enabled ? <Badge>Sim</Badge> : <span className="text-muted">Não</span>) },
                        { key: 'ver', header: 'Versão', render: (a) => <span className="narrow text-muted">{a.version ?? '—'}</span> }
                      ]}
                    />
                  </Section>
                ))}
            </>
          )}
        </div>
      </div>
    </>
  )
}
