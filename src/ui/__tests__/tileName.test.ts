import { describe, expect, it } from 'vitest'
import { aiStep, createGame } from '../../engine'
import type { GameState } from '../../engine'
import { cityGrid } from '../cityLayout'
import { tileName } from '../gameInfo'

describe('타일 이름', () => {
  it('똑같이 생긴 타일은 왼쪽 위부터 1, 2, 3 번호를 붙이고, 하나뿐이면 번호 없이', () => {
    let s: GameState = createGame({ seed: 2, civIds: ['korea', 'germany'] })
    while (s.players[0].cities.length === 0) s = aiStep(s).state
    const city = structuredClone(s.players[0].cities[0])
    const others = city.tiles.filter((t) => t.role !== 'city')
    for (const t of others) t.card = { ...t.card, terrains: ['평지'], resource: undefined, wonder: undefined }
    others[0].card = { ...others[0].card, terrains: ['산'] }
    const order = cityGrid(city, (sd) => city.tiles.find((x) => x.role === 'side' && x.side === sd))
      .cells.filter((c) => c.tile && c.tile.role !== 'city' && c.tile !== others[0])
      .sort((a, b) => a.row - b.row || a.col - b.col)
    expect(order.map((c) => tileName(city, c.tile!.card.id))).toEqual(order.map((_, i) => `평지 ${i + 1}`))
    expect(tileName(city, others[0].card.id)).toBe('산')
  })
})
