import { useQuery } from '@tanstack/react-query'
import { ado, webUrl } from '@/lib/api'
import { useScope, useProjects } from '@/lib/context'
import { Code, ErrorBox, ExternalButton, Loading, PageHeader, Section } from '@/components/ui'

interface ConnectionData {
  instanceId?: string
  deploymentType?: string
  authenticatedUser?: { providerDisplayName?: string }
  locationServiceData?: { serviceOwner?: string }
}

/** Dados da organização: nome, URL, tipo de implantação. Proprietário e região não vêm da API. */
export function OrgOverview() {
  const { org } = useScope()
  const conn = useQuery({
    queryKey: ['os', org, 'connection'],
    enabled: !!org,
    queryFn: () => ado<ConnectionData>({ org, path: '_apis/connectionData', apiVersion: null })
  })
  const projects = useProjects(org)

  return (
    <>
      <PageHeader title={org} subtitle="Configurações da organização" actions={<ExternalButton url={webUrl(org, '_settings/organizationOverview')} />} />
      <div className="flex flex-col gap-6 p-6">
        {conn.isLoading && <Loading />}
        {conn.isError && <ErrorBox error={conn.error} onRetry={() => conn.refetch()} />}
        {conn.data && (
          <Section title="Organização">
            <dl className="grid grid-cols-[180px_1fr] gap-x-4 gap-y-2 p-3 text-sm">
              <dt className="text-muted">Nome</dt>
              <dd className="font-semibold">{org}</dd>
              <dt className="text-muted">URL</dt>
              <dd>
                <Code>{webUrl(org)}</Code>
              </dd>
              <dt className="text-muted">Tipo de implantação</dt>
              <dd>{conn.data.deploymentType === 'cloud' ? 'Nuvem (Azure DevOps Services)' : conn.data.deploymentType ?? '—'}</dd>
              <dt className="text-muted">ID da instância</dt>
              <dd>
                <Code>{conn.data.instanceId ?? '—'}</Code>
              </dd>
              <dt className="text-muted">Proprietário</dt>
              <dd className="text-muted">
                {conn.data.locationServiceData?.serviceOwner ? `${conn.data.locationServiceData.serviceOwner} (serviço)` : 'Não exposto pela API'}
              </dd>
              <dt className="text-muted">Região</dt>
              <dd className="text-muted">Não exposta pela API pública.</dd>
            </dl>
          </Section>
        )}
        {projects.data && (
          <div className="text-sm text-muted">
            {projects.data.length} {projects.data.length === 1 ? 'projeto' : 'projetos'} nesta organização.
          </div>
        )}
      </div>
    </>
  )
}
