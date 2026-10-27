import type { Action, GameState, Player } from '../engine'
import {
  MILITARY_CARDS,
  cardCost,
  civById,
  investableWonders,
  minHammers,
  occupiedTiles,
  researchableTechs,
  upgradeTargets,
} from '../engine'
import { canHammerScience } from '../engine'
import { produceBlock } from './gameInfo'

const hasPending = (p: Player) => p.pendingPolicies > 0 || !!p.policyOffer || !!p.pendingCity || p.pendingFreeCards > 0 || !!p.pendingTiles?.length

/** 쓸 수 있는 과학의 최댓값: 과학 + (문자) 식량 전부 + (과학이론) 망치 2 */
export function maxSciencePool(p: Player): number {
  const y = p.turn!.yields
  const food = p.techs.includes('writing') ? y.cities.reduce((n, c) => n + c.food, 0) : 0
  const hammer = canHammerScience(p) ? Math.min(2, y.cities.reduce((n, c) => n + c.hammer, 0)) : 0
  return y.science + food + hammer
}

/**
 * 과학 need만큼을 식량(문자) 먼저, 그다음 망치(과학이론, 합쳐 2)로 채우는 도시별 변환안.
 * 다 채우지 못하면 null.
 */
export function sciencePlan(p: Player, need: number): { food: Record<number, number>; hammer: Record<number, number> } | null {
  const cities = p.turn!.yields.cities
  const food: Record<number, number> = {}
  const hammer: Record<number, number> = {}
  let left = Math.max(0, need)
  if (p.techs.includes('writing'))
    for (const c of cities) {
      const n = Math.min(left, c.food)
      if (n <= 0) continue
      food[c.cityId] = n
      left -= n
    }
  let hLeft = 2
  if (canHammerScience(p))
    for (const c of cities) {
      const n = Math.min(left, c.hammer, hLeft)
      if (n <= 0) continue
      hammer[c.cityId] = n
      left -= n
      hLeft -= n
    }
  return left > 0 ? null : { food, hammer }
}

/** 이 도시에서 지금 망치로 할 수 있는 일이 있는지 */
export function cityCanProduce(game: GameState, p: Player, cityId: number): boolean {
  const city = p.cities.find((c) => c.id === cityId)!
  const h = p.turn!.yields.cities.find((c) => c.cityId === cityId)?.hammer ?? 0
  if (investableWonders(game, p, city).some((w) => minHammers(p, w) <= h)) return true
  return MILITARY_CARDS.some((def) => {
    const entries = [...(def.uniqueOnly ? [] : [undefined]), ...civById(p.civId).uniques.filter((u) => u.base === def.id).map((u) => u.name)]
    return entries.some((u) => produceBlock(game, p, def, u, city, h) === null)
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
    const bombTargets = game.players.some((o) => o.cities.some((c) => c.tiles.some((t) => t.occupiedBy === p.id && t.role === 'extra')))
    if (p.military.some((c) => c.defId === 'atomic_bomb') && bombTargets) return null
    const enemyGenerals = p.cities.some((c) => c.tiles.some((t) => t.occupiedBy !== undefined && t.occupiedBy !== p.id))
    if (p.wonders.includes('great_wall') && !p.greatWallUsed && enemyGenerals) return null
    if (p.held) return null // 맡아둔 타일을 돌려보내 일꾼을 선전포고에 쓸 수 있다
    if (p.civId === 'india' && p.military.length > 0) return null
    return { action: { type: 'endProduction' }, reason: '망치·금으로 할 수 있는 일이 없어 생산을 넘겼습니다.' }
  }
  return null
}
