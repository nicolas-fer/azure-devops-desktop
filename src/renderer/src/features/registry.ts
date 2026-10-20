// Registro central das features. Cada executor só altera a pasta da própria feature.
import { boardsFeature } from './boards'
import { reposFeature } from './repos'
import { pipelinesFeature } from './pipelines'
import { artifactsFeature } from './artifacts'
import { projectSettingsFeature } from './projectSettings'
import { orgSettingsFeature } from './orgSettings'
import { searchFeature } from './search'
import { homeFeature } from './home'
import type { FeatureModule } from './types'

/** Ordem da barra lateral, igual ao Azure DevOps (sem Overview e Test Plans, fora do escopo). */
export const projectFeatures: FeatureModule[] = [boardsFeature, reposFeature, pipelinesFeature, artifactsFeature]
export const projectSettings = projectSettingsFeature
export const orgSettings = orgSettingsFeature
export const search = searchFeature
export const home = homeFeature
