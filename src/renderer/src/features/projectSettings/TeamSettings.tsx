import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Star, Trash2 } from 'lucide-react'
import { ado, seg, type Team } from '@/lib/api'
import { useTeams } from '@/lib/context'
import { Badge, Button, Empty, ErrorBox, Loading, Section, Select, Table, IconButton, Code } from '@/components/ui'
import { errMsg, useProjectDetail } from './shared'
import { areaValue, dateInput, flattenNodes, useClassificationTree } from './classification'

interface TeamIteration {
  id: string
  name: string
  path: string
  attributes?: { startDate?: string; finishDate?: string; timeFrame?: string }
}

interface TeamFieldValues {
  defaultValue: string
  values: { value: string; includeChildren: boolean }[]
}

const timeFrameLabel = (t?: string) => (t === 'current' ? 'Atual' : t === 'future' ? 'Futura' : t === 'past' ? 'Passada' : '—')

/** Configurações do time: iterações selecionadas e áreas do time (teamsettings). */
export function TeamSettings({ org, project }: { org: string; project: string }) {
  const teams = useTeams(org, project)
  const detail = useProjectDetail(org, project)
  const [teamId, setTeamId] = useState<string>('')

  // Time padrão quando nada foi escolhido
  useEffect(() => {
    if (!teamId && teams.data?.length) {
      const def = teams.data.find((t) => t.id === detail.data?.defaultTeam?.id) ?? teams.data[0]
      setTeamId(def.id)
    }
  }, [teams.data, detail.data, teamId])

  if (teams.isLoading) return <Loading />
  if (teams.isError) return <div className="p-6"><ErrorBox error={teams.error} onRetry={() => teams.refetch()} /></div>
  if (!teams.data?.length) return <Empty title="Nenhum time neste projeto" />
  const team = teams.data.find((t) => t.id === teamId) ?? teams.data[0]

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <span className="colhead">Time</span>
        <Select value={team.id} onChange={(e) => setTeamId(e.target.value)} className="w-64">
          {teams.data.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
      <TeamIterations org={org} project={project} team={team} />
      <TeamAreas org={org} project={project} team={team} />
    </div>
  )
}

function useTeamIterations(org: string, project: string, team: Team) {
  return useQuery({
    queryKey: ['ps', org, project, 'team-iterations', team.id],
    queryFn: () =>
      ado<{ value: TeamIteration[] }>({ org, path: `${seg(project)}/${seg(team.name)}/_apis/work/teamsettings/iterations` }).then((d) => d.value ?? [])
  })
}

function TeamIterations({ org, project, team }: { org: string; project: string; team: Team }) {
  const qc = useQueryClient()
  const selected = useTeamIterations(org, project, team)
  const tree = useClassificationTree(org, project, 'Iterations')
  const [pick, setPick] = useState('')
  const [error, setError] = useState<string | null>(null)
  const base = `${seg(project)}/${seg(team.name)}/_apis/work/teamsettings/iterations`

  const available = useMemo(() => {
    if (!tree.data) return []
    const taken = new Set((selected.data ?? []).map((i) => i.id))
    return flattenNodes(tree.data)
      .filter((r) => !r.isRoot && !taken.has(r.node.identifier))
      .map((r) => ({ id: r.node.identifier, label: '\\' + [project, 'Iteração', ...r.chain].join('\\') }))
  }, [tree.data, selected.data, project])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['ps', org, project, 'team-iterations'] })

  const add = useMutation({
    mutationFn: (id: string) => ado({ org, method: 'POST', path: base, body: { id } }),
    onSuccess: () => {
      setPick('')
      setError(null)
      invalidate()
    },
    onError: (e) => setError(errMsg(e))
  })
  const remove = useMutation({
    mutationFn: (id: string) => ado({ org, method: 'DELETE', path: `${base}/${seg(id)}` }),
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (e) => setError(errMsg(e))
  })

  return (
    <Section title="Iterações do time">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Select value={pick} onChange={(e) => setPick(e.target.value)} className="min-w-72 flex-1" disabled={tree.isLoading || add.isPending}>
          <option value="">{tree.isLoading ? 'Carregando iterações…' : 'Adicionar iteração do projeto…'}</option>
          {available.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
        <Button icon={<Plus className="size-3.5" />} disabled={!pick} loading={add.isPending} onClick={() => add.mutate(pick)}>
          Adicionar
        </Button>
        {tree.isError && <ErrorBox error={tree.error} className="mx-0 my-0 w-full" />}
        {error && <ErrorBox error={error} className="mx-0 my-0 w-full" />}
      </div>
      {selected.isLoading && <Loading label="Carregando iterações do time…" />}
      {selected.isError && <ErrorBox error={selected.error} onRetry={() => selected.refetch()} />}
      {selected.data &&
        (selected.data.length === 0 ? (
          <div className="p-3 text-sm text-muted">Nenhuma iteração selecionada para este time.</div>
        ) : (
          <Table
            persistKey="projectSettings.teamSettings.iterations"
            rows={selected.data}
            rowKey={(i) => i.id}
            columns={[
              { key: 'name', header: 'Iteração', render: (i) => <span className="font-semibold">{i.name}</span>, sortValue: (i) => i.name },
              { key: 'path', header: 'Caminho', render: (i) => <Code>{i.path}</Code> },
              {
                key: 'dates',
                header: 'Período',
                render: (i) => (
                  <span className="narrow text-muted">
                    {dateInput(i.attributes?.startDate) || '—'} → {dateInput(i.attributes?.finishDate) || '—'}
                  </span>
                )
              },
              { key: 'tf', header: 'Situação', render: (i) => <Badge>{timeFrameLabel(i.attributes?.timeFrame)}</Badge> },
              {
                key: 'act',
                header: '',
                align: 'right',
                width: 48,
                render: (i) => (
                  <IconButton title={`Remover ${i.name} do time`} onClick={() => remove.mutate(i.id)} disabled={remove.isPending}>
                    <Trash2 className="size-3.5" />
                  </IconButton>
                )
              }
            ]}
          />
        ))}
    </Section>
  )
}

function TeamAreas({ org, project, team }: { org: string; project: string; team: Team }) {
  const qc = useQueryClient()
  const base = `${seg(project)}/${seg(team.name)}/_apis/work/teamsettings/teamfieldvalues`
  const fv = useQuery({
    queryKey: ['ps', org, project, 'team-areas', team.id],
    queryFn: () => ado<TeamFieldValues>({ org, path: base })
  })
  const tree = useClassificationTree(org, project, 'Areas')
  const [pick, setPick] = useState('')
  const [error, setError] = useState<string | null>(null)

  const available = useMemo(() => {
    if (!tree.data || !fv.data) return []
    const taken = new Set(fv.data.values.map((v) => v.value))
    return flattenNodes(tree.data)
      .map((r) => ({ value: areaValue(project, r.chain), label: areaValue(project, r.chain) }))
      .filter((a) => !taken.has(a.value))
  }, [tree.data, fv.data, project])

  const save = useMutation({
    mutationFn: (next: TeamFieldValues) =>
      ado({ org, method: 'PATCH', path: base, contentType: 'application/json', body: next }),
    onSuccess: () => {
      setPick('')
      setError(null)
      qc.invalidateQueries({ queryKey: ['ps', org, project, 'team-areas'] })
    },
    onError: (e) => setError(errMsg(e))
  })

  if (fv.isLoading) return <Loading label="Carregando áreas do time…" />
  if (fv.isError) return <ErrorBox error={fv.error} onRetry={() => fv.refetch()} />
  if (!fv.data) return null
  const data = fv.data

  return (
    <Section title="Áreas do time">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Select value={pick} onChange={(e) => setPick(e.target.value)} className="min-w-72 flex-1" disabled={tree.isLoading || save.isPending}>
          <option value="">{tree.isLoading ? 'Carregando áreas…' : 'Adicionar área do projeto…'}</option>
          {available.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </Select>
        <Button
          icon={<Plus className="size-3.5" />}
          disabled={!pick}
          loading={save.isPending}
          onClick={() => save.mutate({ defaultValue: data.defaultValue, values: [...data.values, { value: pick, includeChildren: false }] })}
        >
          Adicionar
        </Button>
        {tree.isError && <ErrorBox error={tree.error} className="mx-0 my-0 w-full" />}
        {error && <ErrorBox error={error} className="mx-0 my-0 w-full" />}
      </div>
      {data.values.length === 0 ? (
        <div className="p-3 text-sm text-muted">Nenhuma área selecionada para este time.</div>
      ) : (
        <Table
          persistKey="projectSettings.teamSettings.areas"
          rows={data.values}
          rowKey={(v) => v.value}
          columns={[
            {
              key: 'value',
              header: 'Área',
              render: (v) => (
                <span className="flex items-center gap-2">
                  <Code>{v.value}</Code>
                  {v.value === data.defaultValue && <Badge>Padrão</Badge>}
                </span>
              )
            },
            { key: 'children', header: 'Inclui sub-áreas', render: (v) => <span className="text-muted">{v.includeChildren ? 'Sim' : 'Não'}</span> },
            {
              key: 'act',
              header: '',
              align: 'right',
              width: 88,
              render: (v) => (
                <span className="flex justify-end gap-1">
                  <IconButton
                    title="Definir como área padrão"
                    disabled={v.value === data.defaultValue || save.isPending}
                    onClick={() => save.mutate({ defaultValue: v.value, values: data.values })}
                  >
                    <Star className="size-3.5" />
                  </IconButton>
                  <IconButton
                    title="Remover do time"
                    disabled={data.values.length === 1 || save.isPending}
                    onClick={() => {
                      const values = data.values.filter((x) => x.value !== v.value)
                      const defaultValue = v.value === data.defaultValue ? values[0].value : data.defaultValue
                      save.mutate({ defaultValue, values })
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </span>
              )
            }
          ]}
        />
      )}
    </Section>
  )
}
