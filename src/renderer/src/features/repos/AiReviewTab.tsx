// Aba Revisão IA do PR: terminal embutido (xterm.js + PTY) com o Claude Code aberto no clone local do repositório.
import '@xterm/xterm/css/xterm.css'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { AlertTriangle, ArrowRight, FolderOpen, Info, RotateCw } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Code, Empty, cx } from '@/components/ui'
import type { GitPullRequest } from './repoApi'

interface SavedClone {
  path: string
  remoteUrl: string | null
}

type SessionStatus = { kind: 'starting' } | { kind: 'running' } | { kind: 'exited'; code: number }

const storageKey = (repoId: string) => `devops-desktop:clone:${repoId}`

function loadClone(repoId: string): SavedClone | null {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey(repoId)) ?? 'null')
    return typeof v?.path === 'string' ? { path: v.path, remoteUrl: typeof v.remoteUrl === 'string' ? v.remoteUrl : null } : null
  } catch {
    return null
  }
}

function saveClone(repoId: string, value: SavedClone) {
  try {
    localStorage.setItem(storageKey(repoId), JSON.stringify(value))
  } catch {
    // armazenamento indisponível: a pasta vale só nesta sessão
  }
}

/** Último segmento da URL do remoto (cobre dev.azure.com, visualstudio.com e ssh). */
function repoNameFromRemote(url: string): string | null {
  const last = url.trim().replace(/\/+$/, '').replace(/\.git$/i, '').split(/[/:]/).pop()
  return last ? last.toLowerCase() : null
}

const shortRef = (ref: string) => ref.replace(/^refs\/heads\//, '')

const terminalTheme = {
  background: '#0d3b44',
  foreground: '#e8f1f0',
  cursor: '#3fd1b5',
  cursorAccent: '#0d3b44',
  selectionBackground: '#165460',
  black: '#0d3b44',
  red: '#d93a3a',
  green: '#1e9e5a',
  yellow: '#e3a008',
  blue: '#2f6fde',
  magenta: '#7a3fe0',
  cyan: '#3fd1b5',
  white: '#e8f1f0',
  brightBlack: '#8fb1b0',
  brightRed: '#f07a7a',
  brightGreen: '#4cc985',
  brightYellow: '#f0c24b',
  brightBlue: '#7fa6f0',
  brightMagenta: '#c3a5ff',
  brightCyan: '#3fd1b5',
  brightWhite: '#ffffff'
}

export function AiReviewTab({ pr }: { org: string; project: string; pr: GitPullRequest }) {
  const repoId = pr.repository.id
  const repoName = pr.repository.name
  const [clone, setClone] = useState<SavedClone | null>(() => loadClone(repoId))
  const [runKey, setRunKey] = useState(0)
  const [status, setStatus] = useState<SessionStatus>({ kind: 'starting' })
  const [claudeOk, setClaudeOk] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const termRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    void window.localRepo.commandExists('claude').then((ok) => alive && setClaudeOk(ok))
    return () => {
      alive = false
    }
  }, [])

  // Sessão do terminal: nasce com a pasta escolhida e morre ao desmontar, trocar de pasta ou reiniciar.
  useEffect(() => {
    const el = termRef.current
    if (!clone || !el) return

    let disposed = false
    let id: number | null = null
    let exited = false
    const subs: Array<() => void> = []

    setStatus({ kind: 'starting' })
    const term = new Terminal({
      cursorBlink: true,
      scrollback: 5000,
      fontFamily: "'Cascadia Code', Consolas, monospace",
      fontSize: 13,
      theme: terminalTheme
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    fit.fit()

    const inputSub = term.onData((data) => {
      if (id !== null && !exited) void window.pty.write(id, data)
    })
    const resizeSub = term.onResize(({ cols, rows }) => {
      if (id !== null && !exited) void window.pty.resize(id, cols, rows)
    })
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        // contêiner ainda sem tamanho
      }
    })
    ro.observe(el)

    window.pty
      .spawn({ cwd: clone.path, cols: term.cols, rows: term.rows })
      .then((newId) => {
        if (disposed) {
          void window.pty.kill(newId)
          return
        }
        id = newId
        subs.push(window.pty.onData(newId, (data) => term.write(data)))
        subs.push(
          window.pty.onExit(newId, (code) => {
            exited = true
            if (!disposed) setStatus({ kind: 'exited', code })
          })
        )
        setStatus({ kind: 'running' })
        term.focus()
      })
      .catch((err: unknown) => {
        if (!disposed) {
          setError(err instanceof Error ? err.message : String(err))
          setStatus({ kind: 'exited', code: -1 })
        }
      })

    return () => {
      disposed = true
      ro.disconnect()
      inputSub.dispose()
      resizeSub.dispose()
      subs.forEach((off) => off())
      if (id !== null && !exited) void window.pty.kill(id)
      term.dispose()
    }
  }, [clone, runKey])

  async function chooseFolder() {
    setError(null)
    const res = await window.localRepo.pickFolder()
    if (!res) return
    if ('error' in res) {
      setError(res.error)
      return
    }
    const saved = { path: res.path, remoteUrl: res.remoteUrl }
    saveClone(repoId, saved)
    setClone(saved)
  }

  if (!clone) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Empty icon={<FolderOpen className="size-6" />} title="Revisão IA ainda sem pasta">
          <p className="mb-4 text-[13px]">
            A revisão abre o Claude Code no clone local do repositório <Code>{repoName}</Code>. Escolha a pasta onde ele está clonado.
          </p>
          <Button variant="primary" icon={<FolderOpen className="size-3.5" />} onClick={chooseFolder}>
            Escolher pasta do clone
          </Button>
          {error && <p className="mt-3 text-[12px] text-fail-ink">{error}</p>}
        </Empty>
      </div>
    )
  }

  const remoteName = clone.remoteUrl ? repoNameFromRemote(clone.remoteUrl) : null
  const remoteMismatch = remoteName !== repoName.toLowerCase()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
        <FolderOpen className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate font-mono text-[12px]" title={clone.path}>
          {clone.path}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted">
          <Code>{shortRef(pr.sourceRefName)}</Code>
          <ArrowRight className="size-3.5" />
          <Code>{shortRef(pr.targetRefName)}</Code>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted">
          <span
            className={cx(
              'inline-block size-2',
              status.kind === 'running' && 'bg-zone-done',
              status.kind === 'starting' && 'bg-zone-progress',
              status.kind === 'exited' && 'bg-zone-idle'
            )}
          />
          {status.kind === 'running' && 'Rodando'}
          {status.kind === 'starting' && 'Iniciando…'}
          {status.kind === 'exited' && `Encerrado (código ${status.code})`}
        </span>
        <Button size="sm" variant="ghost" icon={<FolderOpen className="size-3.5" />} onClick={chooseFolder}>
          Trocar pasta
        </Button>
        <Button size="sm" icon={<RotateCw className="size-3.5" />} onClick={() => setRunKey((k) => k + 1)}>
          Reiniciar sessão
        </Button>
      </div>

      {claudeOk === false && (
        <Notice icon={<Info className="mt-px size-3.5 shrink-0 text-muted" />}>
          O comando <Code>claude</Code> não foi encontrado nesta máquina. Instale com <Code>npm install -g @anthropic-ai/claude-code</Code> e reinicie a sessão.
        </Notice>
      )}
      {remoteMismatch && (
        <Notice icon={<AlertTriangle className="mt-px size-3.5 shrink-0 text-progress-ink" />}>
          {clone.remoteUrl
            ? `O remoto origin desta pasta não parece ser o repositório ${repoName}. Confira se é o clone certo.`
            : 'Esta pasta não tem remoto origin configurado. Confira se é o clone do repositório.'}
        </Notice>
      )}
      {error && <Notice icon={<AlertTriangle className="mt-px size-3.5 shrink-0 text-fail-ink" />}>{error}</Notice>}

      {/* Keydown não sobe para os atalhos do app (Ctrl+W, Ctrl+T, F5, Alt+←): o terminal recebe as teclas. */}
      <div className="min-h-0 flex-1 bg-shell p-2" onKeyDown={(e) => e.stopPropagation()}>
        <div ref={termRef} className="h-full w-full" />
      </div>
    </div>
  )
}

function Notice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-border bg-surface px-3 py-2 text-[12px] text-muted">
      {icon}
      <div className="min-w-0">{children}</div>
    </div>
  )
}
