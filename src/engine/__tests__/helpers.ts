import type { GameState, Player, TileCard } from '../types'
import { createGame, currentPlayer, apply } from '../game'
import type { Action } from '../types'

let nextId = 1000
export const tile = (terrains: TileCard['terrains'], extra: Partial<TileCard> = {}): TileCard => ({
  id: nextId++,
  terrains,
  ...extra,
})

/** 지정한 카드가 맨 앞에 오는 덱 (뒤는 평지로 채움). 첫 차례 선수는 첫 4~5장을 받는다. */
export function deckWith(front: TileCard[]): TileCard[] {
  const filler = Array.from({ length: 60 }, () => tile(['평지']))
  return [...front, ...filler]
}

/** 덱 섞기를 우회하려고 상태의 덱/손을 직접 지정한다. */
export function startGame(civIds: string[], hands: TileCard[][], rest: TileCard[] = []): GameState {
  let s = createGame({ seed: 1, civIds, deck: deckWith([]) })
  s = structuredClone(s)
  const filler = Array.from({ length: 60 }, () => tile(['평지']))
  s.deck = [...rest, ...filler]
  // 우선도 순서대로 손 배정
  s.order.forEach((pid, i) => {
    s.players[pid].hand = hands[i] ?? hands[hands.length - 1].map((c) => ({ ...c, id: nextId++ }))
  })
  return s
}

export function found(s: GameState, cityIdx = 0): GameState {
  const p = currentPlayer(s)
  const [city, ...others] = p.hand
  const sides = ['N', 'E', 'S', 'W'] as const
  const sideTiles: Partial<Record<(typeof sides)[number], number>> = {}
  others.slice(0, 4).forEach((c, i) => (sideTiles[sides[i]] = c.id)) // 5장을 넘는 타일은 추가 타일이 된다
  void cityIdx
  return apply(s, { type: 'buildCity', cityTileId: city.id, sideTiles })
}

export function play(s: GameState, ...actions: Action[]): GameState {
  return actions.reduce((st, a) => apply(st, a), s)
}

export const me = (s: GameState): Player => currentPlayer(s)
