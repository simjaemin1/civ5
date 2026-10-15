import type { PolicyId } from './data'

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
  /** 과학이론: 망치를 과학으로 바꾼 개수 (최대 2) */
  hammerToScience: number
  researched: boolean
  /** 이번 차례에 이미 생산을 한 도시 */
  produced: number[]
  /** 전통·체제를 고른 차례에는 식량 정산을 하지 않는다 */
  skipFoodSettle: boolean
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
  policy: PolicyId | null
  /** 아직 고르지 않은 정책 선택 횟수 */
  pendingPolicies: number
  /** 인쇄기술로 얻은 두 번째 도시용 타일 4장 (도시를 세울 때까지) */
  pendingCity: TileCard[] | null
  wonders: string[]
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
  /** 불가사의별 문명의 진척도 토큰 */
  wonderProgress: Record<string, Record<number, number>>
  wonderOwners: Record<string, number>
  /** 이번 라운드의 불가사의 투자 (정산 때 처리) */
  investments: { wonderId: string; playerId: number; cityId: number; hammers: number }[]
  log: string[]
}

export type Action =
  | { type: 'buildCity'; cityTileId: number; sideTiles: Partial<Record<Side, number>> }
  | { type: 'wasteland'; discardTileId: number }
  | { type: 'placeWorkers'; placements: { cityId: number; tileId: number }[] }
  | { type: 'research'; techId: string; foodToScience?: number; hammerToScience?: number }
  | { type: 'skipResearch' }
  | { type: 'endProduction' }
  | { type: 'choosePolicy'; policy: PolicyId; discard?: { cityId: number; count: number }[] }
  | { type: 'buildSecondCity'; cityTileId: number; sideTiles: Partial<Record<Side, number>> }
  | { type: 'invest'; cityId: number; wonderId: string; hammers: number }

export class RuleError extends Error {}
