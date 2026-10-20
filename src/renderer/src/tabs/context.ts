import { createContext, useContext } from 'react'

/** Limite de abas abertas ao mesmo tempo. */
export const MAX_TABS = 12

export interface TabItem {
  id: string
  /** Rota atual da aba (pathname + search + hash), dentro do MemoryRouter da aba. */
  route: string
}

export interface TabsState {
  tabs: TabItem[]
  activeId: string
  /** Aviso curto da barra (ex.: limite de abas atingido). */
  notice: string | null
}

/** Ações estáveis (nunca mudam de identidade): consumidores não re-renderizam quando as abas mudam. */
export interface TabsActions {
  /** Abre uma aba com a rota (padrão: Projetos da organização da aba ativa). Retorna false se atingiu o limite. */
  openTab: (route?: string, opts?: { background?: boolean }) => boolean
  closeTab: (id: string) => void
  activateTab: (id: string) => void
  cycle: (dir: 1 | -1) => void
  activateIndex: (index: number) => void
  closeActive: () => void
}

export const TabsActionsContext = createContext<TabsActions | null>(null)
export const TabsStateContext = createContext<TabsState | null>(null)
/** Verdadeiro só na aba visível. Fora de uma aba (ex.: testes), vale true. */
export const TabActiveContext = createContext(true)

/** Ações das abas (openTab, closeTab…). Não re-renderiza ao trocar de rota. */
export function useTabs(): TabsActions {
  const value = useContext(TabsActionsContext)
  if (!value) throw new Error('useTabs precisa estar dentro de TabsRoot')
  return value
}

/** Estado das abas (lista, ativa, aviso). Use só onde a lista de abas é desenhada. */
export function useTabState(): TabsState {
  const value = useContext(TabsStateContext)
  if (!value) throw new Error('useTabState precisa estar dentro de TabsRoot')
  return value
}

/** true quando a aba que contém o componente está visível. */
export function useTabActive(): boolean {
  return useContext(TabActiveContext)
}
