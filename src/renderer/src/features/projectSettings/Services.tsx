import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ado, seg } from '@/lib/api'
import { isMe, useMe, useScope } from '@/lib/context'
import { Empty, ErrorBox, Loading, MineToggle, PageHeader, Person, Section, StateLabel, Table, Standings, type Zone } from '@/components/ui'

interface ServiceEndpoint {
  id: string
  name: string
  type: string
  url?: string
  isReady?: boolean
  isShared?: boolean
  createdBy?: { displayName: string; id: string; uniqueName?: string }
  owner?: string
  operationStatus?: { state?: string; message?: string } | null
}

const readyInfo = (e: ServiceEndpoint): { label: string; zone: Zone } =>
  e.isReady === true ? { label: 'Pronta', zone: 'done' } : e.isReady === false ? { label: 'Não pronta', zone: 'fail' } : { label: 'Desconhecido', zone: 'idle' }

/** Conexões de serviço do projeto (somente leitura). */
export function Services() {
  const { org, project } = useScope()
  const me = useMe(org)
  const endpoints = useQuery({
    queryKey: ['ps', org, project, 'endpoints'],
    queryFn: () => ado<{ value: ServiceEndpoint[] }>({ org, path: `${seg(project)}/_apis/serviceendpoint/endpoints`, apiVersion: '7.1-preview.4' }).then((d) => d.value ?? [])
  })
  const [filter, setFilter] = useState<'ready' | 'notReady' | null>(null)
  const [onlyMine, setOnlyMine] = useState(false)

  const counts = useMemo(() => {
    const all = endpoints.data ?? []
    return {
      ready: all.filter((e) => e.isReady === true).length,
      notReady: all.filter((e) => e.isReady === false).length
    }
  }, [endpoints.data])

  const rows = useMemo(() => {
    let r = endpoints.data ?? []
    if (filter) r = r.filter((e) => (filter === 'ready' ? e.isReady === true : e.isReady === false))
    if (onlyMine) r = r.filter((e) => isMe(me.data, e.createdBy))
    return r
  }, [endpoints.data, filter, onlyMine, me.data])

  return (
    <>
      <PageHeader
        title="Conexões de serviço"
        subtitle={endpoints.data ? `${endpoints.data.length} ${endpoints.data.length === 1 ? 'conexão' : 'conexões'}` : undefined}
        breadcrumb={<span>Configurações do projeto · {project}</span>}
      />
      <div className="flex flex-col gap-4 p-6">
        {endpoints.isLoading && <Loading />}
        {endpoints.isError && <ErrorBox error={endpoints.error} onRetry={() => endpoints.refetch()} />}
        {endpoints.data && (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Standings
                items={[
                  { key: 'ready', label: 'Prontas', zone: 'done', count: counts.ready },
                  { key: 'notReady', label: 'Não prontas', zone: 'fail', count: counts.notReady }
                ]}
                value={filter}
                onSelect={setFilter}
              />
              <div className="flex-1" />
              <MineToggle active={onlyMine} onChange={setOnlyMine} label="Criadas por mim" />
            </div>
            {endpoints.data.length === 0 ? (
              <Empty title="Nenhuma conexão de serviço neste projeto">Conexões com Azure, GitHub, Docker e outros provedores aparecem aqui.</Empty>
            ) : rows.length === 0 ? (
              <Empty title="Nenhuma conexão com esse filtro" />
            ) : (
              <Section title="Conexões">
                <Table
                  persistKey="projectSettings.services"
                  rows={rows}
                  rowKey={(e) => e.id}
                  zone={(e) => readyInfo(e).zone}
                  mine={(e) => isMe(me.data, e.createdBy)}
                  columns={[
                    { key: 'name', header: 'Nome', render: (e) => <span className="font-semibold">{e.name}</span>, sortValue: (e) => e.name },
                    { key: 'type', header: 'Tipo', render: (e) => <span className="text-muted">{e.type}</span> },
                    {
                      key: 'ready',
                      header: 'Status',
                      render: (e) => {
                        const info = readyInfo(e)
                        return <StateLabel zone={info.zone}>{info.label}</StateLabel>
                      }
                    },
                    { key: 'by', header: 'Criado por', render: (e) => (e.createdBy ? <Person identity={e.createdBy} size={18} /> : <span className="text-muted">—</span>) }
                  ]}
                />
              </Section>
            )}
          </>
        )}
      </div>
    </>
  )
}
