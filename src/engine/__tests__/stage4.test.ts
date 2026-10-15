import { describe, expect, it } from 'vitest'
import { apply, computeYields, RuleError, producible } from '..'
import { found, me, play, startGame, tile } from './helpers'
import type { GameState } from '..'

const mod = (s: GameState, f: (c: GameState) => void): GameState => {
  const c = structuredClone(s)
  f(c)
  return c
}
const hand = () => [tile(['평지']), tile(['숲']), tile(['언덕']), tile(['해안']), tile(['산'])]
const solo = (techs: string[] = [], h = hand()) =>
  mod(found(startGame(['korea'], [h])), (c) => c.players[0].techs.push(...techs))

describe('기술 카드: 더 높은 단계와 자원 조건', () => {
  it('더 높은 단계 기술을 얻으면 낮은 단계 카드는 더 만들 수 없다', () => {
    const s = solo(['agriculture'])
    expect(producible(s, me(s), 'warrior')).not.toBeNull()
    const t = mod(s, (c) => c.players[0].techs.push('iron_working'))
    expect(producible(t, me(t), 'warrior')).toBeNull()
    const u = mod(s, (c) => c.players[0].techs.push('animal_husbandry', 'horseback'))
    expect(producible(u, me(u), 'chariot')).toBeNull()
  })

  it('기마병은 말 타일이 있는 도시에서만, 장검사는 철이 있는 도시에서만 만든다', () => {
    const noHorse = solo(['animal_husbandry', 'horseback'])
    let s = play(noHorse, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' })
    s = mod(s, (c) => (c.players[0].turn!.yields.cities[0].hammer = 20))
    expect(() => apply(s, { type: 'produce', cityId: 0, defId: 'horseman' })).toThrow(RuleError)
    const withHorse = solo(['animal_husbandry', 'horseback'], [tile(['평지']), tile(['평지'], { resource: 'horse' }), tile(['언덕']), tile(['해안']), tile(['산'])])
    let t = play(withHorse, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' })
    t = mod(t, (c) => (c.players[0].turn!.yields.cities[0].hammer = 20))
    expect(() => apply(t, { type: 'produce', cityId: 0, defId: 'horseman' })).not.toThrow()
  })
})

describe('기술 카드: 산출 효과', () => {
  it('천문학: 첫 5타일에 산이 있으면 과학 +5', () => {
    const base = computeYields(me(solo())).science
    expect(computeYields(me(solo(['astronomy']))).science).toBe(base + 5)
    const noMountain = solo(['astronomy'], [tile(['평지']), tile(['숲']), tile(['언덕']), tile(['해안']), tile(['평지'])])
    expect(computeYields(me(noMountain)).science).toBe(base)
  })

  it('경제학: 연구한 다음 차례부터 금 +4', () => {
    const base = computeYields(me(solo())).gold
    const fresh = mod(solo(['economics']), (c) => c.players[0].freshTechs.push('economics'))
    expect(computeYields(me(fresh)).gold).toBe(base)
    expect(computeYields(me(solo(['economics']))).gold).toBe(base + 4)
  })

  it('로봇공학: 망치가 10 미만인 도시는 10이 된다', () => {
    const y = computeYields(me(solo(['robotics'])))
    expect(y.cities.every((c) => c.hammer >= 10)).toBe(true)
  })

  it('핵융합: 연구하면 원자폭탄 1장을 바로 얻는다', () => {
    let s = solo(['atomic_theory'])
    s = play(s, { type: 'placeWorkers', placements: [] })
    s = mod(s, (c) => (c.players[0].turn!.yields.science = 14))
    s = apply(s, { type: 'research', techId: 'fusion' })
    expect(me(s).military.some((c) => c.defId === 'atomic_bomb')).toBe(true)
  })
})
