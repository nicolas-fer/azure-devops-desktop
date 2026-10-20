// Dados e mutações da feature Artifacts (Azure Artifacts: feeds e pacotes).
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ado, adoList, seg, type ListResponse } from '@/lib/api'

export const FEED_API = '7.1-preview.1'

export type ProtocolGroup = 'nuget' | 'npm' | 'maven' | 'pypi' | 'upack' | 'other'

export const PROTOCOL_LABEL: Record<ProtocolGroup, string> = {
  nuget: 'NuGet',
  npm: 'npm',
  maven: 'Maven',
  pypi: 'Python',
  upack: 'Universal',
  other: 'Outro'
}

/** Normaliza o protocolType do ADO (NuGet, Npm, Maven, PyPi, Upack, ...) para um grupo conhecido. */
export function protocolGroup(p?: string | null): ProtocolGroup {
  const s = (p ?? '').toLowerCase()
  if (s === 'nuget') return 'nuget'
  if (s === 'npm') return 'npm'
  if (s === 'maven') return 'maven'
  if (s === 'pypi') return 'pypi'
  if (s === 'upack') return 'upack'
  return 'other'
}

export interface FeedUpstream {
  id?: string
  name: string
  protocol: string
  location?: string
  upstreamSourceType?: string
  status?: string
}

export interface FeedRaw {
  id: string
  name: string
  description?: string
  url: string
  defaultViewId?: string
  upstreamEnabled?: boolean
  upstreamSources?: FeedUpstream[]
  capabilities?: Record<string, unknown>
}

/** Feed com escopo calculado: 'org' (organização) ou 'project' (projeto). */
export interface Feed extends FeedRaw {
  scope: { kind: 'org' } | { kind: 'project'; project: string }
}

export interface FeedView {
  id: string
  name: string
  type: string
}

export interface VersionView {
  id: string
  name: string
  type?: string
}

export interface PackageDependency {
  packageName: string
  group?: string
  versionRange?: string
}

export interface PackageVersion {
  id: string
  version: string
  normalizedVersion: string
  isLatest: boolean
  isListed: boolean
  publishDate: string
  packageDescription?: string
  description?: string
  author?: string
  views: VersionView[]
  dependencies?: PackageDependency[]
  sourceChain?: { name?: string; feedName?: string }[]
}

export interface FeedPackage {
  id: string
  name: string
  normalizedName: string
  protocolType: string
  url: string
  versions: PackageVersion[]
}

export interface FeedPermission {
  role: string
  identityDescriptor: string
  displayName: string | null
  isInheritedRole: boolean
}

const PAGE = 100

/** Prefixo de projeto nas rotas de feed/pacote (feed de projeto exige {project}/). */
export function scopePrefix(feed: Feed | undefined): string {
  return feed && feed.scope.kind === 'project' ? `${seg(feed.scope.project)}/` : ''
}

/** Nome de projeto usado nas URLs de registro (vazio para feed de organização). */
export function scopeProject(feed: Feed | undefined): string | undefined {
  return feed && feed.scope.kind === 'project' ? feed.scope.project : undefined
}

/** Lista feeds da organização e do projeto atual (rótulo de escopo calculado). */
export function useFeeds(org: string, project: string) {
  return useQuery({
    queryKey: [org, project, 'artifacts', 'feeds'],
    enabled: !!org,
    queryFn: async (): Promise<Feed[]> => {
      const [orgFeeds, projFeeds] = await Promise.all([
        adoList<FeedRaw>({ host: 'feeds', org, path: '_apis/packaging/feeds', apiVersion: FEED_API }),
        project
          ? adoList<FeedRaw>({ host: 'feeds', org, path: `${seg(project)}/_apis/packaging/feeds`, apiVersion: FEED_API })
          : Promise.resolve([] as FeedRaw[])
      ])
      const projIds = new Set(projFeeds.map((f) => f.id))
      const merged = new Map<string, Feed>()
      for (const f of orgFeeds) {
        merged.set(f.id, { ...f, scope: projIds.has(f.id) ? { kind: 'project', project } : { kind: 'org' } })
      }
      for (const f of projFeeds) {
        if (!merged.has(f.id)) merged.set(f.id, { ...f, scope: { kind: 'project', project } })
      }
      return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    }
  })
}

/** Views de um feed (@Local, @Prerelease, @Release). */
export function useFeedViews(org: string, feed: Feed | undefined) {
  return useQuery({
    queryKey: [org, feed?.id, 'artifacts', 'views'],
    enabled: !!org && !!feed,
    queryFn: () =>
      adoList<FeedView>({ host: 'feeds', org, path: `${scopePrefix(feed)}_apis/packaging/feeds/${feed!.id}/views`, apiVersion: FEED_API })
  })
}

/** Pacotes do feed, paginados por $skip. */
export function usePackages(org: string, feed: Feed | undefined) {
  return useInfiniteQuery({
    queryKey: [org, feed?.id, 'artifacts', 'packages'],
    enabled: !!org && !!feed,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      adoList<FeedPackage>({
        host: 'feeds',
        org,
        path: `${scopePrefix(feed)}_apis/packaging/Feeds/${feed!.id}/packages`,
        apiVersion: FEED_API,
        query: { includeDescription: true, $top: PAGE, $skip: pageParam }
      }),
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined)
  })
}

/** Versões de um pacote (com views, dependências e origem). */
export function usePackageVersions(org: string, feed: Feed | undefined, pkgId: string | null) {
  return useQuery({
    queryKey: [org, feed?.id, 'artifacts', 'versions', pkgId],
    enabled: !!org && !!feed && !!pkgId,
    queryFn: () =>
      adoList<PackageVersion>({
        host: 'feeds',
        org,
        path: `${scopePrefix(feed)}_apis/packaging/Feeds/${feed!.id}/Packages/${pkgId}/versions`,
        apiVersion: FEED_API,
        query: { $top: 100 }
      })
  })
}

export function useFeedPermissions(org: string, feed: Feed | undefined) {
  return useQuery({
    queryKey: [org, feed?.id, 'artifacts', 'permissions'],
    enabled: !!org && !!feed,
    queryFn: () =>
      adoList<FeedPermission>({ host: 'feeds', org, path: `${scopePrefix(feed)}_apis/packaging/feeds/${feed!.id}/permissions`, apiVersion: FEED_API })
  })
}

/** Caminho base de API de registro por protocolo (apenas NuGet e npm têm escrita aqui). */
function registryPath(feed: Feed, protocol: ProtocolGroup, name: string): string {
  return `${scopePrefix(feed)}_apis/packaging/feeds/${feed.id}/${protocol}/packages/${seg(name)}`
}

export type VersionAction =
  | { kind: 'promote'; view: string }
  | { kind: 'list'; listed: boolean }
  | { kind: 'delete' }

export const WRITABLE_PROTOCOLS: ProtocolGroup[] = ['nuget', 'npm']

/** Promover para view, listar/desListar ou excluir uma versão. Só NuGet e npm nesta versão. */
export function useVersionAction(org: string, feed: Feed | undefined, pkg: FeedPackage | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ version, action }: { version: string; action: VersionAction }) => {
      if (!feed || !pkg) throw new Error('Feed ou pacote não selecionado')
      const proto = protocolGroup(pkg.protocolType)
      if (!WRITABLE_PROTOCOLS.includes(proto)) throw new Error(`Ações de versão não suportadas para ${PROTOCOL_LABEL[proto]} nesta versão do app`)
      const path = `${registryPath(feed, proto, pkg.name)}/versions/${seg(version)}`
      if (action.kind === 'delete') {
        return ado({ host: 'pkgs', org, path, method: 'DELETE', apiVersion: FEED_API })
      }
      const body =
        action.kind === 'promote'
          ? { views: { op: 'add', path: `/views/${action.view}` } }
          : { isListed: action.listed }
      return ado({ host: 'pkgs', org, path, method: 'PATCH', body, apiVersion: FEED_API })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [org, feed?.id, 'artifacts'] })
    }
  })
}

/** Baixa o conteúdo de uma versão NuGet (.nupkg) em base64. */
export async function downloadPackageVersion(org: string, feed: Feed, pkg: FeedPackage, version: string): Promise<string> {
  if (protocolGroup(pkg.protocolType) !== 'nuget') throw new Error('Download disponível apenas para pacotes NuGet nesta versão do app')
  return ado<string>({
    host: 'pkgs',
    org,
    path: `${registryPath(feed, 'nuget', pkg.name)}/versions/${seg(version)}/content`,
    apiVersion: FEED_API,
    responseType: 'base64'
  })
}
