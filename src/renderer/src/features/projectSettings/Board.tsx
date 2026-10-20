import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ado, seg, type Team } from '@/lib/api'
import { useScope, useTeams } from '@/lib/context'
import { Badge, Empty, ErrorBox, Loading, PageHeader, Section, Select, StateLabel } from '@/components/ui'
import { useProjectDetail } from './shared'

interface TeamSettingsDto {
  backlogIteration?: { name: string; path: string }
  defaultIteration?: { name: string; path: string } | null
  bugsBehavior?: string
  workingDays?: string[]
  backlogVisibilities?: Record<string, boolean>
}

const DAYS: Record<string, string> = {
  monday: 'Segunda',
  tuesday: 'Terça',
  wednesday: 'Quarta',
  thursday: 'Quinta',
  friday: 'Sexta',
  saturday: 'Sábado',
  sunday: 'Domingo'
}
const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

const BUGS: Record<string, string> = {
  asRequirements: 'Como requisitos (aparecem no backlog)',
  asTasks: 'Como tarefas (dentro das histórias)',
  off: 'Não tratar bugs no backlog'
}

const BACKLOG_LABELS: Record<string, string> = {
  'Microsoft.EpicCategory': 'Épicos',
  'Microsoft.FeatureCategory': 'Funcionalidades',
  'Microsoft.RequirementCategory': 'Requisitos'
}

/** Configurações de quadro do time (leitura): dias úteis, bugs e backlogs visíveis. */
export function Board() {
  const { org, project } = useScope()
  const teams = useTeams(org, project)
  const detail = useProjectDetail(org, project)
  const [teamId, setTeamId] = useState('')

  useEffect(() => {
    if (!teamId && teams.data?.length) {
      const def = teams.data.find((t) => t.id === detail.data?.defaultTeam?.id) ?? teams.data[0]
      setTeamId(def.id)
    }
  }, [teams.data, detail.data, teamId])

  const team: Team | undefined = teams.data?.find((t) => t.id === teamId) ?? teams.data?.[0]

  return (
    <>
      <PageHeader title="Quadros" subtitle="Configurações do time" breadcrumb={<span>Configurações do projeto · {project}</span>}>
        <div className="flex items-center gap-3 pb-3">
          <span className="colhead">Time</span>
          {teams.data && (
            <Select value={team?.id ?? ''} onChange={(e) => setTeamId(e.target.value)} className="w-64">
              {teams.data.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      </PageHeader>
      <div className="p-6">
        {teams.isLoading && <Loading />}
        {teams.isError && <ErrorBox error={teams.error} onRetry={() => teams.refetch()} />}
        {teams.data && teams.data.length === 0 && <Empty title="Nenhum time neste projeto" />}
        {team && <BoardSettings org={org} project={project} team={team} />}
      </div>
    </>
  )
}

function BoardSettings({ org, project, team }: { org: string; project: string; team: Team }) {
  const q = useQuery({
    queryKey: ['ps', org, project, 'team-board', team.id],
    queryFn: () => ado<TeamSettingsDto>({ org, path: `${seg(project)}/${seg(team.name)}/_apis/work/teamsettings` })
  })
  if (q.isLoading) return <Loading />
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />
  if (!q.data) return null
  const d = q.data
  const days = DAY_ORDER.filter((x) => (d.workingDays ?? []).includes(x))
  const visibilities = Object.entries(d.backlogVisibilities ?? {})

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Dias úteis">
        <div className="flex flex-wrap gap-1.5 p-3">
          {DAY_ORDER.map((day) => (
            <span
              key={day}
              className={
                days.includes(day)
                  ? 'inline-flex h-6 items-center rounded-sm border border-border bg-surface-2 px-2 text-[12px] font-semibold'
                  : 'inline-flex h-6 items-center rounded-sm border border-transparent px-2 text-[12px] text-muted line-through'
              }
            >
              {DAYS[day]}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Comportamento de bugs">
        <div className="p-3 text-sm">{BUGS[d.bugsBehavior ?? ''] ?? d.bugsBehavior ?? '—'}</div>
      </Section>

      <Section title="Backlogs visíveis">
        {visibilities.length === 0 ? (
          <div className="p-3 text-sm text-muted">Nenhuma configuração de backlog retornada.</div>
        ) : (
          <ul className="divide-y divide-border">
            {visibilities.map(([key, on]) => (
              <li key={key} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1">{BACKLOG_LABELS[key] ?? 'Personalizado'}</span>
                {key.startsWith('Custom.') && <Badge>{key.slice(0, 20)}…</Badge>}
                {on ? <StateLabel zone="done">Visível</StateLabel> : <StateLabel zone="idle">Oculto</StateLabel>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Iterações padrão">
        <dl className="grid grid-cols-[160px_1fr] gap-x-4 gap-y-2 p-3 text-sm">
          <dt className="text-muted">Backlog</dt>
          <dd>{d.backlogIteration?.name ?? '—'}</dd>
          <dt className="text-muted">Iteração padrão</dt>
          <dd>{d.defaultIteration?.name ?? 'Atual (automática)'}</dd>
        </dl>
      </Section>
      <p className="text-[12px] text-muted xl:col-span-2">Somente leitura. Alterações são feitas no portal do Azure DevOps.</p>
    </div>
  )
}
