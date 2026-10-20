import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { cx } from '@/components/ui'
import appIcon from './app-icon.svg'
import { MAX_TABS, useTabState, useTabs } from './context'
import { tabTitle } from './title'

/** Faixa arrastável da janela (-webkit-app-region). Abas e botões são no-drag. */
const DRAG: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties
const NO_DRAG: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties

/** Largura reservada aos controles do Windows (minimizar/maximizar/fechar), via Window Controls Overlay. */
function useControlsWidth(): number {
  const [width, setWidth] = useState(140)
  useEffect(() => {
    type Wco = { getTitlebarAreaRect: () => DOMRect; addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void }
    const wco = (navigator as Navigator & { windowControlsOverlay?: Wco }).windowControlsOverlay
    if (!wco) return
    const update = () => {
      const r = wco.getTitlebarAreaRect()
      setWidth(Math.max(0, Math.ceil(window.innerWidth - (r.x + r.width))))
    }
    update()
    wco.addEventListener('geometrychange', update)
    window.addEventListener('resize', update)
    return () => {
      wco.removeEventListener('geometrychange', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return width
}

export function TabBar() {
  const { tabs, activeId, notice } = useTabState()
  const { openTab, closeTab, activateTab } = useTabs()
  const controlsWidth = useControlsWidth()

  const onTabKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activateTab(id)
    }
  }

  return (
    <div
      style={{ ...DRAG, paddingRight: controlsWidth }}
      className="flex h-9 shrink-0 items-end gap-2 bg-tabstrip pl-2 text-shell-fg select-none"
    >
      <img src={appIcon} alt="" draggable={false} className="mb-2 size-4 shrink-0 self-center" />
      <div role="tablist" data-tabstrip className="flex min-w-0 shrink items-end gap-px overflow-hidden">
        {tabs.map((t) => {
          const active = t.id === activeId
          const title = tabTitle(t.route)
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              title={title}
              style={NO_DRAG}
              onClick={() => activateTab(t.id)}
              onKeyDown={(e) => onTabKey(e, t.id)}
              onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault()
              }}
              onAuxClick={(e) => {
                // Clique do meio fecha a aba
                if (e.button !== 1) return
                e.preventDefault()
                closeTab(t.id)
              }}
              className={cx(
                'group relative flex h-8 w-[220px] min-w-[80px] shrink cursor-pointer items-center gap-1 rounded-t-[3px] pr-1 pl-3 text-[12.5px] transition-colors',
                active ? 'bg-shell font-semibold text-white' : 'bg-tabstrip text-shell-muted hover:bg-shell-hover hover:text-shell-fg'
              )}
            >
              {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-shell-accent" />}
              <span className="min-w-0 flex-1 truncate">{title}</span>
              <button
                type="button"
                aria-label={`Fechar aba ${title}`}
                title="Fechar aba (Ctrl+W)"
                style={NO_DRAG}
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(t.id)
                }}
                className={cx(
                  'flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm hover:bg-shell-line hover:text-white',
                  active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                )}
              >
                <X className="size-3.5" />
              </button>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        title={tabs.length >= MAX_TABS ? `Limite de ${MAX_TABS} abas atingido` : 'Nova aba (Ctrl+T)'}
        aria-label="Nova aba"
        style={NO_DRAG}
        onClick={() => openTab()}
        className="mb-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-shell-muted hover:bg-shell-hover hover:text-white"
      >
        <Plus className="size-4" />
      </button>
      {notice && (
        <span role="status" style={NO_DRAG} className="mb-2 shrink-0 text-2xs whitespace-nowrap text-shell-accent">
          {notice}
        </span>
      )}
      {/* Espaço livre depois do "+": continua arrastável (herda a região de arraste da faixa) */}
      <div className="min-w-8 flex-1 self-stretch" />
    </div>
  )
}
