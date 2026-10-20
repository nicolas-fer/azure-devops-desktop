import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, ChevronDown, PanelLeftClose, PanelLeftOpen, RefreshCw, Search as SearchIcon, Settings } from 'lucide-react'
import { cx, ErrorBox, Loading, Avatar } from '@/components/ui'
import { useAccounts, useProfile, useProjects } from '@/lib/context'
import { home, orgSettings, projectFeatures, projectSettings, search } from '@/features/registry'
import type { FeatureModule } from '@/features/types'
import { useTabActive, useTabs } from '@/tabs/context'
import { useTabHistory } from '@/tabs/history'

const LAST_KEY = 'devops-desktop:last'
const COLLAPSED_KEY = 'devops-desktop:collapsed'

function readLast(): { org?: string; project?: string } {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function App() {
  const pat = useQuery({ queryKey: ['hasPat'], queryFn: () => window.ado.hasPat(), staleTime: Infinity })
  if (pat.isLoading) return <Loading />
  if (!pat.data)
    return <ErrorBox error="A variável de ambiente AZURE_DEVOPS_EXT_PAT não está definida. Defina-a e reinicie o app." />
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/:org/*" element={<OrgShell />} />
    </Routes>
  )
}

/** Escolhe a organização inicial: última usada, AZURE_DEVOPS_ORG, ou a primeira acessível pelo PAT. */
function Landing() {
  const accounts = useAccounts()
  const defaultOrg = useQuery({ queryKey: ['defaultOrg'], queryFn: () => window.ado.defaultOrg(), staleTime: Infinity })
  const last = readLast()
  if (defaultOrg.isLoading) return <Loading label="Conectando ao Azure DevOps…" />
  // AZURE_DEVOPS_ORG (ou a última org usada) dispensa listar organizações: PATs restritos a uma org
  // não têm acesso à lista global de contas e não devem travar a abertura.
  const known = last.org ?? defaultOrg.data ?? undefined
  if (known) {
    if (last.org === known && last.project) return <Navigate to={`/${known}/${encodeURIComponent(last.project)}/boards`} replace />
    return <Navigate to={`/${known}/_home`} replace />
  }
  if (accounts.isError)
    return (
      <ErrorBox error="Não foi possível listar suas organizações com este PAT. Gere o token com acesso a “All accessible organizations” ou defina a variável AZURE_DEVOPS_ORG com o nome da organização e reinicie o app." />
    )
  if (accounts.isLoading) return <Loading label="Conectando ao Azure DevOps…" />
  const org = accounts.data?.[0]?.accountName
  if (!org) return <ErrorBox error="Nenhuma organização encontrada para este PAT." />
  if (last.org === org && last.project) return <Navigate to={`/${org}/${encodeURIComponent(last.project)}/boards`} replace />
  return <Navigate to={`/${org}/_home`} replace />
}

function OrgShell() {
  const { org = '' } = useParams()
  return (
    <div className="flex h-full flex-col">
      <Routes>
        <Route path=":project/*" element={<TopBar org={org} />} />
        <Route path="*" element={<TopBar org={org} />} />
      </Routes>
      <div className="flex min-h-0 flex-1">
        <Routes>
          <Route path="_home/*" element={<OrgLevel feature={home} />} />
          <Route path="_settings/*" element={<OrgLevel feature={orgSettings} sidebar />} />
          <Route path="_search/*" element={<OrgLevel feature={search} />} />
          <Route path=":project/*" element={<ProjectShell />} />
          <Route path="*" element={<Navigate to="_home" replace />} />
        </Routes>
      </div>
    </div>
  )
}

/** Área de trabalho: as features ocupam a altura toda e controlam o próprio scroll interno. */
const Main = ({ children }: { children: ReactNode }) => (
  <main className="flex min-w-0 flex-1 flex-col overflow-auto bg-bg">{children}</main>
)

function OrgLevel({ feature, sidebar }: { feature: FeatureModule; sidebar?: boolean }) {
  const { org = '' } = useParams()
  return (
    <>
      {sidebar && <Sidebar features={[feature]} base={`/${org}`} />}
      <Main>
        <feature.Routes />
      </Main>
    </>
  )
}

function ProjectShell() {
  const { org = '', project = '' } = useParams()
  useEffect(() => {
    localStorage.setItem(LAST_KEY, JSON.stringify({ org, project }))
  }, [org, project])
  const base = `/${org}/${encodeURIComponent(project)}`
  return (
    <>
      <Sidebar features={projectFeatures} base={base} settings={projectSettings} />
      <Main>
        <Routes>
          {[...projectFeatures, projectSettings].map((f) => (
            <Route key={f.id} path={`${f.path}/*`} element={<f.Routes />} />
          ))}
          <Route path="*" element={<Navigate to="boards" replace />} />
        </Routes>
      </Main>
    </>
  )
}

function Sidebar({ features, base, settings }: { features: FeatureModule[]; base: string; settings?: FeatureModule }) {
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1')
  const toggle = () =>
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1')
      return !c
    })
  const renderFeature = (f: FeatureModule) => {
    const root = `${base}/${f.path}`
    const active = pathname === root || pathname.startsWith(root + '/')
    const Icon = f.icon
    return (
      <div key={f.id}>
        <NavLink
          to={f.nav[0] ? `${root}/${f.nav[0].path}` : root}
          title={f.label}
          className={cx(
            'flex h-8 items-center gap-2.5 border-l-[3px] px-3 text-sm transition-colors duration-150 hover:bg-shell-hover',
            active ? 'border-shell-accent bg-shell-active font-semibold text-white' : 'border-transparent text-shell-fg'
          )}
        >
          <Icon className="size-4 shrink-0" />
          {!collapsed && <span className="truncate">{f.label}</span>}
        </NavLink>
        {active && !collapsed && f.nav.length > 1 && (
          <div className="flex flex-col py-0.5">
            {f.nav.map((n) => (
              <NavLink
                key={n.path}
                to={`${root}/${n.path}`}
                className={({ isActive }) =>
                  cx(
                    'flex h-7 items-center pl-[41px] text-[12.5px] transition-colors hover:text-white',
                    isActive ? 'font-semibold text-white' : 'text-shell-muted'
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    )
  }
  return (
    <aside className={cx('flex shrink-0 flex-col bg-shell text-shell-fg', collapsed ? 'w-12' : 'w-56')}>
      <nav className="flex-1 overflow-auto py-2">{features.filter((f) => f.showInSidebar !== false).map(renderFeature)}</nav>
      <div className="border-t border-shell-line py-2">
        {settings && renderFeature(settings)}
        <button
          onClick={toggle}
          title={collapsed ? 'Expandir' : 'Recolher'}
          className="flex h-8 w-full items-center gap-2.5 border-l-[3px] border-transparent px-3 text-[12px] text-shell-muted hover:bg-shell-hover hover:text-white"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && 'Recolher'}
        </button>
      </div>
    </aside>
  )
}

function TopBar({ org }: { org: string }) {
  const { project } = useParams()
  const navigate = useNavigate()
  const accounts = useAccounts()
  const projects = useProjects(org)
  const profile = useProfile()
  const [text, setText] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const inProject = project !== undefined && !project.startsWith('_')
  const active = useTabActive()
  const { openTab } = useTabs()
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)
  const history = useTabHistory()

  // Recarrega os dados (todas as consultas em uso) sem recarregar a janela: abas, rolagem e filtros ficam
  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await queryClient.invalidateQueries()
    } finally {
      setRefreshing(false)
    }
  }

  // Ctrl+K foca a busca; F5 e Ctrl+R recarregam os dados. Só na aba ativa (abas ocultas também estão montadas)
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (key === 'f5' || ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'r')) {
        e.preventDefault()
        void refresh()
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        history.back()
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        history.forward()
      }
    }
    // Botões laterais do mouse (voltar = 3, avançar = 4)
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault()
        history.back()
      } else if (e.button === 4) {
        e.preventDefault()
        history.forward()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouse)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouse)
    }
  })

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-[#0a2f36] bg-shell pr-3 pl-2 text-shell-fg">
      <div className="flex items-center">
        <button
          title="Voltar (Alt+←)"
          aria-label="Voltar"
          onClick={history.back}
          disabled={!history.canBack}
          className="rounded-sm p-1.5 hover:bg-shell-hover disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent"
        >
          <ArrowLeft className="size-4" />
        </button>
        <button
          title="Avançar (Alt+→)"
          aria-label="Avançar"
          onClick={history.forward}
          disabled={!history.canForward}
          className="rounded-sm p-1.5 hover:bg-shell-hover disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent"
        >
          <ArrowRight className="size-4" />
        </button>
      </div>
      <button onClick={() => navigate(`/${org}/_home`)} className="narrow text-base font-bold text-white">
        DevOps Desktop
      </button>
      <span className="text-shell-muted">/</span>
      <Picker
        value={org}
        options={(accounts.data ?? []).map((a) => a.accountName)}
        onChange={(o) => navigate(`/${o}/_home`)}
        onOpenNew={(o) => openTab(`/${o}/_home`, { background: true })}
        footer={{ label: 'Configurações da organização', onClick: () => navigate(`/${org}/_settings`) }}
      />
      {inProject && (
        <>
          <span className="text-shell-muted">/</span>
          <Picker
            strong
            value={project!}
            options={(projects.data ?? []).map((p) => p.name).sort((a, b) => a.localeCompare(b))}
            onChange={(p) => navigate(`/${org}/${encodeURIComponent(p)}/boards`)}
            onOpenNew={(p) => openTab(`/${org}/${encodeURIComponent(p)}/boards`, { background: true })}
            footer={{ label: 'Todos os projetos', onClick: () => navigate(`/${org}/_home`) }}
          />
        </>
      )}
      <div className="flex-1" />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          const q = new URLSearchParams({ text })
          if (inProject) q.set('project', project!)
          navigate(`/${org}/_search?${q}`)
        }}
        className="relative w-[420px]"
      >
        <SearchIcon className="absolute top-1.5 left-2 size-4 text-shell-muted" />
        <input
          ref={searchRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Buscar código e work items…"
          className="h-7 w-full rounded-sm border border-shell-line bg-[#0a3038] pr-16 pl-8 text-sm text-white outline-none placeholder:text-shell-muted focus:border-shell-accent"
        />
        <span className="narrow absolute top-1.5 right-2 rounded-sm border border-shell-line px-1 text-2xs leading-4 text-shell-muted">
          Ctrl K
        </span>
      </form>
      <div className="flex-1" />
      <button
        title="Recarregar dados (F5)"
        aria-label="Recarregar dados"
        onClick={() => void refresh()}
        disabled={refreshing}
        className="rounded-sm p-1.5 hover:bg-shell-hover disabled:cursor-progress"
      >
        <RefreshCw className={cx('size-4', refreshing && 'animate-spin')} />
      </button>
      <button
        title="Configurações da organização"
        aria-label="Configurações da organização"
        onClick={() => navigate(`/${org}/_settings`)}
        className="rounded-sm p-1.5 hover:bg-shell-hover"
      >
        <Settings className="size-4" />
      </button>
      {profile.data && <Avatar name={profile.data.displayName} size={26} />}
    </header>
  )
}

function Picker({
  value,
  options,
  onChange,
  onOpenNew,
  footer,
  strong
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
  /** Ctrl+clique ou clique do meio: abre a opção em nova aba. */
  onOpenNew?: (v: string) => void
  footer?: { label: string; onClick: () => void }
  strong?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const shown = options.filter((o) => o.toLowerCase().includes(filter.toLowerCase()))
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cx('flex items-center gap-1 rounded-sm px-1.5 py-1 text-sm hover:bg-shell-hover', strong ? 'font-semibold text-white' : 'font-medium')}
      >
        {decodeURIComponent(value)} <ChevronDown className="size-3.5 text-shell-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 z-50 mt-1 flex max-h-96 w-72 flex-col rounded-sm border border-border bg-surface text-fg shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar…"
              className="m-2 h-7 rounded-sm border border-border bg-surface px-2 text-sm outline-none focus:border-focus"
            />
            <div className="flex-1 overflow-auto">
              {shown.map((o) => (
                <button
                  key={o}
                  onClick={(e) => {
                    setOpen(false)
                    if ((e.ctrlKey || e.metaKey) && onOpenNew) onOpenNew(o)
                    else onChange(o)
                  }}
                  onMouseDown={(e) => {
                    if (e.button === 1) e.preventDefault()
                  }}
                  onAuxClick={(e) => {
                    if (e.button !== 1 || !onOpenNew) return
                    e.preventDefault()
                    setOpen(false)
                    onOpenNew(o)
                  }}
                  className={cx(
                    'flex h-8 w-full items-center truncate border-l-[3px] px-3 text-left text-sm hover:bg-surface-2',
                    o === decodeURIComponent(value) ? 'border-shell-accent font-semibold' : 'border-transparent'
                  )}
                >
                  {o}
                </button>
              ))}
              {shown.length === 0 && <div className="px-3 py-2 text-muted">Nenhum resultado</div>}
            </div>
            {footer && (
              <button
                onClick={() => {
                  setOpen(false)
                  footer.onClick()
                }}
                className="border-t border-border px-3 py-2 text-left text-sm font-medium text-new-ink hover:bg-surface-2"
              >
                {footer.label}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
