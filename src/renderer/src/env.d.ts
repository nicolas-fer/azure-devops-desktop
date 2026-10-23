/// <reference types="vite/client" />
import type { AdoRequestInit, AdoRawResponse } from './lib/api'

export type PickFolderResult = { path: string; remoteUrl: string | null } | { error: string } | null

declare global {
  interface Window {
    ado: {
      request: (req: AdoRequestInit) => Promise<AdoRawResponse>
      hasPat: () => Promise<boolean>
      defaultOrg: () => Promise<string | null>
      openExternal: (url: string) => Promise<void>
    }
    pty: {
      /** Inicia um shell com o Claude Code na pasta; devolve o id da sessão. */
      spawn: (opts: { cwd: string; cols: number; rows: number }) => Promise<number>
      write: (id: number, data: string) => Promise<void>
      resize: (id: number, cols: number, rows: number) => Promise<void>
      kill: (id: number) => Promise<void>
      /** Assina a saída de uma sessão; devolve a função de cancelamento. */
      onData: (id: number, cb: (data: string) => void) => () => void
      onExit: (id: number, cb: (exitCode: number) => void) => () => void
    }
    localRepo: {
      pickFolder: () => Promise<PickFolderResult>
      commandExists: (name: string) => Promise<boolean>
    }
  }
}
export {}
