import { describe, expect, it } from 'vitest'
import { aiStep, createGame } from '..'

describe('인구·행복 기록', () => {
  it('"일꾼 N / 행복 M" 줄은 남기지 않고, 바뀐 경우에만 "인구 a→b"·"행복 a→b"를 남긴다', () => {
    let s = createGame({ seed: 77, civIds: ['korea', 'germany', 'egypt'] })
    for (let i = 0; i < 3000 && s.round < 10; i++) s = aiStep(s).state
    expect(s.log.some((l) => / 일꾼 \d+ \/ 행복 \d+$/.test(l))).toBe(false)
    const pop = s.log.filter((l) => / (인구|행복) \d+→\d+$/.test(l))
    expect(pop.length).toBeGreaterThan(0)
    for (const l of pop) {
      const [a, b] = l.match(/(\d+)→(\d+)$/)!.slice(1).map(Number)
      expect(a).not.toBe(b)
    }
  })
})
