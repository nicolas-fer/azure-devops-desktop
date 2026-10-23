// Terminais embutidos (PTY) para a aba Revisão IA: cada sessão roda um shell que inicia o Claude Code.
import { existsSync, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { WebContents } from 'electron'
import * as pty from '@lydell/node-pty'

export interface SpawnOptions {
  cwd: string
  cols: number
  rows: number
}

const sessions = new Map<number, pty.IPty>()
let nextId = 1
const isWin = process.platform === 'win32'

function findOnPath(exe: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir && existsSync(join(dir, exe))) return join(dir, exe)
  }
  return null
}

/** Comando fixo: o main nunca recebe comando do renderer. */
function shellCommand(): { file: string; args: string[] } {
  if (isWin) {
    // -NoExit mantém o PowerShell aberto quando o claude sair.
    const file = findOnPath('pwsh.exe') ?? 'powershell.exe'
    return { file, args: ['-NoLogo', '-NoExit', '-Command', 'claude'] }
  }
  const shell = process.env.SHELL || 'bash'
  // Login shell roda claude e depois troca o processo por outro login shell (o terminal continua aberto).
  return { file: shell, args: ['-l', '-c', 'claude; exec "$0" -l', shell] }
}

export function spawnSession(sender: WebContents, opts: SpawnOptions): number {
  if (typeof opts?.cwd !== 'string' || !statSync(opts.cwd, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error('Pasta do clone não encontrada.')
  }
  const { file, args } = shellCommand()
  const env: Record<string, string> = { TERM: 'xterm-256color', COLORTERM: 'truecolor' }
  for (const [k, v] of Object.entries(process.env)) if (typeof v === 'string') env[k] = v
  // Se o app foi aberto de dentro de outra sessão do Claude Code, não herdar os marcadores dela:
  // a sessão da Revisão IA é independente (senão o claude se trata como sub-sessão, sem salvar transcript)
  for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')) delete env[k]

  const proc = pty.spawn(file, args, {
    name: 'xterm-256color',
    cols: Math.max(2, Math.floor(opts.cols) || 80),
    rows: Math.max(2, Math.floor(opts.rows) || 24),
    cwd: opts.cwd,
    env
  })
  const id = nextId++
  sessions.set(id, proc)
  proc.onData((data) => {
    if (!sender.isDestroyed()) sender.send('pty:data', id, data)
  })
  proc.onExit(({ exitCode }) => {
    sessions.delete(id)
    if (!sender.isDestroyed()) sender.send('pty:exit', id, exitCode)
  })
  return id
}

export function writeSession(id: number, data: string): void {
  sessions.get(id)?.write(data)
}

export function resizeSession(id: number, cols: number, rows: number): void {
  try {
    sessions.get(id)?.resize(Math.max(2, Math.floor(cols)), Math.max(2, Math.floor(rows)))
  } catch {
    // sessão já encerrada
  }
}

export function killSession(id: number): void {
  const proc = sessions.get(id)
  if (!proc) return
  sessions.delete(id)
  try {
    proc.kill()
  } catch {
    // já encerrada
  }
}

export function killAllSessions(): void {
  for (const id of [...sessions.keys()]) killSession(id)
}
