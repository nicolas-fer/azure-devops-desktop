// Feature Boards: work items, quadros, backlogs, sprints e queries (API REST 7.1 do Azure DevOps).
import { Routes, Route, Navigate } from 'react-router-dom'
import { SquareKanban } from 'lucide-react'
import type { FeatureModule } from '../types'
import { WorkItemsPage, WorkItemRoute } from './WorkItemsPage'
import { BoardPage } from './BoardPage'
import { BacklogsPage } from './BacklogsPage'
import { SprintsPage } from './SprintsPage'
import { QueriesPage } from './QueriesPage'

function BoardsRoutes() {
  return (
    <Routes>
      <Route path="workitems" element={<WorkItemsPage />} />
      <Route path="workitems/:id" element={<WorkItemRoute />} />
      <Route path="board" element={<BoardPage />} />
      <Route path="backlogs" element={<BacklogsPage />} />
      <Route path="sprints" element={<SprintsPage />} />
      <Route path="queries" element={<QueriesPage />} />
      <Route path="*" element={<Navigate to="workitems" replace />} />
    </Routes>
  )
}

export const boardsFeature: FeatureModule = {
  id: 'boards',
  label: 'Boards',
  icon: SquareKanban,
  scope: 'project',
  path: 'boards',
  nav: [
    { label: 'Work items', path: 'workitems' },
    { label: 'Quadros', path: 'board' },
    { label: 'Backlogs', path: 'backlogs' },
    { label: 'Sprints', path: 'sprints' },
    { label: 'Queries', path: 'queries' }
  ],
  Routes: BoardsRoutes
}
