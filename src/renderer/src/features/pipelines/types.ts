// Tipos da API de Pipelines/Releases/Environments/Library usados pela feature (API 7.1).
import type { IdentityRef } from '@/lib/api'

export interface BuildRepo {
  id: string
  name: string
  type: string
  defaultBranch?: string
}

export interface BuildDefinition {
  id: number
  name: string
  /** Pasta do pipeline: "\\" na raiz, "\\Portal\\Api" em subpasta. */
  path: string
  revision?: number
  queueStatus?: string
  url?: string
  project?: { id: string; name: string }
  latestBuild?: Build | null
  latestCompletedBuild?: Build | null
  /** Só vem em GET definitions/{id}. */
  repository?: BuildRepo
  /** type 2 = YAML; yamlFilename só existe em YAML. */
  process?: { type?: number; yamlFilename?: string; phases?: unknown[] }
  variables?: Record<string, { value: string | null; isSecret?: boolean; allowOverride?: boolean }>
  artifacts?: unknown[]
  _links?: { web?: { href: string } }
}

export interface Build {
  id: number
  buildNumber: string
  status: string
  result?: string
  queueTime?: string
  startTime?: string
  finishTime?: string
  sourceBranch?: string
  sourceVersion?: string
  reason?: string
  requestedFor?: IdentityRef
  requestedBy?: IdentityRef
  definition?: { id: number; name: string }
  parameters?: string
  keepForever?: boolean
  retainedByRelease?: boolean
  triggerInfo?: Record<string, string>
  repository?: { id: string; name: string; type: string }
  _links?: { web?: { href: string } }
}

export interface TimelineRecord {
  id: string
  parentId: string | null
  /** Stage | Phase | Job | Task | Checkpoint */
  type: string
  name: string
  identifier?: string
  order?: number
  state?: string
  result?: string | null
  startTime?: string | null
  finishTime?: string | null
  errorCount?: number
  warningCount?: number
  log?: { id: number; url: string } | null
  issues?: { type: string; category?: string; message: string }[]
  attempt?: number
  workerName?: string | null
}

export interface Timeline {
  id: string
  records: TimelineRecord[]
}

export interface BuildArtifact {
  id: number
  name: string
  resource: { type: string; data: string; url: string; downloadUrl?: string }
}

export interface BuildChange {
  id: string
  message: string
  type: string
  timestamp?: string
  author?: { displayName: string; uniqueName?: string }
  location?: string
}

export interface TestRun {
  id: number
  name: string
  state: string
  totalTests: number
  passedTests: number
  incompleteTests?: number
  notApplicableTests?: number
  unanalyzedTests?: number
  startedDate?: string
  completedDate?: string
}

export interface PipelineApproval {
  id: string
  status: string
  createdOn?: string
  instructions?: string
  minRequiredApprovers?: number
  steps?: { assignedApprover: IdentityRef; actualApprover?: IdentityRef; state?: string; comment?: string; order?: number }[]
  pipeline?: { id?: number; owner?: { id: number; type?: string }; name?: string }
  resource?: { type: string; id: string; name?: string }
}

export interface Environment {
  id: number
  name: string
  description?: string
  lastModifiedOn?: string
  lastModifiedBy?: IdentityRef
  resources?: { id: number; name: string; type: string; tags?: string[] }[]
}

/** Registro de implantação de um environment. Campos extras variam conforme o recurso. */
export interface EnvDeploymentRecord {
  id: number
  stageName?: string
  jobName?: string
  result?: string | null
  startTime?: string | null
  finishTime?: string | null
  definition?: { id: number; name: string }
  owner?: { displayName?: string }
  planType?: string
}

export interface ReleaseDefinition {
  id: number
  name: string
  path: string
  artifacts?: {
    alias: string
    type: string
    definitionReference?: { definition?: { id: string; name: string }; project?: { id: string } }
  }[]
  environments?: { id: number; name: string }[]
  modifiedOn?: string
  _links?: { web?: { href: string } }
}

export interface ReleaseTask {
  id: number
  name: string
  status: string
  startTime?: string | null
  finishTime?: string | null
  dateStarted?: string | null
  dateEnded?: string | null
  logUrl?: string | null
  agentName?: string | null
}

export interface ReleaseEnvironment {
  id: number
  name: string
  status: string
  rank?: number
  releaseId?: number
  deploySteps?: {
    id: number
    attempt: number
    status: string
    requestedFor?: IdentityRef
    queuedOn?: string
    releaseDeployPhases?: {
      id: number
      name: string
      status: string
      deploymentJobs?: { job?: { id: number }; tasks?: ReleaseTask[] }[]
    }[]
  }[]
}

export interface Release {
  id: number
  name: string
  status: string
  createdOn?: string
  modifiedOn?: string
  createdBy?: IdentityRef
  createdFor?: IdentityRef
  reason?: string
  description?: string
  environments?: ReleaseEnvironment[]
  releaseDefinition?: { id: number; name: string }
  _links?: { web?: { href: string } }
}

export interface ReleaseApproval {
  id: number
  approvalType: string
  status: string
  createdOn?: string
  instructions?: string
  releaseEnvironment?: { id: number; name: string }
  approver?: IdentityRef
  release?: { id: number; name: string }
}

export interface VariableGroup {
  id: number
  name: string
  type: string
  description?: string
  createdOn?: string
  modifiedOn?: string
  modifiedBy?: IdentityRef
  variables: Record<string, { value?: string | null; isSecret?: boolean }>
  variableGroupProjectReferences?: unknown[] | null
}

export interface SecureFile {
  id: string
  name: string
  createdBy?: IdentityRef
  createdOn?: string
  modifiedOn?: string
}

export interface GitRef {
  name: string
  objectId: string
}
