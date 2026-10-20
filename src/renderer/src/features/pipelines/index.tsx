// Feature Pipelines: Pipelines, Execuções, Run, Editar YAML, Environments, Releases e Library.
import { Routes, Route, Navigate } from 'react-router-dom'
import { Rocket } from 'lucide-react'
import { PipelinesList } from './PipelinesList'
import { RunsPage } from './RunsPage'
import { RunDetail } from './RunDetail'
import { EditYaml } from './EditYaml'
import { EnvironmentsList, EnvironmentDetail } from './Environments'
import { ReleasesPage, ReleaseDetail } from './Releases'
import { Library } from './Library'
import type { FeatureModule } from '../types'

function PipelinesRoutes() {
  return (
    <Routes>
      <Route path="list" element={<PipelinesList />} />
      <Route path="list/:definitionId" element={<RunsPage />} />
      <Route path="run/:buildId" element={<RunDetail />} />
      <Route path="edit/:definitionId" element={<EditYaml />} />
      <Route path="environments" element={<EnvironmentsList />} />
      <Route path="environments/:environmentId" element={<EnvironmentDetail />} />
      <Route path="releases" element={<ReleasesPage />} />
      <Route path="releases/:definitionId" element={<ReleasesPage />} />
      <Route path="release/:releaseId" element={<ReleaseDetail />} />
      <Route path="library" element={<Library />} />
      <Route path="*" element={<Navigate to="list" replace />} />
    </Routes>
  )
}

export const pipelinesFeature: FeatureModule = {
  id: 'pipelines',
  label: 'Pipelines',
  icon: Rocket,
  scope: 'project',
  path: 'pipelines',
  nav: [
    { label: 'Pipelines', path: 'list' },
    { label: 'Environments', path: 'environments' },
    { label: 'Releases', path: 'releases' },
    { label: 'Library', path: 'library' }
  ],
  Routes: PipelinesRoutes
}
