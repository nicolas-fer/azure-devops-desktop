/// <reference types="vite/client" />
import type { AdoRequestInit, AdoRawResponse } from './lib/api'

declare global {
  interface Window {
    ado: {
      request: (req: AdoRequestInit) => Promise<AdoRawResponse>
      hasPat: () => Promise<boolean>
      defaultOrg: () => Promise<string | null>
      openExternal: (url: string) => Promise<void>
    }
  }
}
export {}
