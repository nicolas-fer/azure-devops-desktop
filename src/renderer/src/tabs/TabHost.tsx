import { memo, useEffect } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { App } from '@/App'
import { TabActiveContext } from './context'

interface TabHostProps {
  id: string
  /** Rota inicial, lida só na montagem da aba. */
  initialRoute: string
  active: boolean
  register: (id: string, navigate: ((to: string) => void) | null) => void
  onRoute: (id: string, route: string) => void
}

/**
 * Uma aba = um MemoryRouter com o App inteiro. Abas inativas ficam montadas e ocultas (display: none),
 * preservando rolagem, filtros e painéis. Memoizado: trocar de aba só re-renderiza as duas afetadas.
 */
export const TabHost = memo(function TabHost({ id, initialRoute, active, register, onRoute }: TabHostProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ display: active ? 'flex' : 'none' }}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <TabBridge id={id} register={register} onRoute={onRoute} />
        <TabActiveContext.Provider value={active}>
          <App />
        </TabActiveContext.Provider>
      </MemoryRouter>
    </div>
  )
})

/** Ponte dentro do router da aba: expõe navigate para o TabsRoot e relata a rota atual. */
function TabBridge({ id, register, onRoute }: Pick<TabHostProps, 'id' | 'register' | 'onRoute'>) {
  const navigate = useNavigate()
  const loc = useLocation()
  const route = loc.pathname + loc.search + loc.hash

  useEffect(() => {
    register(id, (to) => navigate(to))
    return () => register(id, null)
  }, [id, navigate, register])

  useEffect(() => {
    onRoute(id, route)
  }, [id, route, onRoute])

  return null
}
