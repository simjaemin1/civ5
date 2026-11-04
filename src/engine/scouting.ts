import type { GameState, Player, TileCard } from './types'
import { RuleError } from './types'
import { WONDERS, civById } from './data'
import { gainCulture, returnToDeck, say } from './core'
import { totalWorkers } from './yields'

/** 선전포고·정찰 등에 쓸 수 있는, 타일에 올리지 않은 일꾼 수 */
export function freeWorkers(p: Player): number {
  // 전통으로 버린, 이미 일한 일꾼은 타일에 남아 있지만(이번 차례 산출) 일꾼 수에서 이미 빠졌으므로 다시 빼지 않는다
  const retired = p.turn?.retiredWorked ?? {}
  const placed = p.cities.reduce((n, c) => n + c.placed.length + (c.enemyPlaced?.length ?? 0) - (retired[c.id] ?? 0), 0)
  const scouting = p.held ? 1 : p.scouting ? 1 : 0
  return totalWorkers(p) - placed - scouting - p.busyWorkers
}

/** 나침반을 연구하면 정찰할 때 보는 타일 수 (사용자 결정: 2장을 보고 그중 1장을 맡아둘 수 있다) */
export const COMPASS_SCOUT = 2
/** 정찰로 이번 차례에 본 타일들 */
export const scoutedCards = (p: Player): TileCard[] => [p.scouted, p.scoutedExtra].filter((c): c is TileCard => !!c)

/** 정찰: 일꾼 1개로 타일 덱 맨 위 카드 1장을 본다 (나침반이 있으면 2장). 엘도라도를 처음 발견하면 문화 1. */
export function scout(s: GameState, p: Player, cityId?: number): void {
  if (p.scouting || p.held) throw new RuleError('이미 정찰 중이거나 타일을 맡아두고 있습니다')
  if (freeWorkers(p) < 1) throw new RuleError('정찰에 쓸 일꾼이 없습니다')
  // 도시가 둘이면 어느 도시의 일꾼을 쓸지 고를 수 있다 (그 도시에 남는 일꾼이 있어야 한다)
  if (cityId !== undefined) {
    const city = p.cities.find((c) => c.id === cityId)
    if (!city) throw new RuleError('내 도시가 아닙니다')
    if (city.workers - city.placed.length - (city.enemyPlaced?.length ?? 0) < 1) throw new RuleError(`도시 ${city.id + 1}에는 정찰에 쓸 일꾼이 없습니다`)
  }
  p.scoutCity = cityId
  if (s.deck.length === 0) throw new RuleError('타일 덱이 비었습니다')
  // 규칙서 8장: 한 차례에 1장만 볼 수 있다. 맡아둔 뒤 돌려보내고 다시 정찰하는 것도 막는다
  if (p.scoutedRound === s.round) throw new RuleError('정찰은 한 차례에 1장만 볼 수 있습니다 (이번 차례에 이미 봤습니다)')
  p.scoutedRound = s.round
  p.scouted = s.deck.shift()!
  p.scoutedExtra = p.techs.includes('compass') && s.deck.length > 0 ? s.deck.shift()! : null
  p.scouting = true
  say(s, `${civById(p.civId).name} 정찰${p.scoutedExtra ? ' (나침반: 2장)' : ''}`)
  for (const card of scoutedCards(p)) {
    const w = card.wonder ? WONDERS[card.wonder] : undefined
    if (w?.cultureOnDiscover && !s.eldoradoFound) {
      s.eldoradoFound = true
      gainCulture(s, p, w.cultureOnDiscover)
    }
  }
}

/**
 * 맡아두기: 정찰한 카드를 돌려넣지 않고 맡아둔다 (최대 1장, 일꾼 1개가 그 위에 남는다). 게임 시작부터 할 수 있다 (사용자 결정, 예전에는 나침반 효과).
 * 나침반으로 2장을 봤으면 그중 1장을 고르고, 나머지 1장은 정찰한 카드로 남았다가 차례가 끝날 때 덱에 돌아간다
 * (맡아두기는 고르기만 하는 행동이라 덱을 건드리지 않는다: 되돌리기가 잠기지 않는다).
 */
export function holdScouted(s: GameState, p: Player, tileId?: number): void {
  if (p.held) throw new RuleError('이미 맡아둔 타일이 있습니다 (1장까지)')
  const seen = scoutedCards(p)
  if (!seen.length) throw new RuleError('맡아둘 정찰한 카드가 없습니다')
  const pick = tileId === undefined ? seen[0] : seen.find((c) => c.id === tileId)
  if (!pick) throw new RuleError('이번 차례에 정찰한 카드가 아닙니다')
  p.held = pick
  p.scouted = seen.find((c) => c.id !== pick.id) ?? null
  p.scoutedExtra = null
  say(s, `${civById(p.civId).name} 타일 맡아두기`)
}

/** 정찰만 하고 타일을 맡아두지 않은 일꾼: 타일 위에 없으므로 그 차례 선전포고에 쓸 수 있다 (사용자 결정) */
export const scoutWorkerForWar = (p: Player): boolean => p.scouting && !p.held

/**
 * 선전포고에 걸 수 있는 일꾼 수: 타일에 올리지 않은 일꾼 + 정찰만 하고 맡아두지 않은 일꾼.
 * 이번 차례에 정찰하고 맡아둔 뒤 돌려보낸 일꾼은 타일을 맡아뒀던 일꾼이라 그 차례 선전포고에 쓸 수 없다 (규칙서 9장)
 */
export function declarationWorkers(s: GameState, p: Player): number {
  return freeWorkers(p) + (scoutWorkerForWar(p) ? 1 : 0) - (p.scoutReleasedRound === s.round ? 1 : 0)
}

export function releaseHeld(s: GameState, p: Player): void {
  if (!p.held) throw new RuleError('맡아둔 타일이 없습니다')
  returnToDeck(s, p.held)
  p.held = null
  p.scouting = false // 일꾼이 돌아온다: 돌려보내기는 일꾼 배치 때 하므로 이번 차례에도 쓸 수 있다
  if (p.scoutedRound === s.round) p.scoutReleasedRound = s.round // 이번 차례에 타일을 맡아뒀던 일꾼은 그 차례 선전포고에 쓸 수 없다
  p.scoutCity = undefined
}

/** 차례가 끝날 때 본 카드를 덱에 돌려넣고 섞는다 */
export function endScouting(s: GameState, p: Player): void {
  for (const c of scoutedCards(p)) returnToDeck(s, c)
  p.scouted = null
  p.scoutedExtra = null
  p.scouting = false
  if (!p.held) p.scoutCity = undefined
}
