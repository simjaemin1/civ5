import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { aiStep, createGame } from '../../engine'
import type { GameState } from '../../engine'
import { Board } from '../Board'

describe('점령당한 타일의 위대한 장군 토큰', () => {
  it('그 라운드에 올려 둔 일꾼이 남아 있어도 전투에 지자마자 점령한 장군이 보인다', () => {
    let s: GameState = createGame({ seed: 11, civIds: ['korea', 'russia', 'egypt'] })
    const occupied = () => s.players.flatMap((p) => p.cities.flatMap((c) => c.tiles.filter((t) => t.occupiedBy !== undefined).map((t) => ({ p, c, t }))))[0]
    for (let i = 0; i < 6000 && !occupied() && s.phase !== 'over'; i++) s = aiStep(s).state
    const hit = occupied()
    expect(hit).toBeDefined()
    // 점령된 타일에 이 라운드의 일꾼 기록이 남아 있는 상황
    s = structuredClone(s)
    const city = s.players[hit.p.id].cities.find((c) => c.id === hit.c.id)!
    city.placed = [...new Set([...city.placed, hit.t.card.id])]
    const html = renderToStaticMarkup(<Board game={s} player={s.players[hit.p.id]} />)
    expect(html).toContain('위대한 장군이 점령 중')
  }, 60_000)
})
