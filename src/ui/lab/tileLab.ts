import { makeTileDeck } from '../../engine'
import { shuffle } from '../../engine/rng'
import type { TileCard } from '../../engine'

/** 타일 뽑기 랩의 상태: 실제 160장 덱에서 손으로 뽑고, 고른 장수만큼 다시 뽑는다 */
export interface TileLabState {
  rng: number
  deck: TileCard[]
  hand: TileCard[]
  /** 지금 판에서 다시 뽑은 횟수와 장수 */
  redraws: number
  redrawn: number
}

export const HAND_SIZE = 4

/** 새 덱을 섞어 4장을 뽑는다 */
export function newTileDraw(seed: number): TileLabState {
  const s: TileLabState = { rng: seed >>> 0, deck: makeTileDeck(seed), hand: [], redraws: 0, redrawn: 0 }
  shuffle(s, s.deck)
  s.hand = s.deck.splice(0, HAND_SIZE)
  return s
}

/** 고른 타일을 덱에 돌려넣고 섞은 뒤 같은 장수를 새로 뽑는다 (게임의 불모지 탈출처럼 버린 타일이 다시 나올 수 있다) */
export function redrawTiles(prev: TileLabState, ids: number[]): TileLabState {
  const pick = new Set(ids)
  const back = prev.hand.filter((c) => pick.has(c.id))
  if (!back.length) return prev
  const s: TileLabState = { ...prev, deck: [...prev.deck, ...back], hand: prev.hand.filter((c) => !pick.has(c.id)) }
  shuffle(s, s.deck)
  s.hand = [...s.hand, ...s.deck.splice(0, back.length)]
  s.redraws += 1
  s.redrawn += back.length
  return s
}
