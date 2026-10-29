import { describe, expect, it } from 'vitest'
import { apply, computeYields, declarationTargets, RuleError, producible, upgradeTargets } from '..'
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
    // 첫 도시 첫 5타일에만 센다: 산이 6번째 이후에 오는 경우는 해당 없음
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
    s = mod(s, (c) => (c.players[0].turn!.yields.science = 15))
    s = apply(s, { type: 'research', techId: 'fusion' })
    expect(me(s).military.some((c) => c.defId === 'atomic_bomb')).toBe(true)
  })
})

describe('바뀐 룰: 승급과 장군', () => {
  it('승급은 중간 등급을 건너뛸 수 있다 (창병 → 대전차포)', () => {
    let s = solo(['bronze_working', 'ballistics'])
    s = mod(s, (c) => c.players[0].military.push({ uid: 900, defId: 'spearman', dirs: ['C'] }))
    expect(upgradeTargets(me(s), me(s).military[0]).map((c) => c.id)).toContain('anti_tank_gun')
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' })
    s = mod(s, (c) => (c.players[0].turn!.yields.gold = 15))
    s = apply(s, { type: 'upgrade', uid: 900, toDefId: 'anti_tank_gun' })
    expect(me(s).military.map((c) => c.defId)).toEqual(['anti_tank_gun'])
    expect(me(s).turn!.yields.gold).toBe(6) // 15 - 9
  })

  it('점령한 장군은 일꾼 배치 단계에서 원하는 만큼 불러들이고, 그 차례 선전포고에 바로 쓴다', () => {
    let s = startGame(['korea', 'russia'], [hand(), hand()])
    for (let i = 0; i < 2; i++) {
      s = found(s)
      s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' }, { type: 'endProduction' })
      if (s.phase === 'declare') s = apply(s, { type: 'endTurn' })
    }
    s = mod(s, (c) => {
      c.players[1].cities[0].tiles[1].occupiedBy = 0
      c.players[1].cities[0].tiles[2].occupiedBy = 0
    })
    const g = me(s).generals
    const a = { type: 'recallGeneral' as const, defenderId: 1, cityId: 0, tileId: s.players[1].cities[0].tiles[1].card.id }
    s = apply(s, a)
    expect(me(s).generals).toBe(g + 1) // 바로 손에 온다
    expect(s.players[1].cities[0].tiles[1].occupiedBy).toBeUndefined()
    // 같은 차례에 하나 더 풀 수 있다
    const b = { ...a, tileId: s.players[1].cities[0].tiles[2].card.id }
    s = apply(s, b)
    expect(me(s).generals).toBe(g + 2)
    expect(s.players[1].cities[0].tiles[2].occupiedBy).toBeUndefined()
    // 이미 푼 타일을 또 풀 수는 없다
    expect(() => apply(s, b)).toThrow(RuleError)
    // 불러들인 장군으로 이번 차례에 선전포고할 수 있다
    s = mod(s, (c) => (c.players[0].cities[0].workers = 2))
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' })
    expect(declarationTargets(s, me(s)).some((t) => t.kind === 'normal')).toBe(true)
    // 일꾼 배치가 끝난 뒤에는 불러들일 수 없다
    s = mod(s, (c) => (c.players[1].cities[0].tiles[3].occupiedBy = 0))
    expect(() => apply(s, { ...a, tileId: s.players[1].cities[0].tiles[3].card.id })).toThrow(RuleError)
  })
})

describe('공중정원', () => {
  it('완성하면 기본 식량 산출량이 1 늘어난다 (다른 산출은 그대로)', () => {
    const base = computeYields(me(solo()))
    const g = mod(solo(), (c) => c.players[0].wonders.push('hanging_gardens'))
    const y = computeYields(me(g))
    expect(y.cities[0].food).toBe(base.cities[0].food + 1)
    expect(y.cities[0].hammer).toBe(base.cities[0].hammer)
    expect(y.science).toBe(base.science)
    expect(y.gold).toBe(base.gold)
  })
})

describe('승부 없음', () => {
  it('180라운드까지 승부가 안 나면 무승부로 끝난다', () => {
    let s = solo()
    s = mod(s, (c) => (c.round = 180))
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' }, { type: 'endProduction' })
    if (s.phase === 'declare') s = apply(s, { type: 'endTurn' })
    expect(s.phase).toBe('over')
    expect(s.winner).toBeNull()
    expect(s.round).toBe(180)
    expect(() => apply(s, { type: 'placeWorkers', placements: [] })).toThrow(RuleError)
  })

  it('사람이 하는 게임(roundLimit null)은 180라운드가 지나도 계속된다', () => {
    let s = mod(solo(), (c) => {
      c.round = 180
      c.roundLimit = null
    })
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' }, { type: 'endProduction' })
    if (s.phase === 'declare') s = apply(s, { type: 'endTurn' })
    expect(s.phase).toBe('place')
    expect(s.round).toBe(181)
  })

  it('179라운드까지는 계속된다', () => {
    let s = mod(solo(), (c) => (c.round = 179))
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' }, { type: 'endProduction' })
    if (s.phase === 'declare') s = apply(s, { type: 'endTurn' })
    expect(s.phase).toBe('place')
    expect(s.round).toBe(180)
  })
})
