import { describe, expect, it } from 'vitest'
import { TILE_DECK_SIZE } from '../../engine'
import { HAND_SIZE, newTileDraw, redrawTiles } from '../lab/tileLab'

describe('타일 뽑기 랩', () => {
  it('실제 덱에서 4장을 뽑는다 (덱과 손을 합치면 160장)', () => {
    const s = newTileDraw(7)
    expect(s.hand).toHaveLength(HAND_SIZE)
    expect(s.deck.length + s.hand.length).toBe(TILE_DECK_SIZE)
  })

  it('고른 장수만큼 다시 뽑고, 고르지 않은 타일은 그대로 남는다', () => {
    const s = newTileDraw(7)
    const keep = s.hand.slice(2).map((c) => c.id)
    const t = redrawTiles(s, s.hand.slice(0, 2).map((c) => c.id))
    expect(t.hand).toHaveLength(HAND_SIZE)
    expect(t.hand.slice(0, 2).map((c) => c.id)).toEqual(keep)
    expect(t.deck.length + t.hand.length).toBe(TILE_DECK_SIZE)
    expect(new Set([...t.deck, ...t.hand].map((c) => c.id)).size).toBe(TILE_DECK_SIZE)
    expect(t.redraws).toBe(1)
    expect(t.redrawn).toBe(2)
    // 아무것도 고르지 않으면 그대로
    expect(redrawTiles(t, [])).toBe(t)
  })
})
