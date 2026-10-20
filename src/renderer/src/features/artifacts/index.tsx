// Feature Artifacts: feeds e pacotes do Azure Artifacts.
import { Routes, Route } from 'react-router-dom'
import { Package } from 'lucide-react'
import type { FeatureModule } from '../types'
import { ArtifactsPage } from './ArtifactsPage'

export const artifactsFeature: FeatureModule = {
  id: 'artifacts',
  label: 'Artifacts',
  icon: Package,
  scope: 'project',
  path: 'artifacts',
  nav: [],
  Routes: () => (
    <Routes>
      <Route path="*" element={<ArtifactsPage />} />
    </Routes>
  )
}
