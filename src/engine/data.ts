import civsJson from './data/civs.json'
import terrainsJson from './data/terrains.json'
import resourcesJson from './data/resources.json'
import wondersJson from './data/wonders.json'
import techsJson from './data/techs.json'
import militaryJson from './data/militaryCards.json'
import wonderCardsJson from './data/wonderCards.json'
import policiesJson from './data/policies.json'
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
  uniques: UniqueUnitDef[]
}
export type UniqueEffect =
  | 'jaguar' | 'mohawk' | 'immortal' | 'slinger' | 'samurai' | 'janissary'
  | 'tercio' | 'impi' | 'hwacha' | 'ski' | 'carolean'

/** 고유 유닛: 카드에 적힌 능력치. 기초 카드(괄호 안)는 효과를 적용할 때만 쓴다 (예: 케식텐은 기사 취급). */
export interface UniqueUnitDef {
  name: string
  base: string
  tech?: string
  cost: number
  hp: number
  def: number
  /** 전투력 마크 하나당 전투력 */
  power?: number
  /** 마크가 놓일 수 있는 방향 조합: 카드가 3장이며 한 장씩 (기본: 왼쪽·가운데·오른쪽) */
  variants?: Dir[][]
  /** 카드를 1개 골라 공격하는 전투력 */
  choose?: number
  noCounter?: boolean
  siege?: boolean
  lateTarget?: boolean
  coastalOnly?: boolean
  effect?: UniqueEffect
  text?: string
}

export interface ResourceDef {
  name: string
  kind: 'bonus' | 'strategic' | 'luxury'
  printed: PartialYield
  luxuryTech?: string
  /** 임시 타일 덱이 이 자원을 붙일 수 있는 지형 (실제 카드 목록이 생기면 필요 없어짐) */
  terrains: string[]
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
  | { kind: 'setPolicy'; policy: PolicyId }
  | { kind: 'compass' }
  | { kind: 'secondCity' }
  | { kind: 'archaeology' }
  | { kind: 'tourismPerCulture' }
  | { kind: 'ignoreRoundPicks' }
  | { kind: 'scienceVictory' }
  | { kind: 'hammerToScience'; amount: number }
export interface TechDef {
  id: string
  name: string
  column: number
  prereqs?: string[]
  effects: TechEffect[]
  cost: number
}

export type Dir = 'L' | 'C' | 'R'
export interface MilitaryCardDef {
  id: string
  name: string
  line: 'infantry' | 'ranged' | 'anti_cavalry' | 'cavalry' | 'siege' | null
  tier?: number
  cost: number
  tech: string
  /** 전투력 마크: 위치가 공격 방향, 숫자가 전투력 (방향이 고정된 카드) */
  marks?: { dir: Dir; power: number }[]
  /** 방향별로 따로 있는 카드: 전투력 power, 마크가 variantDirs의 각 방향인 카드가 한 장씩 존재 */
  power?: number
  variantDirs?: Dir[]
  /** 카드를 1개 골라 공격 */
  attack?: { choose: true; power: number }
  hp?: number
  def?: number
  noCounter?: boolean
  special?: string
  notBattle?: boolean
  note?: string
  /** 고유 유닛으로만 만들 수 있는 카드 (화차, 제고이센) */
  uniqueOnly?: boolean
}

export const CIVS = civsJson as unknown as CivDef[]
/** 고유 유닛 이름 → 소유 문명과 정의 (이름은 모든 문명에서 겹치지 않는다) */
export const UNIQUES: Record<string, { civId: string; def: UniqueUnitDef }> = Object.fromEntries(
  CIVS.flatMap((c) => c.uniques.map((u) => [u.name, { civId: c.id, def: u }])),
)
export const TERRAINS = terrainsJson as Record<Terrain, PartialYield>
export const RESOURCES = resourcesJson as Record<string, ResourceDef>
export const WONDERS = wondersJson as Record<string, WonderDef>
export const MILITARY_CARDS = militaryJson.cards as MilitaryCardDef[]
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

export type PolicyId =
  | 'tradition' | 'aesthetics' | 'despotism' | 'regime'
  | 'liberty' | 'rationalism' | 'equality' | 'diplomacy'
export const POLICIES = policiesJson as Record<PolicyId, { name: string; desc: string }>

export type WonderEffect =
  | { kind: 'general'; amount: number }
  | { kind: 'militaryCostMinus'; amount: number }
  | { kind: 'happiness'; amount: number }
  | { kind: 'goldPerTurn'; amount: number }
  | { kind: 'gardens' }
  | { kind: 'coastalAttackPlus'; amount: number }
  | { kind: 'setPolicy'; policy: PolicyId }
  | { kind: 'desertBonus' }
  | { kind: 'greatWall' }
  | { kind: 'culture'; amount: number }
  | { kind: 'tourism'; amount: number }
  | { kind: 'choosePolicy' }
  | { kind: 'immuneCultureLoss' }
export type WonderCondition =
  | { kind: 'stoneInCity' }
  | { kind: 'coastFirst5' }
  | { kind: 'desertFirst5' }
  | { kind: 'mountainInCity' }
  | { kind: 'policy'; policy: PolicyId }
export interface WonderCardDef {
  id: string
  name: string
  tech: string
  minHammers: number
  progressNeeded: number
  condition?: WonderCondition
  effects: WonderEffect[]
}
export const WONDER_CARDS = wonderCardsJson.wonders as WonderCardDef[]
export const wonderCardById = (id: string): WonderCardDef => {
  const w = WONDER_CARDS.find((x) => x.id === id)
  if (!w) throw new Error(`unknown wonder ${id}`)
  return w
}

export const cardById = (id: string): MilitaryCardDef => {
  const c = MILITARY_CARDS.find((x) => x.id === id)
  if (!c) throw new Error(`unknown military card ${id}`)
  return c
}
