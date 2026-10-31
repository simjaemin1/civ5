import type { Action, GameState, Player, Side, TileCard } from './types'
import { RuleError, SIDES } from './types'
import { MILITARY_CARDS, RESOURCES, TECHS, WONDERS, cardById, civById, wonderCardById } from './data'
import { cardStats } from './cardstats'
import type { TechDef, WonderCardDef } from './data'
import { apply, researchableTechs } from './game'
import { canHammerScience, computeYields, ctxOf, culture, happiness, rationalismScience, tileYield, totalWorkers, tourism } from './yields'
import { conditionMet, investableWonders, minHammers } from './wonders'
import { cardCost, heldCount, holdLimit, producible, uniqueOf, upgradeTargets } from './military'
import { declarationTargets, findTile, occupiedTiles } from './war'
import { battleActions, battleOdds } from './aiBattle'
import { currentPlayer, defaultTileCity } from './core'
import { turnKey } from './undo'

/** 규칙 검증용 단순 휴리스틱 AI. 후보 행동을 순서대로 시도해 규칙을 어기지 않는 첫 행동을 쓴다. */

/** 실험용 AI 성향: 'hammer'는 망치 올인 (타일은 망치 위주, 군사 카드를 먼저 만든다) */
let aiStyle: 'default' | 'hammer' = 'default'
export const setAiStyle = (style: 'default' | 'hammer'): void => {
  aiStyle = style
}

/** 튜닝값 (시뮬레이션으로 조정) */
/** 시뮬레이션(30판)으로 고른 값: 정책은 과학 12 미만이면 합리주의·자유로, 과학이론 우선도 +60, 아폴로 질주는 남은 기술 8개부터 (더 일찍 달리면 오히려 판이 길어진다) */
export const AI_TUNE = {
  scienceWeight: 1.3, apolloRush: 8, policyNeed: 12, coalition: true, cultureRush: 9, cultureSlack: 2, warlord: true, warlordArmy: 6,
  /** 전쟁광이 노리는 상대 타일의 망치 1당 가산점: 망치 2 이상인 타일이 도시 사면(+8)보다 먼저다 (반격할 군사 카드를 못 뽑게 누른다) */
  warlordHammer: 6,
  /** 견제형 점령: 끄면 예전처럼 장군이 모자랄 때 값싼 점령부터 푼다 */
  harass: true,
  /** 견제형이 되는 군사 우위: 내 힘이 살아 있는 상대 평균의 이 배수 이상 (고유 유닛을 들고 있으면 배수와 상관없이) */
  harassEdge: 1.3,
  /** 장군을 불러들여 옮길 만한 차이: 노릴 타일의 중요도가 점령 중인 타일보다 이만큼 이상 커야 한다 (왔다 갔다 방지) */
  harassMargin: 3,
  /** 견제형(고유 유닛을 든 문명 등)이 노리는 상대 타일의 망치 1당 가산점: 상대의 고생산 타일을 점령해 군사·불가사의 생산을 누른다 */
  harassHammer: 6,
}

const weight = (y: { food: number; hammer: number; science: number; gold: number }) =>
  y.food * 1.6 + y.hammer * 1.1 + y.science * AI_TUNE.scienceWeight + y.gold * 0.4

/** 지금 입력을 해야 하는 문명 (전투 중에는 카드를 놓거나 대상을 골라야 하는 쪽) */
export function actorOf(s: GameState): number {
  const b = s.battle
  if (s.phase === 'battle' && b) {
    if (b.step === 'arrange') {
      return [b.decl.attackerId, b.decl.defenderId].find((id) => !b.slots[id]) ?? b.decl.attackerId
    }
    return b.chooseQueue[0]?.playerId ?? b.decl.attackerId
  }
  return currentPlayer(s).id
}

/** 기본 과학으로는 가장 싼 기술도 못 사는 상태: 식량을 늘려 과학으로 바꾸고 일꾼도 키운다 */
let starving = false
/** 이웃의 군사에 비해 수비가 모자라면 망치를 더 챙긴다 */
let defending = false

/** 지금 상황에서 자원 한 단위의 가치 (질주·수비·과학 기아에 따라 바뀐다) */
function yieldWeights(p: Player): { food: number; hammer: number; science: number; gold: number } {
  if (aiStyle === 'hammer') return { food: 1.5, hammer: 4, science: 0.3, gold: 0 }
  if (defending) return { food: 1.6, hammer: 3, science: 0.8, gold: 0.2 }
  // 아폴로 질주·과학 기아: 식량이 곧 과학이므로 식량과 과학을 크게 친다
  if (rushingApollo(p) || rushingCulture(p) || starving) return { food: 3, hammer: 0.5, science: 3, gold: 0.2 }
  return { food: 1.6, hammer: 1.1, science: AI_TUNE.scienceWeight, gold: 0.4 }
}

function tileScore(p: Player, card: TileCard): number {
  const y = tileYield(card, ctxOf(p))
  const w = yieldWeights(p)
  return y.food * w.food + y.hammer * w.hammer + y.science * w.science + y.gold * w.gold
}

function foundAction(p: Player, hand: TileCard[]): Action {
  const best = hand.reduce((a, b) => (tileScore(p, b) > tileScore(p, a) ? b : a))
  const sideTiles: Partial<Record<Side, number>> = {}
  // 십자 사방(4칸)에는 좋은 타일부터, 5장을 넘어 남는 타일은 추가 타일(영토)이 된다
  hand
    .filter((c) => c.id !== best.id)
    .sort((a, b) => tileScore(p, b) - tileScore(p, a))
    .slice(0, SIDES.length)
    .forEach((c, i) => {
      sideTiles[SIDES[i]] = c.id
    })
  return { type: 'buildCity', cityTileId: best.id, sideTiles }
}

function placements(p: Player, reserveFree: number): { cityId: number; tileId: number }[] {
  const out: { cityId: number; tileId: number }[] = []
  let budget = Math.max(0, totalWorkers(p) - p.busyWorkers - (p.held || p.scouting ? 1 : 0) - reserveFree)
  for (const city of p.cities) {
    const tiles = city.tiles
      .filter((t) => t.role !== 'city' && (t.occupiedBy === undefined || t.occupiedBy === p.id))
      .sort((a, b) => tileScore(p, b.card) - tileScore(p, a.card))
    for (const t of tiles.slice(0, Math.min(city.workers, budget))) {
      out.push({ cityId: city.id, tileId: t.card.id })
      budget--
    }
  }
  return out
}

// ───── 차례 계획기 ─────
// 자원은 모아 둘 수 없고 문턱(카드 비용·성장선·기술 비용)에 닿아야 쓸모가 있다. 그래서 타일을 고정 가중치로 고르지 않고,
// 배치 후보를 열거해 문턱 기준으로 어림한 뒤 상위 몇 개를 엔진으로 차례 끝까지 실제로 돌려 보고 고른다.

/** 도시 하나에서 열거할 배치 조합의 상한 (넘으면 좋은 타일 묶음만 남긴다) */
const PLAN_MAX_COMBOS = 400

type Placed = { cityId: number; tileId: number }
interface CityPlan {
  cityId: number
  placed: Placed[]
  food: number
  hammer: number
  science: number
  gold: number
}

/** 한 도시의 배치 조합: 산출이 같은 타일을 묶어 일꾼 k명을 놓는 경우를 모두 센다 (산출 합이 같은 조합은 하나만) */
function cityPlans(p: Player, city: Player['cities'][number], k: number, base: { food: number; hammer: number }): CityPlan[] {
  const ctx = ctxOf(p)
  const groups = new Map<string, { y: ReturnType<typeof tileYield>; ids: number[]; score: number }>()
  for (const t of city.tiles) {
    if (t.role === 'city' || (t.occupiedBy !== undefined && t.occupiedBy !== p.id)) continue
    const y = tileYield(t.card, ctx)
    const key = `${y.food},${y.hammer},${y.science},${y.gold}`
    const g = groups.get(key) ?? { y, ids: [], score: tileScore(p, t.card) }
    g.ids.push(t.card.id)
    groups.set(key, g)
  }
  let list = [...groups.values()].sort((a, b) => b.score - a.score)
  const combos = (gs: typeof list): number => {
    // 조합 수 어림: 묶음마다 0..min(장수, k)
    let n = 1
    for (const g of gs) n *= Math.min(g.ids.length, k) + 1
    return n
  }
  while (list.length > 1 && combos(list) > PLAN_MAX_COMBOS * 4) list = list.slice(0, -1)
  const out = new Map<string, CityPlan>()
  const counts: number[] = []
  const walk = (i: number, left: number) => {
    if (i === list.length || left === 0) {
      const placed: Placed[] = []
      const y = { food: base.food, hammer: base.hammer, science: 0, gold: 0 }
      list.forEach((g, j) => {
        for (let n = 0; n < (counts[j] ?? 0); n++) {
          placed.push({ cityId: city.id, tileId: g.ids[n] })
          y.food += g.y.food
          y.hammer += g.y.hammer
          y.science += g.y.science
          y.gold += g.y.gold
        }
      })
      if (ctx.techs.has('robotics')) y.hammer = Math.max(y.hammer, 10)
      const key = `${y.food},${y.hammer},${y.science},${y.gold}`
      if (!out.has(key) && out.size < PLAN_MAX_COMBOS) out.set(key, { cityId: city.id, placed, ...y })
      return
    }
    // 남은 묶음에 다 놓을 수 없으면 이 묶음에서 더 놓아야 한다: 일꾼은 빠짐없이 놓는다 (산출은 음수가 없다)
    const rest = list.slice(i + 1).reduce((n, g) => n + g.ids.length, 0)
    for (let c = Math.min(left, list[i].ids.length); c >= Math.max(0, left - rest); c--) {
      counts[i] = c
      walk(i + 1, left - c)
    }
    counts[i] = 0
  }
  walk(0, k)
  return [...out.values()]
}

/** 도시별로 망치를 쓸 수 있는 곳: 만들 수 있는 군사 카드의 비용, 투자할 수 있는 불가사의는 최소 망치를 음수로 */
function hammerUse(s: GameState, p: Player): Map<number, number[]> {
  const out = new Map<number, number[]>()
  for (const city of p.cities) {
    const costs: number[] = []
    for (const o of cardOptions(p)) {
      if (o.def.notBattle || o.def.special === 'coastalOnly' || (!o.unique && heldCount(p, o.def.id) >= holdLimit(p, o.def.id)) || !producible(s, p, o.def.id, o.unique, city)) continue
      costs.push(cardCost(p, o.def, o.unique ? uniqueOf(p, o.unique) : undefined))
    }
    for (const w of investableWonders(s, p, city)) costs.push(-minHammers(p, w)) // 음수: 불가사의 최소 망치
    out.set(city.id, costs)
  }
  return out
}

/** 차례 계획기가 배치를 엔진으로 시험하는 중인가 */
let planning = false

/** 일꾼 하나가 늘거나 줄 때의 가치: 일꾼은 앞으로 여러 차례 타일 하나만큼 산출한다 (차례 수 어림) */
const PLAN_WORKER_TURNS = 3

/** 타일 한 장의 평균 가치 (일꾼이 늘거나 줄 때 쓴다) */
function workerValue(p: Player): number {
  const tiles = p.cities.flatMap((c) => c.tiles).filter((t) => t.role !== 'city')
  const avg = tiles.length ? tiles.reduce((n, t) => n + tileScore(p, t.card), 0) / tiles.length : 3
  return avg * PLAN_WORKER_TURNS
}

/**
 * 배치 조합 하나의 문턱 기준 어림 가치 (엔진을 돌리지 않는다).
 * 자원은 문턱에 닿아 실제로 쓰인 몫만 센다: 산 기술의 비용, 만든 카드의 비용(또는 불가사의 투자), 성장·감소, 승급.
 * 남아서 사라지는 몫은 0이다. 자원 한 단위의 가치는 지금 타일을 고르는 가중치(yieldWeights)를 그대로 쓴다.
 */
function roughPlanValue(p: Player, plans: CityPlan[], science: number, gold: number, techCosts: number[], uses: Map<number, number[]>): number {
  const W = yieldWeights(p)
  const wv = workerValue(p)
  let v = 0
  const cap = happiness(p)
  const workers = totalWorkers(p)
  // 생산: 도시마다 망치로 닿는 가장 비싼 카드, 또는 불가사의 투자 (망치 전부)
  for (const c of plans) {
    let used = 0
    for (const x of uses.get(c.cityId)!) {
      if (x >= 0 && x <= c.hammer) used = Math.max(used, x)
      else if (x < 0 && -x <= c.hammer) used = Math.max(used, c.hammer)
    }
    v += used * W.hammer
  }
  // 성장: 식량 정산 (기술을 위해 바꾼 식량은 뺀다)
  const growth = (conv: number): number => {
    let g = 0
    let left = conv
    let n = workers
    for (const c of plans) {
      const w = p.cities.find((x) => x.id === c.cityId)!.workers
      const take = Math.min(left, Math.max(0, c.food - w))
      left -= take
      const f = c.food - take
      if (f < w && p.policy !== 'liberty') g -= wv
      else if (f >= 2 * w && n < cap) {
        g += wv
        n++
      }
    }
    return g
  }
  // 연구: 과학(+ 문자가 있으면 일꾼 유지분을 넘는 식량)으로 닿는 가장 비싼 기술
  const spare = p.techs.includes('writing') ? plans.reduce((n, c) => n + Math.max(0, c.food - p.cities.find((x) => x.id === c.cityId)!.workers), 0) : 0
  let best = growth(0)
  for (const cost of techCosts) {
    if (cost > science + spare) continue
    const conv = Math.max(0, cost - science)
    best = Math.max(best, (cost - conv) * W.science + conv * W.food + W.science + growth(conv))
  }
  v += best
  // 금: 승급 비용(카드 비용 3~10)에 닿으면
  if (gold >= 3 && p.military.length) v += Math.min(gold, 10) * W.gold
  return v
}

/** 엔진으로 끝까지 돌린 차례의 실제 가치 (roughPlanValue와 같은 잣대): 산 기술, 쓴 망치, 일꾼 증감, 승급에 쓴 금 */
function playedValue(s0: GameState, pid: number, placement: Placed[]): number {
  const p0 = s0.players[pid]
  const W = yieldWeights(p0)
  const wv = workerValue(p0)
  let s = apply(s0, { type: 'placeWorkers', placements: placement })
  const gold0 = s.players[pid].turn!.yields.gold
  const key = turnKey(s0)
  let v = 0
  planning = true
  try {
    for (let i = 0; i < 60; i++) {
      if (s.phase === 'over' || s.phase === 'battle' || turnKey(s) !== key || actorOf(s) !== pid) break
      const { state, action } = aiStep(s)
      const p = s.players[pid]
      if (action.type === 'produce') v += cardCost(p, cardById(action.defId), action.unique ? uniqueOf(p, action.unique) : undefined) * W.hammer
      else if (action.type === 'invest') v += action.hammers * W.hammer
      else if (action.type === 'research') {
        const cost = TECHS.find((t) => t.id === action.techId)?.cost ?? 0
        const conv = Math.min(cost, action.foodToScience ?? 0)
        v += (cost - conv) * W.science + conv * W.food + W.science
      }
      s = state
    }
  } finally {
    planning = false
  }
  const p1 = s.players[pid]
  v += (totalWorkers(p1) - totalWorkers(p0)) * wv
  if (p1.turn) v += (gold0 - p1.turn.yields.gold) * W.gold
  return v
}

/** 문턱 기준으로 고른 일꾼 배치. 어림 1등이 지금 배치(타일 점수 순)와 다를 때만 엔진으로 둘을 끝까지 돌려 비교한다 */
function plannedPlacements(s: GameState, p: Player, reserveFree: number): Placed[] | null {
  if (!p.cities.length || aiStyle !== 'default') return null
  let budget = Math.max(0, totalWorkers(p) - p.busyWorkers - (p.held || p.scouting ? 1 : 0) - reserveFree)
  const q = structuredClone(p)
  for (const c of q.cities) {
    c.placed = []
    c.enemyPlaced = []
    c.generalPlaced = []
  }
  const base = computeYields(q)
  const perCity: CityPlan[][] = []
  for (const city of p.cities) {
    const k = Math.min(city.workers, budget)
    budget -= k
    perCity.push(cityPlans(p, city, k, base.cities.find((c) => c.cityId === city.id)!))
  }
  // 도시가 둘 이상이면 조합이 곱해지므로 도시마다 앞쪽(좋은 타일 순) 일부만 남긴다
  while (perCity.reduce((n, l) => n * l.length, 1) > PLAN_MAX_COMBOS * 2) {
    const big = perCity.reduce((a, l, i) => (l.length > perCity[a].length ? i : a), 0)
    perCity[big] = perCity[big].slice(0, Math.ceil(perCity[big].length / 2))
  }
  let combos: CityPlan[][] = [[]]
  for (const l of perCity) combos = combos.flatMap((c) => l.map((x) => [...c, x]))
  if (combos.length <= 1) return null
  const techCosts = [...new Set(researchableTechs(s).map((t) => t.cost))]
  const uses = hammerUse(s, p)
  const value = (c: CityPlan[]) => roughPlanValue(p, c, base.science + c.reduce((n, x) => n + x.science, 0), base.gold + c.reduce((n, x) => n + x.gold, 0), techCosts, uses)
  let top = combos[0]
  let topV = -Infinity
  for (const c of combos) {
    const v = value(c)
    if (v > topV + 1e-9) {
      top = c
      topV = v
    }
  }
  const greedy = placements(p, reserveFree)
  const planned = top.flatMap((c) => c.placed)
  // 산출이 같으면(같은 타일 묶음) 지금 배치를 그대로 쓴다
  const sig = (pl: Placed[]) => {
    const y = { food: 0, hammer: 0, science: 0, gold: 0 }
    for (const x of pl) {
      const t = p.cities.find((c) => c.id === x.cityId)!.tiles.find((t) => t.card.id === x.tileId)!
      const ty = tileYield(t.card, ctxOf(p))
      y.food += ty.food
      y.hammer += ty.hammer
      y.science += ty.science
      y.gold += ty.gold
    }
    return `${pl.map((x) => x.cityId).sort().join()}|${y.food},${y.hammer},${y.science},${y.gold}`
  }
  if (sig(planned) === sig(greedy)) return null
  try {
    return playedValue(s, p.id, planned) > playedValue(s, p.id, greedy) + 1e-9 ? planned : null
  } catch (e) {
    if (!(e instanceof RuleError)) throw e
    return null
  }
}

/** 목표 기술들까지 아직 연구하지 못한 선행 기술(목표 포함) 목록 */
function missingFor(p: Player, goals: string[]): Set<string> {
  const missing = new Set<string>()
  const visit = (id: string) => {
    if (p.techs.includes(id) || missing.has(id)) return
    missing.add(id)
    for (const pre of TECHS.find((t) => t.id === id)?.prereqs ?? []) visit(pre)
  }
  for (const g of goals) visit(g)
  return missing
}
const apolloMissing = (p: Player): Set<string> => missingFor(p, ['apollo'])
/** 문화 승리: 세계화와 냉각기술 (관광 = 문화 3당 1씩 두 번) */
const cultureMissing = (p: Player): Set<string> => missingFor(p, ['globalization', 'refrigeration'])

/**
 * 극후반 계획: 아폴로까지 남은 기술이 적으면 과학 승리(자유 + 식량 전부를 과학으로),
 * 세계화·냉각기술까지 남은 기술이 적고 내 관광이 상대 문화를 넘을 가망이 있으면 문화 승리(평등 + 관광 기술 연속).
 * 둘 다 가까우면 더 가까운 쪽(같으면 문화)으로 간다.
 */
function lateGame(p: Player, s?: GameState): 'apollo' | 'culture' | null {
  if (aiStyle !== 'default') return null
  const apollo = apolloMissing(p).size
  const culturePath = cultureMissing(p).size
  let viable = true
  if (s) {
    const rivals = s.players.filter((o) => o.id !== p.id && !o.eliminated && o.cities.length > 0)
    const reach = 3 * Math.floor(culture(p) / 3) + AI_TUNE.cultureSlack // 세계화·냉각기술·평등이 각각 문화 3당 1
    viable = rivals.length > 0 && Math.max(...rivals.map((o) => culture(o))) < reach
  }
  const cultureOk = AI_TUNE.cultureRush > 0 && culturePath <= AI_TUNE.cultureRush && viable
  const apolloOk = apollo <= AI_TUNE.apolloRush
  if (cultureOk && (!apolloOk || culturePath <= apollo)) return 'culture'
  return apolloOk ? 'apollo' : null
}
/** 지금 행동을 정하는 문명의 계획 (aiCandidates가 매번 정한다) */
let plan: 'apollo' | 'culture' | null = null
const rushingApollo = (_p: Player): boolean => plan === 'apollo'
const rushingCulture = (_p: Player): boolean => plan === 'culture'

/** 번성형 기술 순서: 나침반 → 과학·식량 산출을 키우는 기술과 행복(일꾼 상한) 기술 → 인쇄기술(두 번째 도시) → 나머지는 싼 것부터 넓게 */
const COMPASS_CHAIN = new Set(['sailing', 'optics', 'compass'])
/** 해금 기술이 산출을 올려 주는 자원 (자원 카드에 적힌 boosts 기준) */
function boostTechValue(p: Player, techId: string): number {
  let v = 0
  for (const c of p.cities) {
    for (const tile of c.tiles) {
      const r = tile.card.resource ? RESOURCES[tile.card.resource] : undefined
      if (!r) continue
      if (r.luxuryTech === techId) v += 40 // 사치 자원: 행복 +1 = 일꾼 상한 +1
      for (const b of r.boosts ?? []) if (b.tech === techId) v += 12 * (b.yield.food ?? 0) + 8 * (b.yield.hammer ?? 0) + 14 * (b.yield.science ?? 0)
    }
  }
  return v
}

/** 이번 차례에 망치를 쓸 곳(만들 수 있는 군사 카드나 투자할 불가사의)이 하나도 없다 (researchCandidates가 정한다) */
let idleHammers = false
/** 군사 카드를 열어 주는 기술 */
const unlocksCard = (techId: string): boolean => MILITARY_CARDS.some((c) => c.tech === techId && !c.uniqueOnly && !c.notBattle)

function buildPriority(p: Player, t: TechDef): number {
  // 망치를 쓸 곳이 없으면 군사 카드를 여는 비용 0 기술(농업·궁술·청동기술·목축업)을 나침반보다 먼저 연다
  if (idleHammers && t.cost === 0 && unlocksCard(t.id)) return 350
  if (p.techs.includes('compass') === false && COMPASS_CHAIN.has(t.id)) return 300
  let v = boostTechValue(p, t.id)
  const mountainFirstCity = !!p.cities[0]?.tiles.some((x) => (x.role === 'city' || x.role === 'side') && x.card.terrains.includes('산'))
  if (t.id === 'writing') v += 90 // 식량을 과학으로 바꿀 수 있다
  if (t.id === 'astronomy' && mountainFirstCity) v += 80 // 과학 +5
  if (t.id === 'printing_press') v += 70
  if (t.id === 'economics') v += 15
  if (t.id === 'radar') v -= 60 // 정책이 전제정치로 바뀐다 (아폴로 질주 때만 감수)
  // 고유 유닛이 초반에 열리는 문명은 그 길이 최우선, 고유 유닛 시대에는 장군(기마술)을 일찍 얻어 상대 좋은 타일을 압박한다
  if (uniqueRoute(p)?.has(t.id)) v += 400
  // 전쟁광은 도시를 칠 공성 카드(대포)를 서둘러 연다 (훈족은 고유 유닛 공성추)
  if (isWarlord(p) && warFoundation(p) && !hasSiege(p) && siegeRoute(p).has(t.id)) v += 200
  if (t.id === 'horseback' && (inUniqueEra(p) || !!uniqueRoute(p))) v += 150
  return v
}

function techPriority(t: TechDef, rush?: Set<string>, p?: Player): number {
  // 평소에는 싼 기술부터 넓게 (고점을 보고 번성), 아폴로 질주 때는 선행 기술을 우선
  let v = (rush ? t.cost : -t.cost) + (rush?.has(t.id) ? 500 : 0) + (p && !rush ? buildPriority(p, t) : 0)
  for (const e of t.effects) {
    if (e.kind === 'foodToScience') v += 5
    else if (e.kind === 'secondCity') v += 8
    else if (e.kind === 'culture') v += 4
    else if (e.kind === 'tourismPerCulture') v += rush ? 0 : 60 // 관광이 상대 문화를 넘으면 문화 승리
    else if (e.kind === 'policy') v += p && isWarlord(p) && warFoundation(p) ? 20 : 3 // 전쟁광: 전제정치를 고를 때마다 장군 +1
    else if (e.kind === 'hammerToScience') v += 3
    else if (e.kind === 'sciencePerTurn') v += e.amount * 10
    else if (e.kind === 'general') v += p && isWarlord(p) && warFoundation(p) ? 40 : 2
    else if (e.kind === 'scienceVictory') v += 1000
  }
  // 전쟁광은 새 군사 카드를 열어 주는 기술을 서두른다
  if (p && isWarlord(p)) v += MILITARY_CARDS.filter((c) => c.tech === t.id && !c.uniqueOnly && !c.notBattle).length * 10
  return v
}

function researchCandidates(s: GameState, p: Player): Action[] {
  const turn = p.turn!
  const food = turn.yields.cities.reduce((n, c) => n + c.food, 0)
  const hammers = turn.yields.cities.reduce((n, c) => n + c.hammer, 0)
  const out: Action[] = []
  const rush = rushingCulture(p)
    ? cultureMissing(p)
    : rushingApollo(p)
      ? apolloMissing(p)
      : cultureFirst(p) && !p.techs.includes('acoustics')
        ? missingFor(p, ['acoustics']) // 문화가 급하면 음향학(문화 +1)부터
        : undefined
  idleHammers = [...hammerUse(s, p).values()].every((costs) => costs.length === 0)
  const techs = researchableTechs(s).sort((a, b) => techPriority(b, rush, p) - techPriority(a, rush, p))
  for (const t of techs) {
    let need = t.cost - turn.yields.science
    let foodConv = 0
    let hammerConv = 0
    if (need > 0 && p.techs.includes('writing')) {
// 자유 정책에서는 일꾼을 굶겨도 잃지 않으므로 식량을 전부 과학으로 돌릴 수 있다
      // 전쟁광이 공성 카드(대포)를 여는 화학은 일꾼 몇 명을 잃더라도 식량을 모두 과학으로 돌려 연구한다
      const spare = p.policy === 'liberty' || (isWarlord(p) && warFoundation(p) && t.id === 'chemistry' && !hasSiege(p) && siegeRoute(p).has(t.id)) ? food : food - totalWorkers(p)
      foodConv = Math.min(need, Math.max(0, spare))
      need -= foodConv
    }
    if (need > 0 && canHammerScience(p)) {
      hammerConv = Math.min(2, hammers, need)
      need -= hammerConv
    }
    if (need <= 0) out.push({ type: 'research', techId: t.id, foodToScience: foodConv, hammerToScience: hammerConv })
  }
  out.push({ type: 'skipResearch' })
  return out
}

/** 전쟁광 문명(훈족·줄루·그리스·몽골): 전제정치로 장군을 모으고 군대를 많이 뽑아, 한 상대를 골라 좋은 타일을 선점령한 뒤 도시를 공격해 탈락시킨다 */
const WARLORDS = new Set(['huns', 'zulu', 'greece', 'mongolia'])
const isWarlord = (p: Player): boolean => AI_TUNE.warlord && WARLORDS.has(p.civId)
/** 전쟁광도 기반(영토 7타일 이상, 일꾼 4명 이상)이 없으면 미학 등 성장 정책으로 먼저 키운다 */
const warFoundation = (p: Player): boolean => p.cities.reduce((n, c) => n + c.tiles.length, 0) >= 7 && totalWorkers(p) >= 4
/** 산업시대(비용 6열 이상 기술)가 열리기 전: 이때까지 군대로 몰아붙인다 */
const preIndustrial = (s: GameState): boolean => !s.players.some((o) => !o.eliminated && o.techs.some((id) => (TECHS.find((t) => t.id === id)?.column ?? 0) >= 6))
/** 연합: 1등이 아닌 문명은 모두 1등을 견제한다 (1등 자신은 해당 없음) */
function coalitionLeader(s: GameState, p: Player): Player | null {
  const top = AI_TUNE.coalition ? rankTop(s) : null
  return top && p.id !== top.leader.id ? top.leader : null
}
/** 상대의 공격 대상 도시 (두 번째 도시가 있으면 그쪽을 먼저 무너뜨려야 한다) */
const sidesOccupied = (o: Player): number => conquestCity(o).tiles.filter((t) => t.role === 'side' && t.occupiedBy !== undefined).length
/** 그 도시 사면 중 내 장군이 점령한 칸 수 (도시 공격은 사면에 장군이 가장 많은 문명만, 공동이면 모두) */
const sidesMine = (o: Player, pid: number): number => conquestCity(o).tiles.filter((t) => t.role === 'side' && t.occupiedBy === pid).length
/** 이 문명이 노리는 한 상대: 이미 점령한 타일이 많고(꾸준히), 군대가 약하고, 전통으로 일꾼을 줄여 약해진 상대 */
function warlordVictim(s: GameState, p: Player): number | null {
  const occupied = occupiedTiles(s, p)
  const open = new Set(declarationTargets(s, p).filter((t) => t.kind !== 'retake').map((t) => t.defenderId))
  let rivals = s.players.filter((o) => o.id !== p.id && !o.eliminated && o.cities.length > 0)
  if (!rivals.length) return null
  // 지금 선전포고할 수 있는 타일이 있는 상대만
  if (rivals.some((o) => open.has(o.id))) rivals = rivals.filter((o) => open.has(o.id))
  const score = (o: Player) =>
    occupied.filter((t) => t.defenderId === o.id).length * 4 + (o.policy === 'tradition' ? 3 : 0) + (coalitionLeader(s, p)?.id === o.id ? 6 : 0) + sidesOccupied(o) * 2 - strengthOf(o) * 0.4 - standing(o) * 0.05
  return rivals.sort((x, y) => score(y) - score(x) || x.id - y.id)[0].id
}
/** 전투에 내는 상위 4장의 힘 (체력 + 공격력×2): 서로 4장씩이면 동점은 수비가 이기므로 앞서야 공격한다 */
function strengthOf(p: Player): number {
  return p.military
    .map((c) => {
      const st = cardStats(c)
      return st.hp === undefined ? 0 : st.hp + (st.choose ?? st.marks[0]?.power ?? st.markPower ?? 0) * 2
    })
    .sort((x, y) => y - x)
    .slice(0, 4)
    .reduce((n, v) => n + v, 0)
}
/** 상대 도시 중 공격 대상이 될 도시 (두 번째 도시가 있으면 그쪽을 먼저 무너뜨려야 한다) */
const conquestCity = (o: Player) => (o.cities.length > 1 ? o.cities[o.cities.length - 1] : o.cities[0])

const armyOf = (p: Player): number => p.military.filter((c) => cardStats(c).hp !== undefined).length

/** 상대(또는 내) 타일이 그 주인에게 주는 망치 */
function tileHammers(s: GameState, ownerId: number, cityId: number, tileId: number): number {
  const owner = s.players[ownerId]
  const card = findTile(owner, cityId, tileId)?.tile.card
  return card ? tileYield(card, ctxOf(owner)).hammer : 0
}
/** 전쟁광이 탈락시키려는 상대의 망치 타일 (망치 2 이상): 계속 점령해 그 상대가 반격할 군사 카드를 못 뽑게 한다 */
const HAMMER_HOLD = 2
/** 견제형이 보는 상대 타일의 가치: 중요도에 망치를 크게 더한다 (고생산 타일 강제 점거) */
const harassValue = (s: GameState, ownerId: number, cityId: number, tileId: number): number =>
  tileImportance(s, ownerId, cityId, tileId) + AI_TUNE.harassHammer * tileHammers(s, ownerId, cityId, tileId)

/**
 * 견제형 문명: 정복(도시 공격)은 하지 않지만, 고유 유닛을 들고 있거나 같은 시대 상대들보다 군사력이 충분히 앞서
 * 장군 한두 개로 상대 타일을 오래 점령해 방해한다. 전쟁광은 해당 없다 (한 상대를 골라 탈락시킨다).
 */
function isHarasser(s: GameState, p: Player): boolean {
  if (!AI_TUNE.harass || isWarlord(p) || armyOf(p) < 2) return false
  const rivals = s.players.filter((o) => o.id !== p.id && !o.eliminated && o.cities.length > 0)
  if (!rivals.length) return false
  if (p.military.some((c) => c.unique && cardStats(c).hp !== undefined)) return true
  const avg = rivals.reduce((n, o) => n + strengthOf(o), 0) / rivals.length
  return strengthOf(p) >= AI_TUNE.harassEdge * Math.max(1, avg)
}
/** 견제형이 노릴 상대: 셋 이상이면 1등(내가 1등이면 2등)을 우선한다. 둘뿐이면 남은 상대 */
function harassTarget(s: GameState, p: Player): Player | null {
  const top = rankTop(s)
  if (top) return p.id === top.leader.id ? top.runnerUp : top.leader
  return s.players.find((o) => o.id !== p.id && !o.eliminated && o.cities.length > 0) ?? null
}
/** 상대의 아직 점령되지 않은 땅 중 가장 중요한 타일 (도시 타일 제외) */
function bestOpenTile(s: GameState, o: Player): { cityId: number; tileId: number; v: number } | null {
  let best: { cityId: number; tileId: number; v: number } | null = null
  for (const c of o.cities) {
    for (const t of c.tiles) {
      if (t.role === 'city' || t.occupiedBy !== undefined) continue
      const v = harassValue(s, o.id, c.id, t.card.id)
      if (!best || v > best.v) best = { cityId: c.id, tileId: t.card.id, v }
    }
  }
  return best
}
/**
 * 견제형의 장군 옮기기: 점령한 타일은 오래 들고 있는 것이 기본이다. 쓸 장군이 없을 때만 하나를 불러들인다.
 * 1) 점령 중인 상대가 더는 노릴 상대(1등)가 아니면 그 장군부터 불러들여 새 1등으로 옮긴다.
 * 2) 노릴 상대가 문화·기술로 훨씬 좋은 타일을 얻었으면 가장 덜 중요한 점령을 풀어 그 타일로 옮긴다.
 * 어느 쪽이든 옮겨 갈 타일에서 이길 가망이 없으면 장군을 놀리지 않고 지금 점령을 그대로 둔다.
 * 회수는 일꾼 배치 단계에서 하고, 회수한 장군은 그 차례 선전포고가 바로 그 타일을 고른다 (판 사이 기억 없이 매 차례 다시 계산한다).
 */
function harassRecalls(s: GameState, p: Player): Action[] {
  if (p.generals - p.generalWorkers + p.returningGenerals >= 1) return []
  const target = harassTarget(s, p)
  if (!target) return []
  const occ = occupiedTiles(s, p).map((t) => ({ t, v: harassValue(s, t.defenderId, t.cityId, t.tileId) }))
  if (!occ.length) return []
  const best = bestOpenTile(s, target)
  if (!best) return []
  const offTarget = occ.filter((x) => x.t.defenderId !== target.id).sort((a, b) => a.v - b.v)
  const pick = offTarget[0] ?? [...occ].sort((a, b) => a.v - b.v)[0]
  if (!offTarget.length && best.v < pick.v + AI_TUNE.harassMargin) return []
  if (battleOdds(s, p, { defenderId: target.id, cityId: best.cityId, tileId: best.tileId, kind: 'normal' }) < ODDS_NEEDED.normal) return []
  return [{ type: 'recallGeneral', ...pick.t }]
}

/** 이웃이 군사를 가졌으면 그만큼(최대 4장, 최소 2장) 수비 군사를 갖춰야 한다 */
/** 이번 라운드에 나를 노린 선전포고가 있다 */
const underAttack = (s: GameState, p: Player): boolean => s.declarations.some((d) => d.defenderId === p.id)

function defenseTarget(s: GameState, p: Player): number {
  const enemy = Math.max(0, ...s.players.filter((o) => o.id !== p.id && !o.eliminated).map(armyOf))
  return enemy > 0 ? Math.min(4, Math.max(2, enemy)) : 0
}

/** 고유 유닛이 열리는 기술 (고유 유닛 자신의 기술, 없으면 바탕 카드의 기술) */
function uniqueTechs(p: Player): string[] {
  return civById(p.civId).uniques.map((u) => u.tech ?? cardById(u.base).tech)
}
/** 가장 빨리 열 수 있는 고유 유닛 기술이 초반(4칸 이내)이면 그 길을 최우선으로 탄다 */
function uniqueRoute(p: Player): Set<string> | undefined {
  const open = uniqueTechs(p).filter((id) => !p.techs.includes(id))
  if (open.length === 0) return undefined
  const early = open.map((id) => TECHS.find((t) => t.id === id)!).filter((t) => t.column <= 4).sort((a, b) => a.column - b.column)[0]
  if (!early) return undefined
  const need = new Set<string>()
  const visit = (id: string) => {
    if (p.techs.includes(id) || need.has(id)) return
    need.add(id)
    for (const pre of TECHS.find((t) => t.id === id)?.prereqs ?? []) visit(pre)
  }
  visit(early.id)
  return need
}
/** 한 기술까지 아직 연구하지 않은 선행 기술 묶음 */
function routeTo(p: Player, techId: string): Set<string> {
  const need = new Set<string>()
  const visit = (id: string) => {
    if (p.techs.includes(id) || need.has(id)) return
    need.add(id)
    for (const pre of TECHS.find((t) => t.id === id)?.prereqs ?? []) visit(pre)
  }
  visit(techId)
  return need
}
/** 도시 공격에는 공성 카드가 필요하다 (대포·야포, 훈족은 공성추) */
/** 전쟁광이 공성 카드를 열려고 연구해야 하는 기술 (훈족은 고유 유닛 공성추가 있어 해당 없음) */
const siegeRoute = (p: Player): Set<string> => (civById(p.civId).uniques.some((u) => u.name === '공성추') ? new Set() : routeTo(p, 'chemistry'))
const hasSiege = (p: Player): boolean => p.military.some((c) => cardStats(c).siege)
/** 고유 유닛 시대: 고유 유닛 기술을 열었다 */
const inUniqueEra = (p: Player): boolean => uniqueTechs(p).some((id) => p.techs.includes(id))

type Policy = 'aesthetics' | 'tradition' | 'rationalism' | 'liberty' | 'despotism' | 'equality' | 'regime' | 'diplomacy'
const POLICY_PREFERENCE: Policy[] = ['aesthetics', 'tradition', 'rationalism', 'liberty', 'despotism', 'equality', 'regime', 'diplomacy']

/** 만들 수 있는 카드 후보: 비싼 순, 같은 값이면 고유 유닛을 먼저 (고유 유닛은 일반 카드보다 강하다) */
function cardOptions(p: Player): { def: (typeof MILITARY_CARDS)[number]; unique?: string; cost: number }[] {
  const opts: { def: (typeof MILITARY_CARDS)[number]; unique?: string; cost: number }[] = MILITARY_CARDS.map((def) => ({ def, cost: def.cost }))
  for (const u of civById(p.civId).uniques) opts.push({ def: cardById(u.base), unique: u.name, cost: u.cost })
  return opts.sort((a, b) => b.cost - a.cost || Number(!!b.unique) - Number(!!a.unique))
}

/**
 * 정책 고르기: 과학이 모자라 기술을 못 연구할 지경이면 합리주의·자유로, 아니면 미학·전통으로 번성한다.
 * 과학 가능량 = 기본 과학 + (식량을 과학으로 바꿀 수 있으면) 남는 식량. 자유는 식량 전부, 합리주의는 +4(한국 +6).
 */
/** 이 정도 타일(영토)이 있으면 문화보다 과학을 챙긴다 */
const TERRITORY_OK = 10

/** 후반에 크게 터지는 자원 타일 (기술이 열리면 산출이 크게 늘어난다) */
const LATE_RESOURCES = new Set(['oil', 'coal', 'uranium', 'aluminum'])
/** 정책 조건이 걸려 있어 그 정책이어야만 지을 수 있는 중요한 불가사의 (미학: 루브르) */
const MUST_BUILD_WONDERS: Record<string, Policy> = { louvre: 'aesthetics' }
/** 영토 타일 한 장의 평균 가치가 이보다 낮으면 타일이 좋지 못하다고 본다 */
const POOR_TILES = 2.6

/**
 * 문화를 최우선으로 노릴 때: 영토 타일이 시원치 않거나, 일꾼이 행복 상한만큼 다 찼다.
 * 성장할 길이 막혔으니 새 타일을 문화로 얻어야 한다 (음향학 연구, 시스티나 성당).
 */
function cultureFirst(p: Player): boolean {
  if (!p.cities.length) return false
  const territory = p.cities.flatMap((c) => c.tiles).filter((t) => t.role !== 'city')
  const avg = territory.length ? territory.reduce((n, t) => n + weight(tileYield(t.card, ctxOf(p))), 0) / territory.length : 0
  return (territory.length >= 3 && avg < POOR_TILES) || totalWorkers(p) >= happiness(p)
}

/** 정책을 고른 이유 (시뮬레이션 통계용) */
export const aiDebug = { policyReason: '' }

function policyOrder(s: GameState, p: Player): Policy[] {
  const turn = p.turn
  const food = turn ? turn.yields.cities.reduce((n, c) => n + c.food, 0) : 0
  const base = turn ? turn.yields.science - (p.policy === 'rationalism' ? rationalismScience(p.civId) : 0) : 0
  const writing = p.techs.includes('writing')
  const cheapest = Math.min(...researchableTechs(s).map((t) => t.cost), 99)
  const withNone = base + (writing ? Math.max(0, food - totalWorkers(p)) : 0)
  // 앞으로 만날 비용 10대 기술을 감당할 수 있는지 (번성 뒤에도 막히지 않도록 여유 있게)
  const need = Math.max(cheapest, AI_TUNE.policyNeed)
  // 맨 처음 고르는 정책은 전통 아니면 미학으로 고정한다: 당장 남는 식량(식량 − 일꾼)이 없으면 미학, 있으면 전통.
  if ((p.policyPicks ?? 0) === 0) {
    aiDebug.policyReason = '첫 정책'
    return food - totalWorkers(p) > 0 ? ['tradition', 'aesthetics', ...POLICY_PREFERENCE] : ['aesthetics', 'tradition', ...POLICY_PREFERENCE]
  }
  // 평등 한 번으로 관광이 상대의 문화를 넘어 탈락시킬 수 있으면 (아폴로 질주 중이어도) 평등
  if (p.policy !== 'equality') {
    const gain = Math.floor(culture(p) / 3)
    const now = tourism(p)
    if (s.players.some((o) => o.id !== p.id && !o.eliminated && o.cities.length > 0 && culture(o) >= now && culture(o) < now + gain)) return ['equality', ...POLICY_PREFERENCE]
  }
  // 초반: 미학으로 문화(= 새 타일)를 늘려 영토를 넓히는 게 먼저. 자유만 고집하면 영토가 안 늘고 일꾼도 안 늘어 막힌다.
  // 식량이 넉넉해 일꾼 3개쯤은 금방 되살아나면 전통, 아니면 미학. 후반(아폴로 질주)에는 자유.
  // 문화 질주: 평등으로는 식량→과학 변환이 줄어든다. 남은 관광 기술을 평등 아래서도 한 차례에 연구할 수 있을 때만 평등,
  // 아니면 자유로 과학부터 몰아 올린다 (평등에 갇혀 과학이 멈추는 일 방지)
  if (rushingCulture(p)) {
    const costs = [...cultureMissing(p)].map((id) => TECHS.find((t) => t.id === id)!.cost)
    return withNone >= Math.max(0, ...costs) ? ['equality', ...POLICY_PREFERENCE] : ['liberty', 'rationalism', ...POLICY_PREFERENCE]
  }
  if (rushingApollo(p)) return ['liberty', 'rationalism', ...POLICY_PREFERENCE]
  // 전쟁광: 기반이 갖춰졌으면(영토·일꾼) 타일이 괜찮거나 상대가 전통으로 약해졌을 때 전제정치(장군 +1, 선전포고에 일꾼 불필요), 타일이 모자라면 미학으로 타협한다.
  // 기반이 없으면 아래 성장 정책 규칙을 따르고, 과학·문화 질주 중에도 그쪽을 우선한다 (산업시대 전까지)
  if (isWarlord(p) && preIndustrial(s) && warFoundation(p)) {
    const terr = p.cities.flatMap((c) => c.tiles).filter((t) => t.role !== 'city')
    const avg = terr.length ? terr.reduce((n, t) => n + weight(tileYield(t.card, ctxOf(p))), 0) / terr.length : 0
    const weakRival = s.players.some((o) => o.id !== p.id && !o.eliminated && o.policy === 'tradition')
    aiDebug.policyReason = '전쟁광'
    return avg >= POOR_TILES || weakRival ? ['despotism', 'aesthetics', ...POLICY_PREFERENCE] : ['aesthetics', 'despotism', ...POLICY_PREFERENCE]
  }
  const surplus = food - totalWorkers(p)
  const tiles = p.cities.reduce((n, c) => n + c.tiles.length, 0)
  const recovers = surplus >= 3 && totalWorkers(p) >= 6
  // 정책마다 맞는 때가 있다:
  //  - 꼭 지어야 할 불가사의(루브르)가 미학을 요구하는 때, 또는 성장이 한번 무너지면 되살리기 힘든 때(식량 여유가 거의 없다) → 미학
  //  - 후반 지향형 타일(석유·석탄·우라늄·알루미늄)이 영토에 두 장 이상이면 곧 터지므로 → 자유·합리주의로 스퍼트
  //  - 타일이 좋지 못하면 → 전통
  const territory = p.cities.flatMap((c) => c.tiles).filter((t) => t.role !== 'city')
  const lateTiles = territory.filter((t) => t.card.resource && LATE_RESOURCES.has(t.card.resource)).length
  const avgTile = territory.length ? territory.reduce((n, t) => n + weight(tileYield(t.card, ctxOf(p))), 0) / territory.length : 0
  const mustWonder = Object.entries(MUST_BUILD_WONDERS).some(
    ([id, pol]) => pol === 'aesthetics' && p.policy !== 'aesthetics' && p.techs.includes(wonderCardById(id).tech) && s.wonderOwners[id] === undefined,
  )
  const foundationDone = tiles >= TERRITORY_OK && totalWorkers(p) >= happiness(p) - 1
  const fragile = surplus <= 0 && totalWorkers(p) >= 3 && !foundationDone
  const sprint = (): Policy[] => {
    const withRational = base + rationalismScience(p.civId) + (writing ? Math.max(0, food - totalWorkers(p)) : 0)
    const withLiberty = base + (writing ? food : 0)
    return withLiberty >= withRational ? ['liberty', 'rationalism', ...POLICY_PREFERENCE] : ['rationalism', 'liberty', ...POLICY_PREFERENCE]
  }
  if (mustWonder) {
    aiDebug.policyReason = '불가사의'
    return ['aesthetics', ...POLICY_PREFERENCE]
  }
  if (fragile) {
    aiDebug.policyReason = '성장 취약'
    return ['aesthetics', 'tradition', ...POLICY_PREFERENCE]
  }
  if (lateTiles >= 2) {
    aiDebug.policyReason = '후반 타일'
    return sprint()
  }
  if (territory.length >= 4 && avgTile < POOR_TILES && !foundationDone) {
    aiDebug.policyReason = '타일 부실'
    return ['tradition', 'aesthetics', ...POLICY_PREFERENCE]
  }
  // 발판(미학·전통)이 다져졌으면(영토가 충분하고 일꾼이 행복 한계에 가깝다) 스퍼트: 자유·합리주의로 과학을 몰아 올린다
  if (foundationDone || withNone < Math.min(need, 4)) {
    aiDebug.policyReason = '스퍼트'
    return sprint()
  }
  aiDebug.policyReason = recovers ? '전통(회복 빠름)' : '미학(기본)'
  return recovers ? ['tradition', 'aesthetics', ...POLICY_PREFERENCE] : ['aesthetics', 'tradition', ...POLICY_PREFERENCE]
}

/** 전통으로 버릴 일꾼 3명: 일꾼이 가장 많은 도시부터 한 명씩 */
function traditionDiscard(p: Player): { cityId: number; count: number }[] {
  const left = new Map(p.cities.map((c) => [c.id, c.workers]))
  const taken = new Map<number, number>()
  for (let i = 0; i < 3; i++) {
    const [id] = [...left.entries()].sort((a, b) => b[1] - a[1])[0]
    left.set(id, left.get(id)! - 1)
    taken.set(id, (taken.get(id) ?? 0) + 1)
  }
  return [...taken.entries()].map(([cityId, count]) => ({ cityId, count }))
}

function pendingCandidates(s: GameState, p: Player): Action[] {
  const out: Action[] = []
  if (p.pendingCity) out.push(foundSecond(p.pendingCity))
  if (p.pendingPolicies > 0) {
    for (const policy of policyOrder(s, p)) {
      // 전통을 고를 때는 일꾼 3명을 버려 문화 2를 얻는다 (일꾼이 3명 이상일 때)
      if (policy === 'tradition' && totalWorkers(p) >= 3) out.push({ type: 'choosePolicy', policy, discard: traditionDiscard(p) })
      out.push({ type: 'choosePolicy', policy })
    }
  }
  if (p.policyOffer) {
    // 과학이론: 지금 정책보다 합리주의를 더 좋게 보면 바꾼다
    const order = policyOrder(s, p)
    const now = p.policy ? order.indexOf(p.policy) : -1
    const want = now < 0 || order.indexOf(p.policyOffer) < now
    out.push({ type: 'policyOffer', accept: want }, { type: 'policyOffer', accept: !want })
  }
  if (p.pendingFreeCards > 0) {
    for (const o of cardOptions(p)) {
      out.push({ type: 'claimFreeCard', defId: o.def.id, unique: o.unique })
    }
  }
  return out
}

/** 정찰한 타일을 맡아둘 가치: 행복(사치 자원·행복 자연경관)과 식량이 높을수록 크다 */
function holdValue(p: Player, card: TileCard): number {
  let v = 0
  const owned = new Set<string>()
  for (const c of p.cities) for (const t of c.tiles) if (t.card.resource) owned.add(t.card.resource)
  const r = card.resource ? RESOURCES[card.resource] : undefined
  if (r?.luxuryTech && !owned.has(card.resource!)) v += 8
  if (card.resource === 'aluminum') v += 6
  if (card.wonder && (WONDERS[card.wonder].happinessOnClaim ?? 0) > 0) v += 9
  return v + tileScore(p, card) * 0.5
}
const HOLD_THRESHOLD = 7

/** 정찰은 3라운드에 한 번만 (일꾼 1개가 그 차례 쉬므로) */
function scoutCandidates(s: GameState, p: Player): Action[] {
  if (aiStyle === 'hammer' || !p.techs.includes('compass') || rushingApollo(p) || rushingCulture(p)) return []
  if (p.held || p.scouting || p.scouted || totalWorkers(p) < 4 || s.round % 3 !== 0) return []
  return [{ type: 'scout' }]
}

/** 이번 차례에 문화(= 새 타일)가 들어올 가망이 있으면 정찰한 좋은 타일을 맡아둔다 */
function holdCandidates(p: Player, research: Action[]): Action[] {
  if (!p.scouted || p.held || holdValue(p, p.scouted) < HOLD_THRESHOLD) return []
  const first = research.find((a): a is Extract<Action, { type: 'research' }> => a.type === 'research')
  const tech = first ? TECHS.find((t) => t.id === first.techId) : undefined
  const hope = p.pendingPolicies > 0 || !!tech?.effects.some((e) => e.kind === 'culture' || e.kind === 'policy')
  return hope ? [{ type: 'holdScouted' }] : []
}

function foundSecond(hand: TileCard[]): Action {
  const [city, ...rest] = hand
  const sideTiles: Partial<Record<Side, number>> = {}
  rest.forEach((c, i) => {
    sideTiles[SIDES[i]] = c.id
  })
  return { type: 'buildSecondCity', cityTileId: city.id, sideTiles }
}

const isInfantryAction = (a: Action): boolean => a.type === 'produce' && !a.unique && cardById(a.defId).line === 'infantry'
const facesImpi = (s: GameState, p: Player): boolean => s.players.some((o) => o.id !== p.id && !o.eliminated && o.civId === 'zulu')
const isSiegeAction = (a: Action): boolean => a.type === 'produce' && (cardById(a.defId).line === 'siege' || a.unique === '공성추')

/**
 * 한 도시가 낼 수 있는 망치의 상한 (공개 정보만: 영토 타일 산출, 도시별 일꾼 수, 문명 보너스).
 * 일꾼을 망치가 많은 타일부터 올렸다고 본다.
 */
function hammerCeiling(o: Player): Map<number, number> {
  const ctx = ctxOf(o)
  const out = new Map<number, number>()
  o.cities.forEach((c, i) => {
    let hammer = i === 0 ? (ctx.civ.bonus.hammer ?? 0) : 0
    const tiles = c.tiles.filter((t) => t.role !== 'city' && (t.occupiedBy === undefined || t.occupiedBy === o.id)).map((t) => tileYield(t.card, ctx).hammer)
    hammer += c.tiles.filter((t) => t.role === 'city').reduce((n, t) => n + tileYield(t.card, ctx).hammer, 0)
    hammer += tiles.sort((x, y) => y - x).slice(0, c.workers).reduce((n, h) => n + h, 0)
    if (ctx.techs.has('robotics')) hammer = Math.max(hammer, 10) // computeYields와 같다
    out.set(c.id, hammer)
  })
  return out
}

/**
 * 불가사의 경매 읽기 (순차 공개 전액지불 경매: 최다 투자 한 명만 진척도, 동률이면 아무도 못 얻고, 망치는 모두 사라진다).
 * - sure: 앞사람보다 많고, 뒤에 둘 문명이 공개 정보로 낼 수 있는 망치 상한보다도 많다 (또는 넘길 수 있는 문명이 없다)
 * - risky: 앞사람보다 많지만 뒤 문명이 넘길 수 있다 → 군사 카드를 만들 수 없을 때만
 * - spoil: 앞사람과 같은 금액밖에 못 내지만 그 앞사람이 이번에 이기면 완성한다 → 동률로 막는다
 * 이미 앞사람 이상인 불가사의(막을 이유가 없는 것)와, 상대의 진척도가 2 이상 앞선 불가사의(매몰비용)는 버린다.
 */
function wonderBids(s: GameState, p: Player, wonders: WonderCardDef[], h: number): { sure: WonderCardDef[]; risky: WonderCardDef[]; spoil: WonderCardDef[] } {
  const out = { sure: [] as WonderCardDef[], risky: [] as WonderCardDef[], spoil: [] as WonderCardDef[] }
  const later = s.order.slice(s.turnIdx + 1).map((id) => s.players[id]).filter((o) => !o.eliminated && o.cities.length > 0)
  const ceilings = new Map(later.map((o) => [o.id, hammerCeiling(o)]))
  for (const w of wonders) {
    const prog = s.wonderProgress[w.id] ?? {}
    const mine = prog[p.id] ?? 0
    const prior = s.investments.filter((i) => i.wonderId === w.id && i.playerId !== p.id)
    const best = prior.reduce((n, i) => Math.max(n, i.hammers), 0)
    const winner = prior.find((i) => i.hammers === best)
    const finishing = !!winner && prior.filter((i) => i.hammers === best).length === 1 && (prog[winner.playerId] ?? 0) + 1 >= w.progressNeeded
    if (best > h) continue
    if (best === h) {
      if (finishing) out.spoil.push(w)
      continue
    }
    if (finishing) {
      out.spoil.push(w) // 더 많이 내서 이기면 막으면서 내 진척도도 얻는다
      continue
    }
    const rivalProg = Math.max(0, ...Object.entries(prog).filter(([id]) => Number(id) !== p.id).map(([, v]) => v))
    if (rivalProg >= mine + 2) continue
    // 뒤 문명 중 이 불가사의에 투자할 수 있고, 그 도시의 망치 상한이 내 투자 이상인 문명이 있는가
    const threat = later.some((o) =>
      o.techs.includes(w.tech) &&
      !s.investments.some((i) => i.wonderId === w.id && i.playerId === o.id) &&
      o.cities.some((c) => conditionMet(o, c, w) && minHammers(o, w) <= (ceilings.get(o.id)!.get(c.id) ?? 0) && (ceilings.get(o.id)!.get(c.id) ?? 0) >= h),
    )
    ;(threat ? out.risky : out.sure).push(w)
  }
  return out
}

/**
 * 장군 불러들이기 (일꾼 배치 단계에서만, 불러들인 장군은 그 차례 선전포고에 바로 쓴다).
 * 장군이 없고 군대가 있으면 점령 중인 장군 1개를 불러들여 다시 전쟁에 쓴다.
 * 다만 상대에게 중요한 타일(좋은 산출·자원·자연경관)을 점령 중이면 그대로 들고 있는다. 상대의 성장을 누르는 편이 낫다.
 * 견제형 문명은 점령을 오래 들고 있고, 1등이 바뀌었거나 상대가 훨씬 좋은 타일을 얻었을 때만 장군을 옮긴다 (harassRecalls).
 */
function recallCandidates(s: GameState, p: Player): Action[] {
  const raw = isHarasser(s, p) ? harassRecalls(s, p) : plainRecalls(s, p)
  // 불러들인 장군으로 정말 더 나은 곳을 치는지 미리 본다: 방금 푼 타일을 다시 치거나 더 못한 타일로 가면 점령을 그대로 둔다
  // (같은 타일을 풀었다 다시 치면 일꾼만 쓰고 질 위험만 진다). 승률 추정이 비싸 앞의 둘만 본다
  for (const a of raw.slice(0, 2)) if (a.type === 'recallGeneral' && worthRecall(s, p, a)) return [a]
  return []
}

function plainRecalls(s: GameState, p: Player): Action[] {
  const army = p.military.filter((c) => cardStats(c).hp !== undefined).length
  if (p.generals + p.returningGenerals >= 1 || army < 2) return []
  const victim = isWarlord(p) && AI_TUNE.warlordHammer > 0 ? warlordVictim(s, p) : null
  return occupiedTiles(s, p)
    .map((t) => ({ t, v: tileImportance(s, t.defenderId, t.cityId, t.tileId) }))
    .filter((x) => x.v < KEEP_OCCUPIED)
    .filter((x) => !keepForConquest(s, p, x.t))
    // 전쟁광은 탈락시키려는 상대의 망치 타일을 풀지 않는다 (반격할 군사 카드를 못 뽑게 계속 누른다)
    .filter((x) => !(x.t.defenderId === victim && tileHammers(s, x.t.defenderId, x.t.cityId, x.t.tileId) >= HAMMER_HOLD))
    .sort((a, b) => a.v - b.v)
    .map(({ t }) => ({ type: 'recallGeneral' as const, ...t }))
}

/** 불러들인 뒤 이번 차례에 칠 곳이 푼 타일과 다르고, 탈환·도시 공격이거나 푼 타일보다 중요한 타일이어야 불러들인다 */
function worthRecall(s: GameState, p: Player, a: { defenderId: number; cityId: number; tileId: number }): boolean {
  const value = isHarasser(s, p) ? harassValue : tileImportance
  const released = value(s, a.defenderId, a.cityId, a.tileId)
  let after: GameState
  try {
    after = apply(s, { type: 'recallGeneral', ...a })
  } catch (e) {
    if (e instanceof RuleError) return false
    throw e
  }
  const next = declareCandidates(after, after.players[p.id]).find((x) => x.type === 'declareWar')
  if (!next || next.type !== 'declareWar') return false
  if (next.defenderId === a.defenderId && next.cityId === a.cityId && next.tileId === a.tileId) return false
  const t = declarationTargets(after, after.players[p.id]).find((x) => x.defenderId === next.defenderId && x.cityId === next.cityId && x.tileId === next.tileId)
  if (t && t.kind !== 'normal') return true
  // 도시 공격의 발판(도시 옆 4칸)으로 옮기는 것은 산출이 같아도 의미가 있다
  const side = (pl: GameState, x: { defenderId: number; cityId: number; tileId: number }) => {
    const o = pl.players[x.defenderId]
    return x.cityId === conquestCity(o).id && findTile(o, x.cityId, x.tileId)?.tile.role === 'side'
  }
  if (side(after, next) && !side(s, a)) return true
  return value(after, next.defenderId, next.cityId, next.tileId) > released
}

function produceCandidates(s: GameState, p: Player): Action[] {
  const out: Action[] = []
  const turn = p.turn!
  const army = p.military.filter((c) => cardStats(c).hp !== undefined).length
  for (const city of p.cities) {
    if (turn.produced.includes(city.id)) continue
    const h = turn.yields.cities.find((c) => c.cityId === city.id)!.hammer
    const wonders = investableWonders(s, p, city)
      .filter((w) => minHammers(p, w) <= h)
      // 과학 정책(합리주의·자유)을 평등 등으로 덮어쓰는 불가사의는 피한다
      .filter((w) => !(['rationalism', 'liberty'].includes(p.policy ?? '') && w.effects.some((e) => e.kind === 'setPolicy' && e.policy !== 'liberty')))
      .sort((a, b) => (isWarlord(p) ? Number(b.id === 'statue_of_zeus') - Number(a.id === 'statue_of_zeus') : 0) || (cultureFirst(p) ? Number(b.id === 'sistine_chapel') - Number(a.id === 'sistine_chapel') : 0) || b.minHammers - a.minHammers)
    const bids = wonderBids(s, p, wonders, h)
    const wonderActions: Action[] = bids.sure.map((w) => ({ type: 'invest', cityId: city.id, wonderId: w.id, hammers: h }))
    const spoilActions: Action[] = bids.spoil.map((w) => ({ type: 'invest', cityId: city.id, wonderId: w.id, hammers: h }))
    const riskyActions: Action[] = bids.risky.map((w) => ({ type: 'invest', cityId: city.id, wonderId: w.id, hammers: h }))
    const cardActions: Action[] = []
    for (const o of cardOptions(p)) {
      if (o.def.notBattle || (!o.unique && heldCount(p, o.def.id) >= holdLimit(p, o.def.id)) || !producible(s, p, o.def.id, o.unique, city) || cardCost(p, o.def, o.unique ? uniqueOf(p, o.unique) : undefined) > h) continue
      cardActions.push({ type: 'produce', cityId: city.id, defId: o.def.id, unique: o.unique })
    }
    // 군대가 3장 미만이거나 이웃의 군사에 비해 수비가 모자라면 군사 카드를 먼저, 그 뒤에는 불가사의에 망치를 모두 건다
    // 이번 라운드에 나를 노린 선전포고가 있으면(앞사람의 선전포고는 공개됨) 수비 카드를 먼저 만든다
    const needDefense = army < defenseTarget(s, p) || underAttack(s, p)
    const warRush = isWarlord(p) && warFoundation(p) && preIndustrial(s)
    // 공성 카드가 없으면 그것부터 만든다 (도시를 치려면 공성 카드가 살아남아야 한다)
    const joinSiege = !isWarlord(p) && !hasSiege(p) && (() => { const l = coalitionLeader(s, p); return !!l && l.cities.length > 0 && sidesOccupied(l) >= 2 && sidesMine(l, p.id) >= 1 })()
    const rush = (warRush && army < AI_TUNE.warlordArmy) || ((warRush || joinSiege) && !hasSiege(p) && cardActions.some(isSiegeAction))
    if ((warRush || joinSiege) && !hasSiege(p)) cardActions.sort((x, y) => Number(isSiegeAction(y)) - Number(isSiegeAction(x)))
    // 줄루의 임피는 상대 카드의 효과 칸 공격과 효과(원거리의 반격 없음 등)를 없애므로, 줄루가 상대면 마크로만 싸우는 보병 계열을 먼저 만든다
    if (facesImpi(s, p)) cardActions.sort((x, y) => Number(isInfantryAction(y)) - Number(isInfantryAction(x)))
    // 완성 직전인 상대를 동률로 막는 투자가 가장 먼저, 뒤 문명이 넘길 수 있는 투자는 군사 카드 뒤로
    out.push(...spoilActions)
    out.push(...(army < 3 || needDefense || rush || aiStyle === 'hammer' ? [...cardActions, ...wonderActions] : [...wonderActions, ...cardActions]))
    out.push(...riskyActions)
  }
  // 3) 금으로 승급 (가장 높은 단계부터 시도한다)
  // 금이 모자라거나 승급할 수 없는 후보는 미리 거른다 (후보마다 엔진이 상태를 통째로 복사해 시도하므로 카드가 많으면 느려진다)
  if (!turn.upgraded && turn.yields.gold > 0) {
    const gold = turn.yields.gold
    for (const c of p.military) {
      const ups = upgradeTargets(p, c)
      for (const u of civById(p.civId).uniques) {
        const uq = uniqueOf(p, u.name)
        if (uq && ups.some((x) => x.id === uq.base) && cardCost(p, cardById(uq.base), uq) <= gold) out.push({ type: 'upgrade', uid: c.uid, unique: u.name })
      }
    }
    for (const c of p.military) for (const t of upgradeTargets(p, c).filter((x) => heldCount(p, x.id) < holdLimit(p, x.id) && cardCost(p, x) <= gold)) out.push({ type: 'upgrade', uid: c.uid, toDefId: t.id })
  }
  return out
}

/** 지금 얼마나 앞서 있는지: 문화(타일), 기술, 불가사의, 일꾼, 군사 */
export function standing(p: Player): number {
  return culture(p) + 2 * p.techs.length + 3 * p.wonders.length + totalWorkers(p) + 0.5 * armyOf(p)
}
/**
 * 실질 위협도: 앞선 정도(standing)에 승리까지 거리를 더하고, 이미 받고 있는 견제를 뺀다. 결정할 때마다 다시 계산한다.
 * - 아폴로까지 남은 기술이 적을수록, 관광이 상대 문화(가장 큰 상대)에 가까울수록 위협이 크다.
 * - 점령당한 타일은 문화(타일 수)에는 남지만 산출을 잃으므로 그만큼 뺀다.
 * - 이번 라운드에 이미 걸린 선전포고(공개됨)도 뺀다: 견제는 이미 진행 중이다.
 */
export function threat(s: GameState, o: Player): number {
  let v = standing(o)
  v += Math.max(0, 10 - apolloMissing(o).size) * 3
  const rivals = s.players.filter((q) => q.id !== o.id && !q.eliminated && q.cities.length > 0)
  const t = tourism(o)
  if (t > 0 && rivals.length) v += 25 * Math.min(1.2, t / Math.max(1, ...rivals.map((q) => culture(q))))
  const ctx = ctxOf(o)
  for (const c of o.cities) for (const tl of c.tiles) if (tl.occupiedBy !== undefined && tl.occupiedBy !== o.id) v -= 0.6 * weight(tileYield(tl.card, ctx))
  v -= 3 * s.declarations.filter((d) => d.defenderId === o.id && d.kind !== 'retake').length
  return v
}
/** 1등(실질 위협도가 가장 큰 문명)과 2등. 탈락한 문명은 뺀다. */
export function rankTop(s: GameState): { leader: Player; runnerUp: Player } | null {
  const alive = s.players.filter((q) => !q.eliminated).map((q) => ({ q, v: threat(s, q) }))
  alive.sort((a, b) => b.v - a.v || a.q.id - b.q.id)
  return alive.length >= 3 ? { leader: alive[0].q, runnerUp: alive[1].q } : null
}

/** 상대(또는 내) 타일이 그 주인에게 얼마나 중요한지: 산출·자원·행복·자연경관 */
function tileImportance(s: GameState, ownerId: number, cityId: number, tileId: number): number {
  const owner = s.players[ownerId]
  const card = owner.cities.find((c) => c.id === cityId)?.tiles.find((x) => x.card.id === tileId)?.card
  if (!card) return 0
  const r = card.resource ? RESOURCES[card.resource] : undefined
  return weight(tileYield(card, ctxOf(owner))) + (r?.kind === 'luxury' ? 4 : r?.kind === 'strategic' ? 3 : 0) + (card.wonder ? 6 : 0)
}
/** 이만큼 중요한 상대 타일은 장군을 올려 둔 채 계속 점령한다 (상대의 성장을 누른다) */
const KEEP_OCCUPIED = 4.5

/** 전쟁광이 노리는 상대(또는 연합이 견제하는 1등)의 도시 4칸 점령은 도시 공격의 발판이라 풀지 않는다 */
function keepForConquest(s: GameState, p: Player, t: { defenderId: number; cityId: number; tileId: number }): boolean {
  const victim = isWarlord(p) ? warlordVictim(s, p) : (coalitionLeader(s, p)?.id ?? null)
  if (t.defenderId !== victim) return false
  const o = s.players[t.defenderId]
  const found = findTile(o, t.cityId, t.tileId)
  return !!found && found.tile.role === 'side' && found.city.id === conquestCity(o).id
}

/** 1등에게 이번 라운드에 이미 걸린 선전포고의 공격 측 힘 합이 1등 수비를 충분히(1.2배) 넘는다 */
function piledOn(s: GameState, leader: Player): boolean {
  const decls = s.declarations.filter((d) => d.defenderId === leader.id && d.kind !== 'retake')
  return decls.length > 0 && decls.reduce((n, d) => n + strengthOf(s.players[d.attackerId]), 0) >= 1.2 * strengthOf(leader)
}

/** 선전포고에 필요한 승률 (탈환은 장군이 들지 않아 조금 낮게) */
const ODDS_NEEDED: Record<'normal' | 'retake' | 'city', number> = { normal: 0.45, retake: 0.35, city: 0.45 }

const coastalTarget = (s: GameState, t: ReturnType<typeof declarationTargets>[number]): boolean => {
  const owner = t.kind === 'retake' ? s.players.find((o) => o.cities.some((c) => c.id === t.cityId && c.tiles.some((x) => x.card.id === t.tileId && x.occupiedBy !== undefined))) : s.players[t.defenderId]
  return !!owner && !!findTile(owner, t.cityId, t.tileId)?.tile.card.terrains.includes('해안')
}

function declareCandidates(s: GameState, p: Player): Action[] {
  // 차례 계획기가 배치를 시험하는 중에는 선전포고를 건너뛴다 (배치하지 않은 일꾼을 쓰므로 배치의 가치와 상관없고, 승률 추정이 비싸다)
  if (planning) return [{ type: 'endTurn' }]
  const out: Action[] = []
  const army = p.military.filter((c) => cardStats(c).hp !== undefined).length
  if (army >= 2) {
    // 탈환 → 상대의 좋은 타일(산출·자원·행복) → 도시 순으로 노린다. 좋은 타일을 점령해 상대의 성장을 누른다
    const value = (t: ReturnType<typeof declarationTargets>[number]): number => {
      if (t.kind === 'retake') return 1000
      if (t.kind === 'city') return 0
      return tileImportance(s, t.defenderId, t.cityId, t.tileId)
    }
    // 셋 이상이면 한 사람을 집중공략하지 않고, 딸리는 나라들이 함께 1등을 견제한다.
    // 1등은 2등을 견제한다. 탈환은 언제든 할 수 있다.
    const top = AI_TUNE.coalition ? rankTop(s) : null
    let aim = top ? (p.id === top.leader.id ? top.runnerUp.id : top.leader.id) : null
    // 쏠림 방지: 1등에게 이미 걸린 공격이 1등 수비를 충분히 넘으면 2등(다음 위협)을 노리고, 내가 2등이면 군대를 키운다.
    // 다만 1등 도시의 사면 점령이 3칸 이상이면 도시 공격 직전이므로 집중을 유지한다.
    if (top && aim === top.leader.id && !isWarlord(p) && piledOn(s, top.leader) && sidesOccupied(top.leader) < 3) aim = top.runnerUp.id !== p.id ? top.runnerUp.id : -1
    let rate = value
    if (!isWarlord(p) && top && aim === top.leader.id) {
      // 1등을 견제하는 연합: 도시 옆 4칸을 함께 점령해 두면, 그중 장군이 가장 많은 문명(공동이면 모두)이 공성 카드로 도시를 파괴할 수 있다
      rate = (t) => {
        if (t.kind === 'retake') return 1000
        if (t.kind === 'city') return hasSiege(p) ? 500 : -1
        const o = s.players[t.defenderId]
        const side = t.cityId === conquestCity(o).id && findTile(o, t.cityId, t.tileId)?.tile.role === 'side'
        return tileImportance(s, t.defenderId, t.cityId, t.tileId) + (side ? 8 : 0)
      }
    }
    if (isWarlord(p)) {
      // 한 상대에 집중한다: 도시를 칠 수 있으면 도시(탈락), 아니면 그 도시의 4칸 → 좋은 타일 순으로 선점령
      aim = warlordVictim(s, p)
      // 힘이 앞서지 않으면 장군만 낭비하므로 선전포고하지 않고 군대를 더 키운다 (탈환은 언제든)
      if (aim !== null && strengthOf(p) < strengthOf(s.players[aim]) * 1.15) aim = -1
      // 탈락시킬 상대의 망치 타일을 먼저 점령한다: 성장을 마쳐도 반격할 군사 카드를 못 뽑아 리드가 오래간다
      rate = (t) => {
        if (t.kind === 'retake') return 1000
        if (t.kind === 'city') return hasSiege(p) ? 500 : -1
        const o = s.players[t.defenderId]
        const side = t.cityId === conquestCity(o).id && findTile(o, t.cityId, t.tileId)?.tile.role === 'side'
        return tileImportance(s, t.defenderId, t.cityId, t.tileId) + AI_TUNE.warlordHammer * tileHammers(s, t.defenderId, t.cityId, t.tileId) + (side ? 8 : 0)
      }
    } else if (isHarasser(s, p)) {
      // 견제형(고유 유닛을 든 문명 등): 군대만 뽑거나 전제정치로 가지 않고, 가진 장군으로 상대의 고생산(망치) 타일을 강제 점거한다.
      // 셋 이상이면 1등 도시의 사면도 노린다: 장군이 1개씩뿐이어도 여럿이 함께 사면을 채우면, 공성 카드를 가진 문명이 도시를 칠 수 있다
      const coalition = !!top && aim === top.leader.id
      rate = (t) => {
        if (t.kind === 'retake') return 1000
        if (t.kind === 'city') return hasSiege(p) ? 500 : -1
        const o = s.players[t.defenderId]
        const side = coalition && t.cityId === conquestCity(o).id && findTile(o, t.cityId, t.tileId)?.tile.role === 'side'
        return harassValue(s, t.defenderId, t.cityId, t.tileId) + (side ? 8 : 0)
      }
    }
    const targets = declarationTargets(s, p)
      .filter((t) => aim === null || t.kind === 'retake' || t.defenderId === aim || (isWarlord(p) && t.kind === 'city'))
      .filter((t) => rate(t) >= 0)
      .sort((a, b) => rate(b) - rate(a))
    // 같은 타일에 이미 다른 문명이 선전포고했다면 앞 문명이 이길 때 전투 없이 끝나므로 뒤로 미룬다
    const taken = (t: (typeof targets)[number]) => t.kind !== 'retake' && s.declarations.some((d) => d.defenderId === t.defenderId && d.cityId === t.cityId && d.tileId === t.tileId)
    targets.sort((a, b) => Number(taken(a)) - Number(taken(b)))
    // 이길 가망이 있는 목표만 (엔진 전투를 상태 복사본으로 돌려 본다). 앞에서부터 둘을 찾으면 그만 센다
    const odds = new Map<string, number>()
    let found = 0
    for (const t of targets) {
      if (found >= 2) break
      const key = `${t.defenderId}:${t.kind}:${coastalTarget(s, t)}`
      if (!odds.has(key)) odds.set(key, battleOdds(s, p, t))
      if (odds.get(key)! < ODDS_NEEDED[t.kind]) continue
      out.push({ type: 'declareWar', defenderId: t.defenderId, cityId: t.cityId, tileId: t.tileId })
      found++
    }
  } else {
    for (const t of declarationTargets(s, p)) {
      if (t.kind === 'retake') out.push({ type: 'declareWar', defenderId: t.defenderId, cityId: t.cityId, tileId: t.tileId })
    }
  }
  out.push({ type: 'endTurn' })
  return out
}

function battleCandidates(s: GameState): Action[] {
  return battleActions(s, actorOf(s))
}

/** 지금 입력해야 하는 문명의 행동 후보 (앞에 있을수록 선호, 마지막은 항상 규칙을 지키는 진행 행동). */
export function aiCandidates(s: GameState): Action[] {
  if (s.phase === 'battle' && s.battle) return battleCandidates(s)
  const p = currentPlayer(s)
  // 보유 한도를 넘은 카드는 같은 종류 중 가장 약한 카드(체력이 낮은 일반 카드)를 버린다
  if (p.pendingCardDiscard?.length) {
    const kind = p.pendingCardDiscard[0]
    const cands = p.military.filter((c) => c.defId === kind && !c.unique).sort((x, y) => (cardStats(x).hp ?? 0) - (cardStats(y).hp ?? 0))
    return cands.map((c) => ({ type: 'discardCard' as const, uid: c.uid }))
  }
  // 문화로 얻은 타일은 먼저 붙인다 (예전 자동 배치와 같은 도시)
  if (p.pendingTiles?.length && s.phase !== 'setup' && s.phase !== 'over') return [{ type: 'placeGainedTile', cityId: defaultTileCity(p).id }]
  plan = p.cities.length ? lateGame(p, s) : null
  switch (s.phase) {
    case 'setup':
      return [foundAction(p, p.hand)]
    case 'place': {
      const baseScience = civById(p.civId).bonus.science ?? 0
      defending = armyOf(p) < defenseTarget(s, p) || underAttack(s, p)
      starving = baseScience < Math.min(...researchableTechs(s).map((t) => t.cost), 99)
      const reserve = p.generals > 0 && p.military.length >= 2 ? 1 : 0
      const planned = plannedPlacements(s, p, reserve)
      return [
        ...recallCandidates(s, p),
        ...scoutCandidates(s, p),
        ...(planned ? [{ type: 'placeWorkers' as const, placements: planned }] : []),
        { type: 'placeWorkers', placements: placements(p, reserve) },
        { type: 'placeWorkers', placements: placements(p, 0) },
        { type: 'placeWorkers', placements: [] },
      ]
    }
    case 'research': {
      const research = researchCandidates(s, p)
      return [...holdCandidates(p, research), ...pendingCandidates(s, p), ...research]
    }
    case 'produce':
      return [...pendingCandidates(s, p), ...produceCandidates(s, p), { type: 'endProduction' }]
    case 'declare': {
      // 행복 상한을 넘은 일꾼은 일꾼이 가장 많은 도시부터 한 명씩 버린다
      if (p.pendingDiscard) {
        const biggest = p.cities.reduce((a, b) => (b.workers > a.workers ? b : a))
        return [{ type: 'discardWorker', cityId: biggest.id }]
      }
      return declareCandidates(s, p)
    }
    default:
      return []
  }
}

/** AI가 한 번 행동한다: 후보를 순서대로 시도해 성공한 첫 행동의 결과를 돌려준다. */
export function aiStep(s: GameState): { state: GameState; action: Action } {
  for (const action of aiCandidates(s)) {
    try {
      return { state: apply(s, action), action }
    } catch (e) {
      if (!(e instanceof RuleError)) throw e
    }
  }
  throw new Error(`AI가 행동을 찾지 못했습니다 (phase=${s.phase})`)
}
