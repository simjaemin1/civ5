import type { Action, CardInst, GameState, Player, Side, TileCard } from './types'
import { RuleError, SIDES } from './types'
import { MILITARY_CARDS, RESOURCES, TECHS, WONDERS, cardById, civById, wonderCardById } from './data'
import { cardStats } from './cardstats'
import type { TechDef } from './data'
import { apply, researchableTechs } from './game'
import { canHammerScience, ctxOf, culture, happiness, rationalismScience, tileYield, totalWorkers, tourism } from './yields'
import { investableWonders, minHammers } from './wonders'
import { MAX_HOLD, cardCost, heldCount, producible, uniqueOf, upgradeTargets } from './military'
import { declarationTargets, findTile, occupiedTiles, targetSlot } from './war'
import { currentPlayer, defaultTileCity } from './core'

/** 규칙 검증용 단순 휴리스틱 AI. 후보 행동을 순서대로 시도해 규칙을 어기지 않는 첫 행동을 쓴다. */

/** 실험용 AI 성향: 'hammer'는 망치 올인 (타일은 망치 위주, 군사 카드를 먼저 만든다) */
let aiStyle: 'default' | 'hammer' = 'default'
export const setAiStyle = (style: 'default' | 'hammer'): void => {
  aiStyle = style
}

/** 튜닝값 (시뮬레이션으로 조정) */
/** 시뮬레이션(30판)으로 고른 값: 정책은 과학 12 미만이면 합리주의·자유로, 과학이론 우선도 +60, 아폴로 질주는 남은 기술 8개부터 (더 일찍 달리면 오히려 판이 길어진다) */
export const AI_TUNE = { scienceWeight: 1.3, apolloRush: 8, policyNeed: 12, coalition: true, cultureRush: 9, cultureSlack: 2, warlord: true, warlordArmy: 6 }

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

function buildPriority(p: Player, t: TechDef): number {
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
    const wonderActions: Action[] = wonders.map((w) => ({ type: 'invest', cityId: city.id, wonderId: w.id, hammers: h }))
    const cardActions: Action[] = []
    for (const o of cardOptions(p)) {
      if (o.def.notBattle || (!o.unique && heldCount(p, o.def.id) >= MAX_HOLD) || !producible(s, p, o.def.id, o.unique, city) || cardCost(p, o.def, o.unique ? uniqueOf(p, o.unique) : undefined) > h) continue
      cardActions.push({ type: 'produce', cityId: city.id, defId: o.def.id, unique: o.unique })
    }
    // 군대가 3장 미만이거나 이웃의 군사에 비해 수비가 모자라면 군사 카드를 먼저, 그 뒤에는 불가사의에 망치를 모두 건다
    const needDefense = army < defenseTarget(s, p)
    const warRush = isWarlord(p) && warFoundation(p) && preIndustrial(s)
    // 공성 카드가 없으면 그것부터 만든다 (도시를 치려면 공성 카드가 살아남아야 한다)
    const joinSiege = !isWarlord(p) && !hasSiege(p) && (() => { const l = coalitionLeader(s, p); return !!l && l.cities.length > 0 && sidesOccupied(l) >= 2 })()
    const rush = (warRush && army < AI_TUNE.warlordArmy) || ((warRush || joinSiege) && !hasSiege(p) && cardActions.some(isSiegeAction))
    if ((warRush || joinSiege) && !hasSiege(p)) cardActions.sort((x, y) => Number(isSiegeAction(y)) - Number(isSiegeAction(x)))
    // 줄루의 임피는 상대 카드의 효과 칸 공격과 효과(원거리의 반격 없음 등)를 없애므로, 줄루가 상대면 마크로만 싸우는 보병 계열을 먼저 만든다
    if (facesImpi(s, p)) cardActions.sort((x, y) => Number(isInfantryAction(y)) - Number(isInfantryAction(x)))
    out.push(...(army < 3 || needDefense || rush || aiStyle === 'hammer' ? [...cardActions, ...wonderActions] : [...wonderActions, ...cardActions]))
  }
  // 3) 금으로 승급 (가장 높은 단계부터 시도한다)
  if (!turn.upgraded && turn.yields.gold > 0) {
    for (const c of p.military) {
      for (const u of civById(p.civId).uniques) out.push({ type: 'upgrade', uid: c.uid, unique: u.name })
    }
    for (const c of p.military) for (const t of upgradeTargets(p, c).filter((x) => heldCount(p, x.id) < MAX_HOLD)) out.push({ type: 'upgrade', uid: c.uid, toDefId: t.id })
  }
  // 4) 장군이 없고 군대가 있으면 점령 중인 장군 1개를 불러들여 다시 전쟁에 쓴다.
  //    다만 상대에게 중요한 타일(좋은 산출·자원·자연경관)을 점령 중이면 그대로 들고 있는다. 상대의 성장을 누르는 편이 낫다.
  if (p.generals < 1 && !turn.recalled && army >= 2) {
    const cheap = occupiedTiles(s, p)
      .map((t) => ({ t, v: tileImportance(s, t.defenderId, t.cityId, t.tileId) }))
      .filter((x) => x.v < KEEP_OCCUPIED)
      .filter((x) => !keepForConquest(s, p, x.t))
      .sort((a, b) => a.v - b.v)
    for (const { t } of cheap) out.push({ type: 'recallGeneral', ...t })
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

function declareCandidates(s: GameState, p: Player): Action[] {
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
    let rate = value
    if (!isWarlord(p) && top && aim === top.leader.id) {
      // 1등을 견제하는 연합: 도시 옆 4칸을 함께 점령해 두면 (누구의 장군이든) 공성 카드를 가진 누구나 도시를 파괴할 수 있다
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
      rate = (t) => {
        if (t.kind === 'retake') return 1000
        if (t.kind === 'city') return hasSiege(p) ? 500 : -1
        const o = s.players[t.defenderId]
        const side = t.cityId === conquestCity(o).id && findTile(o, t.cityId, t.tileId)?.tile.role === 'side'
        return tileImportance(s, t.defenderId, t.cityId, t.tileId) + (side ? 8 : 0)
      }
    }
    const targets = declarationTargets(s, p)
      .filter((t) => aim === null || t.kind === 'retake' || t.defenderId === aim || (isWarlord(p) && t.kind === 'city'))
      .filter((t) => rate(t) >= 0)
      .sort((a, b) => rate(b) - rate(a))
    // 같은 타일에 이미 다른 문명이 선전포고했다면 앞 문명이 이길 때 전투 없이 끝나므로 뒤로 미룬다
    const taken = (t: (typeof targets)[number]) => t.kind !== 'retake' && s.declarations.some((d) => d.defenderId === t.defenderId && d.cityId === t.cityId && d.tileId === t.tileId)
    targets.sort((a, b) => Number(taken(a)) - Number(taken(b)))
    for (const t of targets) out.push({ type: 'declareWar', defenderId: t.defenderId, cityId: t.cityId, tileId: t.tileId })
  } else {
    for (const t of declarationTargets(s, p)) {
      if (t.kind === 'retake') out.push({ type: 'declareWar', defenderId: t.defenderId, cityId: t.cityId, tileId: t.tileId })
    }
  }
  out.push({ type: 'endTurn' })
  return out
}

/**
 * 공격 마크가 상대 칸 안쪽(1~4번)을 향하면 값이 있고 벽(범위 밖)을 향하면 헛방이다.
 * 원거리 계열은 반드시 안쪽을 향하게, 창병 계열은 벽을 향해도 괜찮지만 임피는 공격수라 안쪽을 향하게 둔다.
 */
function wallWeight(c: CardInst): number {
  if (cardStats(c).effect === 'impi') return 3
  const line = cardById(c.defId).line
  if (line === 'ranged') return 3
  if (line === 'anti_cavalry') return 0.3
  return 2
}

/** 이 카드를 slot(1~4번)에 놓았을 때 안쪽을 향하는 공격의 가치 */
function inwardValue(c: CardInst, slot: number): number {
  const w = wallWeight(c)
  return cardStats(c).marks.reduce((n, m) => {
    const j = targetSlot(m.dir, slot)
    return n + (j >= 1 && j <= 4 ? m.power * w : 0)
  }, 0)
}

/** 낼 카드(최대 4장)를 4칸에 놓는 방법 중 안쪽을 향하는 공격이 가장 많은 것. 같으면 원래 순서를 지킨다 */
export function bestSlots(p: Player, uids: number[]): (number | null)[] {
  const base: (number | null)[] = [uids[0] ?? null, uids[1] ?? null, uids[2] ?? null, uids[3] ?? null]
  const inst = (u: number) => p.military.find((c) => c.uid === u)!
  const score = (slots: (number | null)[]): number => slots.reduce<number>((n, u, i) => n + (u === null ? 0 : inwardValue(inst(u), i + 1)), 0)
  let best = base
  let bestScore = score(base)
  const used = new Set<number>()
  const cur: (number | null)[] = []
  const walk = (i: number) => {
    if (i === 4) {
      const sc = score(cur)
      if (sc > bestScore) {
        best = [...cur]
        bestScore = sc
      }
      return
    }
    for (const u of uids) {
      if (used.has(u)) continue
      used.add(u)
      cur[i] = u
      walk(i + 1)
      used.delete(u)
    }
    // 카드가 4장보다 적으면 빈칸도 둘 수 있다
    if (cur.filter((x, k) => k < i && x !== null).length + (4 - i) > uids.length) {
      cur[i] = null
      walk(i + 1)
    }
  }
  walk(0)
  return best
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
    // 도시를 공격할 때는 공성 카드를 반드시 내보낸다 (살아남아 이겨야 도시가 파괴된다)
    const siegeFirst = (uid: number) => (b.decl.kind === 'city' && b.decl.attackerId === pid && cardStats(p.military.find((c) => c.uid === uid)!).siege ? 1000 : 0)
    const usable = p.military.map((c) => c.uid).sort((x, y) => power(y) + siegeFirst(y) - (power(x) + siegeFirst(x)))
    const picked = usable.slice(0, 4)
    return [
      { type: 'arrangeBattle', playerId: pid, slots: bestSlots(p, picked) },
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
  const picks: Record<number, number | null> = {}
  for (const uid of head.uids) {
    const me = p.military.find((c) => c.uid === uid)!
    picks[uid] = cardStats(me).baseId === 'tank' && antiTank.length ? antiTank[0] : (sorted[0] ?? null)
  }
  return [{ type: 'chooseTargets', playerId: pid, picks }]
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
