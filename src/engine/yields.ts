import type { City, PartialYield, Player, Terrain, TileCard, TurnYields, Yield } from './types'
import { RESOURCES, TECHS, TERRAINS, WONDERS, civById, wonderCardById } from './data'
import type { CivDef } from './data'

export const ZERO: Yield = { food: 0, hammer: 0, science: 0, gold: 0 }

export function addYield(a: Yield, b: PartialYield): Yield {
  return {
    food: a.food + (b.food ?? 0),
    hammer: a.hammer + (b.hammer ?? 0),
    science: a.science + (b.science ?? 0),
    gold: a.gold + (b.gold ?? 0),
  }
}

/** 지형 우선순위: 정글·숲 → 설원 → 언덕 → 나머지 (같은 순위면 먼저 적힌 지형). */
export function primaryTerrain(terrains: Terrain[]): Terrain {
  const rank = (t: Terrain) => (t === '정글' || t === '숲' ? 0 : t === '설원' ? 1 : t === '언덕' ? 2 : 3)
  if (terrains.length === 0) return '산' // 지형이 적히지 않은 자연경관: 산출은 카드 값을 쓰므로 지형 효과는 없다
  return terrains.reduce((best, t) => (rank(t) < rank(best) ? t : best))
}

export interface YieldCtx {
  civ: CivDef
  techs: ReadonlySet<string>
  /** 이번 차례에 연구한 기술: "다음 차례부터" 효과를 제외한다 */
  fresh: ReadonlySet<string>
  /** 페트라: 사막 타일 식량 +1 */
  desertBonus: boolean
}

export function ctxOf(player: Player): YieldCtx {
  return {
    civ: civById(player.civId),
    techs: new Set(player.techs),
    fresh: new Set(player.freshTechs),
    desertBonus: player.wonders.includes('petra'),
  }
}

export function tileYield(card: TileCard, ctx: YieldCtx): Yield {
  let y: Yield = ZERO
  if (card.wonder) {
    y = addYield(y, WONDERS[card.wonder].yield)
  } else {
    const terrain = primaryTerrain(card.terrains)
    const override = ctx.civ.terrainOverride?.find((o) => o.terrain === terrain)
    y = addYield(y, override ? override.yield : TERRAINS[terrain])
  }
  if (card.resource) {
    const res = RESOURCES[card.resource]
    y = addYield(y, res.printed)
    for (const b of res.boosts ?? []) {
      if (!ctx.techs.has(b.tech)) continue
      if (b.nextTurn && ctx.fresh.has(b.tech)) continue
      y = addYield(y, b.yield)
    }
  }
  for (const m of ctx.civ.tileMods ?? []) {
    const hit =
      (m.terrain !== undefined && card.terrains.includes(m.terrain as Terrain)) ||
      (m.resource !== undefined && card.resource === m.resource)
    if (hit) y = addYield(y, m.yield)
  }
  if (ctx.desertBonus && card.terrains.includes('사막')) {
    // 페트라: 영토의 모든 사막 타일 식량 +1
    y = { ...y, food: y.food + 1 }
  }
  return y
}

/** 도시 타일은 일꾼이 없어도 산출하고, 일꾼이 놓인 타일만 추가로 산출한다. */
export function computeYields(player: Player): TurnYields {
  const ctx = ctxOf(player)
  let science = ctx.civ.bonus.science ?? 0
  let gold = ctx.civ.bonus.gold ?? 0
  const cities = player.cities.map((city: City, i) => {
    let food = i === 0 ? (ctx.civ.bonus.food ?? 0) : 0
    let hammer = i === 0 ? (ctx.civ.bonus.hammer ?? 0) : 0
    const cards = city.tiles
      .filter((t) => t.role === 'city' || city.placed.includes(t.card.id) || city.generalPlaced?.includes(t.card.id))
      .map((t) => t.card)
    for (const e of city.enemyPlaced ?? []) cards.push(e.card) // 몽골: 내 장군이 올라간 상대 타일
    for (const card of cards) {
      const y = tileYield(card, ctx)
      food += y.food
      hammer += y.hammer
      science += y.science
      gold += y.gold
    }
    // 로봇공학: 내 차례에 망치가 10 미만인 도시는 10이 되도록 추가로 받는다
    if (ctx.techs.has('robotics')) hammer = Math.max(hammer, 10)
    return { cityId: city.id, food, hammer }
  })
  // 천문학: 첫 도시의 첫 5타일에 산이 있으면 과학 +5
  if (ctx.techs.has('astronomy') && player.cities[0]?.tiles.some((t) => (t.role === 'city' || t.role === 'side') && t.card.terrains.includes('산'))) science += 5
  // 경제학: 다음 차례부터 금 +4
  if (ctx.techs.has('economics') && !ctx.fresh.has('economics')) gold += 4
  if (player.policy === 'rationalism') science += rationalismScience(player.civId)
  if (player.wonders.includes('colossus')) gold += 4
  // 공중정원: 다음 차례부터 첫 도시 식량 +1
  if (player.wonders.includes('hanging_gardens') && cities.length) cities[0].food += 1
  return { cities, science, gold }
}

export function culture(player: Player): number {
  // 붙이기를 기다리는 타일도 이미 얻은 문화다
  return player.cities.reduce((n, c) => n + c.tiles.length, 0) + (player.pendingTiles?.length ?? 0)
}

export function happiness(player: Player): number {
  const civ = civById(player.civId)
  const owned = new Set(player.techs)
  const luxuries = new Set<string>()
  let bonus = 0
  for (const city of player.cities) {
    for (const t of city.tiles) {
      const res = t.card.resource ? RESOURCES[t.card.resource] : undefined
      if (res?.luxuryTech && owned.has(res.luxuryTech)) luxuries.add(t.card.resource!)
      if (t.card.wonder) bonus += WONDERS[t.card.wonder].happinessOnClaim ?? 0
    }
  }
  // 완성한 불가사의의 행복 (페르시아는 2배)
  const mult = civ.id === 'persia' ? 2 : 1
  for (const id of player.wonders) {
    for (const e of wonderCardById(id).effects) if (e.kind === 'happiness') bonus += e.amount * mult
  }
  return civ.happiness + luxuries.size + bonus
}

/** 합리주의: 매 차례 과학 4 (한국은 6) */
export const rationalismScience = (civId: string): number => (civId === 'korea' ? 6 : 4)

/** 턴당 관광: 평등(문화 3당 1), 세계화·냉각기술(문화 3당 1), 루브르 +3, 에펠탑 +4 (프랑스는 불가사의 관광 2배). */
export function tourism(player: Player): number {
  let t = 0
  if (player.policy === 'equality') t += Math.floor(culture(player) / 3)
  for (const tech of TECHS) {
    if (!player.techs.includes(tech.id)) continue
    for (const e of tech.effects) {
      if (e.kind === 'tourismPerCulture') t += Math.floor(culture(player) / e.per)
    }
  }
  const mult = player.civId === 'france' ? 2 : 1
  for (const id of player.wonders) {
    for (const e of wonderCardById(id).effects) if (e.kind === 'tourism') t += e.amount * mult
  }
  return t
}

export const totalWorkers = (p: Player): number => p.cities.reduce((n, c) => n + c.workers, 0)
