// Voltar / avançar por aba. O MemoryRouter não expõe se há para onde ir, então acompanhamos
// a pilha de entradas (pelas keys de location) a cada navegação da própria aba.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'

interface TabHistory {
  canBack: boolean
  canForward: boolean
  back: () => void
  forward: () => void
}

const TabHistoryContext = createContext<TabHistory>({ canBack: false, canForward: false, back: () => {}, forward: () => {} })

export function TabHistoryProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const type = useNavigationType()
  const navigate = useNavigate()
  const stack = useRef<{ keys: string[]; index: number }>({ keys: [location.key], index: 0 })
  const [, force] = useState(0)

  useEffect(() => {
    const s = stack.current
    if (s.keys[s.index] === location.key) return
    if (type === 'POP') {
      // Voltou ou avançou: localiza a entrada na pilha
      const i = s.keys.indexOf(location.key)
      s.index = i >= 0 ? i : s.index
    } else if (type === 'REPLACE') {
      s.keys[s.index] = location.key
    } else {
      // PUSH: descarta o "futuro" e empilha
      s.keys = [...s.keys.slice(0, s.index + 1), location.key]
      s.index = s.keys.length - 1
    }
    force((n) => n + 1)
  }, [location.key, type])

  const s = stack.current
  const value: TabHistory = {
    canBack: s.index > 0,
    canForward: s.index < s.keys.length - 1,
    back: () => s.index > 0 && navigate(-1),
    forward: () => s.index < s.keys.length - 1 && navigate(1)
  }
  return <TabHistoryContext.Provider value={value}>{children}</TabHistoryContext.Provider>
}

/** Voltar / avançar da aba atual. */
export function useTabHistory(): TabHistory {
  return useContext(TabHistoryContext)
}
