import { Navigate, Route, Routes } from 'react-router-dom'
import { Settings } from 'lucide-react'
import type { FeatureModule } from '../types'
import { OrgOverview } from './OrgOverview'
import { OrgProjects } from './OrgProjects'
import { OrgUsers } from './OrgUsers'
import { OrgGroups } from './OrgGroups'
import { OrgPools } from './OrgPools'
import { OrgExtensions } from './OrgExtensions'
import { OrgProcesses } from './OrgProcesses'

const nav = [
  { label: 'Visão geral', path: 'overview' },
  { label: 'Projetos', path: 'projects' },
  { label: 'Usuários', path: 'users' },
  { label: 'Grupos', path: 'groups' },
  { label: 'Agent pools', path: 'pools' },
  { label: 'Extensões', path: 'extensions' },
  { label: 'Processos', path: 'processes' }
]

export const orgSettingsFeature: FeatureModule = {
  id: 'orgSettings',
  label: 'Configurações da organização',
  icon: Settings,
  scope: 'org',
  path: '_settings',
  nav,
  Routes: () => (
    <Routes>
      <Route path="overview" element={<OrgOverview />} />
      <Route path="projects" element={<OrgProjects />} />
      <Route path="users" element={<OrgUsers />} />
      <Route path="groups" element={<OrgGroups />} />
      <Route path="pools" element={<OrgPools />} />
      <Route path="extensions" element={<OrgExtensions />} />
      <Route path="processes" element={<OrgProcesses />} />
      <Route path="*" element={<Navigate to="overview" replace />} />
    </Routes>
  )
}
