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
  /** 도시를 세운 뒤에 붙은 타일 (첫 5타일에 속하지 않는다: 해안 도시 판정 등) */
  late?: boolean
  /** 추가 타일(extra)이 놓인 자리 번호 (0부터). 원자폭탄으로 타일이 사라져도 번호는 그대로 남아 그 자리는 비고, 새 타일이 먼저 메운다 */
  slot?: number
}

export interface City {
  id: number
  tiles: PlacedTile[]
  workers: number
  /** 일꾼이 올라간 타일 id */
  placed: number[]
  /** 지난 차례에 일꾼이 올라가 있던 타일 id (다음 배치 때 그대로 올려 둔다) */
  lastPlaced?: number[]
  /** 지난 차례에 스웨덴이 장군을 올린 타일 / 몽골이 일꾼을 올린 상대 타일 (다음 배치 때 그대로 올려 둔다) */
  lastGeneralPlaced?: number[]
  lastEnemyPlaced?: { playerId: number; cityId: number; tileId: number }[]
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
  /** 도시별로 과학에 쓴 식량·망치 (없으면 도시 순서대로 자동) */
  foodByCity?: Record<number, number>
  hammerByCity?: Record<number, number>
  researched: boolean
  /** 이번 차례에 이미 생산을 한 도시 */
  produced: number[]
  /** 이번 차례에 금으로 승급했는지 (한 차례에 한 장) */
  upgraded: boolean
  /** 인도 등으로 얻은 이번 차례의 추가 식량 */
  extraFood: number

  /** 전통·체제를 고른 차례에는 식량 정산을 하지 않는다 */
  skipFoodSettle: boolean
  /** 이번 차례에 장군을 점령지에서 불러들였는가 (차례당 1개) */
}

export interface PlayerChoices {
  /** false면 맡아둔 타일을 두고 덱에서 새로 뽑는다 */
  useHeld?: boolean
  cultureCity?: number
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
  /** 행복 상한을 넘어 이번 차례 끝에 직접 버려야 하는 일꾼 수 (도시를 눌러 한 명씩 버린다) */
  pendingDiscard?: number
  /** 보유 한도(한 종류 4장)를 넘어 골라 버려야 하는 군사 카드의 종류 (한 장마다 한 항목) */
  pendingCardDiscard?: string[]
  /** 정책을 바꿀 기회로 얻은 선택권이면 고를 수 있는 정책 (이 정책이나 지금 정책) */
  /** 과학이론: 정책을 이 정책으로 바꿀지 말지 정할 기회 (고르면 바뀌고, 안 고르면 그대로). 정하기 전에는 생산·투자·승급을 못 한다 */
  policyOffer?: PolicyId
  /** 지금까지 정책을 고른 횟수 (불가사의·기술로 바뀐 것은 세지 않는다) */
  policyPicks?: number
  /** 아직 고르지 않은 정책 선택 횟수 */
  pendingPolicies: number
  /** 인쇄기술로 얻은 두 번째 도시용 타일 4장 (도시를 세울 때까지) */
  pendingCity: TileCard[] | null
  /** 문화로 얻었지만 아직 붙이지 않은 타일 (도시가 둘 이상이면 플레이어가 타일을 보고 붙일 도시를 고른다) */
  pendingTiles?: TileCard[]
  wonders: string[]
  military: CardInst[]
  /** 이번 차례에 일꾼처럼 타일에 올린 장군 수 (스웨덴) */
  generalWorkers: number
  /** 불러들였지만 다음 차례에 도착하는 장군 */
  returningGenerals: number
  /** 선전포고에 걸려 아직 쓸 수 없는 일꾼 수 (정산 때 풀림) */
  busyWorkers: number
  /** 이번 차례에 일꾼 1개를 정찰에 쓰고 있는지 */
  scouting: boolean
  /** 정찰로 본 타일 (이번 차례) */
  scouted: TileCard | null
  /** 마지막으로 정찰한 라운드: 한 차례에 1장만 볼 수 있다 (맡아둔 타일을 돌려보내도 다시 정찰할 수 없다) */
  scoutedRound?: number
  /** 나침반으로 맡아둔 타일 (일꾼 1개가 그 위에 있음) */
  held: TileCard | null
  eliminated: boolean
  greatWallUsed: boolean
  /** 시작 손이 이미 5장이라 손에 더 못 받는 엘도라도 발견 타일: 도시를 세울 때 영토로 붙는다 */
  startExtras?: TileCard[]
  /** 선택 사항: 문화로 얻는 타일을 맡아둔 타일로 받을지(기본), 붙일 도시, 일꾼을 버릴 도시 */
  choices?: PlayerChoices
  /** 독일: 장군을 얻어서 생기는 무료 군사 카드 선택권 */
  pendingFreeCards: number
}

export interface CardInst {
  uid: number
  defId: string
  /** 전투력 마크의 방향 (방향 카드를 만들 때 무작위로 정해진다. 연노병처럼 마크가 둘이면 둘) */
  dirs?: ('L' | 'C' | 'R')[]
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

/** 전투 결과 보고: 화면에서 전투 장면을 보여 주기 위해 전투가 끝날 때마다 남긴다 */
export interface BattleUnitReport {
  inst: CardInst
  owner: number
  /** 1~4번 자리 */
  slot: number
  /** 효과를 반영한 체력 */
  hp: number
  /** 상대 공격으로 받은 대미지와 공격하며 받은 반격 대미지 */
  attackDamage: number
  counterDamage: number
  destroyed: boolean
}
export interface BattleHit {
  from: { pid: number; slot: number }
  to: { pid: number; slot: number }
  /** 실제로 준 대미지 (면역이면 0) */
  power: number
}
export interface BattleReport {
  seq: number
  round: number
  attackerId: number
  defenderId: number
  kind: Declaration['kind']
  terrains: string[]
  coastal: boolean
  units: BattleUnitReport[]
  hits: BattleHit[]
  survivors: { attacker: number; defender: number }
  winner: 'attacker' | 'defender'
  /** 결과 한 줄: 타일 점령, 도시 파괴 등 */
  outcome: string
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
  /** 최근 전투 결과 (최대 30개) */
  battleReports: BattleReport[]
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
  | { type: 'research'; techId: string; foodToScience?: number; hammerToScience?: number; foodByCity?: Record<number, number>; hammerByCity?: Record<number, number> }
  | { type: 'setChoices'; useHeld?: boolean; cultureCity?: number | null }
  | { type: 'discardWorker'; cityId: number }
  | { type: 'discardCard'; uid: number }
  | { type: 'skipResearch' }
  | { type: 'endProduction' }
  | { type: 'choosePolicy'; policy: PolicyId; discard?: { cityId: number; count: number }[]; dismiss?: { cityId: number; tileId: number }; addWorkers?: { cityId: number; count: number }[] }
  | { type: 'policyOffer'; accept: boolean }
  | { type: 'buildSecondCity'; cityTileId: number; sideTiles: Partial<Record<Side, number>> }
  | { type: 'invest'; cityId: number; wonderId: string; hammers: number }
  | { type: 'produce'; cityId: number; defId: string; unique?: string }
  | { type: 'upgrade'; uid: number; unique?: string; toDefId?: string }
  | { type: 'recallGeneral'; defenderId: number; cityId: number; tileId: number }
  | { type: 'scout' }
  | { type: 'holdScouted' }
  | { type: 'releaseHeld' }
  | { type: 'declareWar'; defenderId: number; cityId: number; tileId: number }
  | { type: 'endTurn' }
  | { type: 'arrangeBattle'; playerId: number; slots: (number | null)[] }
  | { type: 'chooseTargets'; playerId: number; picks: Record<number, number | null> }
  | { type: 'useAtomicBomb'; defenderId: number; cityId: number; tileId: number }
  | { type: 'useGreatWall' }
  | { type: 'sacrificeCard'; uid: number }
  | { type: 'claimFreeCard'; defId: string; unique?: string }
  | { type: 'placeGainedTile'; cityId: number }

export class RuleError extends Error {}
