import { describe, expect, it } from 'vitest'
import { actorOf, aiStep, createGame } from '../../engine'
import type { GameState } from '../../engine'
import { actorChange, snap } from '../actorChange'
import type { ProduceLine, ToastMsg } from '../actorChange'

describe('시점 화면 안내 (지금 차례 문명이 결정을 마쳤을 때만)', () => {
  it('연구는 고르면 바로, 생산은 생산 단계를 마칠 때 한 번에, 연구를 되돌리면 취소', () => {
    let g: GameState = createGame({ seed: 7, civIds: ['korea', 'germany', 'brazil'] })
    const seen: { m: ToastMsg; phase: GameState['phase'] }[] = []
    let lines: ProduceLine[] = []
    let undo = 0
    for (let i = 0; i < 400 && g.phase !== 'over'; i++) {
      const id = actorOf(g)
      const before = g
      g = aiStep(g).state
      const m = actorChange(snap(before, id), g, lines)
      if (m?.kind === 'collect') lines = m.lines
      else if (m) {
        seen.push({ m, phase: g.phase })
        lines = []
        if (m.kind === 'research' && actorChange(snap(g, id), before, [])?.kind === 'undo') undo++
      }
    }
    const research = seen.find((x) => x.m.kind === 'research')?.m
    expect(research?.kind === 'research' && research.text).toMatch(/^.+[을를] 선택!$/)
    const produce = seen.filter((x) => x.m.kind === 'produce')
    expect(produce.length).toBeGreaterThan(0)
    // 생산 중간에는 띄우지 않는다: 생산 안내는 모두 생산 단계를 벗어난 뒤에 나온다
    expect(produce.every((x) => x.phase !== 'produce')).toBe(true)
    const p = produce.find((x) => x.m.kind === 'produce' && x.m.lines.length)!.m
    expect(p.kind === 'produce' && p.lines[0].what).toMatch(/ 생산$|에 투자$/)
    expect(undo).toBeGreaterThan(0)
    expect(seen.every((x) => x.m.kind !== 'undo')).toBe(true)
  })
})
