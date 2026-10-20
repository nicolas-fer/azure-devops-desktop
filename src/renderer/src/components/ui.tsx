// Componentes de UI compartilhados — design system "Tabela do Brasileirão".
// Use SEMPRE estes componentes nas features. Regras: grade de 4px, escala 11/13/15/20/28,
// faixa de zona de 4px em toda linha/card que tem estado, roxo só para "é meu".
import { clsx } from 'clsx'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Loader2, AlertTriangle, X, ExternalLink, ChevronDown, ChevronUp, Inbox } from 'lucide-react'
import {
  useEffect,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { openExternal, type IdentityRef } from '@/lib/api'
import { zoneBg, zoneInk, type Zone } from '@/lib/zones'
import { useTabActive } from '@/tabs/context'

export { clsx as cx }
export type { Zone }

// ---------------------------------------------------------------- Botões e campos

type Variant = 'primary' | 'default' | 'ghost' | 'danger' | 'success'
export function Button({
  variant = 'default',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-sm border font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-6 px-2 text-[12px]' : 'h-7 px-3 text-sm',
        variant === 'primary' && 'border-accent bg-accent text-accent-fg hover:bg-shell-active',
        variant === 'success' && 'border-zone-done bg-zone-done text-white hover:brightness-95',
        variant === 'default' && 'border-border bg-surface hover:bg-surface-2',
        variant === 'ghost' && 'border-transparent bg-transparent hover:bg-surface-2',
        variant === 'danger' && 'border-zone-fail bg-zone-fail text-white hover:brightness-95',
        className
      )}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  )
}

/** Botão só com ícone (obrigatório passar title para acessibilidade). */
export function IconButton({ title, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { title: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      {...rest}
      className={clsx('inline-flex size-7 items-center justify-center rounded-sm text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50', className)}
    >
      {children}
    </button>
  )
}

const fieldCls =
  'h-7 rounded-sm border border-border bg-surface px-2 text-sm text-fg outline-none placeholder:text-muted focus:border-focus focus:ring-2 focus:ring-focus/40'

/** Largura total por padrão, salvo quando className já define uma largura (w-…). */
const hasWidth = (className?: string) => /(^|\s)(w-|flex-1)/.test(className ?? '')
const widthDefault = (className?: string) => !hasWidth(className) && 'w-full'

export const Input = ({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...rest} className={clsx(fieldCls, widthDefault(className), className)} />
)
export const Textarea = ({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...rest} className={clsx(fieldCls, widthDefault(className), 'h-auto min-h-20 py-1.5 leading-5', className)} />
)
export const Select = ({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => (
  // Sem largura total por padrão: em barras de filtro fica do tamanho do conteúdo; dentro de Field estica pela coluna.
  <select {...rest} className={clsx(fieldCls, !hasWidth(className) && 'w-auto max-w-80 min-w-32', 'pr-6', className)}>
    {children}
  </select>
)

export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <label className={clsx('flex flex-col gap-1', className)}>
      <span className="colhead">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-muted">{hint}</span>}
    </label>
  )
}

// ---------------------------------------------------------------- Estados de carregamento

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={clsx('size-4 animate-spin text-muted', className)} />

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-6 py-6 text-muted">
      <Spinner /> {label}
    </div>
  )
}

/** Mensagem em pt-BR com o problema e a saída, a partir do status HTTP do ADO. */
function errorCopy(error: unknown): { title: string; hint: string } {
  const status = (error as { status?: number })?.status
  if (status === 401) return { title: 'PAT recusado', hint: 'O token em AZURE_DEVOPS_EXT_PAT expirou ou é inválido. Gere outro e reinicie o app.' }
  if (status === 403) return { title: 'Sem permissão', hint: 'O PAT não tem o escopo necessário para este recurso. Ajuste os escopos do token.' }
  if (status === 404) return { title: 'Não encontrado', hint: 'O item não existe mais ou o nome mudou.' }
  if (status === 0) return { title: 'Sem conexão com o Azure DevOps', hint: 'Verifique a rede e tente de novo.' }
  if (status && status >= 500) return { title: 'O Azure DevOps falhou ao responder', hint: 'Costuma ser passageiro. Tente de novo em instantes.' }
  return { title: 'Não foi possível carregar', hint: 'A requisição foi recusada pelo servidor.' }
}

export function ErrorBox({ error, className, onRetry }: { error: unknown; className?: string; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error)
  const { title, hint } = errorCopy(error)
  return (
    <div role="alert" className={clsx('mx-6 my-4 flex flex-wrap items-start gap-x-3 gap-y-2 rounded-sm border border-zone-fail/40 bg-surface px-3 py-2', className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-fail-ink" />
      <div className="min-w-[12rem] flex-1">
        <div className="font-medium">{title}</div>
        <div className="text-[12px] break-words text-muted">{hint}</div>
        <details className="mt-1 text-[12px] text-muted">
          <summary className="cursor-pointer select-none">Detalhes técnicos</summary>
          <div className="mt-1 font-mono break-words">{msg}</div>
        </details>
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  )
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center text-muted">
      {icon ?? <Inbox className="size-6" />}
      <div className="text-base font-medium text-fg">{title}</div>
      {children && <div className="max-w-md">{children}</div>}
    </div>
  )
}

/** Renderiza loading/erro/vazio de uma query do TanStack e chama children com os dados. */
export function QueryView<T>({
  query,
  children,
  empty,
  emptyTitle = 'Nada por aqui'
}: {
  query: UseQueryResult<T>
  children: (data: T) => ReactNode
  empty?: (data: T) => boolean
  emptyTitle?: string
}) {
  if (query.isLoading) return <Loading />
  if (query.isError) return <ErrorBox error={query.error} onRetry={() => query.refetch()} />
  if (query.data === undefined) return null
  if (empty?.(query.data)) return <Empty title={emptyTitle} />
  return <>{children(query.data)}</>
}

// ---------------------------------------------------------------- Estrutura de página

/**
 * Cabeçalho padrão: trilha (breadcrumb) opcional, título em Archivo Narrow 28px,
 * ações à direita e abas (children) logo abaixo.
 */
export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
  children,
  variant = 'page',
  idPrefix
}: {
  title: ReactNode
  subtitle?: ReactNode
  breadcrumb?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  /** "page": título de seção (Narrow 28px). "entity": título longo de um item (20px, quebra linha). */
  variant?: 'page' | 'entity'
  /** Prefixo de ID em Narrow esmaecido (ex.: "!1287", "#4821") para variant="entity". */
  idPrefix?: ReactNode
}) {
  return (
    <div className={clsx('border-b border-border bg-surface px-6 pt-4', children ? 'pb-0' : 'pb-4')}>
      {breadcrumb && <div className="mb-0.5 flex items-center gap-2 text-[12px] text-muted">{breadcrumb}</div>}
      <div className={clsx('flex gap-3', variant === 'entity' ? 'items-start' : 'items-center')}>
        {variant === 'entity' ? (
          <h1 className="min-w-0 text-xl font-semibold text-balance">
            {idPrefix && <span className="narrow mr-2 font-bold text-muted">{idPrefix}</span>}
            {title}
          </h1>
        ) : (
          <h1 className="narrow min-w-0 truncate text-2xl font-bold">{title}</h1>
        )}
        {subtitle && <div className="min-w-0 truncate text-sm text-muted">{subtitle}</div>}
        <div className="flex-1" />
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  )
}

/** Abas (controladas). Ativa com sublinhado escuro de 2px. */
export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  className
}: {
  tabs: { key: K; label: ReactNode; count?: number }[]
  value: K
  onChange: (k: K) => void
  className?: string
}) {
  return (
    <div role="tablist" className={clsx('flex gap-5', className)}>
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={clsx(
            '-mb-px border-b-2 py-2 text-sm font-medium transition-colors',
            value === t.key ? 'border-rule-strong text-fg' : 'border-transparent text-muted hover:text-fg'
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="narrow ml-1 font-semibold">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Barra de filtros/linha de classificação logo abaixo do cabeçalho. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('flex flex-wrap items-center gap-3 border-b border-border px-6 py-3', className)}>{children}</div>
}

/** Seção com título no estilo cabeçalho de tabela (régua de 2px). Use em painéis/rails. */
export function Section({ title, actions, children, className }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-sm border border-border bg-surface', className)}>
      <div className="flex min-h-8 items-center gap-2 border-b-2 border-rule-strong px-3 py-1">
        <span className="colhead flex-1">{title}</span>
        {actions}
      </div>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------- Gesto assinatura: zonas

/** Faixa vertical de 4px colada à borda esquerda (estado) + 2px roxa opcional (é meu). */
export function ZoneStripe({ zone, mine }: { zone: Zone; mine?: boolean }) {
  return (
    <span className="flex shrink-0 self-stretch" aria-hidden>
      <span className={clsx('w-1', zoneBg[zone])} />
      {mine && <span className="w-0.5 bg-zone-mine" />}
    </span>
  )
}

/** Quadradinho de zona de 8px. */
export const ZoneSquare = ({ zone, className }: { zone: Zone | 'mine'; className?: string }) => (
  <span aria-hidden className={clsx('inline-block size-2 shrink-0', zone === 'mine' ? 'bg-zone-mine' : zoneBg[zone], className)} />
)

/** Rótulo de estado: quadradinho + texto condensado em caixa-alta. Substitui pílulas coloridas. */
export function StateLabel({ zone, children, icon, className }: { zone: Zone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'narrow inline-flex items-center gap-1.5 text-2xs font-semibold tracking-[0.04em] whitespace-nowrap uppercase',
        zoneInk[zone],
        className
      )}
    >
      {icon ?? <ZoneSquare zone={zone} />}
      {children}
    </span>
  )
}

/**
 * Linha de classificação: contadores por zona no formato do cabeçalho da tabela.
 * Clicar num contador chama onSelect(key); o ativo fica sublinhado.
 */
export function Standings<K extends string>({
  items,
  value,
  onSelect
}: {
  items: { key: K; label: string; zone: Zone; count: number }[]
  value?: K | null
  onSelect?: (key: K | null) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((it, i) => (
        <span key={it.key} className="flex items-center gap-4">
          {i > 0 && <span className="text-border">·</span>}
          <button
            type="button"
            onClick={() => onSelect?.(value === it.key ? null : it.key)}
            className={clsx(
              'narrow inline-flex items-center gap-1.5 border-b-2 text-[12px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase',
              value === it.key ? 'border-rule-strong' : 'border-transparent',
              it.zone === 'fail' && it.count > 0 ? 'text-fail-ink' : 'text-fg'
            )}
          >
            <ZoneSquare zone={it.zone} />
            {it.label}
            <b className="text-base font-bold">{it.count}</b>
          </button>
        </span>
      ))}
    </div>
  )
}

/** Filtro "é meu" — o único lugar, além da faixa de 2px, onde o roxo aparece. */
export function MineToggle({ active, onChange, label = 'Atribuídos a mim', count }: { active: boolean; onChange: (v: boolean) => void; label?: string; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onChange(!active)}
      className={clsx(
        'inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 text-[12px] font-semibold whitespace-nowrap',
        active ? 'border-mine-line bg-mine-bg text-mine-ink' : 'border-border bg-surface text-muted hover:text-fg'
      )}
    >
      <ZoneSquare zone="mine" />
      {label}
      {count !== undefined && <span className="narrow">· {count}</span>}
    </button>
  )
}

/** Badge neutro (tags de work item, labels). Estados usam StateLabel, não Badge. */
export function Badge({ children, tone = 'default', className }: { children: ReactNode; tone?: 'default' | 'danger'; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex h-[18px] items-center rounded-sm border px-1.5 text-2xs whitespace-nowrap',
        tone === 'danger' ? 'border-zone-fail/40 text-fail-ink' : 'border-border text-muted',
        className
      )}
    >
      {children}
    </span>
  )
}

/** Trecho de código inline (branch, caminho, hash). */
export const Code = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={clsx('rounded-sm border border-border bg-surface-2 px-1.5 font-mono text-[12px] whitespace-nowrap', className)}>{children}</span>
)

// ---------------------------------------------------------------- Pessoas e datas

const avatarPalette = ['#3E7C6B', '#8A5A2B', '#4B5FA8', '#9C3D5A', '#5B7A2E', '#2D6E8A', '#6B6B3A', '#A0522D']

/** Avatar com iniciais (as imagens do ADO exigem auth). */
export function Avatar({ identity, name, size = 22 }: { identity?: IdentityRef | null; name?: string; size?: number }) {
  const n = identity?.displayName ?? name ?? '?'
  const initials = n
    .replace(/[<[(].*$/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
  let h = 0
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return (
    <span
      title={n}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.42), background: avatarPalette[h % avatarPalette.length] }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
    >
      {initials || '?'}
    </span>
  )
}

export function Person({ identity, size = 20 }: { identity?: IdentityRef | null; size?: number }) {
  if (!identity) return <span className="text-muted">Não atribuído</span>
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Avatar identity={identity} size={size} />
      <span className="truncate">{identity.displayName}</span>
    </span>
  )
}

export function TimeAgo({ date }: { date?: string | Date | null }) {
  if (!date) return null
  const d = new Date(date)
  if (isNaN(d.getTime())) return null
  return <span title={format(d, 'dd/MM/yyyy HH:mm')}>{formatDistanceToNow(d, { addSuffix: true, locale: ptBR })}</span>
}

export const formatDate = (date?: string | Date | null, pattern = 'dd/MM/yyyy HH:mm') => (date ? format(new Date(date), pattern) : '')

/** Duração legível: "4m 31s", "1h 02m". */
export function formatDuration(start?: string | null, end?: string | null): string {
  if (!start) return ''
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()
  if (ms < 0 || isNaN(ms)) return ''
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

// ---------------------------------------------------------------- Sobreposições

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 560
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  // Abas escondidas continuam montadas: só a aba visível responde ao Esc
  const tabActive = useTabActive()
  useEffect(() => {
    if (!open || !tabActive) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, tabActive])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={onClose}>
      <div
        role="dialog"
        style={{ width }}
        className="flex max-h-[90vh] max-w-[95vw] flex-col rounded-sm border border-border bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-2 border-rule-strong px-4 py-2">
          <div className="narrow text-xl font-bold">{title}</div>
          <IconButton title="Fechar" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-auto p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

/** Painel lateral deslizante (detalhe de item sem sair da lista). */
export function SidePanel({
  open,
  onClose,
  title,
  actions,
  children,
  width = 760
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  actions?: ReactNode
  children: ReactNode
  width?: number
}) {
  // Abas escondidas continuam montadas: só a aba visível responde ao Esc
  const tabActive = useTabActive()
  useEffect(() => {
    if (!open || !tabActive) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, tabActive])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/25" onMouseDown={onClose}>
      <div
        style={{ width }}
        className="flex h-full max-w-[95vw] animate-[slidein_160ms_ease-out] flex-col border-l border-border bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <div className="min-w-0 flex-1 truncate font-semibold">{title}</div>
          {actions}
          <IconButton title="Fechar" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
      <style>{'@keyframes slidein{from{transform:translateX(16px);opacity:.6}to{transform:none;opacity:1}}'}</style>
    </div>
  )
}

// ---------------------------------------------------------------- Larguras de coluna redimensionáveis
//
// Larguras ficam salvas por tela (persistKey) no localStorage e num cache em memória com assinantes:
// como todas as abas vivem na mesma janela, ajustar uma coluna numa aba atualiza as outras na hora.

const COLW_PREFIX = 'devops-desktop:colw:'
const COLW_MIN = 48
type ColWidths = Readonly<Record<string, number>>
const colwCache = new Map<string, ColWidths>()
const colwListeners = new Set<() => void>()
const EMPTY_WIDTHS: ColWidths = Object.freeze({})

function readColWidths(key: string): ColWidths {
  let v = colwCache.get(key)
  if (!v) {
    try {
      const raw = localStorage.getItem(COLW_PREFIX + key)
      v = raw ? (JSON.parse(raw) as ColWidths) : EMPTY_WIDTHS
    } catch {
      v = EMPTY_WIDTHS
    }
    colwCache.set(key, v)
  }
  return v
}

function writeColWidths(key: string, next: ColWidths, persist: boolean) {
  colwCache.set(key, next)
  if (persist) {
    try {
      if (Object.keys(next).length) localStorage.setItem(COLW_PREFIX + key, JSON.stringify(next))
      else localStorage.removeItem(COLW_PREFIX + key)
    } catch {
      /* sem armazenamento: a largura vale só nesta sessão */
    }
  }
  colwListeners.forEach((l) => l())
}

const subscribeColWidths = (l: () => void) => {
  colwListeners.add(l)
  return () => colwListeners.delete(l)
}

/**
 * Colunas redimensionáveis com largura persistida por tela (`persistKey`), compartilhada entre abas.
 * Use em tabelas próprias: aplique `tableStyle` no <table>, `width(key)` no style de cada <th>
 * (que precisa de `relative` e `data-col={key}`) e coloque `handle(key)` dentro do <th>.
 * Arrastar a alça ajusta; duplo clique restaura a largura original da coluna.
 */
export function useResizableColumns(persistKey: string, cols: { key: string; width?: number | string }[], extraPx = 0) {
  const widths = useSyncExternalStore(subscribeColWidths, () => readColWidths(persistKey))
  const width = (k: string): number | string | undefined => widths[k] ?? cols.find((c) => c.key === k)?.width
  const custom = Object.keys(widths).length > 0
  const allPx = cols.every((c) => typeof width(c.key) === 'number')
  const total = allPx ? cols.reduce((s, c) => s + (width(c.key) as number), extraPx) : undefined
  // Com larguras salvas a tabela passa a layout fixo: colunas sem largura (as flexíveis) dividem o que sobra;
  // se todas forem fixas, a tabela tem exatamente a soma (como numa planilha) e rola na horizontal se precisar.
  const tableStyle: CSSProperties | undefined = custom ? { tableLayout: 'fixed', width: total ?? '100%' } : undefined

  const onPointerDown = (k: string) => (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const th = e.currentTarget.closest('th')
    if (!th) return
    // Congela as colunas de largura definida pela medida atual, para nenhuma "pular" quando o layout virar fixo
    const current = { ...readColWidths(persistKey) }
    th.parentElement?.querySelectorAll<HTMLTableCellElement>('th[data-col]').forEach((cell) => {
      const key = cell.dataset.col!
      const def = cols.find((c) => c.key === key)?.width
      if (current[key] === undefined && (def !== undefined || key === k)) current[key] = Math.round(cell.getBoundingClientRect().width)
    })
    writeColWidths(persistKey, current, false)
    const startX = e.clientX
    const startW = current[k]!
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    // Ouve na janela inteira: o ponteiro sai da alça (e até da tabela) durante o arraste
    const move = (ev: PointerEvent) =>
      writeColWidths(persistKey, { ...readColWidths(persistKey), [k]: Math.max(COLW_MIN, Math.round(startW + ev.clientX - startX)) }, false)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      writeColWidths(persistKey, readColWidths(persistKey), true)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', up)
  }

  const reset = (k: string) => {
    const next = { ...readColWidths(persistKey) }
    delete next[k]
    // Se só restaram colunas que já tinham largura padrão igual à salva, volta ao layout original
    const meaningful = Object.entries(next).filter(([key, v]) => cols.find((c) => c.key === key)?.width !== v)
    writeColWidths(persistKey, meaningful.length ? next : EMPTY_WIDTHS, true)
  }

  const handle = (k: string) => (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar coluna"
      title="Arraste para redimensionar · duplo clique restaura"
      onPointerDown={onPointerDown(k)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation()
        reset(k)
      }}
      className="absolute top-0 -right-1 z-[2] h-full w-2.5 cursor-col-resize touch-none select-none after:absolute after:inset-y-2 after:left-1 after:w-px after:bg-border hover:after:w-0.5 hover:after:bg-focus"
    />
  )

  return { tableStyle, width, handle, custom }
}

// ---------------------------------------------------------------- Tabela de classificação

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  width?: number | string
  align?: 'left' | 'right' | 'center'
  className?: string
  /** Valor para ordenação ao clicar no cabeçalho. */
  sortValue?: (row: T) => string | number | null | undefined
}

/**
 * Tabela padrão: cabeçalho condensado com régua de 2px, linhas de 32px com régua de 1px,
 * faixa de zona opcional na esquerda (zone/mine) e ordenação por clique.
 */
export function Table<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  zone,
  mine,
  sort,
  onSortChange,
  selectedKey,
  className,
  rowClassName,
  persistKey
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (r: T) => string | number
  onRowClick?: (r: T) => void
  zone?: (r: T) => Zone
  mine?: (r: T) => boolean
  sort?: { key: string; dir: 'asc' | 'desc' } | null
  onSortChange?: (s: { key: string; dir: 'asc' | 'desc' }) => void
  selectedKey?: string | number | null
  className?: string
  rowClassName?: (r: T) => string | undefined
  /** Chave da tela para salvar as larguras das colunas (ex.: "pipelines.runs"). Sem ela, deriva das colunas. */
  persistKey?: string
}) {
  const resize = useResizableColumns(persistKey ?? `auto:${columns.map((c) => c.key).join('|')}`, columns, zone ? 6 : 0)
  let shown = rows
  const sortCol = sort && columns.find((c) => c.key === sort.key)
  if (sortCol?.sortValue) {
    const sv = sortCol.sortValue
    shown = [...rows].sort((a, b) => {
      const va = sv(a) ?? ''
      const vb = sv(b) ?? ''
      const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR', { numeric: true })
      return sort!.dir === 'asc' ? r : -r
    })
  }
  const hasZone = !!zone
  return (
    <div className={clsx('overflow-auto bg-surface', className)}>
      <table className={clsx('w-full border-collapse text-sm', resize.custom && '[&_td]:overflow-hidden')} style={resize.tableStyle}>
        <thead className="sticky top-0 z-[1] bg-surface">
          <tr className="border-b-2 border-rule-strong">
            {hasZone && <th className="w-1.5 p-0" style={resize.custom ? { width: 6 } : undefined} />}
            {columns.map((c) => {
              const active = sort?.key === c.key
              return (
                <th
                  key={c.key}
                  data-col={c.key}
                  style={{ width: resize.width(c.key) }}
                  className={clsx(
                    'colhead relative h-8 overflow-visible px-3 font-semibold',
                    c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                  )}
                >
                  {c.sortValue && onSortChange ? (
                    <button
                      type="button"
                      className={clsx('inline-flex items-center gap-1 uppercase hover:text-fg', active && 'text-fg')}
                      onClick={() => onSortChange({ key: c.key, dir: active && sort!.dir === 'asc' ? 'desc' : 'asc' })}
                    >
                      {c.header}
                      {active && (sort!.dir === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
                    </button>
                  ) : (
                    c.header
                  )}
                  {resize.handle(c.key)}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const k = rowKey(r)
            return (
              <tr
                key={k}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={clsx(
                  'h-8 border-b border-border transition-colors duration-100',
                  onRowClick && 'cursor-pointer hover:bg-surface-2',
                  selectedKey === k && 'bg-surface-2',
                  rowClassName?.(r)
                )}
              >
                {hasZone && (
                  <td className="w-1.5 p-0">
                    <span className="flex h-8">
                      <ZoneStripe zone={zone!(r)} mine={mine?.(r)} />
                    </span>
                  </td>
                )}
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={clsx('px-3 py-1 align-middle', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.className)}
                  >
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Célula de "posição": ID em Archivo Narrow semibold alinhado à direita (#1234, !1287). */
export const IdCell = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={clsx('narrow font-semibold whitespace-nowrap', className)}>{children}</span>
)

// ---------------------------------------------------------------- Conteúdo rico

/** Markdown com GFM. Links abrem no navegador padrão. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={clsx('prose-ado', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                if (href) openExternal(href)
              }}
            >
              {children}
            </a>
          )
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

/** HTML vindo do ADO (descrições de work item etc.). Sanitização básica. */
export function Html({ html, className }: { html?: string | null; className?: string }) {
  if (!html) return null
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    // Estilos inline do editor do ADO (fundos cinza, cores fixas) brigam com o tema; a tipografia vem de .prose-ado
    .replace(/\s(style|bgcolor|color|background)="[^"]*"/gi, '')
    .replace(/\s(style|bgcolor|color|background)='[^']*'/gi, '')
  return (
    <div
      className={clsx('prose-ado', className)}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a')
        if (a?.href) {
          e.preventDefault()
          openExternal(a.href)
        }
      }}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}

export function ExternalButton({ url, label = 'Abrir no navegador' }: { url: string; label?: string }) {
  return (
    <Button variant="ghost" size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => openExternal(url)}>
      {label}
    </Button>
  )
}
