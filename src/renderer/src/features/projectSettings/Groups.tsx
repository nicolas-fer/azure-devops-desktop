import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ado, seg } from '@/lib/api'
import { useScope } from '@/lib/context'
import { Empty, ErrorBox, Loading, PageHeader, Section, Table, Badge } from '@/components/ui'
import { useProjectDetail } from './shared'

interface GraphGroup {
  displayName: string
  principalName?: string
  description?: string
  descriptor: string
  origin?: string
}

interface GraphMembership {
  memberDescriptor: string
  containerDescriptor: string
}

interface GraphSubject {
  displayName: string
  principalName?: string
  subjectKind?: string
  mailAddress?: string | null
}

const GRAPH = { host: 'vssps' as const, apiVersion: '7.1-preview.1' }

/** Descriptor de escopo do projeto (Graph). Necessário para listar só os grupos do projeto. */
function useProjectScopeDescriptor(org: string, projectId?: string) {
  return useQuery({
    queryKey: ['ps', org, 'graph-descriptor', projectId],
    enabled: !!org && !!projectId,
    queryFn: async () => {
      const d = await ado<{ value: string }>({ ...GRAPH, org, path: `_apis/graph/descriptors/${seg(projectId!)}` })
      return d.value
    }
  })
}

function useProjectGroups(org: string, scope?: string) {
  return useQuery({
    queryKey: ['ps', org, 'graph-groups', scope],
    enabled: !!org && !!scope,
    queryFn: async () => {
      const d = await ado<{ value: GraphGroup[] }>({ ...GRAPH, org, path: '_apis/graph/groups', query: { scopeDescriptor: scope } })
      return d.value ?? []
    }
  })
}

function useGroupMembers(org: string, group?: GraphGroup) {
  return useQuery({
    queryKey: ['ps', org, 'graph-members', group?.descriptor],
    enabled: !!org && !!group,
    queryFn: async () => {
      const m = await ado<{ value: GraphMembership[] }>({
        ...GRAPH,
        org,
        path: `_apis/graph/memberships/${seg(group!.descriptor)}`,
        query: { direction: 'down' }
      })
      const memberships = m.value ?? []
      if (memberships.length === 0) return [] as GraphSubject[]
      const lookup = await ado<{ value: Record<string, GraphSubject | null> }>({
        ...GRAPH,
        org,
        method: 'POST',
        path: '_apis/graph/subjectlookup',
        body: { lookupKeys: memberships.map((x) => ({ descriptor: x.memberDescriptor })) }
      })
      return memberships.map((x) => lookup.value?.[x.memberDescriptor]).filter((s): s is GraphSubject => !!s)
    }
  })
}

/** Grupos do projeto (somente leitura): a administração de permissões fica no portal. */
export function Groups() {
  const { org, project } = useScope()
  const projectId = useProjectDetail(org, project).data?.id
  const descriptor = useProjectScopeDescriptor(org, projectId)
  const groups = useProjectGroups(org, descriptor.data)
  const [selected, setSelected] = useState<GraphGroup | null>(null)
  const members = useGroupMembers(org, selected ?? undefined)

  return (
    <>
      <PageHeader
        title="Permissões e grupos"
        subtitle={groups.data ? `${groups.data.length} grupos` : undefined}
        breadcrumb={<span>Configurações do projeto · {project}</span>}
      />
      <div className="grid gap-4 p-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          {(descriptor.isLoading || groups.isLoading) && <Loading label="Carregando grupos…" />}
          {descriptor.isError && <ErrorBox error={descriptor.error} onRetry={() => descriptor.refetch()} />}
          {groups.isError && <ErrorBox error={groups.error} onRetry={() => groups.refetch()} />}
          {groups.data &&
            (groups.data.length === 0 ? (
              <Empty title="Nenhum grupo encontrado para este projeto" />
            ) : (
              <Section title="Grupos do projeto">
                <Table
                  persistKey="projectSettings.groups"
                  rows={groups.data}
                  rowKey={(g) => g.descriptor}
                  onRowClick={setSelected}
                  selectedKey={selected?.descriptor}
                  columns={[
                    { key: 'name', header: 'Grupo', render: (g) => <span className="font-semibold">{g.displayName}</span>, sortValue: (g) => g.displayName },
                    { key: 'desc', header: 'Descrição', render: (g) => <span className="block max-w-[360px] truncate text-muted">{g.description || '—'}</span> },
                    { key: 'origin', header: 'Origem', render: (g) => <Badge>{g.origin === 'vsts' ? 'Azure DevOps' : g.origin ?? '—'}</Badge> }
                  ]}
                />
              </Section>
            ))}
        </div>

        <Section title={selected ? `Membros · ${selected.displayName}` : 'Membros'} className="self-start">
          {!selected && <div className="p-3 text-sm text-muted">Selecione um grupo para ver os membros.</div>}
          {selected && members.isLoading && <Loading label="Carregando membros…" />}
          {selected && members.isError && <ErrorBox error={members.error} onRetry={() => members.refetch()} />}
          {selected && members.data &&
            (members.data.length === 0 ? (
              <div className="p-3 text-sm text-muted">Este grupo não tem membros diretos.</div>
            ) : (
              <ul className="divide-y divide-border">
                {members.data.map((s) => (
                  <li key={s.principalName ?? s.displayName} className="flex flex-col px-3 py-2">
                    <span className="font-medium">{s.displayName}</span>
                    <span className="text-[12px] text-muted">{s.principalName ?? s.mailAddress ?? ''}</span>
                  </li>
                ))}
              </ul>
            ))}
        </Section>
      </div>
    </>
  )
}
