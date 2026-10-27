import { describe, expect, it } from 'vitest'
import { createGame } from '../../engine'
import type { GameState } from '../../engine'
import { eraOfColumn, soundsFor } from '../sounds'

const base = (): GameState => createGame({ seed: 1, civIds: ['korea', 'egypt'] })
const next = (s: GameState, lines: string[], fn: (c: GameState) => void = () => undefined): GameState => {
  const c = structuredClone(s)
  for (const l of lines) {
    c.log.push(l)
    c.logSeq++
  }
  fn(c)
  return c
}

describe('효과음', () => {
  it('선전포고 / 문화로 새 타일 / 정책 로그에 맞는 소리를 낸다', () => {
    const s = base()
    expect(soundsFor(s, next(s, ['[R3] 한국 → 이집트 선전포고']))).toEqual(['war'])
    expect(soundsFor(s, next(s, ['[R3] 한국 → 이집트 탈환 선전포고']))).toEqual(['war'])
    expect(soundsFor(s, next(s, ['한국 문화 +2']))).toEqual(['borders'])
    expect(soundsFor(s, next(s, ['한국 정책: 미학']))).toEqual(['policy'])
  })

  it('기술: 새 시대에 처음 도달하면 새 시대 소리, 같은 시대면 기술 소리', () => {
    const s = next(base(), [], (c) => c.players[0].techs.push('agriculture'))
    // 고대 → 고대
    expect(soundsFor(s, next(s, ['한국 기술 연구: 궁술'], (c) => c.players[0].techs.push('archery')))).toEqual(['tech'])
    // 고대 → 중세 (화약은 4열)
    expect(soundsFor(s, next(s, ['한국 기술 연구: 화약'], (c) => c.players[0].techs.push('gunpowder')))).toEqual(['era'])
  })

  it('되돌리기·불러오기(로그가 줄거나 그대로)이면 소리를 내지 않는다', () => {
    const s = next(base(), ['한국 → 이집트 선전포고'])
    expect(soundsFor(s, base())).toEqual([])
    expect(soundsFor(s, s)).toEqual([])
  })

  it('시대 구분: 고대 1~3열, 중세 4~5열, 산업 6~8열, 현대 9~10열', () => {
    expect([1, 3, 4, 5, 6, 8, 9, 10].map(eraOfColumn)).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
  })
})
