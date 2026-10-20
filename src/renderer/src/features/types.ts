import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * Contrato de um módulo de feature.
 * - scope "project": montado em /:org/:project/<path>/*
 * - scope "org":     montado em /:org/<path>/*  (path começa com "_", ex.: "_settings")
 * Routes deve renderizar um <Routes> com caminhos RELATIVOS (ex.: <Route path="workitems" ...>).
 */
export interface FeatureModule {
  id: string
  label: string
  icon: LucideIcon
  scope: 'project' | 'org'
  path: string
  /** Subitens da barra lateral (caminhos relativos a path). O primeiro é o padrão. */
  nav: { label: string; path: string }[]
  Routes: ComponentType
  /** Se false, não aparece na barra lateral (ex.: busca). */
  showInSidebar?: boolean
}
