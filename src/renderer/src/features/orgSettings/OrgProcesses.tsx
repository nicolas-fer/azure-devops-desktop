import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adoList } from '@/lib/api'
import { useScope } from '@/lib/context'
import { Badge, Empty, ErrorBox, Loading, PageHeader, Section, StateLabel, Table } from '@/components/ui'

interface WorkProcess {
  typeId: string
  name: string
  description?: string
  parentProcessTypeId?: string
  isEnabled: boolean
  isDefault: boolean
  customizationType?: string
}

const NO_PARENT = '00000000-0000-0000-0000-000000000000'

const customLabel = (t?: string) => (t === 'system' ? 'Sistema' : t === 'inherited' ? 'Herdado' : t === 'custom' ? 'Personalizado' : t ?? '—')

/** Processos de trabalho da organização, com herança (somente leitura). */
export function OrgProcesses() {
  const { org } = useScope()
  const procs = useQuery({
    queryKey: ['os', org, 'processes'],
    enabled: !!org,
    queryFn: () => adoList<WorkProcess>({ org, path: '_apis/work/processes' })
  })
  const names = useMemo(() => new Map((procs.data ?? []).map((p) => [p.typeId, p.name])), [procs.data])

  return (
    <>
      <PageHeader title="Processos" subtitle={procs.data ? `${procs.data.length} processos` : undefined} />
      <div className="flex flex-col gap-4 p-6">
        {procs.isLoading && <Loading />}
        {procs.isError && <ErrorBox error={procs.error} onRetry={() => procs.refetch()} />}
        {procs.data &&
          (procs.data.length === 0 ? (
            <Empty title="Nenhum processo encontrado" />
          ) : (
            <Section title="Processos de trabalho">
              <Table
                persistKey="orgSettings.processes"
                rows={procs.data}
                rowKey={(p) => p.typeId}
                zone={(p) => (p.isEnabled ? 'done' : 'idle')}
                columns={[
                  { key: 'name', header: 'Processo', render: (p) => <span className="font-semibold">{p.name}</span>, sortValue: (p) => p.name },
                  {
                    key: 'parent',
                    header: 'Herdado de',
                    render: (p) =>
                      p.parentProcessTypeId && p.parentProcessTypeId !== NO_PARENT ? (
                        <span>{names.get(p.parentProcessTypeId) ?? p.parentProcessTypeId.slice(0, 8)}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )
                  },
                  { key: 'type', header: 'Tipo', render: (p) => <Badge>{customLabel(p.customizationType)}</Badge> },
                  { key: 'def', header: 'Padrão', render: (p) => (p.isDefault ? <Badge>Padrão</Badge> : null) },
                  {
                    key: 'state',
                    header: 'Situação',
                    render: (p) => (p.isEnabled ? <StateLabel zone="done">Habilitado</StateLabel> : <StateLabel zone="idle">Desabilitado</StateLabel>)
                  }
                ]}
              />
            </Section>
          ))}
        <p className="text-[12px] text-muted">Somente leitura. Criar ou editar processos é feito no portal do Azure DevOps.</p>
      </div>
    </>
  )
}
