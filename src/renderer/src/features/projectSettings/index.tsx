import { Navigate, Route, Routes } from 'react-router-dom'
import { Settings } from 'lucide-react'
import type { FeatureModule } from '../types'
import { Overview } from './Overview'
import { Teams } from './Teams'
import { Groups } from './Groups'
import { Notifications } from './Notifications'
import { Iterations } from './Iterations'
import { Repos } from './Repos'
import { Services } from './Services'
import { Queues } from './Queues'
import { Pipelines } from './Pipelines'
import { Board } from './Board'

const nav = [
  { label: 'Visão geral', path: 'overview' },
  { label: 'Times', path: 'teams' },
  { label: 'Permissões e grupos', path: 'permissions' },
  { label: 'Notificações', path: 'notifications' },
  { label: 'Iterações e áreas', path: 'iterations' },
  { label: 'Repositórios', path: 'repos' },
  { label: 'Conexões de serviço', path: 'services' },
  { label: 'Filas de agentes', path: 'queues' },
  { label: 'Pipelines', path: 'pipelines' },
  { label: 'Quadros', path: 'board' }
]

export const projectSettingsFeature: FeatureModule = {
  id: 'projectSettings',
  label: 'Configurações do projeto',
  icon: Settings,
  scope: 'project',
  path: '_settings',
  nav,
  Routes: () => (
    <Routes>
      <Route path="overview" element={<Overview />} />
      <Route path="teams" element={<Teams />} />
      <Route path="permissions" element={<Groups />} />
      <Route path="notifications" element={<Notifications />} />
      <Route path="iterations" element={<Iterations />} />
      <Route path="repos" element={<Repos />} />
      <Route path="services" element={<Services />} />
      <Route path="queues" element={<Queues />} />
      <Route path="pipelines" element={<Pipelines />} />
      <Route path="board" element={<Board />} />
      <Route path="*" element={<Navigate to="overview" replace />} />
    </Routes>
  )
}
