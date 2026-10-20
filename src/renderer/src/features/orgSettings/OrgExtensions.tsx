import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adoList } from '@/lib/api'
import { useScope } from '@/lib/context'
import { Empty, ErrorBox, Input, Loading, PageHeader, Section, Table, TimeAgo, StateLabel, type Zone } from '@/components/ui'

interface InstalledExtension {
  extensionId: string
  extensionName: string
  publisherId: string
  publisherName: string
  version: string
  lastPublished?: string
  installState?: { flags?: string }
  scopes?: string[]
}

const stateInfo = (flags?: string): { label: string; zone: Zone } => {
  if (!flags || flags === 'none') return { label: 'Instalada', zone: 'done' }
  if (flags.toLowerCase().includes('disabled')) return { label: 'Desativada', zone: 'idle' }
  if (flags.toLowerCase().includes('error') || flags.toLowerCase().includes('uninstall')) return { label: 'Com erro', zone: 'fail' }
  return { label: flags, zone: 'new' }
}

/** Extensões instaladas na organização (somente leitura). */
export function OrgExtensions() {
  const { org } = useScope()
  const exts = useQuery({
    queryKey: ['os', org, 'extensions'],
    enabled: !!org,
    queryFn: () => adoList<InstalledExtension>({ org, host: 'extmgmt', path: '_apis/extensionmanagement/installedextensions' })
  })
  const [text, setText] = useState('')
  const shown = useMemo(() => {
    const q = text.trim().toLowerCase()
    const all = [...(exts.data ?? [])].sort((a, b) => a.extensionName.localeCompare(b.extensionName, 'pt-BR'))
    if (!q) return all
    return all.filter((e) => e.extensionName.toLowerCase().includes(q) || e.publisherName.toLowerCase().includes(q))
  }, [exts.data, text])

  return (
    <>
      <PageHeader title="Extensões" subtitle={exts.data ? `${exts.data.length} instaladas` : undefined} />
      <div className="flex flex-col gap-4 p-6">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filtrar extensões" className="w-72" aria-label="Filtrar extensões" />
        {exts.isLoading && <Loading />}
        {exts.isError && <ErrorBox error={exts.error} onRetry={() => exts.refetch()} />}
        {exts.data &&
          (shown.length === 0 ? (
            <Empty title={text ? 'Nenhuma extensão com esse filtro' : 'Nenhuma extensão instalada'} />
          ) : (
            <Section title="Extensões instaladas">
              <Table
                persistKey="orgSettings.extensions"
                rows={shown}
                rowKey={(e) => e.extensionId + e.publisherId}
                zone={(e) => stateInfo(e.installState?.flags).zone}
                columns={[
                  { key: 'name', header: 'Extensão', render: (e) => <span className="font-semibold">{e.extensionName}</span>, sortValue: (e) => e.extensionName },
                  { key: 'pub', header: 'Publicador', render: (e) => <span className="text-muted">{e.publisherName}</span> },
                  { key: 'ver', header: 'Versão', render: (e) => <span className="narrow">{e.version}</span> },
                  {
                    key: 'state',
                    header: 'Situação',
                    render: (e) => {
                      const info = stateInfo(e.installState?.flags)
                      return <StateLabel zone={info.zone}>{info.label}</StateLabel>
                    }
                  },
                  { key: 'pub2', header: 'Publicada', render: (e) => <span className="text-muted"><TimeAgo date={e.lastPublished} /></span>, sortValue: (e) => e.lastPublished }
                ]}
              />
            </Section>
          ))}
      </div>
    </>
  )
}
