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
    const culture = next(s, ['[R3] 한국 문화 +2'])
    const policy = next(s, ['[R3] 한국 정책: 미학'])
    expect(soundsFor(s, culture, 0)).toEqual(['borders'])
    expect(soundsFor(s, policy, 0)).toEqual(['policy'])
    // 본인에게만 들린다
    expect(soundsFor(s, culture, 1)).toEqual([])
    expect(soundsFor(s, policy, 1)).toEqual([])
  })

  it('기술: 새 시대에 처음 도달하면 새 시대 소리, 같은 시대면 기술 소리', () => {
    const s = next(base(), [], (c) => c.players[0].techs.push('agriculture'))
    // 고대 → 고대
    const archery = next(s, ['한국 기술 연구: 궁술'], (c) => c.players[0].techs.push('archery'))
    expect(soundsFor(s, archery, 0)).toEqual(['tech'])
    expect(soundsFor(s, archery, 1)).toEqual([]) // 연구한 본인에게만 들린다
    // 고대 → 중세 (화약은 4열)
    const gun = next(s, ['한국 기술 연구: 화약'], (c) => c.players[0].techs.push('gunpowder'))
    expect(soundsFor(s, gun, 0)).toEqual(['era'])
    expect(soundsFor(s, gun, 1)).toEqual([])
  })

  it('되돌리기·불러오기(로그가 줄거나 그대로)이면 소리를 내지 않는다', () => {
    const s = next(base(), ['한국 → 이집트 선전포고'])
    expect(soundsFor(s, base())).toEqual([])
    expect(soundsFor(s, s)).toEqual([])
  })

  it('불가사의: 지은 사람은 완성 소리, 나머지는 다른 문명 소리', () => {
    const s = base()
    const built = next(s, ['한국 제우스상 완성'], (c) => (c.wonderOwners.statue_of_zeus = 0))
    expect(soundsFor(s, built, 0)).toEqual(['wonderMine'])
    expect(soundsFor(s, built, 1)).toEqual(['wonderOther'])
    // 이미 있던 불가사의는 다시 소리를 내지 않는다
    expect(soundsFor(built, next(built, ['x']), 1)).toEqual([])
  })

  it('내 차례가 시작될 때 내 타일 위에 상대 장군이 있으면 경고 소리', () => {
    let s = base()
    s = next(s, [], (c) => {
      c.phase = 'place'
      c.turnIdx = 0
      c.players[c.order[0]].cities = [{ id: 0, tiles: [{ card: { id: 1, terrains: ['평지'] }, role: 'city' }, { card: { id: 2, terrains: ['숲'] }, role: 'side', side: 'N', occupiedBy: c.order[1] }], workers: 1, placed: [], openSides: [] } as never]
    })
    const me = s.order[0]
    const moved = next(s, ['x'], (c) => { c.turnIdx = 1 })
    const back = next(moved, ['y'], (c) => { c.turnIdx = 0; c.round = 2 })
    expect(soundsFor(moved, back, me)).toEqual(['enemyBorder'])
    expect(soundsFor(moved, back, s.order[1])).toEqual([])
  })

  it('전쟁에서 내 군사 카드가 파괴되면 소리', () => {
    const s = base()
    const report = (owner: number, destroyed: boolean) => ({ seq: 1, units: [{ owner, destroyed }] }) as never
    const lost = next(s, ['전투 결과'], (c) => { c.battleReports = [report(0, true)] })
    expect(soundsFor(s, lost, 0)).toEqual(['killed'])
    expect(soundsFor(s, lost, 1)).toEqual([])
  })

  it('금으로 승급하면 승급 소리', () => {
    const s = base()
    const up = next(s, ['[R4] 한국 장검사 → 머스킷병 승급 (금 6)'])
    expect(soundsFor(s, up, 0)).toEqual(['promote'])
    expect(soundsFor(s, up, 1)).toEqual([]) // 승급한 본인에게만 들린다
  })

  it('시대 구분: 고대 1~3열, 중세 4~5열, 산업 6~8열, 현대 9~10열', () => {
    expect([1, 3, 4, 5, 6, 8, 9, 10].map(eraOfColumn)).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
  })
})
