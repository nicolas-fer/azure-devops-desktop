// Configurações do feed em modo somente leitura: upstreams, visões e permissões.
import { Badge, Empty, QueryView, Section, Table } from '@/components/ui'
import type { Zone } from '@/lib/zones'
import { PROTOCOL_LABEL, protocolGroup, useFeedPermissions, useFeedViews, type Feed, type FeedUpstream } from './api'

export function FeedSettings({ org, feed }: { org: string; feed: Feed }) {
  const upstreams = feed.upstreamSources ?? []
  const views = useFeedViews(org, feed)
  const perms = useFeedPermissions(org, feed)
  return (
    <div className="flex flex-col gap-4 overflow-auto p-6">
      <Section title={`Upstreams (${upstreams.length})`}>
        {upstreams.length === 0 ? (
          <Empty title="Sem upstreams">Este feed não consome pacotes de fontes externas.</Empty>
        ) : (
          <Table<FeedUpstream>
            persistKey="artifacts.feedSettings.upstreams"
            rows={upstreams}
            rowKey={(u) => u.id ?? `${u.name}-${u.protocol}`}
            zone={(u): Zone => (u.status && u.status.toLowerCase() !== 'enabled' ? 'idle' : 'done')}
            columns={[
              { key: 'nome', header: 'Nome', render: (u) => <span className="font-medium">{u.name}</span> },
              { key: 'protocolo', header: 'Protocolo', width: 120, render: (u) => PROTOCOL_LABEL[protocolGroup(u.protocol)] },
              { key: 'tipo', header: 'Tipo', width: 160, render: (u) => <span className="text-muted">{u.upstreamSourceType ?? '—'}</span> },
              { key: 'local', header: 'Local', render: (u) => <span className="block max-w-[380px] truncate text-muted">{u.location ?? '—'}</span> },
              { key: 'status', header: 'Status', width: 120, render: (u) => <span className="text-muted">{u.status ?? '—'}</span> }
            ]}
          />
        )}
      </Section>

      <Section title="Visões">
        <QueryView query={views} empty={(d) => d.length === 0} emptyTitle="Nenhuma visão">
          {(list) => (
            <div className="flex flex-wrap gap-2 p-3">
              {list.map((v) => (
                <Badge key={v.id}>
                  @{v.name} · {v.type}
                </Badge>
              ))}
            </div>
          )}
        </QueryView>
      </Section>

      <Section title="Permissões">
        <QueryView query={perms} empty={(d) => d.length === 0} emptyTitle="Nenhuma permissão listada">
          {(list) => (
            <Table
              persistKey="artifacts.feedSettings.permissions"
              rows={list}
              rowKey={(p) => `${p.role}-${p.identityDescriptor}`}
              columns={[
                { key: 'papel', header: 'Papel', width: 160, render: (p) => <span className="capitalize">{p.role}</span> },
                {
                  key: 'quem',
                  header: 'Identidade',
                  render: (p) => (
                    <span className="block truncate">
                      {p.displayName ?? p.identityDescriptor.split(/[\;]/).pop() ?? p.identityDescriptor}
                    </span>
                  )
                },
                {
                  key: 'herdada',
                  header: 'Origem',
                  width: 120,
                  render: (p) => <span className="text-muted">{p.isInheritedRole ? 'Herdada' : 'Direta'}</span>
                }
              ]}
            />
          )}
        </QueryView>
      </Section>

      <Section title="Retenção">
        <p className="p-3 text-muted">Política de retenção não exibida nesta versão do app.</p>
      </Section>
    </div>
  )
}
