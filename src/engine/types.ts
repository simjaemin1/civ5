export type Terrain =
  | '평지' | '정글' | '호수' | '오아시스' | '숲' | '언덕'
  | '사막' | '툰드라' | '습지' | '해안' | '설원' | '산'

export interface Yield {
  food: number
  hammer: number
  science: number
  gold: number
}
export type PartialYield = Partial<Yield>

export interface TileCard {
  id: number
  terrains: Terrain[]
  resource?: string
  wonder?: string
  historic?: boolean
}

export type Side = 'N' | 'E' | 'S' | 'W'
export const SIDES: readonly Side[] = ['N', 'E', 'S', 'W']

export interface PlacedTile {
  card: TileCard
  /** 'city' | 'side' (첫 5타일의 십자 위치) | 'extra' */
  role: 'city' | 'side' | 'extra'
  side?: Side
}

export interface City {
  id: number
  tiles: PlacedTile[]
  workers: number
  /** 일꾼이 올라간 타일 id */
  placed: number[]
  /** 첫 5타일 중 아직 비어 있는 면 */
  openSides: Side[]
}

export interface TurnYields {
  cities: { cityId: number; food: number; hammer: number }[]
  science: number
  gold: number
}

export interface TurnData {
  yields: TurnYields
  foodToScience: number
  researched: boolean
}

export interface Player {
  id: number
  civId: string
  cities: City[]
  techs: string[]
  /** 이번 차례에 연구한 기술 (nextTurn 효과를 이번 차례에는 제외) */
  freshTechs: string[]
  generals: number
  hand: TileCard[]
  wastelandPending: boolean
  turn: TurnData | null
}

export type Phase = 'setup' | 'place' | 'research' | 'produce' | 'over'

export interface GameState {
  rng: number
  round: number
  deck: TileCard[]
  players: Player[]
  /** 우선도 순 player id */
  order: number[]
  turnIdx: number
  phase: Phase
  /** 이번 라운드에 앞사람이 고른 기술 */
  roundTechPicks: string[]
  log: string[]
}

export type Action =
  | { type: 'buildCity'; cityTileId: number; sideTiles: Partial<Record<Side, number>> }
  | { type: 'wasteland'; discardTileId: number }
  | { type: 'placeWorkers'; placements: { cityId: number; tileId: number }[] }
  | { type: 'research'; techId: string; foodToScience?: number }
  | { type: 'skipResearch' }
  | { type: 'endProduction' }

export class RuleError extends Error {}
