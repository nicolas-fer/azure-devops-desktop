// Peças visuais compartilhadas dentro da feature Pipelines (não promover sem revisar).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, Search } from 'lucide-react'
import { Button, ErrorBox, Input, Modal, cx } from '@/components/ui'
import { errorText } from './errors'

/** Confirmação antes de ações irreversíveis (cancelar, excluir, criar release, implantar). */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  danger,
  pending,
  error,
  onConfirm,
  onClose
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  danger?: boolean
  pending?: boolean
  error?: unknown
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={440}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm">{message}</div>
      {error ? <ErrorBox className="mx-0 my-3" error={error} /> : null}
    </Modal>
  )
}

/** Observa se um elemento entrou na área visível (carregamento sob demanda). */
export function useInView<T extends Element>() {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || inView) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setInView(true)
        io.disconnect()
      }
    })
    io.observe(el)
    return () => io.disconnect()
  }, [inView])
  return { ref, inView }
}

/** Mensagem curta de sucesso/erro embaixo de uma ação. */
export function InlineNote({ kind, children }: { kind: 'ok' | 'err'; children: ReactNode }) {
  return (
    <div
      role="status"
      className={cx(
        'flex items-center gap-2 border-l-2 bg-surface px-3 py-1.5 text-[12px]',
        kind === 'ok' ? 'border-zone-done text-fg' : 'border-zone-fail text-fail-ink'
      )}
    >
      {children}
    </div>
  )
}

export { errorText }

const LINE_CLS = {
  error: 'text-fail-ink bg-zone-fail/10',
  warning: 'text-progress-ink bg-zone-progress/10',
  section: 'font-semibold text-fg bg-surface-2'
} as const

function lineKind(line: string): keyof typeof LINE_CLS | null {
  if (line.includes('##[error]')) return 'error'
  if (line.includes('##[warning]')) return 'warning'
  if (line.includes('##[section]')) return 'section'
  return null
}

/**
 * Visualizador de log monoespaçado: numeração de linhas, cores para ##[error]/##[warning]/##[section],
 * busca (filtra e destaca) e "seguir" (rola para o fim enquanto o run está em execução).
 */
export function LogViewer({ text, running, emptyLabel = 'Sem conteúdo de log' }: { text: string | undefined; running?: boolean; emptyLabel?: string }) {
  const [query, setQuery] = useState('')
  const [follow, setFollow] = useState(true)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n')
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  const q = query.trim().toLowerCase()
  const matches = q ? lines.reduce((n, l) => n + (l.toLowerCase().includes(q) ? 1 : 0), 0) : 0

  useEffect(() => {
    if (running && follow && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [text, running, follow])

  return (
    <div className="flex h-full min-h-0 flex-col border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-2 py-1">
        <div className="relative w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted" />
          <Input
            aria-label="Buscar no log"
            placeholder="Buscar no log"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-6 pl-7 text-[12px]"
          />
        </div>
        {q && <span className="narrow text-[12px] text-muted">{matches} linha(s)</span>}
        <div className="flex-1" />
        {running && (
          <label className="flex items-center gap-1 text-[12px] text-muted">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            Seguir
          </label>
        )}
        {running && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-fg"
            onClick={() => boxRef.current && (boxRef.current.scrollTop = boxRef.current.scrollHeight)}
          >
            <ArrowDown className="size-3.5" /> Ir ao fim
          </button>
        )}
      </div>
      <div ref={boxRef} className="min-h-0 flex-1 overflow-auto bg-bg font-mono text-[12.5px] leading-[18px]">
        {lines.length === 0 ? (
          <div className="px-3 py-3 text-muted">{emptyLabel}</div>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, i) => {
                if (q && !line.toLowerCase().includes(q)) return null
                const k = lineKind(line)
                return (
                  <tr key={i} className={cx(k && LINE_CLS[k])}>
                    <td className="w-12 min-w-12 px-2 text-right align-top text-muted select-none">{i + 1}</td>
                    <td className="px-2 break-all whitespace-pre-wrap">
                      {line.replace(/##\[(error|warning|section|group|endgroup)\]/g, (_m, t: string) => (t === 'group' || t === 'endgroup' ? '' : `[${t === 'section' ? 'seção' : t === 'error' ? 'erro' : 'aviso'}] `))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
