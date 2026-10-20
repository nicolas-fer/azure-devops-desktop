// Núcleo da feature Repos: tipos da API Git (7.1), helpers de referência e hooks de leitura/escrita.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ado, adoList, seg, type AdoRequestInit, type IdentityRef } from '@/lib/api'

export const ZERO = '0000000000000000000000000000000000000000'

// ---------------------------------------------------------------- Tipos

export interface GitRepo {
  id: string
  name: string
  defaultBranch?: string
  remoteUrl: string
  sshUrl: string
  webUrl: string
  size: number
  isDisabled?: boolean
  project: { id: string; name: string }
}

export interface GitRef {
  name: string
  objectId: string
  peeledObjectId?: string
  creator?: IdentityRef
  url: string
  isLocked?: boolean
}

export interface GitPerson {
  name: string
  email: string
  date: string
}

export interface GitCommit {
  commitId: string
  author: GitPerson
  committer: GitPerson
  comment: string
  commentTruncated?: boolean
  parents?: string[]
  treeId?: string
  changeCounts?: Record<string, number>
  url: string
  remoteUrl: string
  push?: { pushId: number; date: string; pushedBy: IdentityRef }
}

export interface GitItem {
  objectId: string
  gitObjectType: 'tree' | 'blob' | 'commit' | 'tag'
  commitId: string
  path: string
  isFolder?: boolean
  size?: number
  url: string
  contentMetadata?: { isBinary?: boolean; contentType?: string; fileName?: string }
}

export interface GitChange {
  changeId?: number
  changeType: string
  item: { path: string; objectId?: string; isFolder?: boolean; gitObjectType?: string }
  originalPath?: string
}

export interface GitPush {
  pushId: number
  date: string
  pushedBy: IdentityRef
  refUpdates: { name: string; oldObjectId: string; newObjectId: string }[]
  commits?: GitCommit[]
  url?: string
}

export interface GitBranchStat {
  name: string
  aheadCount: number
  behindCount: number
  commit: GitCommit
  isBaseVersion: boolean
}

export interface GitStatus {
  id: number
  state: string
  description?: string
  context?: { genre?: string; name: string }
  targetUrl?: string
  creationDate?: string
}

export interface GitAnnotatedTag {
  objectId: string
  name: string
  taggedObject: { objectId: string; objectType: string }
  taggedBy?: GitPerson
  message?: string
  url: string
}

export interface PrReviewer extends IdentityRef {
  uniqueName?: string
  vote: number
  isRequired?: boolean
  hasDeclined?: boolean
  isFlagged?: boolean
}

export interface GitPullRequest {
  pullRequestId: number
  codeReviewId?: number
  title: string
  description?: string
  status: string
  createdBy: IdentityRef & { uniqueName?: string }
  creationDate: string
  closedDate?: string
  sourceRefName: string
  targetRefName: string
  mergeStatus?: string
  isDraft: boolean
  reviewers: PrReviewer[]
  repository: { id: string; name: string; project: { id: string; name: string } }
  url: string
  lastMergeSourceCommit?: { commitId: string }
  lastMergeTargetCommit?: { commitId: string }
  lastMergeCommit?: { commitId: string }
  completionOptions?: {
    mergeStrategy?: string
    deleteSourceBranch?: boolean
    transitionWorkItems?: boolean
    mergeCommitMessage?: string
  }
  autoCompleteSetBy?: IdentityRef
  labels?: { id: string; name: string; active: boolean }[]
  supportsIterations?: boolean
}

export interface PrComment {
  id: number
  parentCommentId: number
  author: IdentityRef
  content?: string
  publishedDate: string
  lastUpdatedDate?: string
  commentType?: string | number
  isDeleted?: boolean
  usersLiked?: IdentityRef[]
}

export interface PrThread {
  id: number
  comments: PrComment[]
  status?: string | number
  threadContext?: {
    filePath: string
    rightFileStart?: { line: number; offset: number }
    rightFileEnd?: { line: number; offset: number }
    leftFileStart?: { line: number; offset: number }
    leftFileEnd?: { line: number; offset: number }
  } | null
  properties?: Record<string, { $value: unknown }>
  /** Identidades referenciadas pelo thread (id → nome), quando a API as devolve. */
  identities?: Record<string, { displayName?: string }>
  isDeleted?: boolean
  publishedDate?: string
  lastUpdatedDate?: string
  pullRequestThreadContext?: {
    iterationContext?: { firstComparingIteration: number; secondComparingIteration: number }
  } | null
}

export interface PrIteration {
  id: number
  description?: string
  author: IdentityRef
  createdDate: string
  updatedDate: string
  sourceRefCommit?: { commitId: string }
  targetRefCommit?: { commitId: string }
  commonRefCommit?: { commitId: string }
  reason?: string
  hasMoreCommits?: boolean
}

export interface PrPolicyEvaluation {
  evaluationId: string
  status: string
  startedDate?: string
  completedDate?: string
  configuration: {
    id: number
    isBlocking: boolean
    isEnabled: boolean
    type: { displayName: string }
    settings?: { displayName?: string }
  }
  context?: { buildId?: number; isExpired?: boolean; buildNumber?: string }
}

export interface PrWorkItemRef {
  id: string
  url: string
}

export interface WorkItemMini {
  id: number
  fields: Record<string, unknown>
}

// ---------------------------------------------------------------- Helpers de referência

export const refName = (short: string, kind: 'branch' | 'tag' = 'branch') => `refs/${kind === 'tag' ? 'tags' : 'heads'}/${short}`
export const shortRef = (name: string) => name.replace(/^refs\/(heads|tags)\//, '')
export const shortHash = (h?: string | null) => (h ? h.slice(0, 8) : '')
export const firstLine = (m?: string | null) => (m ?? '').split('\n')[0]

export type VersionType = 'branch' | 'tag' | 'commit'
export interface Version {
  type: VersionType
  name: string
}

/** Versão usada na URL (?v=branch:main). */
export const versionToStr = (v: Version) => `${v.type}:${v.name}`
export function parseVersion(s: string | null | undefined, fallback: Version): Version {
  if (!s) return fallback
  const i = s.indexOf(':')
  if (i < 0) return fallback
  const type = s.slice(0, i)
  if (type !== 'branch' && type !== 'tag' && type !== 'commit') return fallback
  return { type, name: s.slice(i + 1) }
}

/** Parâmetros de versão para as chamadas de itens/commits. */
export const versionQuery = (v: Version | null | undefined, prefix = 'versionDescriptor'): Record<string, string> =>
  v ? { [`${prefix}.version`]: v.name, [`${prefix}.versionType`]: v.type } : {}

/** Converte um objectId de commit em Version. */
export const commitVersion = (commitId: string): Version => ({ type: 'commit', name: commitId })

export const repoPath = (project: string, repo: string) => `${seg(project)}/_apis/git/repositories/${seg(repo)}`

// ---------------------------------------------------------------- Hooks de leitura

export const repoKey = (org: string, project: string, ...rest: unknown[]) => ['repos', org, project, ...rest]

export function useRepos(org: string, project: string) {
  return useQuery({
    queryKey: repoKey(org, project, 'repos'),
    enabled: !!org && !!project,
    queryFn: () => adoList<GitRepo>({ org, path: `${seg(project)}/_apis/git/repositories` })
  })
}

/** Lista genérica de um endpoint de repositório (value[]). */
export function useAdoList<T>(org: string, project: string, key: unknown[], req: Omit<AdoRequestInit, 'org'>, enabled = true) {
  return useQuery({
    queryKey: repoKey(org, project, ...key),
    enabled: enabled && !!org && !!project,
    queryFn: () => adoList<T>({ org, ...req })
  })
}

/** Objeto genérico de um endpoint de repositório. */
export function useAdoObj<T>(org: string, project: string, key: unknown[], req: Omit<AdoRequestInit, 'org'>, enabled = true) {
  return useQuery({
    queryKey: repoKey(org, project, ...key),
    enabled: enabled && !!org && !!project,
    queryFn: () => ado<T>({ org, ...req })
  })
}

// ---------------------------------------------------------------- Mutações

/** Qualquer escrita invalida todas as queries de repos do projeto. */
export function useRepoMutation<V, R = unknown>(org: string, project: string, fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repos', org, project] })
  })
}

export interface PushChange {
  changeType: 'add' | 'edit' | 'delete'
  path: string
  /** Conteúdo em texto (rawtext) ou base64 quando base64 = true. */
  content?: string
  base64?: boolean
}

/** Cria um commit em uma branch existente via POST pushes. oldObjectId = head atual da branch. */
export function commitChanges(
  org: string,
  project: string,
  repo: string,
  opts: { branch: string; oldObjectId: string; message: string; changes: PushChange[] }
) {
  return ado<GitPush>({
    org,
    method: 'POST',
    path: `${repoPath(project, repo)}/pushes`,
    body: {
      refUpdates: [{ name: refName(opts.branch), oldObjectId: opts.oldObjectId }],
      commits: [
        {
          comment: opts.message,
          changes: opts.changes.map((c) =>
            c.changeType === 'delete'
              ? { changeType: 'delete', item: { path: c.path } }
              : {
                  changeType: c.changeType,
                  item: { path: c.path },
                  newContent: { content: c.content ?? '', contentType: c.base64 ? 'base64encoded' : 'rawtext' }
                }
          )
        }
      ]
    }
  })
}

/** Lê o objectId atual de uma branch (ou null se não existir). */
export async function branchHead(org: string, project: string, repo: string, branch: string): Promise<string | null> {
  const refs = await adoList<GitRef>({ org, path: `${repoPath(project, repo)}/refs`, query: { filter: `heads/${branch}` } })
  return refs.find((r) => r.name === refName(branch))?.objectId ?? null
}

/** Atualiza refs (criar, excluir, travar). Cada item segue o contrato de GitRefUpdate. */
export function updateRefs(
  org: string,
  project: string,
  repo: string,
  updates: { name: string; oldObjectId: string; newObjectId: string; isLocked?: boolean }[]
) {
  return ado({ org, method: 'POST', path: `${repoPath(project, repo)}/refs`, body: updates })
}

/** Trava ou destrava uma branch (Update Ref: PATCH refs?filter=heads/<branch>). */
export function setBranchLock(org: string, project: string, repo: string, branch: string, isLocked: boolean) {
  return ado({ org, method: 'PATCH', path: `${repoPath(project, repo)}/refs`, query: { filter: `heads/${branch}` }, body: { isLocked } })
}

/** Texto do próximo commit anotado de tag. */
export const tagUrl = (org: string, project: string, repo: string) => `${repoPath(project, repo)}/annotatedtags`

export function useInvalidateRepos(org: string, project: string) {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['repos', org, project] })
}
