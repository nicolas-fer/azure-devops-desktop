import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MAX_TABS, TabsActionsContext, TabsStateContext, type TabsActions, type TabsState } from './context'
import { TabBar } from './TabBar'
import { TabHost } from './TabHost'
import { orgOfRoute, tabTitle } from './title'

const STORAGE_KEY = 'devops-desktop:tabs'

type Navigate = (to: string) => void

const newId = () => Math.random().toString(36).slice(2, 10)

/** Abas salvas (rotas + índice ativo). Ausentes ou inválidas: undefined, e vale a lógica do Landing. */
function readStored(): { routes: string[]; active: number } | undefined {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!raw || !Array.isArray(raw.routes)) return undefined
    const routes = raw.routes.filter((r: unknown): r is string => typeof r === 'string' && r.startsWith('/')).slice(0, MAX_TABS)
    if (routes.length === 0) return undefined
    return { routes, active: Number.isInteger(raw.active) ? raw.active : 0 }
  } catch {
    return undefined
  }
}

function initialState(): TabsState {
  const stored = readStored()
  const routes = stored?.routes ?? ['/']
  const active = Math.min(Math.max(stored?.active ?? 0, 0), routes.length - 1)
  // location.hash na abertura (ex.: script de captura) prevalece sobre a aba ativa salva
  const hash = window.location.hash.replace(/^#/, '')
  if (hash.startsWith('/')) routes[active] = hash
  const tabs = routes.map((route) => ({ id: newId(), route }))
  return { tabs, activeId: tabs[active].id, notice: null }
}

/**
 * Raiz das abas: estado único (lista, ativa), atalhos de teclado, sincronização com location.hash
 * e persistência. Cada aba renderiza um TabHost (MemoryRouter próprio) e o QueryClient é compartilhado.
 */
export function TabsRoot() {
  const [state, setState] = useState<TabsState>(initialState)
  // Espelho síncrono do estado: ações chamadas em sequência enxergam a mudança anterior.
  const stateRef = useRef(state)
  const navigators = useRef(new Map<string, Navigate>())
  const noticeTimer = useRef<number | undefined>(undefined)

  const commit = useCallback((next: TabsState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const register = useCallback((id: string, navigate: Navigate | null) => {
    if (navigate) navigators.current.set(id, navigate)
    else navigators.current.delete(id)
  }, [])

  const setRoute = useCallback(
    (id: string, route: string) => {
      const cur = stateRef.current
      if (!cur.tabs.some((t) => t.id === id && t.route !== route)) return
      commit({ ...cur, tabs: cur.tabs.map((t) => (t.id === id ? { ...t, route } : t)) })
    },
    [commit]
  )

  const showNotice = useCallback(
    (notice: string) => {
      commit({ ...stateRef.current, notice })
      window.clearTimeout(noticeTimer.current)
      noticeTimer.current = window.setTimeout(() => commit({ ...stateRef.current, notice: null }), 2500)
    },
    [commit]
  )

  const actions = useMemo<TabsActions>(() => {
    const openTab: TabsActions['openTab'] = (route, opts) => {
      const cur = stateRef.current
      if (cur.tabs.length >= MAX_TABS) {
        showNotice(`Limite de ${MAX_TABS} abas atingido`)
        return false
      }
      const active = cur.tabs.find((t) => t.id === cur.activeId)
      const org = active && orgOfRoute(active.route)
      const tab = { id: newId(), route: route ?? (org ? `/${org}/_home` : '/') }
      commit({ ...cur, tabs: [...cur.tabs, tab], activeId: opts?.background ? cur.activeId : tab.id })
      return true
    }

    const activateTab: TabsActions['activateTab'] = (id) => {
      const cur = stateRef.current
      if (cur.activeId !== id && cur.tabs.some((t) => t.id === id)) commit({ ...cur, activeId: id })
    }

    const closeTab: TabsActions['closeTab'] = (id) => {
      const cur = stateRef.current
      const idx = cur.tabs.findIndex((t) => t.id === id)
      if (idx < 0) return
      if (cur.tabs.length === 1) {
        // Última aba não fecha: volta à home da organização
        const org = orgOfRoute(cur.tabs[0].route)
        navigators.current.get(id)?.(org ? `/${org}/_home` : '/')
        return
      }
      const tabs = cur.tabs.filter((t) => t.id !== id)
      const activeId = cur.activeId === id ? tabs[Math.min(idx, tabs.length - 1)].id : cur.activeId
      commit({ ...cur, tabs, activeId })
    }

    const cycle: TabsActions['cycle'] = (dir) => {
      const cur = stateRef.current
      const i = cur.tabs.findIndex((t) => t.id === cur.activeId)
      const next = cur.tabs[(i + dir + cur.tabs.length) % cur.tabs.length]
      if (next) activateTab(next.id)
    }

    const activateIndex: TabsActions['activateIndex'] = (index) => {
      const t = stateRef.current.tabs[index]
      if (t) activateTab(t.id)
    }

    const closeActive: TabsActions['closeActive'] = () => closeTab(stateRef.current.activeId)

    return { openTab, closeTab, activateTab, cycle, activateIndex, closeActive }
  }, [commit, showNotice])

  const activeTab = state.tabs.find((t) => t.id === state.activeId)
  const activeRoute = activeTab?.route

  // Rota da aba ativa reflete em location.hash (replaceState não dispara hashchange: sem loop)
  useEffect(() => {
    if (activeRoute) window.history.replaceState(null, '', '#' + activeRoute)
  }, [activeRoute])

  // location.hash = '/org/projeto/rota' (script de captura) navega a aba ativa
  useEffect(() => {
    const onHash = () => {
      const to = window.location.hash.replace(/^#/, '')
      if (!to.startsWith('/')) return
      const cur = stateRef.current
      const active = cur.tabs.find((t) => t.id === cur.activeId)
      if (!active || active.route === to) return
      navigators.current.get(active.id)?.(to)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Atalhos: Ctrl+T, Ctrl+W, Ctrl+Tab / Ctrl+Shift+Tab, Ctrl+1..9
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return
      const k = e.key.toLowerCase()
      if (k === 't' && !e.shiftKey) {
        e.preventDefault()
        actions.openTab()
      } else if (k === 'w' && !e.shiftKey) {
        e.preventDefault()
        actions.closeActive()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        actions.cycle(e.shiftKey ? -1 : 1)
      } else if (/^[1-9]$/.test(e.key)) {
        e.preventDefault()
        actions.activateIndex(Number(e.key) - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions])

  // Persistência das abas e da ativa (try/catch: armazenamento pode estar indisponível)
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ routes: state.tabs.map((t) => t.route), active: state.tabs.findIndex((t) => t.id === state.activeId) })
      )
    } catch {
      // sem persistência: as abas valem só nesta sessão
    }
  }, [state.tabs, state.activeId])

  useEffect(() => {
    document.title = activeRoute ? `${tabTitle(activeRoute)} · DevOps Desktop` : 'DevOps Desktop'
  }, [activeRoute])

  return (
    <TabsActionsContext.Provider value={actions}>
      <TabsStateContext.Provider value={state}>
        <div className="flex h-full flex-col">
          <TabBar />
          <div className="flex min-h-0 flex-1 flex-col">
            {state.tabs.map((t) => (
              <TabHost
                key={t.id}
                id={t.id}
                initialRoute={t.route}
                active={t.id === state.activeId}
                register={register}
                onRoute={setRoute}
              />
            ))}
          </div>
        </div>
      </TabsStateContext.Provider>
    </TabsActionsContext.Provider>
  )
}
