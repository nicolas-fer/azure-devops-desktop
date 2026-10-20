import { ado, adoList, seg, webUrl, type Project } from '@/lib/api'

export interface ProcessRef {
  id: string
  name: string
  isDefault: boolean
  type: string
  description?: string
}

export interface OperationRef {
  id: string
  status: string
  url?: string
  resultMessage?: string
  detailedMessage?: string
}

/** Estados finais de uma operação assíncrona do ADO. */
export const operationDone = (s?: string) => s === 'succeeded' || s === 'complete' || s === 'failed' || s === 'cancelled'
export const operationFailed = (s?: string) => s === 'failed' || s === 'cancelled'

export const listProcesses = (org: string) => adoList<ProcessRef>({ org, path: '_apis/process/processes', query: { $top: 100 } })

export interface CreateProjectInput {
  name: string
  description: string
  visibility: 'private' | 'public'
  sourceControl: 'Git' | 'Tfvc'
  processId: string
}

/** Cria o projeto. Responde com uma operação que deve ser acompanhada até concluir. */
export const createProject = (org: string, input: CreateProjectInput) =>
  ado<OperationRef>({
    org,
    method: 'POST',
    path: '_apis/projects',
    body: {
      name: input.name.trim(),
      description: input.description.trim(),
      visibility: input.visibility,
      capabilities: {
        versioncontrol: { sourceControlType: input.sourceControl },
        processTemplate: { templateTypeId: input.processId }
      }
    }
  })

export const getOperation = (org: string, id: string) => ado<OperationRef>({ org, path: `_apis/operations/${seg(id)}` })

export const listProjects = (org: string) => adoList<Project>({ org, path: '_apis/projects', query: { $top: 500 } })

/** Link "Abrir no navegador" do projeto. */
export const projectWebUrl = (org: string, name: string) => webUrl(org, seg(name))
