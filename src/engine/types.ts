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
  /** 이 타일을 점령 중인 문명 (그 문명의 위대한 장군 토큰이 올라가 있음) */
  occupiedBy?: number
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
  /** 몽골: 일꾼이 올라간 상대 타일 */
  enemyPlaced?: { playerId: number; cityId: number; tileId: number; card: TileCard }[]
  /** 스웨덴: 일꾼처럼 올린 위대한 장군이 있는 타일 */
  generalPlaced?: number[]
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
  /** 이번 차례에 금으로 승급했는지 (한 차례에 한 장) */
  upgraded: boolean
  /** 인도 등으로 얻은 이번 차례의 추가 식량 */
  extraFood: number

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
  military: CardInst[]
  /** 이번 차례에 일꾼처럼 타일에 올린 장군 수 (스웨덴) */
  generalWorkers: number
  /** 선전포고에 걸려 아직 쓸 수 없는 일꾼 수 (정산 때 풀림) */
  busyWorkers: number
  /** 이번 차례에 일꾼 1개를 정찰에 쓰고 있는지 */
  scouting: boolean
  /** 정찰로 본 타일 (이번 차례) */
  scouted: TileCard | null
  /** 나침반으로 맡아둔 타일 (일꾼 1개가 그 위에 있음) */
  held: TileCard | null
  eliminated: boolean
  greatWallUsed: boolean
  /** 독일: 장군을 얻어서 생기는 무료 군사 카드 선택권 */
  pendingFreeCards: number
}

export interface CardInst {
  uid: number
  defId: string
  /** 방향별 카드의 공격 방향 */
  dir?: 'L' | 'C' | 'R'
  /** 고유 유닛 이름 (기초 카드로 취급) */
  unique?: string
}

export interface Declaration {
  attackerId: number
  defenderId: number
  /** 목표 타일이 속한 도시와 타일 */
  cityId: number
  tileId: number
  kind: 'normal' | 'retake' | 'city'
}

export interface BattleState {
  decl: Declaration
  slots: Record<number, (number | null)[] | null>
  /** 대상을 고르는 카드(전차·기마병 등)의 선택 순서 */
  chooseQueue: { playerId: number; uids: number[] }[]
  picks: Record<number, number | null>
  step: 'arrange' | 'choose'
  coastal: boolean
}

export type Phase = 'setup' | 'place' | 'research' | 'produce' | 'declare' | 'battle' | 'over'

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
  nextUid: number
  /** 고유 유닛은 좌·중·우 3장만 존재한다: 이름별로 아직 만들 수 있는 카드 ('L'|'C'|'R'|'x') */
  uniqueSupply: Record<string, string[]>
  declarations: Declaration[]
  battle: BattleState | null
  eldoradoFound: boolean
  /** 지금까지 쓴 로그 줄 수 (log는 최근 줄만 남기므로 새 줄 수를 셀 때 쓴다) */
  logSeq: number
  winner: { playerId: number; type: 'science' | 'culture' | 'conquest' } | null
  log: string[]
}

/** 일꾼 배치. general: 스웨덴 능력(장군을 일꾼처럼), enemy: 몽골 능력(내 장군이 올라간 상대 타일) */
export interface Placement {
  cityId: number
  tileId: number
  general?: boolean
  enemy?: { playerId: number; cityId: number }
}

export type Action =
  | { type: 'buildCity'; cityTileId: number; sideTiles: Partial<Record<Side, number>> }
  | { type: 'wasteland'; discardTileId: number }
  | { type: 'placeWorkers'; placements: Placement[] }
  | { type: 'research'; techId: string; foodToScience?: number; hammerToScience?: number }
  | { type: 'skipResearch' }
  | { type: 'endProduction' }
  | { type: 'choosePolicy'; policy: PolicyId; discard?: { cityId: number; count: number }[]; dismiss?: { cityId: number; tileId: number } }
  | { type: 'buildSecondCity'; cityTileId: number; sideTiles: Partial<Record<Side, number>> }
  | { type: 'invest'; cityId: number; wonderId: string; hammers: number }
  | { type: 'produce'; cityId: number; defId: string; unique?: string }
  | { type: 'upgrade'; uid: number; unique?: string }
  | { type: 'scout' }
  | { type: 'holdScouted' }
  | { type: 'releaseHeld' }
  | { type: 'declareWar'; defenderId: number; cityId: number; tileId: number }
  | { type: 'endTurn' }
  | { type: 'arrangeBattle'; playerId: number; slots: (number | null)[] }
  | { type: 'chooseTargets'; playerId: number; picks: Record<number, number> }
  | { type: 'useAtomicBomb'; defenderId: number; cityId: number; tileId: number }
  | { type: 'useGreatWall' }
  | { type: 'sacrificeCard'; uid: number }
  | { type: 'claimFreeCard'; defId: string; unique?: string }

export class RuleError extends Error {}
