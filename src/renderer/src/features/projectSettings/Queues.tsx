import { useQuery } from '@tanstack/react-query'
import { adoList, seg } from '@/lib/api'
import { useScope } from '@/lib/context'
import { Badge, Empty, ErrorBox, Loading, PageHeader, Section, Table } from '@/components/ui'

interface AgentQueue {
  id: number
  name: string
  pool: { id: number; name: string; isHosted: boolean; poolType?: string; size?: number }
}

/** Filas de agentes do projeto e o pool de cada uma (somente leitura). */
export function Queues() {
  const { org, project } = useScope()
  const queues = useQuery({
    queryKey: ['ps', org, project, 'queues'],
    queryFn: () => adoList<AgentQueue>({ org, path: `${seg(project)}/_apis/distributedtask/queues` })
  })
  return (
    <>
      <PageHeader
        title="Filas de agentes"
        subtitle={queues.data ? `${queues.data.length} ${queues.data.length === 1 ? 'fila' : 'filas'}` : undefined}
        breadcrumb={<span>Configurações do projeto · {project}</span>}
      />
      <div className="flex flex-col gap-4 p-6">
        {queues.isLoading && <Loading />}
        {queues.isError && <ErrorBox error={queues.error} onRetry={() => queues.refetch()} />}
        {queues.data &&
          (queues.data.length === 0 ? (
            <Empty title="Nenhuma fila de agentes neste projeto" />
          ) : (
            <Section title="Filas">
              <Table
                persistKey="projectSettings.queues"
                rows={queues.data}
                rowKey={(q) => q.id}
                columns={[
                  { key: 'name', header: 'Fila', render: (q) => <span className="font-semibold">{q.name}</span>, sortValue: (q) => q.name },
                  { key: 'pool', header: 'Pool de agentes', render: (q) => <span>{q.pool?.name ?? '—'}</span> },
                  {
                    key: 'kind',
                    header: 'Tipo',
                    render: (q) => (q.pool?.isHosted ? <Badge>Hospedado pela Microsoft</Badge> : <Badge>Autogerenciado</Badge>)
                  },
                  { key: 'size', header: 'Agentes', align: 'right', render: (q) => <span className="narrow">{q.pool?.size ?? '—'}</span> }
                ]}
              />
            </Section>
          ))}
        {queues.data && queues.data.length > 0 && (
          <p className="text-[12px] text-muted">Os pools são do nível da organização; a lista de agentes de cada um fica em Configurações da organização.</p>
        )}
      </div>
    </>
  )
}
