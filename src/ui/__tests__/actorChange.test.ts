import { describe, expect, it } from 'vitest'
import { actorOf, aiStep, createGame } from '../../engine'
import type { GameState } from '../../engine'
import { actorChange, snap } from '../actorChange'
import type { ToastMsg } from '../actorChange'

describe('시점 화면 알림 (지금 차례 문명의 확정한 행동)', () => {
  it('연구·생산은 알리고, 거꾸로 가면 취소, 다른 단계는 조용하다', () => {
    let g: GameState = createGame({ seed: 7, civIds: ['korea', 'germany', 'brazil'] })
    const seen: ToastMsg[] = []
    let undo = 0
    for (let i = 0; i < 400 && g.phase !== 'over'; i++) {
      const id = actorOf(g)
      const before = g
      g = aiStep(g).state
      const m = actorChange(snap(before, id), g, [])
      if (m) seen.push(m)
      // 되돌리기: 뒤 상태에서 앞 상태로 돌아간 것으로 본다
      const back = actorChange(snap(g, id), before, [])
      if (m && back?.kind === 'undo') undo++
    }
    const research = seen.find((m) => m.kind === 'research')
    expect(research && research.kind === 'research' && research.text).toMatch(/^.+[은는] .+[을를] 연구했다$/)
    const produce = seen.find((m) => m.kind === 'produce')
    expect(produce && produce.kind === 'produce' && produce.lines[0].what).toMatch(/ (생산|투자)$|에 투자$/)
    expect(undo).toBeGreaterThan(0)
    expect(seen.every((m) => m.kind !== 'undo')).toBe(true)
  })
})
