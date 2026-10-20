import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ado } from '@/lib/api'
import { useScope } from '@/lib/context'
import { Empty, ErrorBox, Input, Loading, PageHeader, Section, Table, Badge } from '@/components/ui'

interface OrgGroup {
  displayName: string
  principalName?: string
  description?: string
  origin?: string
  descriptor: string
}

/** Grupos da organização via Graph (somente leitura). */
export function OrgGroups() {
  const { org } = useScope()
  const groups = useQuery({
    queryKey: ['os', org, 'groups'],
    enabled: !!org,
    queryFn: async () =>
      (await ado<{ value: OrgGroup[] }>({ org, host: 'vssps', apiVersion: '7.1-preview.1', path: '_apis/graph/groups' })).value ?? []
  })
  const [text, setText] = useState('')
  const shown = useMemo(() => {
    const q = text.trim().toLowerCase()
    const all = groups.data ?? []
    const sorted = [...all].sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'))
    if (!q) return sorted
    return sorted.filter((g) => g.displayName.toLowerCase().includes(q) || (g.principalName ?? '').toLowerCase().includes(q))
  }, [groups.data, text])

  return (
    <>
      <PageHeader title="Grupos" subtitle={groups.data ? `${groups.data.length} grupos` : undefined} />
      <div className="flex flex-col gap-4 p-6">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filtrar grupos" className="w-72" aria-label="Filtrar grupos" />
        {groups.isLoading && <Loading />}
        {groups.isError && <ErrorBox error={groups.error} onRetry={() => groups.refetch()} />}
        {groups.data &&
          (shown.length === 0 ? (
            <Empty title={text ? 'Nenhum grupo com esse filtro' : 'Nenhum grupo encontrado'} />
          ) : (
            <Section title="Grupos">
              <Table
                persistKey="orgSettings.groups"
                rows={shown}
                rowKey={(g) => g.descriptor}
                columns={[
                  { key: 'name', header: 'Grupo', render: (g) => <span className="font-semibold">{g.displayName}</span>, sortValue: (g) => g.displayName },
                  { key: 'principal', header: 'Identificador', render: (g) => <span className="block max-w-[360px] truncate text-muted">{g.principalName ?? '—'}</span> },
                  { key: 'desc', header: 'Descrição', render: (g) => <span className="block max-w-[320px] truncate text-muted">{g.description || '—'}</span> },
                  { key: 'origin', header: 'Origem', render: (g) => <Badge>{g.origin === 'vsts' ? 'Azure DevOps' : g.origin ?? '—'}</Badge> }
                ]}
              />
            </Section>
          ))}
      </div>
    </>
  )
}
