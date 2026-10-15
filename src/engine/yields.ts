import type { City, PartialYield, Player, Terrain, TileCard, TurnYields, Yield } from './types'
import { RESOURCES, TERRAINS, WONDERS, civById } from './data'
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
  return terrains.reduce((best, t) => (rank(t) < rank(best) ? t : best))
}

export interface YieldCtx {
  civ: CivDef
  techs: ReadonlySet<string>
  /** 이번 차례에 연구한 기술: "다음 차례부터" 효과를 제외한다 */
  fresh: ReadonlySet<string>
}

export function ctxOf(player: Player): YieldCtx {
  return { civ: civById(player.civId), techs: new Set(player.techs), fresh: new Set(player.freshTechs) }
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
    for (const t of city.tiles) {
      if (t.role !== 'city' && !city.placed.includes(t.card.id)) continue
      const y = tileYield(t.card, ctx)
      food += y.food
      hammer += y.hammer
      science += y.science
      gold += y.gold
    }
    return { cityId: city.id, food, hammer }
  })
  return { cities, science, gold }
}

export function culture(player: Player): number {
  return player.cities.reduce((n, c) => n + c.tiles.length, 0)
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
  return civ.happiness + luxuries.size + bonus
}

export const totalWorkers = (p: Player): number => p.cities.reduce((n, c) => n + c.workers, 0)
