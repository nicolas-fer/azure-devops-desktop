// Ícone lucide por grupo de protocolo (usado na tabela e no detalhe do pacote).
import { Archive, Box, Coffee, FileCode, Hexagon, Package, type LucideIcon } from 'lucide-react'
import type { ProtocolGroup } from './api'

export const PROTOCOL_ICON: Record<ProtocolGroup, LucideIcon> = {
  nuget: Box,
  npm: Hexagon,
  maven: Coffee,
  pypi: FileCode,
  upack: Archive,
  other: Package
}
