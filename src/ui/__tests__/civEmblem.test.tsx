import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CIVS, createGame } from '../../engine'
import { CivEmblem } from '../CivEmblem'
import { civEmblem } from '../civEmblems'

describe('문명 기호', () => {
  it('24개 문명 모두 기호 그림이 있다', () => {
    expect(CIVS.filter((c) => !civEmblem(c.id)).map((c) => c.id)).toEqual([])
  })
  it('기호 버튼은 보고 있는 문명 이름을 안내하고, 누르기 전에는 창이 없다', () => {
    const game = createGame({ seed: 1, civIds: ['germany', 'korea'] })
    const html = renderToStaticMarkup(<CivEmblem player={game.players[0]} />)
    expect(html).toContain('독일')
    expect(html).toContain('civ-emblem')
    expect(html).not.toContain('civ-pop')
  })
})
