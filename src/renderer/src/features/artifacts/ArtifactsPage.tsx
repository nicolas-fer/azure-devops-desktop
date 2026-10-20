// Página de Artifacts: seletor de feed, pacotes do feed (tabela com faixa de zona) e configurações.
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Empty, ExternalButton, Input, Loading, PageHeader, QueryView, Select, SidePanel, Standings, Table, Tabs, Toolbar, TimeAgo, Button, ErrorBox, IdCell } from '@/components/ui'
import { useScope } from '@/lib/context'
import { seg, webUrl } from '@/lib/api'
import type { Zone } from '@/lib/zones'
import { PROTOCOL_LABEL, protocolGroup, useFeedViews, useFeeds, usePackages, type Feed, type FeedPackage, type ProtocolGroup } from './api'
import { PackageDetail } from './PackageDetail'
import { PROTOCOL_ICON } from './icons'
import { FeedSettings } from './FeedSettings'

/** Lê e grava filtros na URL (?feed=&pkg=&tab=&proto=&view=&q=&estado=). */
export function useArtifactParams() {
  const [sp, setSp] = useSearchParams()
  const set = (patch: Record<string, string | null>) =>
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(patch)) {
          if (v) n.set(k, v)
          else n.delete(k)
        }
        return n
      },
      { replace: true }
    )
  return { sp, set }
}

export function ArtifactsPage() {
  const { org, project } = useScope()
  const feeds = useFeeds(org, project)
  return (
    <QueryView query={feeds} empty={(d) => d.length === 0} emptyTitle="Nenhum feed disponível">
      {(all) => <ArtifactsBody org={org} project={project} feeds={all} />}
    </QueryView>
  )
}

function ArtifactsBody({ org, project, feeds }: { org: string; project: string; feeds: Feed[] }) {
  const { sp, set } = useArtifactParams()
  const feed = feeds.find((f) => f.id === sp.get('feed')) ?? feeds[0]!
  const tab = sp.get('tab') === 'config' ? 'config' : 'pacotes'
  const scopeLabel = feed.scope.kind === 'project' ? `Projeto ${feed.scope.project}` : 'Organização'

  return (
    <>
      <PageHeader
        title="Artifacts"
        subtitle={`${feed.name} · ${scopeLabel}`}
        actions={<ExternalButton url={webUrl(org, `${seg(project)}/_artifacts/feed/${seg(feed.name)}`)} />}
      >
        <Tabs
          tabs={[
            { key: 'pacotes', label: 'Pacotes' },
            { key: 'config', label: 'Configurações do feed' }
          ]}
          value={tab}
          onChange={(k) => set({ tab: k === 'config' ? 'config' : null })}
        />
      </PageHeader>

      <Toolbar>
        <Select className="w-72" aria-label="Feed" value={feed.id} onChange={(e) => set({ feed: e.target.value, pkg: null })}>
          {feeds.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} — {f.scope.kind === 'project' ? `projeto ${f.scope.project}` : 'organização'}
            </option>
          ))}
        </Select>
        <span className="text-[12px] text-muted">
          Upstreams:{' '}
          {feed.upstreamSources && feed.upstreamSources.length > 0
            ? feed.upstreamSources.map((u) => `${u.name} (${PROTOCOL_LABEL[protocolGroup(u.protocol)]})`).join(' · ')
            : 'nenhum'}
          {feed.upstreamEnabled === false && ' · upstreams desativados'}
        </span>
      </Toolbar>

      {tab === 'config' ? <FeedSettings org={org} feed={feed} /> : <PackagesView org={org} feed={feed} />}
    </>
  )
}

function PackagesView({ org, feed }: { org: string; feed: Feed }) {
  const { sp, set } = useArtifactParams()
  const packages = usePackages(org, feed)
  const all = useMemo(() => packages.data?.pages.flat() ?? [], [packages.data])
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>({ key: 'nome', dir: 'asc' })

  const proto = (sp.get('proto') ?? 'todos') as ProtocolGroup | 'todos'
  const view = sp.get('view') ?? ''
  const q = sp.get('q') ?? ''
  const estado = sp.get('estado') ?? ''

  const protocolsPresent = useMemo(() => [...new Set(all.map((p) => protocolGroup(p.protocolType)))], [all])
  // Zona por tipo de versão: verde = estável listada, âmbar = última versão é prerelease, cinza = não listado.
  const zoneOf = (p: FeedPackage): Zone => {
    if (!p.versions.some((v) => v.isListed)) return 'idle'
    const version = (p.versions.find((v) => v.isLatest) ?? p.versions[0])?.version ?? ''
    return version.includes('-') ? 'progress' : 'done'
  }
  const countOf = (z: Zone) => all.filter((p) => zoneOf(p) === z).length

  const rows = all.filter((p) => {
    if (proto !== 'todos' && protocolGroup(p.protocolType) !== proto) return false
    if (view && !p.versions.some((v) => v.views.some((x) => x.name === view))) return false
    if (estado === 'listado' && zoneOf(p) !== 'done') return false
    if (estado === 'pre-release' && zoneOf(p) !== 'progress') return false
    if (estado === 'nao-listado' && zoneOf(p) !== 'idle') return false
    if (q && !`${p.name} ${p.versions[0]?.packageDescription ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  const selected = all.find((p) => p.id === sp.get('pkg')) ?? null
  const latest = (p: FeedPackage) => p.versions.find((v) => v.isLatest) ?? p.versions[0]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar>
        <Standings
          items={[
            { key: 'listado', label: 'Listados', zone: 'done', count: countOf('done') },
            { key: 'pre-release', label: 'Pré-release', zone: 'progress', count: countOf('progress') },
            { key: 'nao-listado', label: 'Não listados', zone: 'idle', count: countOf('idle') }
          ]}
          value={(estado || null) as 'listado' | 'pre-release' | 'nao-listado' | null}
          onSelect={(k) => set({ estado: k })}
        />
        <div className="flex-1" />
        <Select className="w-36" aria-label="Tipo de protocolo" value={proto} onChange={(e) => set({ proto: e.target.value === 'todos' ? null : e.target.value })}>
          <option value="todos">Todos os tipos</option>
          {(['nuget', 'npm', 'maven', 'pypi', 'upack'] as ProtocolGroup[])
            .filter((g) => protocolsPresent.includes(g) || proto === g)
            .map((g) => (
              <option key={g} value={g}>
                {PROTOCOL_LABEL[g]}
              </option>
            ))}
        </Select>
        <ViewSelect org={org} feed={feed} value={view} onChange={(v) => set({ view: v || null })} />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted" />
          <Input
            className="w-56 pl-7"
            placeholder="Buscar pacote"
            aria-label="Buscar pacote"
            value={q}
            onChange={(e) => set({ q: e.target.value || null })}
          />
        </div>
      </Toolbar>

      {packages.isLoading ? (
        <Loading label="Carregando pacotes…" />
      ) : packages.isError ? (
        <ErrorBox error={packages.error} onRetry={() => packages.refetch()} />
      ) : all.length === 0 ? (
        <Empty title="Nenhum pacote neste feed">Publique um pacote ou verifique o feed selecionado.</Empty>
      ) : rows.length === 0 ? (
        <Empty title="Nenhum pacote encontrado">Ajuste os filtros ou a busca.</Empty>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <Table<FeedPackage>
            persistKey="artifacts.packages"
            rows={rows}
            rowKey={(p) => p.id}
            zone={zoneOf}
            selectedKey={selected?.id ?? null}
            onRowClick={(p) => set({ pkg: p.id })}
            sort={sort}
            onSortChange={setSort}
            columns={[
              {
                key: 'nome',
                header: 'Nome',
                sortValue: (p) => p.name.toLowerCase(),
                render: (p) => <span className="font-medium">{p.name}</span>
              },
              {
                key: 'tipo',
                header: 'Tipo',
                width: 120,
                sortValue: (p) => PROTOCOL_LABEL[protocolGroup(p.protocolType)],
                render: (p) => {
                  const g = protocolGroup(p.protocolType)
                  const Icon = PROTOCOL_ICON[g]
                  return (
                    <span className="inline-flex items-center gap-1.5 text-muted">
                      <Icon className="size-3.5" />
                      {PROTOCOL_LABEL[g]}
                    </span>
                  )
                }
              },
              {
                key: 'versao',
                header: 'Última versão',
                width: 150,
                render: (p) => <IdCell>{latest(p)?.version ?? '—'}</IdCell>
              },
              {
                key: 'descricao',
                header: 'Descrição',
                render: (p) => (
                  <span className="block max-w-[420px] truncate text-muted">{latest(p)?.packageDescription || p.versions[0]?.packageDescription || ''}</span>
                )
              },
              {
                key: 'data',
                header: 'Publicado',
                width: 140,
                sortValue: (p) => new Date(latest(p)?.publishDate ?? 0).getTime(),
                render: (p) => (
                  <span className="whitespace-nowrap text-muted">
                    <TimeAgo date={latest(p)?.publishDate} />
                  </span>
                )
              }
            ]}
          />
          {packages.hasNextPage && (
            <div className="flex justify-center py-3">
              <Button onClick={() => packages.fetchNextPage()} loading={packages.isFetchingNextPage}>
                Carregar mais pacotes
              </Button>
            </div>
          )}
        </div>
      )}

      <SidePanel
        open={!!selected}
        onClose={() => set({ pkg: null })}
        title={selected ? `${selected.name}` : ''}
        width={820}
      >
        {selected && <PackageDetail org={org} feed={feed} pkg={selected} />}
      </SidePanel>
    </div>
  )
}

/** Filtro de visão (@Local, @Prerelease, @Release) carregado das views do feed. */
function ViewSelect({ org, feed, value, onChange }: { org: string; feed: Feed; value: string; onChange: (v: string) => void }) {
  const views = useFeedViews(org, feed)
  if (views.isError) return <span className="text-[12px] text-fail-ink">Visões indisponíveis</span>
  return (
    <Select className="w-36" aria-label="Visão" value={value} disabled={views.isLoading} onChange={(e) => onChange(e.target.value)}>
      <option value="">Todas as visões</option>
      {(views.data ?? []).map((v) => (
        <option key={v.id} value={v.name}>
          @{v.name}
        </option>
      ))}
    </Select>
  )
}
