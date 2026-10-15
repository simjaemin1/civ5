import type { Action, GameState, Player, Side, TileCard } from './types'
import { RuleError, SIDES } from './types'
import { MILITARY_CARDS, RESOURCES, TECHS, WONDERS, cardById, civById } from './data'
import { cardStats } from './cardstats'
import type { TechDef } from './data'
import { apply, researchableTechs } from './game'
import { ctxOf, tileYield, totalWorkers } from './yields'
import { investableWonders, minHammers } from './wonders'
import { cardCost, producible, uniqueOf } from './military'
import { declarationTargets } from './war'
import { currentPlayer } from './core'

/** 규칙 검증용 단순 휴리스틱 AI. 후보 행동을 순서대로 시도해 규칙을 어기지 않는 첫 행동을 쓴다. */

/** 실험용 AI 성향: 'hammer'는 망치 올인 (타일은 망치 위주, 군사 카드를 먼저 만든다) */
let aiStyle: 'default' | 'hammer' = 'default'
export const setAiStyle = (style: 'default' | 'hammer'): void => {
  aiStyle = style
}

const weight = (y: { food: number; hammer: number; science: number; gold: number }) =>
  y.food * 1.6 + y.hammer * 1.1 + y.science * 1.3 + y.gold * 0.4

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

function tileScore(p: Player, card: TileCard): number {
  const y = tileYield(card, ctxOf(p))
  if (aiStyle === 'hammer') return y.hammer * 4 + y.food * 1.5 + y.science * 0.3
  // 아폴로 질주: 식량이 곧 과학이므로 식량과 과학을 크게 친다
  if (rushingApollo(p)) return y.food * 3 + y.science * 3 + y.hammer * 0.5 + y.gold * 0.2
  return weight(y)
}

function foundAction(p: Player, hand: TileCard[]): Action {
  const best = hand.reduce((a, b) => (tileScore(p, b) > tileScore(p, a) ? b : a))
  const sideTiles: Partial<Record<Side, number>> = {}
  hand
    .filter((c) => c.id !== best.id)
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

/** 아폴로 프로젝트까지 아직 연구하지 못한 선행 기술(아폴로 포함) 목록 */
function apolloMissing(p: Player): Set<string> {
  const missing = new Set<string>()
  const visit = (id: string) => {
    if (p.techs.includes(id) || missing.has(id)) return
    missing.add(id)
    for (const pre of TECHS.find((t) => t.id === id)?.prereqs ?? []) visit(pre)
  }
  visit('apollo')
  return missing
}

/** 극후반: 아폴로까지 남은 기술이 이 정도면 과학 승리를 향해 달린다 (자유 정책 + 식량 전부를 과학으로) */
const APOLLO_RUSH = 8
const rushingApollo = (p: Player): boolean => aiStyle === 'default' && apolloMissing(p).size <= APOLLO_RUSH

/** 나침반 → 행복 타일 정찰 → 두 번째 도시(인쇄기술) → 일꾼 증식을 노리는 기술 우선순위 */
const COMPASS_CHAIN = new Set(['sailing', 'optics', 'compass'])
function buildPriority(p: Player, t: TechDef): number {
  if (p.techs.includes('compass') === false && COMPASS_CHAIN.has(t.id)) return 300
  let v = 0
  // 내 영토에 있는 사치 자원을 열어 주는 기술은 행복(= 일꾼 상한)을 늘린다
  for (const c of p.cities) {
    for (const tile of c.tiles) {
      const r = tile.card.resource ? RESOURCES[tile.card.resource] : undefined
      if (r?.luxuryTech === t.id) v += 40
    }
  }
  if (t.id === 'printing_press') v += 60
  return v
}

function techPriority(t: TechDef, rush?: Set<string>, p?: Player): number {
  let v = t.cost + (rush?.has(t.id) ? 500 : 0) + (p && !rush ? buildPriority(p, t) : 0)
  for (const e of t.effects) {
    if (e.kind === 'foodToScience') v += 5
    else if (e.kind === 'secondCity') v += 8
    else if (e.kind === 'culture') v += 4
    else if (e.kind === 'policy') v += 3
    else if (e.kind === 'hammerToScience') v += 3
    else if (e.kind === 'general') v += 2
    else if (e.kind === 'scienceVictory') v += 1000
  }
  return v
}

function researchCandidates(s: GameState, p: Player): Action[] {
  const turn = p.turn!
  const food = turn.yields.cities.reduce((n, c) => n + c.food, 0)
  const hammers = turn.yields.cities.reduce((n, c) => n + c.hammer, 0)
  const out: Action[] = []
  const rush = rushingApollo(p) ? apolloMissing(p) : undefined
  const techs = researchableTechs(s).sort((a, b) => techPriority(b, rush, p) - techPriority(a, rush, p))
  for (const t of techs) {
    let need = t.cost - turn.yields.science
    let foodConv = 0
    let hammerConv = 0
    if (need > 0 && p.techs.includes('writing')) {
// 자유 정책에서는 일꾼을 굶겨도 잃지 않으므로 식량을 전부 과학으로 돌릴 수 있다
      foodConv = Math.min(need, Math.max(0, p.policy === 'liberty' ? food : food - totalWorkers(p)))
      need -= foodConv
    }
    if (need > 0 && p.techs.includes('scientific_theory')) {
      hammerConv = Math.min(2, hammers, need)
      need -= hammerConv
    }
    if (need <= 0) out.push({ type: 'research', techId: t.id, foodToScience: foodConv, hammerToScience: hammerConv })
  }
  out.push({ type: 'skipResearch' })
  return out
}

const POLICY_PREFERENCE = ['aesthetics', 'tradition', 'rationalism', 'liberty', 'despotism', 'equality', 'regime', 'diplomacy'] as const

/** 만들 수 있는 카드 후보: 비싼 순, 같은 값이면 고유 유닛을 먼저 (고유 유닛은 일반 카드보다 강하다) */
function cardOptions(p: Player): { def: (typeof MILITARY_CARDS)[number]; unique?: string; cost: number }[] {
  const opts: { def: (typeof MILITARY_CARDS)[number]; unique?: string; cost: number }[] = MILITARY_CARDS.map((def) => ({ def, cost: def.cost }))
  for (const u of civById(p.civId).uniques) opts.push({ def: cardById(u.base), unique: u.name, cost: u.cost })
  return opts.sort((a, b) => b.cost - a.cost || Number(!!b.unique) - Number(!!a.unique))
}

function pendingCandidates(s: GameState, p: Player): Action[] {
  const out: Action[] = []
  if (p.pendingCity) out.push(foundSecond(p.pendingCity))
  const prefs = rushingApollo(p) ? (['liberty', ...POLICY_PREFERENCE] as const) : POLICY_PREFERENCE
  for (const policy of prefs) {
    if (p.pendingPolicies > 0) out.push({ type: 'choosePolicy', policy })
  }
  if (p.pendingFreeCards > 0) {
    for (const o of cardOptions(p)) {
      out.push({ type: 'claimFreeCard', defId: o.def.id, unique: o.unique })
    }
  }
  void s
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
  if (aiStyle === 'hammer' || !p.techs.includes('compass') || rushingApollo(p)) return []
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

function produceCandidates(s: GameState, p: Player): Action[] {
  const out: Action[] = []
  const turn = p.turn!
  const army = p.military.filter((c) => cardStats(c).hp !== undefined).length
  for (const city of p.cities) {
    if (turn.produced.includes(city.id)) continue
    const h = turn.yields.cities.find((c) => c.cityId === city.id)!.hammer
    const wonders = investableWonders(s, p, city)
      .filter((w) => minHammers(p, w) <= h)
      .sort((a, b) => b.minHammers - a.minHammers)
    const wonderActions: Action[] = wonders.map((w) => ({ type: 'invest', cityId: city.id, wonderId: w.id, hammers: h }))
    const cardActions: Action[] = []
    for (const o of cardOptions(p)) {
      if (o.def.notBattle || !producible(s, p, o.def.id, o.unique, city) || cardCost(p, o.def, o.unique ? uniqueOf(p, o.unique) : undefined) > h) continue
      cardActions.push({ type: 'produce', cityId: city.id, defId: o.def.id, unique: o.unique })
    }
    // 군대가 3장 미만이면 군사 카드를 먼저, 그 뒤에는 불가사의에 망치를 모두 건다
    out.push(...(army < 3 || aiStyle === 'hammer' ? [...cardActions, ...wonderActions] : [...wonderActions, ...cardActions]))
  }
  // 3) 금으로 승급
  if (!turn.upgraded && turn.yields.gold > 0) {
    for (const c of p.military) {
      for (const u of civById(p.civId).uniques) out.push({ type: 'upgrade', uid: c.uid, unique: u.name })
    }
    for (const c of p.military) out.push({ type: 'upgrade', uid: c.uid })
  }
  return out
}

function declareCandidates(s: GameState, p: Player): Action[] {
  const out: Action[] = []
  const army = p.military.filter((c) => cardStats(c).hp !== undefined).length
  if (army >= 2) {
    const targets = declarationTargets(s, p).sort((a, b) => Number(b.kind === 'city') - Number(a.kind === 'city'))
    for (const t of targets) out.push({ type: 'declareWar', defenderId: t.defenderId, cityId: t.cityId, tileId: t.tileId })
  } else {
    for (const t of declarationTargets(s, p)) {
      if (t.kind === 'retake') out.push({ type: 'declareWar', defenderId: t.defenderId, cityId: t.cityId, tileId: t.tileId })
    }
  }
  out.push({ type: 'endTurn' })
  return out
}

function battleCandidates(s: GameState): Action[] {
  const b = s.battle!
  const pid = actorOf(s)
  const p = s.players[pid]
  if (b.step === 'arrange') {
    const power = (uid: number) => {
      const st = cardStats(p.military.find((c) => c.uid === uid)!)
      return (st.hp ?? 0) + (st.choose ?? st.marks[0]?.power ?? st.markPower ?? 0) * 2
    }
    const usable = p.military.map((c) => c.uid).sort((x, y) => power(y) - power(x))
    return [
      { type: 'arrangeBattle', playerId: pid, slots: [usable[0] ?? null, usable[1] ?? null, usable[2] ?? null, usable[3] ?? null] },
      { type: 'arrangeBattle', playerId: pid, slots: [null, null, null, null] },
    ]
  }
  const head = b.chooseQueue[0]
  const enemyId = pid === b.decl.attackerId ? b.decl.defenderId : b.decl.attackerId
  const enemy = s.players[enemyId]
  const enemyBoard = (b.slots[enemyId] ?? []).filter((x): x is number => x !== null)
  const hpOf = (uid: number) => cardStats(enemy.military.find((c) => c.uid === uid)!).hp ?? 99
  const sorted = [...enemyBoard].sort((x, y) => hpOf(x) - hpOf(y))
  const antiTank = enemyBoard.filter((u) => cardStats(enemy.military.find((c) => c.uid === u)!).baseId === 'anti_tank_gun')
  const picks: Record<number, number> = {}
  for (const uid of head.uids) {
    const me = p.military.find((c) => c.uid === uid)!
    picks[uid] = cardStats(me).baseId === 'tank' && antiTank.length ? antiTank[0] : sorted[0]
  }
  return [{ type: 'chooseTargets', playerId: pid, picks }]
}

/** 지금 입력해야 하는 문명의 행동 후보 (앞에 있을수록 선호, 마지막은 항상 규칙을 지키는 진행 행동). */
export function aiCandidates(s: GameState): Action[] {
  if (s.phase === 'battle' && s.battle) return battleCandidates(s)
  const p = currentPlayer(s)
  switch (s.phase) {
    case 'setup':
      return [foundAction(p, p.hand)]
    case 'place': {
      const reserve = p.generals > 0 && p.military.length >= 2 ? 1 : 0
      return [
        ...scoutCandidates(s, p),
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
    case 'declare':
      return declareCandidates(s, p)
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
