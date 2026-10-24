import type { Action, GameState, Player, Side, TileCard } from './types'
import { RuleError, SIDES } from './types'
import { MILITARY_CARDS, RESOURCES, TECHS, WONDERS, cardById, civById } from './data'
import { cardStats } from './cardstats'
import type { TechDef } from './data'
import { apply, researchableTechs } from './game'
import { ctxOf, culture, happiness, tileYield, totalWorkers, tourism } from './yields'
import { investableWonders, minHammers } from './wonders'
import { cardCost, producible, uniqueOf, upgradeTargets } from './military'
import { declarationTargets, occupiedTiles } from './war'
import { currentPlayer } from './core'

/** 규칙 검증용 단순 휴리스틱 AI. 후보 행동을 순서대로 시도해 규칙을 어기지 않는 첫 행동을 쓴다. */

/** 실험용 AI 성향: 'hammer'는 망치 올인 (타일은 망치 위주, 군사 카드를 먼저 만든다) */
let aiStyle: 'default' | 'hammer' = 'default'
export const setAiStyle = (style: 'default' | 'hammer'): void => {
  aiStyle = style
}

/** 튜닝값 (시뮬레이션으로 조정) */
/** 시뮬레이션(30판)으로 고른 값: 정책은 과학 12 미만이면 합리주의·자유로, 과학이론 우선도 +60, 아폴로 질주는 남은 기술 8개부터 (더 일찍 달리면 오히려 판이 길어진다) */
export const AI_TUNE = { scienceWeight: 1.3, apolloRush: 8, policyNeed: 12, theoryBonus: 60, coalition: true, cultureRush: 9, cultureSlack: 2 }

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

function tileScore(p: Player, card: TileCard): number {
  const y = tileYield(card, ctxOf(p))
  if (aiStyle === 'hammer') return y.hammer * 4 + y.food * 1.5 + y.science * 0.3
  // 아폴로 질주·과학 기아: 식량이 곧 과학이므로 식량과 과학을 크게 친다
  if (defending) return y.food * 1.6 + y.hammer * 3 + y.science * 0.8 + y.gold * 0.2
  if (rushingApollo(p) || rushingCulture(p) || starving) return y.food * 3 + y.science * 3 + y.hammer * 0.5 + y.gold * 0.2
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
    const reach = 2 * Math.floor(culture(p) / 3) + Math.floor(totalWorkers(p) / 2) + AI_TUNE.cultureSlack
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

function buildPriority(p: Player, t: TechDef): number {
  if (p.techs.includes('compass') === false && COMPASS_CHAIN.has(t.id)) return 300
  let v = boostTechValue(p, t.id)
  const mountainFirstCity = !!p.cities[0]?.tiles.some((x) => (x.role === 'city' || x.role === 'side') && x.card.terrains.includes('산'))
  if (t.id === 'writing') v += 90 // 식량을 과학으로 바꿀 수 있다
  if (t.id === 'astronomy' && mountainFirstCity) v += 80 // 과학 +5
  if (t.id === 'scientific_theory') v += AI_TUNE.theoryBonus
  if (t.id === 'printing_press') v += 70
  if (t.id === 'economics') v += 15
  if (t.id === 'radar') v -= 60 // 정책이 전제정치로 바뀐다 (아폴로 질주 때만 감수)
  // 고유 유닛이 초반에 열리는 문명은 그 길이 최우선, 고유 유닛 시대에는 장군(기마술)을 일찍 얻어 상대 좋은 타일을 압박한다
  if (uniqueRoute(p)?.has(t.id)) v += 400
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
  const rush = rushingCulture(p) ? cultureMissing(p) : rushingApollo(p) ? apolloMissing(p) : undefined
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

const armyOf = (p: Player): number => p.military.filter((c) => cardStats(c).hp !== undefined).length

/** 이웃이 군사를 가졌으면 그만큼(최대 4장, 최소 2장) 수비 군사를 갖춰야 한다 */
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
 * 과학 가능량 = 기본 과학 + (식량을 과학으로 바꿀 수 있으면) 남는 식량. 자유는 식량 전부, 합리주의는 +3(한국 +5).
 */
/** 이 정도 타일(영토)이 있으면 문화보다 과학을 챙긴다 */
const TERRITORY_OK = 10

function policyOrder(s: GameState, p: Player): Policy[] {
  const turn = p.turn
  const food = turn ? turn.yields.cities.reduce((n, c) => n + c.food, 0) : 0
  const base = turn ? turn.yields.science - (p.policy === 'rationalism' ? (p.civId === 'korea' ? 5 : 3) : 0) : 0
  const writing = p.techs.includes('writing')
  const cheapest = Math.min(...researchableTechs(s).map((t) => t.cost), 99)
  const withNone = base + (writing ? Math.max(0, food - totalWorkers(p)) : 0)
  // 앞으로 만날 비용 10대 기술을 감당할 수 있는지 (번성 뒤에도 막히지 않도록 여유 있게)
  const need = Math.max(cheapest, AI_TUNE.policyNeed)
  // 평등 한 번으로 관광이 상대의 문화를 넘어 탈락시킬 수 있으면 (아폴로 질주 중이어도) 평등
  if (p.policy !== 'equality') {
    const gain = Math.floor(totalWorkers(p) / 2)
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
  const surplus = food - totalWorkers(p)
  const tiles = p.cities.reduce((n, c) => n + c.tiles.length, 0)
  const recovers = surplus >= 3 && totalWorkers(p) >= 6
  // 발판(미학·전통)이 다져졌으면(영토가 충분하고 일꾼이 행복 한계에 가깝다) 스퍼트: 자유·합리주의로 과학을 몰아 올린다
  const foundationDone = tiles >= TERRITORY_OK && totalWorkers(p) >= happiness(p) - 1
  if (foundationDone || withNone < Math.min(need, 4)) {
    const withRational = base + (p.civId === 'korea' ? 5 : 3) + (writing ? Math.max(0, food - totalWorkers(p)) : 0)
    const withLiberty = base + (writing ? food : 0)
    return withLiberty >= withRational ? ['liberty', 'rationalism', ...POLICY_PREFERENCE] : ['rationalism', 'liberty', ...POLICY_PREFERENCE]
  }
  return recovers ? ['tradition', 'aesthetics', ...POLICY_PREFERENCE] : ['aesthetics', 'tradition', ...POLICY_PREFERENCE]
}

function pendingCandidates(s: GameState, p: Player): Action[] {
  const out: Action[] = []
  if (p.pendingCity) out.push(foundSecond(p.pendingCity))
  if (p.pendingPolicies > 0) for (const policy of policyOrder(s, p)) out.push({ type: 'choosePolicy', policy })
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
      .sort((a, b) => b.minHammers - a.minHammers)
    const wonderActions: Action[] = wonders.map((w) => ({ type: 'invest', cityId: city.id, wonderId: w.id, hammers: h }))
    const cardActions: Action[] = []
    for (const o of cardOptions(p)) {
      if (o.def.notBattle || !producible(s, p, o.def.id, o.unique, city) || cardCost(p, o.def, o.unique ? uniqueOf(p, o.unique) : undefined) > h) continue
      cardActions.push({ type: 'produce', cityId: city.id, defId: o.def.id, unique: o.unique })
    }
    // 군대가 3장 미만이거나 이웃의 군사에 비해 수비가 모자라면 군사 카드를 먼저, 그 뒤에는 불가사의에 망치를 모두 건다
    const needDefense = army < defenseTarget(s, p)
    out.push(...(army < 3 || needDefense || aiStyle === 'hammer' ? [...cardActions, ...wonderActions] : [...wonderActions, ...cardActions]))
  }
  // 3) 금으로 승급 (가장 높은 단계부터 시도한다)
  if (!turn.upgraded && turn.yields.gold > 0) {
    for (const c of p.military) {
      for (const u of civById(p.civId).uniques) out.push({ type: 'upgrade', uid: c.uid, unique: u.name })
    }
    for (const c of p.military) for (const t of upgradeTargets(p, c)) out.push({ type: 'upgrade', uid: c.uid, toDefId: t.id })
  }
  // 4) 장군이 없고 군대가 있으면 점령 중인 장군 1개를 불러들여 다시 전쟁에 쓴다
  if (p.generals < 1 && !turn.recalled && army >= 2) {
    for (const t of occupiedTiles(s, p)) out.push({ type: 'recallGeneral', ...t })
  }
  return out
}

/** 지금 얼마나 앞서 있는지: 문화(타일), 기술, 불가사의, 일꾼, 군사 */
export function standing(p: Player): number {
  return culture(p) + 2 * p.techs.length + 3 * p.wonders.length + totalWorkers(p) + 0.5 * armyOf(p)
}
/** 1등(가장 앞선 문명)과 2등. 탈락한 문명은 뺀다. */
export function rankTop(s: GameState): { leader: Player; runnerUp: Player } | null {
  const alive = s.players.filter((q) => !q.eliminated).sort((a, b) => standing(b) - standing(a) || a.id - b.id)
  return alive.length >= 3 ? { leader: alive[0], runnerUp: alive[1] } : null
}

function declareCandidates(s: GameState, p: Player): Action[] {
  const out: Action[] = []
  const army = p.military.filter((c) => cardStats(c).hp !== undefined).length
  if (army >= 2) {
    // 탈환 → 상대의 좋은 타일(산출·자원·행복) → 도시 순으로 노린다. 좋은 타일을 점령해 상대의 성장을 누른다
    const value = (t: ReturnType<typeof declarationTargets>[number]): number => {
      if (t.kind === 'retake') return 1000
      if (t.kind === 'city') return 0
      const owner = s.players[t.defenderId]
      const card = owner.cities.find((c) => c.id === t.cityId)?.tiles.find((x) => x.card.id === t.tileId)?.card
      if (!card) return 0
      const r = card.resource ? RESOURCES[card.resource] : undefined
      return weight(tileYield(card, ctxOf(owner))) + (r?.kind === 'luxury' ? 4 : r?.kind === 'strategic' ? 3 : 0) + (card.wonder ? 6 : 0)
    }
    // 셋 이상이면 한 사람을 집중공략하지 않고, 딸리는 나라들이 함께 1등을 견제한다.
    // 1등은 2등을 견제한다. 탈환은 언제든 할 수 있다.
    const top = AI_TUNE.coalition ? rankTop(s) : null
    const aim = top ? (p.id === top.leader.id ? top.runnerUp.id : top.leader.id) : null
    const targets = declarationTargets(s, p)
      .filter((t) => aim === null || t.kind === 'retake' || t.defenderId === aim)
      .sort((a, b) => value(b) - value(a))
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
  plan = p.cities.length ? lateGame(p, s) : null
  switch (s.phase) {
    case 'setup':
      return [foundAction(p, p.hand)]
    case 'place': {
      const baseScience = civById(p.civId).bonus.science ?? 0
      defending = armyOf(p) < defenseTarget(s, p)
      starving = baseScience < Math.min(...researchableTechs(s).map((t) => t.cost), 99)
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
