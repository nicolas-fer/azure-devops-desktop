// Pasta do clone local e checagem do Claude Code instalado.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron'

export type PickFolderResult = { path: string; remoteUrl: string | null } | { error: string } | null

function readOriginUrl(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    // execFile sem shell: o caminho vai como argumento.
    execFile('git', ['-C', cwd, 'config', '--get', 'remote.origin.url'], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
      resolve(err ? null : stdout.trim() || null)
    })
  })
}

/** Abre o seletor de pasta. null = cancelado; { error } = pasta sem .git. */
export async function pickFolder(win: BrowserWindow | null): Promise<PickFolderResult> {
  const options: OpenDialogOptions = { properties: ['openDirectory'], title: 'Escolha a pasta do clone local' }
  const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (res.canceled || res.filePaths.length === 0) return null
  const path = res.filePaths[0]
  if (!existsSync(join(path, '.git'))) {
    return { error: 'Essa pasta não tem .git. Escolha a raiz do clone do repositório.' }
  }
  return { path, remoteUrl: await readOriginUrl(path) }
}

/** Verifica se um comando existe (no login shell do Linux, para pegar o PATH do perfil). */
export function commandExists(name: string): Promise<boolean> {
  if (!/^[\w.-]+$/.test(name)) return Promise.resolve(false)
  return new Promise((resolve) => {
    const [file, args] =
      process.platform === 'win32'
        ? ['where.exe', [name]]
        : [process.env.SHELL || 'bash', ['-lc', 'command -v "$1"', 'sh', name]]
    execFile(file, args as string[], { windowsHide: true, timeout: 10000 }, (err) => resolve(!err))
  })
}
