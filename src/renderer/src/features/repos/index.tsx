// Feature Repos (Git): arquivos, commits, pushes, branches, tags e pull requests.
// Rotas relativas a /:org/:project/repos. Sem :repo na URL, o repositório é resolvido pelo RepoGate.
import { Navigate, Route, Routes } from 'react-router-dom'
import { GitBranch } from 'lucide-react'
import type { FeatureModule } from '../types'
import { FilesScreen } from './FilesScreen'
import { CommitsScreen } from './CommitsScreen'
import { PushesScreen } from './PushesScreen'
import { BranchesScreen } from './BranchesScreen'
import { TagsScreen } from './TagsScreen'
import { PullRequestsScreen } from './PullRequestsScreen'
import { PullRequestScreen } from './PullRequestScreen'
import { PrCreateScreen } from './PrCreate'

function ReposRoutes() {
  return (
    <Routes>
      <Route path="files" element={<FilesScreen />} />
      <Route path="files/:repo/*" element={<FilesScreen />} />
      <Route path="commits" element={<CommitsScreen />} />
      <Route path="commits/:repo" element={<CommitsScreen />} />
      <Route path="pushes" element={<PushesScreen />} />
      <Route path="pushes/:repo" element={<PushesScreen />} />
      <Route path="branches" element={<BranchesScreen />} />
      <Route path="branches/:repo" element={<BranchesScreen />} />
      <Route path="tags" element={<TagsScreen />} />
      <Route path="tags/:repo" element={<TagsScreen />} />
      <Route path="pullrequests" element={<PullRequestsScreen />} />
      <Route path="pullrequests/:repo" element={<PullRequestsScreen />} />
      <Route path="pullrequest/:repo/new" element={<PrCreateScreen />} />
      <Route path="pullrequest/:repo/:id" element={<PullRequestScreen />} />
      <Route path="*" element={<Navigate to="files" replace />} />
    </Routes>
  )
}

export const reposFeature: FeatureModule = {
  id: 'repos',
  label: 'Repos',
  icon: GitBranch,
  scope: 'project',
  path: 'repos',
  nav: [
    { label: 'Arquivos', path: 'files' },
    { label: 'Commits', path: 'commits' },
    { label: 'Pushes', path: 'pushes' },
    { label: 'Branches', path: 'branches' },
    { label: 'Tags', path: 'tags' },
    { label: 'Pull requests', path: 'pullrequests' }
  ],
  Routes: ReposRoutes
}
