import { Search } from 'lucide-react'
import type { FeatureModule } from '../types'
import { SearchPage } from './SearchPage'

export const searchFeature: FeatureModule = {
  id: 'search',
  label: 'Busca',
  icon: Search,
  scope: 'org',
  path: '_search',
  nav: [],
  Routes: () => <SearchPage />
}
