import { useMemo, useRef, useState, type MouseEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LayoutGrid, List, Plus, Search as SearchIcon, FolderOpen } from 'lucide-react'
import { Badge, Button, Empty, ExternalButton, IconButton, Input, PageHeader, QueryView, Section, Table, TimeAgo, cx } from '@/components/ui'
import { useProjects } from '@/lib/context'
import { seg, webUrl, type Project } from '@/lib/api'
import { useTabs } from '@/tabs/context'
import { CreateProjectModal } from './CreateProjectModal'
import { pushRecent, readRecents } from './recents'

type View = 'grid' | 'list'
const VIEW_KEY = 'devops-desktop:home-view'

const visibilityLabel = (v: string) => (v === 'public' ? 'Público' : v === 'organization' ? 'Organização' : 'Privado')

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

export function HomePage() {
  const { org = '' } = useParams()
  const navigate = useNavigate()
  const projects = useProjects(org)
  const [text, setText] = useState('')
  const [view, setViewState] = useState<View>(readView)
  const [creating, setCreating] = useState(false)
  const [recentsVersion, setRecentsVersion] = useState(0)

  const setView = (v: View) => {
    setViewState(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // armazenamento indisponível: a preferência vale só nesta sessão
    }
  }

  const sorted = useMemo(
    () => [...(projects.data ?? [])].sort((a, b) => (b.lastUpdateTime ?? '').localeCompare(a.lastUpdateTime ?? '')),
    [projects.data]
  )
  const q = text.trim().toLowerCase()
  const filtered = useMemo(
    () => (q ? sorted.filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)) : sorted),
    [sorted, q]
  )

  // Recentes: só nomes que ainda existem na organização
  const recents = useMemo(() => {
    void recentsVersion
    const byName = new Map(sorted.map((p) => [p.name, p]))
    return readRecents(org)
      .map((n) => byName.get(n))
      .filter((p): p is Project => !!p)
  }, [org, sorted, recentsVersion])

  const { openTab } = useTabs()
  // Ctrl+clique / clique do meio abre o projeto em nova aba (em segundo plano, como no navegador)
  const ctrlRef = useRef(false)
  const remember = (e: MouseEvent) => {
    ctrlRef.current = e.ctrlKey || e.metaKey
  }
  const middleGuard = (e: MouseEvent) => {
    if (e.button === 1) e.preventDefault()
  }

  const open = (p: Project, newTab = false) => {
    pushRecent(org, p.name)
    setRecentsVersion((v) => v + 1)
    const route = `/${org}/${seg(p.name)}/boards`
    if (newTab) openTab(route, { background: true })
    else navigate(route)
  }

  const count = projects.data?.length
  return (
    <>
      <PageHeader
        title="Projetos"
        subtitle={count !== undefined ? `${count} ${count === 1 ? 'projeto' : 'projetos'}` : undefined}
        actions={
          <>
            <ExternalButton url={webUrl(org)} />
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)} disabled={!org}>
              Novo projeto
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-6 py-3">
        <div className="relative w-72">
          <SearchIcon className="absolute top-1.5 left-2 size-4 text-muted" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar projetos" aria-label="Buscar projetos" className="pl-8" />
        </div>
        <div className="flex-1" />
        <div className="flex overflow-hidden rounded-sm border border-border">
          <IconButton title="Visualizar em grade" aria-pressed={view === 'grid'} onClick={() => setView('grid')} className={cx('rounded-none', view === 'grid' && 'bg-surface-2 text-fg')}>
            <LayoutGrid className="size-4" />
          </IconButton>
          <IconButton title="Visualizar em lista" aria-pressed={view === 'list'} onClick={() => setView('list')} className={cx('rounded-none', view === 'list' && 'bg-surface-2 text-fg')}>
            <List className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className="flex flex-col gap-6 p-6">
        {!q && recents.length > 0 && (
          <Section title="Recentes">
            <div className="flex flex-wrap gap-2 p-3">
              {recents.map((p) => (
                <button
                  key={p.id}
                  onClick={(e) => open(p, e.ctrlKey || e.metaKey)}
                  onMouseDown={middleGuard}
                  onAuxClick={(e) => {
                    if (e.button === 1) open(p, true)
                  }}
                  className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 text-sm font-medium hover:bg-surface-2"
                >
                  <FolderOpen className="size-3.5 text-muted" />
                  {p.name}
                </button>
              ))}
            </div>
          </Section>
        )}

        <QueryView query={projects} emptyTitle="Nenhum projeto nesta organização" empty={(d) => d.length === 0}>
          {() =>
            filtered.length === 0 ? (
              <Empty title="Nenhum projeto encontrado" icon={<SearchIcon className="size-6" />}>
                Nenhum projeto corresponde a “{text}”.
              </Empty>
            ) : view === 'grid' ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={(e) => open(p, e.ctrlKey || e.metaKey)}
                    onMouseDown={middleGuard}
                    onAuxClick={(e) => {
                      if (e.button === 1) open(p, true)
                    }}
                    className="flex min-h-[112px] flex-col gap-2 rounded-sm border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-2"
                  >
                    <div className="flex items-start gap-2">
                      <span className="narrow min-w-0 flex-1 truncate text-xl font-bold">{p.name}</span>
                      <Badge>{visibilityLabel(p.visibility)}</Badge>
                    </div>
                    <p className="line-clamp-2 min-h-10 text-sm text-muted">{p.description || 'Sem descrição'}</p>
                    <div className="mt-auto text-[12px] text-muted">
                      Atualizado <TimeAgo date={p.lastUpdateTime} />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <Section title={`Projetos · ${filtered.length}`}>
                <div
                  onMouseDown={middleGuard}
                  onClickCapture={remember}
                  onAuxClick={(e) => {
                    // Linha: o clique do meio chega ao container; localiza o projeto pelo nome da linha
                    if (e.button !== 1) return
                    const name = (e.target as HTMLElement).closest("tr")?.querySelector(".font-semibold")?.textContent
                    const p = filtered.find((x) => x.name === name)
                    if (p) open(p, true)
                  }}
                >
                <Table
                  persistKey="home.projects"
                  rows={filtered}
                  rowKey={(p) => p.id}
                  onRowClick={(p) => open(p, ctrlRef.current)}
                  columns={[
                    { key: 'name', header: 'Nome', render: (p) => <span className="font-semibold">{p.name}</span>, sortValue: (p) => p.name },
                    { key: 'desc', header: 'Descrição', render: (p) => <span className="block max-w-[420px] truncate text-muted">{p.description || '—'}</span> },
                    { key: 'vis', header: 'Visibilidade', render: (p) => <Badge>{visibilityLabel(p.visibility)}</Badge>, sortValue: (p) => p.visibility },
                    {
                      key: 'upd',
                      header: 'Última atualização',
                      render: (p) => (
                        <span className="text-muted">
                          <TimeAgo date={p.lastUpdateTime} />
                        </span>
                      ),
                      sortValue: (p) => p.lastUpdateTime
                    }
                  ]}
                />
                </div>
              </Section>
            )
          }
        </QueryView>
      </div>

      <CreateProjectModal org={org} open={creating} onClose={() => setCreating(false)} />
    </>
  )
}
