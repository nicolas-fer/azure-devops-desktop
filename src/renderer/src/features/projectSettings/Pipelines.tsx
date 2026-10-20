import { useQuery } from '@tanstack/react-query'
import { ado, seg } from '@/lib/api'
import { useScope } from '@/lib/context'
import { Badge, ErrorBox, Loading, PageHeader, Section, StateLabel } from '@/components/ui'

interface RetentionRange {
  min: number
  max: number
  value: number
}

interface Retention {
  purgeArtifacts: RetentionRange
  purgePullRequestRuns: RetentionRange
  purgeRuns: RetentionRange
  retainRunsPerProtectedBranch: RetentionRange
}

interface GeneralSettings {
  disableClassicPipelineCreation?: boolean
  disableClassicBuildPipelineCreation?: boolean
  disableClassicReleasePipelineCreation?: boolean
  forkProtectionEnabled?: boolean
  buildsEnabledForForks?: boolean
  enforceJobAuthScope?: boolean
  enforceJobAuthScopeForReleases?: boolean
  enforceSettableVar?: boolean
  statusBadgesArePrivate?: boolean
  isCommentRequiredForPullRequest?: boolean
}

const RETENTION_LABELS: { key: keyof Retention; label: string; unit: string }[] = [
  { key: 'purgeRuns', label: 'Execuções mantidas', unit: 'dias' },
  { key: 'purgePullRequestRuns', label: 'Execuções de pull request mantidas', unit: 'dias' },
  { key: 'purgeArtifacts', label: 'Artefatos mantidos', unit: 'dias' },
  { key: 'retainRunsPerProtectedBranch', label: 'Execuções retidas por branch protegida', unit: 'execuções' }
]

const GENERAL_LABELS: { key: keyof GeneralSettings; label: string }[] = [
  { key: 'disableClassicPipelineCreation', label: 'Bloquear criação de pipelines clássicos' },
  { key: 'enforceJobAuthScope', label: 'Escopo de autorização de job restrito' },
  { key: 'enforceJobAuthScopeForReleases', label: 'Escopo de autorização de job restrito em releases' },
  { key: 'forkProtectionEnabled', label: 'Proteção contra forks' },
  { key: 'buildsEnabledForForks', label: 'Execuções habilitadas para forks' },
  { key: 'enforceSettableVar', label: 'Exigir variáveis definíveis em runtime' },
  { key: 'statusBadgesArePrivate', label: 'Badges de status privados' },
  { key: 'isCommentRequiredForPullRequest', label: 'Comentário obrigatório em pull requests' }
]

/** Retenção de execuções/artefatos e configurações gerais de pipelines (somente leitura). */
export function Pipelines() {
  const { org, project } = useScope()
  const retention = useQuery({
    queryKey: ['ps', org, project, 'retention'],
    queryFn: () => ado<Retention>({ org, path: `${seg(project)}/_apis/build/retention` })
  })
  const general = useQuery({
    queryKey: ['ps', org, project, 'general-settings'],
    queryFn: () => ado<GeneralSettings>({ org, path: `${seg(project)}/_apis/build/generalsettings` })
  })

  return (
    <>
      <PageHeader title="Pipelines" subtitle="Retenção e configurações gerais" breadcrumb={<span>Configurações do projeto · {project}</span>} />
      <div className="grid gap-4 p-6 xl:grid-cols-2">
        <Section title="Retenção">
          {retention.isLoading && <Loading />}
          {retention.isError && <ErrorBox error={retention.error} onRetry={() => retention.refetch()} />}
          {retention.data && (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 p-3 text-sm">
              {RETENTION_LABELS.map((r) => {
                const v = retention.data[r.key]
                return (
                  <div key={r.key} className="contents">
                    <dt className="text-muted">
                      {r.label}
                      <span className="text-[12px] text-muted"> · mín. {v?.min} · máx. {v?.max}</span>
                    </dt>
                    <dd className="narrow font-semibold">
                      {v?.value} {r.unit}
                    </dd>
                  </div>
                )
              })}
            </dl>
          )}
        </Section>

        <Section title="Configurações gerais">
          {general.isLoading && <Loading />}
          {general.isError && <ErrorBox error={general.error} onRetry={() => general.refetch()} />}
          {general.data && (
            <ul className="divide-y divide-border">
              {GENERAL_LABELS.map((g) => {
                const on = !!general.data[g.key]
                return (
                  <li key={g.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="flex-1">{g.label}</span>
                    {on ? <StateLabel zone="done">Ativo</StateLabel> : <Badge>Inativo</Badge>}
                  </li>
                )
              })}
            </ul>
          )}
        </Section>
      </div>
      <p className="px-6 pb-6 text-[12px] text-muted">Somente leitura. Alterações são feitas no portal do Azure DevOps.</p>
    </>
  )
}
