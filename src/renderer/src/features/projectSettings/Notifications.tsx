import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ado } from '@/lib/api'
import { isMe, useMe, useScope } from '@/lib/context'
import { Empty, ErrorBox, Loading, MineToggle, PageHeader, Person, Section, StateLabel, Table, TimeAgo, Standings, type Zone } from '@/components/ui'
import { useProjectDetail } from './shared'

interface Subscription {
  id: string
  description?: string
  status: string
  modifiedDate?: string
  subscriber?: { displayName: string; id: string; uniqueName?: string }
  scope?: { id?: string; name?: string; type?: string }
  channel?: { type?: string }
}

const isEnabled = (s: Subscription) => s.status === 'enabled'

const statusInfo = (s: string): { label: string; zone: Zone } =>
  s === 'enabled'
    ? { label: 'Ativa', zone: 'done' }
    : s.startsWith('disabled')
      ? { label: 'Desativada', zone: 'idle' }
      : { label: s, zone: 'new' }

/** Assinaturas de notificação do projeto (somente leitura: criar ou editar fica no portal). */
export function Notifications() {
  const { org, project } = useScope()
  const detail = useProjectDetail(org, project)
  const me = useMe(org)
  const subs = useQuery({
    queryKey: ['ps', org, 'subscriptions'],
    queryFn: async () => (await ado<{ value: Subscription[] }>({ org, path: '_apis/notification/subscriptions' })).value ?? []
  })
  const [onlyMine, setOnlyMine] = useState(false)
  const [filter, setFilter] = useState<'enabled' | 'disabled' | null>(null)

  const projectId = detail.data?.id
  // Assinaturas cujo escopo é este projeto (por id ou nome)
  const scoped = useMemo(() => {
    const all = subs.data ?? []
    if (!projectId) return []
    return all.filter((s) => s.scope?.id === projectId || s.scope?.name === project)
  }, [subs.data, projectId, project])

  const enabledCount = scoped.filter(isEnabled).length
  const shown = useMemo(() => {
    let rows = scoped
    if (filter) rows = rows.filter((s) => (filter === 'enabled' ? isEnabled(s) : !isEnabled(s)))
    if (onlyMine) rows = rows.filter((s) => isMe(me.data, s.subscriber))
    return rows
  }, [scoped, filter, onlyMine, me.data])

  return (
    <>
      <PageHeader
        title="Notificações"
        subtitle={subs.data ? `${scoped.length} ${scoped.length === 1 ? 'assinatura' : 'assinaturas'}` : undefined}
        breadcrumb={<span>Configurações do projeto · {project}</span>}
      />
      <div className="flex flex-col gap-4 p-6">
        {(subs.isLoading || detail.isLoading) && <Loading />}
        {subs.isError && <ErrorBox error={subs.error} onRetry={() => subs.refetch()} />}
        {detail.isError && <ErrorBox error={detail.error} onRetry={() => detail.refetch()} />}
        {subs.data && detail.data && (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Standings
                items={[
                  { key: 'enabled', label: 'Ativas', zone: 'done', count: enabledCount },
                  { key: 'disabled', label: 'Desativadas', zone: 'idle', count: scoped.length - enabledCount }
                ]}
                value={filter}
                onSelect={setFilter}
              />
              <div className="flex-1" />
              <MineToggle active={onlyMine} onChange={setOnlyMine} label="Criadas por mim" />
            </div>

            {scoped.length === 0 ? (
              <Empty title="Nenhuma assinatura neste projeto">As notificações criadas pelos usuários para este projeto aparecem aqui.</Empty>
            ) : shown.length === 0 ? (
              <Empty title="Nenhuma assinatura com esse filtro" />
            ) : (
              <Section title="Assinaturas">
                <Table
                  persistKey="projectSettings.notifications"
                  rows={shown}
                  rowKey={(s) => s.id}
                  zone={(s) => statusInfo(s.status).zone}
                  mine={(s) => isMe(me.data, s.subscriber)}
                  columns={[
                    {
                      key: 'desc',
                      header: 'Descrição',
                      render: (s) => <span className="block max-w-[420px] truncate font-medium">{s.description || 'Sem descrição'}</span>
                    },
                    { key: 'sub', header: 'Assinante', render: (s) => <Person identity={s.subscriber} size={18} /> },
                    {
                      key: 'status',
                      header: 'Status',
                      render: (s) => {
                        const info = statusInfo(s.status)
                        return <StateLabel zone={info.zone}>{info.label}</StateLabel>
                      }
                    },
                    { key: 'channel', header: 'Canal', render: (s) => <span className="text-muted">{s.channel?.type ?? '—'}</span> },
                    {
                      key: 'mod',
                      header: 'Modificada',
                      render: (s) => (
                        <span className="text-muted">
                          <TimeAgo date={s.modifiedDate} />
                        </span>
                      ),
                      sortValue: (s) => s.modifiedDate
                    }
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
