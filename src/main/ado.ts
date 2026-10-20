// Todas as chamadas HTTP ao Azure DevOps passam por aqui (processo main),
// evitando CORS e mantendo o PAT fora do renderer.

export type AdoHost = 'dev' | 'vssps' | 'vsrm' | 'feeds' | 'pkgs' | 'almsearch' | 'analytics' | 'vsaex' | 'extmgmt' | 'app'

export interface AdoRequest {
  /** Organização (ex.: "minha-org"). Ignorado para host "app". */
  org?: string
  host?: AdoHost
  /** Caminho após a organização, ex.: "MyProject/_apis/git/repositories" */
  path: string
  method?: string
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  /** Content-Type do body; padrão application/json. Use application/json-patch+json para work items. */
  contentType?: string
  apiVersion?: string | null
  /** Formato da resposta: json (padrão), text ou base64 (binários). */
  responseType?: 'json' | 'text' | 'base64'
  /** Headers extras (ex.: Accept, If-Match). */
  headers?: Record<string, string>
  /** Se "base64", body é uma string base64 enviada como binário (uploads de anexos). */
  bodyEncoding?: 'json' | 'base64'
}

export interface AdoResponse {
  ok: boolean
  status: number
  data: unknown
  /** Header x-ms-continuationtoken, se houver (paginação). */
  continuationToken: string | null
  /** Headers úteis da resposta (etag, location, content-type, content-disposition). */
  headers: Record<string, string>
  error?: string
}

function baseUrl(host: AdoHost, org?: string): string {
  switch (host) {
    case 'app':
      return 'https://app.vssps.visualstudio.com/'
    case 'vssps':
      return `https://vssps.dev.azure.com/${org}/`
    case 'vsrm':
      return `https://vsrm.dev.azure.com/${org}/`
    case 'feeds':
      return `https://feeds.dev.azure.com/${org}/`
    case 'pkgs':
      return `https://pkgs.dev.azure.com/${org}/`
    case 'almsearch':
      return `https://almsearch.dev.azure.com/${org}/`
    case 'vsaex':
      return `https://vsaex.dev.azure.com/${org}/`
    case 'extmgmt':
      return `https://extmgmt.dev.azure.com/${org}/`
    case 'analytics':
      return `https://analytics.dev.azure.com/${org}/`
    default:
      return `https://dev.azure.com/${org}/`
  }
}

export async function adoRequest(req: AdoRequest): Promise<AdoResponse> {
  const pat = process.env.AZURE_DEVOPS_EXT_PAT
  if (!pat) {
    return { ok: false, status: 0, data: null, continuationToken: null, headers: {}, error: 'Variável AZURE_DEVOPS_EXT_PAT não definida' }
  }

  const host = req.host ?? 'dev'
  const isAbsolute = /^https?:\/\//.test(req.path)
  const url = new URL(isAbsolute ? req.path : baseUrl(host, req.org) + req.path.replace(/^\//, ''))
  for (const [k, v] of Object.entries(req.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }
  if (req.apiVersion !== null && !url.searchParams.has('api-version')) {
    url.searchParams.set('api-version', req.apiVersion ?? '7.1')
  }

  const headers: Record<string, string> = {
    Authorization: 'Basic ' + Buffer.from(':' + pat).toString('base64'),
    Accept: req.responseType === 'json' || !req.responseType ? 'application/json' : '*/*',
    ...req.headers
  }
  let body: BodyInit | undefined
  if (req.body !== undefined) {
    if (req.bodyEncoding === 'base64') {
      headers['Content-Type'] = req.contentType ?? 'application/octet-stream'
      body = Buffer.from(String(req.body), 'base64')
    } else {
      headers['Content-Type'] = req.contentType ?? 'application/json'
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }
  }

  try {
    const res = await fetch(url, { method: req.method ?? 'GET', headers, body, redirect: 'follow' })
    const continuationToken = res.headers.get('x-ms-continuationtoken')
    const outHeaders: Record<string, string> = {}
    for (const h of ['etag', 'location', 'content-type', 'content-disposition']) {
      const v = res.headers.get(h)
      if (v) outHeaders[h] = v
    }
    let data: unknown = null
    const type = req.responseType ?? 'json'
    if (type === 'base64') {
      data = Buffer.from(await res.arrayBuffer()).toString('base64')
    } else {
      const text = await res.text()
      if (type === 'text') data = text
      else {
        try {
          data = text ? JSON.parse(text) : null
        } catch {
          data = text
        }
      }
    }
    if (!res.ok) {
      const msg =
        (data && typeof data === 'object' && 'message' in data && String((data as { message: unknown }).message)) ||
        (typeof data === 'string' && data.slice(0, 500)) ||
        res.statusText
      return { ok: false, status: res.status, data, continuationToken, headers: outHeaders, error: `${res.status} ${msg}` }
    }
    return { ok: true, status: res.status, data, continuationToken, headers: outHeaders }
  } catch (e) {
    return { ok: false, status: 0, data: null, continuationToken: null, headers: {}, error: (e as Error).message }
  }
}
