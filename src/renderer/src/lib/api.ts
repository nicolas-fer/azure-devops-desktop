// Cliente da API REST do Azure DevOps. A requisição real é feita no processo main (ver src/main/ado.ts).

export type AdoHost = 'dev' | 'vssps' | 'vsrm' | 'feeds' | 'pkgs' | 'almsearch' | 'analytics' | 'vsaex' | 'extmgmt' | 'app'

export interface AdoRequestInit {
  org?: string
  host?: AdoHost
  path: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  contentType?: string
  apiVersion?: string | null
  responseType?: 'json' | 'text' | 'base64'
  headers?: Record<string, string>
  /** "base64": body é string base64 enviada como binário (upload de anexos). */
  bodyEncoding?: 'json' | 'base64'
}

export interface AdoRawResponse {
  ok: boolean
  status: number
  data: unknown
  continuationToken: string | null
  /** etag, location, content-type, content-disposition quando presentes. */
  headers: Record<string, string>
  error?: string
}

export class AdoError extends Error {
  constructor(message: string, public status: number, public data: unknown) {
    super(message)
  }
}

/** Faz uma chamada e devolve o corpo já tipado. Lança AdoError em falha. */
export async function ado<T = unknown>(req: AdoRequestInit): Promise<T> {
  const res = await window.ado.request(req)
  if (!res.ok) throw new AdoError(res.error ?? `Erro ${res.status}`, res.status, res.data)
  return res.data as T
}

/** Igual a ado(), mas devolve também o continuationToken. */
export async function adoRaw<T = unknown>(
  req: AdoRequestInit
): Promise<{ data: T; continuationToken: string | null; headers: Record<string, string> }> {
  const res = await window.ado.request(req)
  if (!res.ok) throw new AdoError(res.error ?? `Erro ${res.status}`, res.status, res.data)
  return { data: res.data as T, continuationToken: res.continuationToken, headers: res.headers ?? {} }
}

/** Respostas de lista do ADO: { count, value: [] } */
export interface ListResponse<T> {
  count: number
  value: T[]
}

/** Busca uma lista e devolve só o array value. */
export async function adoList<T>(req: AdoRequestInit): Promise<T[]> {
  const data = await ado<ListResponse<T>>(req)
  return data?.value ?? []
}

/** Busca todas as páginas de uma lista que usa x-ms-continuationtoken. */
export async function adoListAll<T>(req: AdoRequestInit, maxPages = 20): Promise<T[]> {
  const out: T[] = []
  let token: string | null = null
  for (let i = 0; i < maxPages; i++) {
    const { data, continuationToken }: { data: ListResponse<T>; continuationToken: string | null } = await adoRaw<ListResponse<T>>({
      ...req,
      query: { ...req.query, continuationToken: token ?? undefined }
    })
    out.push(...(data?.value ?? []))
    if (!continuationToken) break
    token = continuationToken
  }
  return out
}

/** Codifica um segmento de caminho (nome de projeto, repo, etc.). */
export const seg = (s: string) => encodeURIComponent(s)

/** Abre uma URL no navegador padrão. */
export const openExternal = (url: string) => window.ado.openExternal(url)

/** URL web equivalente no Azure DevOps (para "Abrir no navegador"). */
export const webUrl = (org: string, path = '') => `https://dev.azure.com/${org}/${path.replace(/^\//, '')}`

// ---------- Tipos comuns ----------

export interface IdentityRef {
  id: string
  displayName: string
  uniqueName?: string
  imageUrl?: string
  descriptor?: string
}

export interface Project {
  id: string
  name: string
  description?: string
  state: string
  visibility: string
  lastUpdateTime: string
  url: string
}

export interface Team {
  id: string
  name: string
  description?: string
  projectId: string
  projectName: string
}

export interface Profile {
  id: string
  displayName: string
  emailAddress: string
  publicAlias: string
}

export interface Account {
  accountId: string
  accountName: string
  accountUri: string
}

/** Salva um arquivo vindo da API (base64) pelo download do navegador. */
export function saveBase64(b64: string, filename: string, mime = 'application/octet-stream') {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
