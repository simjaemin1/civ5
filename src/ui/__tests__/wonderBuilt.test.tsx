import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { aiStep, createGame } from '../../engine'
import type { GameState } from '../../engine'
import { RecentLog } from '../SidePanel'

describe('최근 기록: 불가사의 완성', () => {
  it('완성된 라운드와 다음 라운드에는 맨 위에 어떤 불가사의가 지어졌는지 띄운다', () => {
    let s: GameState = createGame({ seed: 5, civIds: ['korea', 'germany', 'egypt'] })
    let line: string | undefined
    for (let i = 0; i < 4000 && s.phase !== 'over' && !line; i++) {
      s = aiStep(s).state
      line = s.log.find((l) => / 완성$/.test(l))
    }
    expect(line).toBeDefined()
    const [, civ, wonder] = line!.match(/^\[R\d+\] (\S+) (.+) 완성$/)!
    const html = renderToStaticMarkup(<RecentLog game={s} />)
    expect(html).toContain('wonder-built')
    expect(html).toContain(civ)
    expect(html).toContain(wonder)
    // 두 라운드 뒤에는 맨 위 표시가 사라진다
    expect(renderToStaticMarkup(<RecentLog game={{ ...s, round: s.round + 2 }} />)).not.toContain('wonder-built')
  }, 60_000)
})
