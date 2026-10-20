// Hooks de leitura (TanStack Query) da feature Pipelines. Mutações ficam nas telas que as usam.
import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query'
import { ado, adoList, adoListAll, adoRaw, seg, type ListResponse } from '@/lib/api'
import { isRunning, parseYamlMeta } from './lib'
import type {
  Build,
  BuildArtifact,
  BuildChange,
  BuildDefinition,
  EnvDeploymentRecord,
  Environment,
  GitRef,
  PipelineApproval,
  Release,
  ReleaseApproval,
  ReleaseDefinition,
  SecureFile,
  TestRun,
  Timeline,
  VariableGroup
} from './types'

const POLL_MS = 3000

// ---------------------------------------------------------------- Definições (pipelines)

/** Todas as definições do projeto com o último build de cada uma (lista "Pipelines"). */
export function useDefinitions(org: string, project: string) {
  return useQuery({
    queryKey: [org, project, 'pipelines', 'definitions'],
    enabled: !!org && !!project,
    queryFn: () =>
      adoList<BuildDefinition>({
        org,
        path: `${seg(project)}/_apis/build/definitions`,
        query: { includeLatestBuilds: true, queryOrder: 'lastModifiedDescending', $top: 500 }
      })
  })
}

/** Uma definição com repositório, process (YAML ou clássico) e variáveis. */
export function useDefinition(org: string, project: string, id: number | undefined) {
  return useQuery({
    queryKey: [org, project, 'pipelines', 'definition', id],
    enabled: !!org && !!project && !!id,
    queryFn: () => ado<BuildDefinition>({ org, path: `${seg(project)}/_apis/build/definitions/${id}` })
  })
}

// ---------------------------------------------------------------- Execuções (builds)

export interface BuildFilter {
  definitionId: number
  branch?: string
  statusFilter?: string
  resultFilter?: string
  requestedFor?: string
}

/** Execuções de um pipeline, paginadas por continuationToken ("Carregar mais"). */
export function useBuildsPaged(org: string, project: string, f: BuildFilter) {
  return useInfiniteQuery({
    queryKey: [org, project, 'pipelines', 'builds', f],
    enabled: !!org && !!project && !!f.definitionId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data, continuationToken } = await adoRaw<ListResponse<Build>>({
        org,
        path: `${seg(project)}/_apis/build/builds`,
        query: {
          definitions: f.definitionId,
          $top: 50,
          continuationToken: pageParam ?? undefined,
          branchName: f.branch ? `refs/heads/${f.branch}` : undefined,
          statusFilter: f.statusFilter,
          resultFilter: f.resultFilter,
          requestedFor: f.requestedFor
        }
      })
      return { items: data?.value ?? [], next: continuationToken }
    },
    getNextPageParam: (last) => last.next ?? undefined,
    // Polling leve só enquanto há run em execução na lista.
    refetchInterval: (q) => (q.state.data?.pages.some((p) => p.items.some(isRunning)) ? 5000 : false)
  })
}

/** Execuções dos últimos 14 dias (análise e branches). Até 1000 runs. */
export function useBuildsWindow(org: string, project: string, definitionId: number | undefined) {
  return useQuery({
    queryKey: [org, project, 'pipelines', 'window', definitionId],
    enabled: !!org && !!project && !!definitionId,
    queryFn: () =>
      adoListAll<Build>(
        {
          org,
          path: `${seg(project)}/_apis/build/builds`,
          query: {
            definitions: definitionId,
            minTime: new Date(Date.now() - 14 * 864e5).toISOString(),
            $top: 200
          }
        },
        5
      ),
    refetchInterval: (q) => (q.state.data?.some(isRunning) ? 10000 : false)
  })
}

export function useBuild(org: string, project: string, id: number) {
  return useQuery({
    queryKey: [org, project, 'pipelines', 'build', id],
    enabled: !!org && !!project && !!id,
    queryFn: () => ado<Build>({ org, path: `${seg(project)}/_apis/build/builds/${id}` }),
    refetchInterval: (q) => (isRunning(q.state.data) ? POLL_MS * 2 : false)
  })
}

/** Timeline (stages → jobs → tasks). Polling enquanto o run estiver em execução. */
export function useTimeline(org: string, project: string, buildId: number, running: boolean, enabled = true) {
  return useQuery({
    queryKey: [org, project, 'pipelines', 'timeline', buildId],
    enabled: enabled && !!org && !!project && !!buildId,
    queryFn: () => ado<Timeline>({ org, path: `${seg(project)}/_apis/build/builds/${buildId}/timeline` }),
    refetchInterval: running ? POLL_MS : false
  })
}

/** Texto de um log de task. Polling leve quando o run está em execução. */
export function useBuildLog(org: string, project: string, buildId: number, logId: number | undefined, running: boolean) {
  return useQuery({
    queryKey: [org, project, 'pipelines', 'log', buildId, logId],
    enabled: !!org && !!project && !!buildId && !!logId,
    queryFn: () =>
      ado<string>({ org, path: `${seg(project)}/_apis/build/builds/${buildId}/logs/${logId}`, responseType: 'text' }),
    refetchInterval: running ? POLL_MS : false
  })
}

export function useBuildArtifacts(org: string, project: string, buildId: number) {
  return useQuery({
    queryKey: [org, project, 'pipelines', 'artifacts', buildId],
    enabled: !!org && !!project && !!buildId,
    queryFn: () => adoList<BuildArtifact>({ org, path: `${seg(project)}/_apis/build/builds/${buildId}/artifacts` })
  })
}

export function useBuildWorkItems(org: string, project: string, buildId: number) {
  return useQuery({
    queryKey: [org, project, 'pipelines', 'workitems', buildId],
    enabled: !!org && !!project && !!buildId,
    queryFn: () => adoList<{ id: number; url: string }>({ org, path: `${seg(project)}/_apis/build/builds/${buildId}/workitems` })
  })
}

/** Títulos e estados dos work items associados (lote de até 200 ids). */
export function useWorkItemTitles(org: string, project: string, ids: number[]) {
  const key = ids.join(',')
  return useQuery({
    queryKey: [org, project, 'pipelines', 'wititles', key],
    enabled: !!org && !!project && ids.length > 0,
    queryFn: () =>
      adoList<{ id: number; fields: Record<string, string> }>({
        org,
        path: `${seg(project)}/_apis/wit/workitems`,
        query: { ids: ids.slice(0, 200).join(','), fields: 'System.Title,System.State,System.WorkItemType' }
      })
  })
}

export function useBuildChanges(org: string, project: string, buildId: number) {
  return useQuery({
    queryKey: [org, project, 'pipelines', 'changes', buildId],
    enabled: !!org && !!project && !!buildId,
    queryFn: () => adoList<BuildChange>({ org, path: `${seg(project)}/_apis/build/builds/${buildId}/changes`, query: { $top: 100 } })
  })
}

export function useBuildTests(org: string, project: string, buildId: number) {
  return useQuery({
    queryKey: [org, project, 'pipelines', 'tests', buildId],
    enabled: !!org && !!project && !!buildId,
    queryFn: () =>
      adoList<TestRun>({
        org,
        path: `${seg(project)}/_apis/test/runs`,
        query: { buildUri: `vstfs:///Build/Build/${buildId}`, $top: 50 }
      })
  })
}

/** Aprovações pendentes de pipeline no projeto (filtradas por run na tela). */
export function usePipelineApprovals(org: string, project: string) {
  return useQuery({
    queryKey: [org, project, 'pipelines', 'approvals'],
    enabled: !!org && !!project,
    queryFn: () =>
      adoList<PipelineApproval>({
        org,
        path: `${seg(project)}/_apis/pipelines/approvals`,
        query: { state: 'pending', $expand: 'steps' },
        apiVersion: '7.1-preview.1'
      }),
    refetchInterval: 15000
  })
}

// ---------------------------------------------------------------- Repositório (branches, arquivos)

export function useRepoRefs(org: string, project: string, repoId: string | undefined, kind: 'heads' | 'tags') {
  return useQuery({
    queryKey: [org, project, 'pipelines', 'refs', repoId, kind],
    enabled: !!org && !!project && !!repoId,
    queryFn: () =>
      adoList<GitRef>({ org, path: `${seg(project)}/_apis/git/repositories/${repoId}/refs`, query: { filter: `${kind}/`, $top: 1000 } })
  })
}

/** Conteúdo de um arquivo do repositório em uma branch. 404 vira erro com mensagem clara. */
export function useRepoFile(org: string, project: string, repoId: string | undefined, branch: string | undefined, path: string | undefined) {
  return useQuery({
    queryKey: [org, project, 'pipelines', 'file', repoId, branch, path],
    enabled: !!org && !!project && !!repoId && !!branch && !!path,
    retry: false,
    queryFn: async () => {
      const data = await ado<{ content?: string }>({
        org,
        path: `${seg(project)}/_apis/git/repositories/${repoId}/items`,
        query: {
          path: `/${path}`,
          includeContent: true,
          'versionDescriptor.version': branch,
          'versionDescriptor.versionType': 'branch'
        }
      })
      return data?.content ?? ''
    }
  })
}

/** Parâmetros e stages do YAML (leitura leve, para o modal de execução). */
export function useYamlMeta(org: string, project: string, repoId: string | undefined, branch: string | undefined, yamlFile: string | undefined) {
  const file = useRepoFile(org, project, repoId, branch, yamlFile)
  return { ...file, meta: file.data !== undefined ? parseYamlMeta(file.data) : undefined }
}

// ---------------------------------------------------------------- Environments

export function useEnvironments(org: string, project: string) {
  return useQuery({
    queryKey: [org, project, 'pipelines', 'environments'],
    enabled: !!org && !!project,
    queryFn: () =>
      adoList<Environment>({ org, path: `${seg(project)}/_apis/distributedtask/environments`, apiVersion: '7.1-preview.1' })
  })
}

export function useEnvironment(org: string, project: string, id: number) {
  return useQuery({
    queryKey: [org, project, 'pipelines', 'environment', id],
    enabled: !!org && !!project && !!id,
    queryFn: () =>
      ado<Environment>({ org, path: `${seg(project)}/_apis/distributedtask/environments/${id}`, apiVersion: '7.1-preview.1' })
  })
}

export function useEnvRecords(org: string, project: string, envId: number, top: number, enabled = true) {
  return useQuery({
    queryKey: [org, project, 'pipelines', 'envrecords', envId, top],
    enabled: enabled && !!org && !!project && !!envId,
    queryFn: () =>
      adoList<EnvDeploymentRecord>({
        org,
        path: `${seg(project)}/_apis/distributedtask/environments/${envId}/environmentdeploymentrecords`,
        query: { top },
        apiVersion: '7.1-preview.1'
      })
  })
}

/** Último registro de implantação de cada environment (faixa de zona da lista). */
export function useEnvLastRecords(org: string, project: string, envIds: number[]) {
  return useQueries({
    queries: envIds.map((id) => ({
      queryKey: [org, project, 'pipelines', 'envrecords', id, 1],
      queryFn: () =>
        adoList<EnvDeploymentRecord>({
          org,
          path: `${seg(project)}/_apis/distributedtask/environments/${id}/environmentdeploymentrecords`,
          query: { top: 1 },
          apiVersion: '7.1-preview.1'
        }).then((r) => r[0] ?? null)
    }))
  })
}

// ---------------------------------------------------------------- Releases (vsrm)

export function useReleaseDefinitions(org: string, project: string) {
  return useQuery({
    queryKey: [org, project, 'releases', 'definitions'],
    enabled: !!org && !!project,
    queryFn: () => adoList<ReleaseDefinition>({ org, host: 'vsrm', path: `${seg(project)}/_apis/release/definitions`, query: { $top: 500 } })
  })
}

export function useReleaseDefinition(org: string, project: string, id: number | undefined) {
  return useQuery({
    queryKey: [org, project, 'releases', 'definition', id],
    enabled: !!org && !!project && !!id,
    queryFn: () => ado<ReleaseDefinition>({ org, host: 'vsrm', path: `${seg(project)}/_apis/release/definitions/${id}` })
  })
}

export function useReleases(org: string, project: string, definitionId: number | undefined) {
  return useQuery({
    queryKey: [org, project, 'releases', 'releases', definitionId],
    enabled: !!org && !!project && !!definitionId,
    queryFn: () =>
      adoList<Release>({
        org,
        host: 'vsrm',
        path: `${seg(project)}/_apis/release/releases`,
        query: { definitionId, $top: 50, $expand: 'environments' }
      }),
    refetchInterval: 15000
  })
}

export function useRelease(org: string, project: string, id: number) {
  return useQuery({
    queryKey: [org, project, 'releases', 'release', id],
    enabled: !!org && !!project && !!id,
    queryFn: () => ado<Release>({ org, host: 'vsrm', path: `${seg(project)}/_apis/release/releases/${id}`, query: { $expand: 'environments' } }),
    refetchInterval: 10000
  })
}

export function useReleaseApprovals(org: string, project: string, releaseId: number) {
  return useQuery({
    queryKey: [org, project, 'releases', 'approvals', releaseId],
    enabled: !!org && !!project && !!releaseId,
    queryFn: () =>
      adoList<ReleaseApproval>({
        org,
        host: 'vsrm',
        path: `${seg(project)}/_apis/release/approvals`,
        query: { releaseIdsFilter: releaseId, statusFilter: 'pending' }
      })
  })
}

// ---------------------------------------------------------------- Library

export function useVariableGroups(org: string, project: string) {
  return useQuery({
    queryKey: [org, project, 'library', 'groups'],
    enabled: !!org && !!project,
    queryFn: () => adoList<VariableGroup>({ org, path: `${seg(project)}/_apis/distributedtask/variablegroups`, apiVersion: '7.1-preview.2' })
  })
}

export function useVariableGroup(org: string, project: string, id: number | undefined) {
  return useQuery({
    queryKey: [org, project, 'library', 'group', id],
    enabled: !!org && !!project && !!id,
    queryFn: () =>
      ado<VariableGroup>({ org, path: `${seg(project)}/_apis/distributedtask/variablegroups/${id}`, apiVersion: '7.1-preview.2' })
  })
}

export function useSecureFiles(org: string, project: string) {
  return useQuery({
    queryKey: [org, project, 'library', 'securefiles'],
    enabled: !!org && !!project,
    queryFn: () => adoList<SecureFile>({ org, path: `${seg(project)}/_apis/distributedtask/securefiles`, apiVersion: '7.1-preview.1' })
  })
}


