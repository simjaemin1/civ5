import type { GameState, Player } from './types'
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

/** 정찰: 일꾼 1개로 타일 덱 맨 위 카드 1장을 본다. 엘도라도를 처음 발견하면 문화 1. */
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
  // 규칙서 9장: 한 차례에 1장만 볼 수 있다. 나침반으로 맡아둔 뒤 돌려보내고 다시 정찰하는 것도 막는다
  if (p.scoutedRound === s.round) throw new RuleError('정찰은 한 차례에 1장만 볼 수 있습니다 (이번 차례에 이미 봤습니다)')
  p.scoutedRound = s.round
  p.scouted = s.deck.shift()!
  p.scouting = true
  say(s, `${civById(p.civId).name} 정찰`)
  const w = p.scouted.wonder ? WONDERS[p.scouted.wonder] : undefined
  if (w?.cultureOnDiscover && !s.eldoradoFound) {
    s.eldoradoFound = true
    gainCulture(s, p, w.cultureOnDiscover)
  }
}

/** 나침반: 정찰한 카드를 돌려넣지 않고 맡아둔다 (최대 1장, 일꾼 1개가 그 위에 남는다). */
export function holdScouted(s: GameState, p: Player): void {
  if (!p.techs.includes('compass')) throw new RuleError('나침반을 연구해야 합니다')
  if (!p.scouted) throw new RuleError('맡아둘 정찰한 카드가 없습니다')
  p.held = p.scouted
  p.scouted = null
  say(s, `${civById(p.civId).name} 타일 맡아두기`)
}

/** 선전포고에 걸 수 있는 일꾼 수: 이번 차례에 정찰하고 맡아둔 뒤 돌려보낸 일꾼은 이미 쓴 일꾼이라 선전포고에 쓸 수 없다 (규칙서 9장) */
export function declarationWorkers(s: GameState, p: Player): number {
  return freeWorkers(p) - (p.scoutReleasedRound === s.round ? 1 : 0)
}

export function releaseHeld(s: GameState, p: Player): void {
  if (!p.held) throw new RuleError('맡아둔 타일이 없습니다')
  returnToDeck(s, p.held)
  p.held = null
  p.scouting = false // 일꾼이 돌아온다: 돌려보내기는 일꾼 배치 때 하므로 이번 차례에도 쓸 수 있다
  if (p.scoutedRound === s.round) p.scoutReleasedRound = s.round // 이번 차례에 정찰에 쓴 일꾼은 이미 쓴 일꾼
  p.scoutCity = undefined
}

/** 차례가 끝날 때 본 카드를 덱에 돌려넣고 섞는다 */
export function endScouting(s: GameState, p: Player): void {
  if (p.scouted) {
    returnToDeck(s, p.scouted)
    p.scouted = null
  }
  p.scouting = false
  if (!p.held) p.scoutCity = undefined
}
