import type { Action, GameState, Player } from '../engine'
import {
  MILITARY_CARDS,
  cardCost,
  civById,
  investableWonders,
  minHammers,
  occupiedTiles,
  producible,
  researchableTechs,
  uniqueOf,
  upgradeTargets,
} from '../engine'

const hasPending = (p: Player) => p.pendingPolicies > 0 || !!p.pendingCity || p.pendingFreeCards > 0

/** 쓸 수 있는 과학의 최댓값: 과학 + (문자) 식량 전부 + (과학이론) 망치 2 */
export function maxSciencePool(p: Player): number {
  const y = p.turn!.yields
  const food = p.techs.includes('writing') ? y.cities.reduce((n, c) => n + c.food, 0) : 0
  const hammer = p.techs.includes('scientific_theory') ? Math.min(2, y.cities.reduce((n, c) => n + c.hammer, 0)) : 0
  return y.science + food + hammer
}

/** 이 도시에서 지금 망치로 할 수 있는 일이 있는지 */
export function cityCanProduce(game: GameState, p: Player, cityId: number): boolean {
  const city = p.cities.find((c) => c.id === cityId)!
  const h = p.turn!.yields.cities.find((c) => c.cityId === cityId)?.hammer ?? 0
  if (investableWonders(game, p, city).some((w) => minHammers(p, w) <= h)) return true
  return MILITARY_CARDS.some((def) => {
    const entries = [undefined, ...civById(p.civId).uniques.filter((u) => u.base === def.id).map((u) => u.name)]
    return entries.some((u) => producible(game, p, def.id, u, city) && cardCost(p, def, u ? uniqueOf(p, u) : undefined) <= h)
  })
}

/**
 * 사람이 고를 것이 전혀 없는 단계면 넘기는 행동과 이유를 돌려준다 (설정에서 켰을 때만 쓴다).
 * 정책·두 번째 도시 같은 대기 중인 선택이 있으면 넘기지 않는다.
 */
export function autoSkipAction(game: GameState, p: Player): { action: Action; reason: string } | null {
  if (!p.turn || hasPending(p)) return null
  if (game.phase === 'research') {
    const pool = maxSciencePool(p)
    if (!researchableTechs(game).some((t) => t.cost <= pool)) return { action: { type: 'skipResearch' }, reason: '연구할 수 있는 기술이 없어 연구를 넘겼습니다.' }
    return null
  }
  if (game.phase === 'produce') {
    const t = p.turn
    if (p.cities.some((c) => !t.produced.includes(c.id) && cityCanProduce(game, p, c.id))) return null
    if (!t.upgraded && p.military.some((c) => upgradeTargets(p, c).some((u) => cardCost(p, u) <= t.yields.gold))) return null
    if (!t.recalled && occupiedTiles(game, p).length > 0) return null
    if (p.military.some((c) => c.defId === 'atomic_bomb')) return null
    if (p.wonders.includes('great_wall') && !p.greatWallUsed) return null
    if (p.civId === 'india' && p.military.length > 0) return null
    return { action: { type: 'endProduction' }, reason: '망치·금으로 할 수 있는 일이 없어 생산을 넘겼습니다.' }
  }
  return null
}
