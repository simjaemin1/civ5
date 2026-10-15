import civsJson from './data/civs.json'
import terrainsJson from './data/terrains.json'
import resourcesJson from './data/resources.json'
import wondersJson from './data/wonders.json'
import techsJson from './data/techs.json'
import type { PartialYield, Terrain } from './types'

export interface TileMod {
  terrain?: string
  resource?: string
  yield: PartialYield
}
export interface CivDef {
  id: string
  name: string
  priority: number
  happiness: number
  bonus: PartialYield
  startCulture: number
  ability: string
  unique: string
  tileMods?: TileMod[]
  terrainOverride?: TileMod[]
}
export interface ResourceDef {
  name: string
  kind: 'bonus' | 'strategic' | 'luxury'
  printed: PartialYield
  luxuryTech?: string
  boosts?: { tech: string; yield: PartialYield; nextTurn?: boolean }[]
}
export interface WonderDef {
  name: string
  yield: PartialYield
  cultureOnClaim?: number
  cultureOnDiscover?: number
  happinessOnClaim?: number
}
export type TechEffect =
  | { kind: 'foodToScience' }
  | { kind: 'culture'; amount: number }
  | { kind: 'general'; amount: number }
  | { kind: 'policy' }
  | { kind: 'compass' }
export interface TechDef {
  id: string
  name: string
  column: number
  prereqs?: string[]
  effects: TechEffect[]
  cost: number
}

export const CIVS = civsJson as CivDef[]
export const TERRAINS = terrainsJson as Record<Terrain, PartialYield>
export const RESOURCES = resourcesJson as Record<string, ResourceDef>
export const WONDERS = wondersJson as Record<string, WonderDef>
export const COLUMN_COSTS = techsJson.columnCosts
export const TECHS: TechDef[] = (techsJson.techs as Omit<TechDef, 'cost'>[]).map((t) => ({
  ...t,
  cost: COLUMN_COSTS[t.column - 1],
})) as TechDef[]

export const civById = (id: string): CivDef => {
  const c = CIVS.find((x) => x.id === id)
  if (!c) throw new Error(`unknown civ ${id}`)
  return c
}
export const techById = (id: string): TechDef => {
  const t = TECHS.find((x) => x.id === id)
  if (!t) throw new Error(`unknown tech ${id}`)
  return t
}
