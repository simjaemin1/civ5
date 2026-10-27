import { CIVS, MILITARY_CARDS, RuleError, aiCandidates, arrangeBattle, cardById, chooseTargets, createGame, makeTileDeck, usableInBattle } from '../../engine'
import type { Action, BattleReport, CardInst, Declaration, Dir, GameState, PlacedTile, TileCard } from '../../engine'

/**
 * 모의 전투 랩: 실제 게임 없이 두 문명의 군사 카드를 마음대로 골라 엔진 전투를 돌려 본다.
 * 전투 계산은 게임과 같은 엔진 함수(arrangeBattle·chooseTargets)를 쓰고, 전투가 끝난 뒤 라운드 진행(continueRound)만 하지 않는다.
 */

/** 고를 수 있는 카드 한 종류 (방향 카드는 방향마다 따로) */
export interface LabCard {
  key: string
  defId: string
  dirs?: Dir[]
  unique?: string
}

const keyOf = (c: { defId: string; dirs?: Dir[]; unique?: string }) => `${c.unique ?? c.defId}:${c.dirs?.join('') ?? 'x'}`

/** 이 문명이 전투에 낼 수 있는 카드 종류: 일반 군사 카드 전부(방향별) + 이 문명의 고유 유닛(방향 조합별) */
export function labCatalog(civId: string): LabCard[] {
  const out: LabCard[] = []
  for (const def of MILITARY_CARDS) {
    if (def.notBattle || def.uniqueOnly || def.hp === undefined) continue
    const dirSets: (Dir[] | undefined)[] = def.variantDirs ? def.variantDirs.map((d) => [d]) : [undefined]
    for (const dirs of dirSets) out.push({ key: keyOf({ defId: def.id, dirs }), defId: def.id, dirs })
  }
  const civ = CIVS.find((c) => c.id === civId)
  for (const u of civ?.uniques ?? []) {
    if (cardById(u.base).notBattle) continue
    const sets: (Dir[] | undefined)[] = u.power !== undefined ? (u.variants ?? [['L'], ['C'], ['R']]) : [undefined]
    for (const dirs of sets) out.push({ key: keyOf({ defId: u.base, dirs, unique: u.name }), defId: u.base, dirs, unique: u.name })
  }
  return out
}

/** 목표 타일 후보: 실제 타일 덱에서 지형 조합마다 한 장 */
export function labTiles(): TileCard[] {
  const seen = new Set<string>()
  const out: TileCard[] = []
  for (const t of makeTileDeck()) {
    const k = t.terrains.join('·')
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push({ id: t.id, terrains: [...t.terrains] })
  }
  return out
}

export interface LabSide {
  civId: string
  cards: LabCard[]
  /** 알렉산드리아 등대 (해안 타일 전투 공격 +1) */
  lighthouse: boolean
  /** 로켓공학 (상대 전투기의 효과 무시) */
  rocketry: boolean
}

export interface LabSetup {
  attacker: LabSide
  defender: LabSide
  kind: Declaration['kind']
  tile: TileCard
  /** 대상을 먼저 고르는 쪽 (실제 게임에서는 이번 라운드 차례 순서가 빠른 쪽) */
  attackerFirst: boolean
}

const CENTER: TileCard = { id: 9000, terrains: ['평지'] }

/** 랩 설정으로 카드를 놓는 단계의 전투 상태를 만든다. 0번 = 공격, 1번 = 수비 */
export function buildLab(setup: LabSetup): GameState {
  const s = createGame({ seed: 1, civIds: [setup.attacker.civId, setup.defender.civId] })
  s.phase = 'battle'
  s.order = setup.attackerFirst ? [0, 1] : [1, 0]
  const tileOwner = setup.kind === 'retake' ? 0 : 1
  const target: TileCard = { ...setup.tile, terrains: [...setup.tile.terrains], id: 9001 }
  s.players.forEach((p, id) => {
    const side = id === 0 ? setup.attacker : setup.defender
    const tiles: PlacedTile[] = [{ card: { ...CENTER, terrains: [...CENTER.terrains] }, role: 'city' }]
    if (id === tileOwner) tiles.push({ card: target, role: 'side', side: 'N', ...(setup.kind === 'retake' ? { occupiedBy: 1 } : {}) })
    p.cities = [{ id: 0, tiles, workers: 1, placed: [], openSides: [] }]
    if (side.lighthouse) p.wonders.push('great_lighthouse')
    if (side.rocketry) p.techs.push('rocketry')
    p.military = side.cards.map((c): CardInst => ({ uid: s.nextUid++, defId: c.defId, ...(c.dirs ? { dirs: [...c.dirs] } : {}), ...(c.unique ? { unique: c.unique } : {}) }))
  })
  const decl: Declaration = { attackerId: 0, defenderId: 1, cityId: 0, tileId: setup.kind === 'city' ? CENTER.id : target.id, kind: setup.kind }
  s.battle = { decl, slots: { 0: null, 1: null }, chooseQueue: [], picks: {}, step: 'arrange', coastal: target.terrains.includes('해안') }
  // 낼 수 있는 카드가 없는 쪽은 빈 배치로 넘어간다 (게임과 같음)
  for (const p of s.players) {
    if (!p.military.some((c) => usableInBattle(s, s.battle!, p, c))) arrangeBattle(s, p.id, [null, null, null, null])
  }
  return s
}

/** 전투 행동을 엔진 규칙대로 적용한 새 상태. 규칙 위반은 RuleError */
export function labApply(s: GameState, a: Action): GameState {
  const next = structuredClone(s)
  if (a.type === 'arrangeBattle') arrangeBattle(next, a.playerId, a.slots)
  else if (a.type === 'chooseTargets') chooseTargets(next, a.playerId, a.picks)
  else throw new RuleError('모의 전투에서는 카드 놓기와 대상 고르기만 합니다')
  return next
}

/** AI가 대신 놓거나 고른다 (규칙 검증용 AI와 같은 판단) */
export function labAi(s: GameState): GameState {
  for (const a of aiCandidates(s)) {
    try {
      return labApply(s, a)
    } catch (e) {
      if (!(e instanceof RuleError)) throw e
    }
  }
  throw new RuleError('AI가 놓을 방법을 찾지 못했습니다')
}

export const labReport = (s: GameState): BattleReport | null => (s.battle ? null : (s.battleReports.at(-1) ?? null))
