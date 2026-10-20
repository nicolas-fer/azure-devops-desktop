import { Home } from 'lucide-react'
import type { FeatureModule } from '../types'
import { HomePage } from './HomePage'

export const homeFeature: FeatureModule = {
  id: 'home',
  label: 'Projetos',
  icon: Home,
  scope: 'org',
  path: '_home',
  nav: [],
  Routes: () => <HomePage />
}
