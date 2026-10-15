import { describe, expect, it } from 'vitest'
import { apply, createGame, currentPlayer, culture, happiness, primaryTerrain, researchableTechs, tileYield, ctxOf, RuleError } from '..'
import type { GameState } from '..'
import { found, me, play, startGame, tile } from './helpers'

const hand4 = () => [tile(['평지']), tile(['숲']), tile(['언덕']), tile(['해안'])]

/** 한 명짜리 게임 (선수 = 문명 하나). 도시를 세우고 place 단계까지 진행. */
function solo(civ = 'denmark', hand = hand4()): GameState {
  return found(startGame([civ], [hand]))
}

/** 일꾼 수·식량을 원하는 값으로 맞추기 위한 헬퍼 */
function settleWith(workers: number, food: number, civ = 'denmark'): number {
  let s = solo(civ)
  s = structuredClone(s)
  const c = s.players[0].cities[0]
  c.workers = workers
  // 산출을 직접 지정: place → research로 간 뒤 food를 덮어쓴다
  s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' })
  s.players[0].turn!.yields.cities[0].food = food
  s = apply(s, { type: 'endProduction' })
  return s.players[0].cities[0].workers
}

describe('지형 산출', () => {
  it('지형 우선순위: 숲,언덕 → 숲이 먼저라 식량1 망치1', () => {
    expect(primaryTerrain(['숲', '언덕'])).toBe('숲')
    expect(primaryTerrain(['언덕', '숲'])).toBe('숲')
    expect(primaryTerrain(['평지', '설원', '언덕'])).toBe('설원')
    const s = solo()
    const y = tileYield(tile(['숲', '언덕']), ctxOf(me(s)))
    expect(y).toMatchObject({ food: 1, hammer: 1 })
  })

  it('기본 지형표', () => {
    const ctx = ctxOf(me(solo()))
    const y = (t: Parameters<typeof tile>[0]) => tileYield(tile(t), ctx)
    expect(y(['평지'])).toMatchObject({ food: 2, hammer: 0 })
    expect(y(['오아시스'])).toMatchObject({ food: 3, gold: 1 })
    expect(y(['언덕'])).toMatchObject({ food: 0, hammer: 2 })
    expect(y(['산'])).toMatchObject({ food: 0, hammer: 0 })
    expect(y(['해안'])).toMatchObject({ food: 1 })
  })

  it('자원: 철 망치+1, 사치자원 금3, 대리석 망치+1', () => {
    const ctx = ctxOf(me(solo()))
    expect(tileYield(tile(['평지'], { resource: 'iron' }), ctx)).toMatchObject({ food: 2, hammer: 1 })
    expect(tileYield(tile(['평지'], { resource: 'gems' }), ctx)).toMatchObject({ gold: 3 })
    expect(tileYield(tile(['평지'], { resource: 'marble' }), ctx)).toMatchObject({ gold: 3, hammer: 1 })
  })

  it('문명 능력: 러시아 툰드라 +1, 잉카 산 식량3, 아즈텍 호수 +2', () => {
    const t = (terr: Parameters<typeof tile>[0]) => tile(terr)
    expect(tileYield(t(['툰드라']), ctxOf(me(solo('russia'))))).toMatchObject({ food: 2 })
    expect(tileYield(t(['산']), ctxOf(me(solo('inca'))))).toMatchObject({ food: 3 })
    expect(tileYield(t(['호수']), ctxOf(me(solo('aztec'))))).toMatchObject({ food: 4 })
  })
})

describe('게임 준비', () => {
  it('타일 4장으로 도시 + 세 면, 문화 4, 일꾼 1, 남은 면 1', () => {
    const s = solo()
    const c = me(s).cities[0]
    expect(c.tiles).toHaveLength(4)
    expect(culture(me(s))).toBe(4)
    expect(c.workers).toBe(1)
    expect(c.openSides).toHaveLength(1)
  })

  it('시작 문화 1 문명은 타일 5장으로 시작하고 십자가 완성된다', () => {
    const hand = [...hand4(), tile(['정글'])]
    const s = found(startGame(['mongolia'], [hand]))
    expect(culture(me(s))).toBe(5)
    expect(me(s).cities[0].openSides).toHaveLength(0)
  })

  it('도시 외 타일을 모두 서로 다른 면에 붙이지 않으면 오류', () => {
    const s = startGame(['denmark'], [hand4()])
    const [city, a, b] = me(s).hand
    expect(() =>
      apply(s, { type: 'buildCity', cityTileId: city.id, sideTiles: { N: a.id, E: b.id } }),
    ).toThrow(RuleError)
  })

  it('불모지 탈출: 그 차례를 쓰고 다음 차례에 도시를 세운다', () => {
    let s = startGame(['denmark'], [hand4()])
    const bad = me(s).hand[0]
    s = apply(s, { type: 'wasteland', discardTileId: bad.id })
    expect(s.round).toBe(2)
    expect(s.phase).toBe('setup')
    expect(me(s).cities).toHaveLength(0)
    expect(me(s).hand).toHaveLength(4)
    expect(me(s).hand.some((c) => c.id === bad.id)).toBe(false)
    s = found(s)
    expect(s.phase).toBe('place')
  })

  it('불모지 탈출은 한 번만 가능', () => {
    let s = startGame(['denmark'], [hand4()])
    s = apply(s, { type: 'wasteland', discardTileId: me(s).hand[0].id })
    expect(() => apply(s, { type: 'wasteland', discardTileId: me(s).hand[0].id })).toThrow(RuleError)
  })
})

describe('차례 순서', () => {
  it('우선도가 높은 문명부터 진행한다', () => {
    const s = createGame({ seed: 5, civIds: ['mongolia', 'korea', 'russia'] })
    expect(s.order.map((id) => s.players[id].civId)).toEqual(['korea', 'russia', 'mongolia'])
    expect(currentPlayer(s).civId).toBe('korea')
  })

  it('같은 시드는 같은 결과(결정적)', () => {
    const a = createGame({ seed: 42, civIds: ['korea', 'russia'] })
    const b = createGame({ seed: 42, civIds: ['korea', 'russia'] })
    expect(a.players.map((p) => p.hand.map((c) => c.id))).toEqual(b.players.map((p) => p.hand.map((c) => c.id)))
  })
})

describe('일꾼 배치', () => {
  it('도시 타일에는 일꾼을 올릴 수 없다', () => {
    const s = solo()
    const cityTile = me(s).cities[0].tiles[0].card.id
    expect(() => apply(s, { type: 'placeWorkers', placements: [{ cityId: 0, tileId: cityTile }] })).toThrow(RuleError)
  })

  it('한 타일에 일꾼 1개만', () => {
    let s = solo()
    s = structuredClone(s)
    s.players[0].cities[0].workers = 2
    const t = s.players[0].cities[0].tiles[1].card.id
    expect(() =>
      apply(s, {
        type: 'placeWorkers',
        placements: [
          { cityId: 0, tileId: t },
          { cityId: 0, tileId: t },
        ],
      }),
    ).toThrow(RuleError)
  })

  it('가진 일꾼보다 많이 놓을 수 없다', () => {
    const s = solo()
    const ts = me(s).cities[0].tiles.slice(1).map((t) => t.card.id)
    expect(() =>
      apply(s, { type: 'placeWorkers', placements: ts.slice(0, 2).map((tileId) => ({ cityId: 0, tileId })) }),
    ).toThrow(RuleError)
  })

  it('산출 = 도시 타일 + 일꾼 놓은 타일 + 턴당 보너스', () => {
    // 도시=평지(식량2). 덴마크 금2. 일꾼을 숲(식량1 망치1)에
    let s = solo('denmark', [tile(['평지']), tile(['숲']), tile(['언덕']), tile(['해안'])])
    const forest = me(s).cities[0].tiles.find((t) => t.card.terrains[0] === '숲')!.card.id
    s = apply(s, { type: 'placeWorkers', placements: [{ cityId: 0, tileId: forest }] })
    const y = me(s).turn!.yields
    expect(y.cities[0]).toMatchObject({ food: 3, hammer: 1 })
    expect(y.gold).toBe(2)
  })
})

describe('식량 정산 (규칙서 예시)', () => {
  it('일꾼 2, 식량 1 → 1개', () => expect(settleWith(2, 1)).toBe(1))
  it('일꾼 2, 식량 3 → 2개 유지', () => expect(settleWith(2, 3)).toBe(2))
  it('일꾼 2, 식량 4 → 3개 (행복 5, 덴마크)', () => expect(settleWith(2, 4)).toBe(3))
  it('일꾼 2, 식량 4 → 행복 3이면 3개까지 가능 (한국)', () => expect(settleWith(2, 4, 'korea')).toBe(3))
  it('일꾼 3, 식량 6 → 행복 3이면 더 늘지 않는다 (한국)', () => expect(settleWith(3, 6, 'korea')).toBe(3))
  it('일꾼 0 → 반드시 1개가 된다', () => expect(settleWith(0, 0)).toBe(1))
  it('식량이 얼마나 모자라도 한 차례에 1개만 잃는다', () => expect(settleWith(3, 0)).toBe(2))
})

describe('행복', () => {
  it('시작 행복 + 사치자원 종류 수 (같은 자원은 1만)', () => {
    let s = solo('korea', [tile(['평지']), tile(['평지'], { resource: 'gems' }), tile(['평지'], { resource: 'gems' }), tile(['평지'], { resource: 'gold' })])
    expect(happiness(me(s))).toBe(3)
    s = structuredClone(s)
    s.players[0].techs.push('mining')
    expect(happiness(me(s))).toBe(3 + 2) // 보석, 황금 두 종류
  })
})

describe('기술 연구', () => {
  const toResearch = (s: GameState) => apply(s, { type: 'placeWorkers', placements: [] })

  it('비용 0인 시작 기술은 과학 없이 연구 가능', () => {
    let s = toResearch(solo())
    s = apply(s, { type: 'research', techId: 'agriculture' })
    expect(me(s).techs).toContain('agriculture')
  })

  it('과학이 모자라면 오류 (비용 1 기술, 과학 0)', () => {
    let s = solo('denmark')
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'research', techId: 'agriculture' })
    // 다음 차례를 위해 한 바퀴
    s = play(s, { type: 'endProduction' })
    s = toResearch(s)
    expect(() => apply(s, { type: 'research', techId: 'calendar' })).toThrow(RuleError) // 덴마크 과학 0
  })

  it('앞사람이 이미 고른 기술은 같은 라운드에 고를 수 없다', () => {
    let s = startGame(['korea', 'russia'], [hand4(), hand4()])
    s = found(s)
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'research', techId: 'agriculture' }, { type: 'endProduction' })
    s = found(s)
    s = apply(s, { type: 'placeWorkers', placements: [] })
    expect(researchableTechs(s).map((t) => t.id)).not.toContain('agriculture')
    expect(() => apply(s, { type: 'research', techId: 'agriculture' })).toThrow(RuleError)
    s = apply(s, { type: 'research', techId: 'writing' })
    expect(me(s).techs).toEqual(['writing'])
  })

  it('광학은 항해가 먼저 필요하다', () => {
    const s = toResearch(solo('korea'))
    expect(researchableTechs(s).map((t) => t.id)).not.toContain('optics')
  })

  it('드라마와 시: 즉시 문화 1 → 새 타일이 남은 면에 붙는다', () => {
    // 한국(과학2)로 비용 1 기술 연구: 먼저 역법 선행인 농업 필요 없이, 잠정 규칙상 1열 기술 보유 필요
    let s = solo('korea')
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'research', techId: 'agriculture' }, { type: 'endProduction' })
    s = toResearch(s)
    expect(me(s).cities[0].openSides).toHaveLength(1)
    s = apply(s, { type: 'research', techId: 'drama' })
    expect(culture(me(s))).toBe(5)
    expect(me(s).cities[0].openSides).toHaveLength(0)
    expect(me(s).cities[0].tiles.at(-1)!.role).toBe('side')
  })

  it('문자: 식량을 1:1로 과학으로 바꿔 연구, 남은 식량으로 정산', () => {
    // 덴마크(과학0): 문자 연구 후 다음 차례에 식량 2를 과학으로 → 비용 1 기술 연구
    let s = solo('denmark')
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'research', techId: 'writing' }, { type: 'endProduction' })
    s = toResearch(s)
    expect(() => apply(s, { type: 'research', techId: 'calendar' })).toThrow(RuleError)
    s = apply(s, { type: 'research', techId: 'calendar', foodToScience: 1 })
    expect(me(s).turn!.foodToScience).toBe(1)
  })

  it('문자 없이 식량→과학 변환은 오류', () => {
    const s = toResearch(solo('denmark'))
    expect(() => apply(s, { type: 'research', techId: 'agriculture', foodToScience: 1 })).toThrow(RuleError)
  })

  it('농업: 밀 타일 식량 +1은 "다음 차례부터" 적용', () => {
    const wheat = tile(['평지'], { resource: 'wheat' })
    let s = solo('denmark', [tile(['평지']), wheat, tile(['언덕']), tile(['해안'])])
    s = apply(s, { type: 'placeWorkers', placements: [{ cityId: 0, tileId: wheat.id }] })
    const before = me(s).turn!.yields.cities[0].food
    s = apply(s, { type: 'research', techId: 'agriculture' })
    expect(me(s).turn!.yields.cities[0].food).toBe(before) // 이번 차례엔 그대로
    s = apply(s, { type: 'endProduction' })
    s = apply(s, { type: 'placeWorkers', placements: [{ cityId: 0, tileId: wheat.id }] })
    expect(me(s).turn!.yields.cities[0].food).toBe(before + 1) // 다음 차례부터
  })

  it('목축업: 소 타일 망치 +1은 이번 차례에 바로 적용', () => {
    const cattle = tile(['평지'], { resource: 'cattle' })
    let s = solo('denmark', [tile(['평지']), cattle, tile(['언덕']), tile(['해안'])])
    s = apply(s, { type: 'placeWorkers', placements: [{ cityId: 0, tileId: cattle.id }] })
    expect(me(s).turn!.yields.cities[0].hammer).toBe(0)
    s = apply(s, { type: 'research', techId: 'animal_husbandry' })
    expect(me(s).turn!.yields.cities[0].hammer).toBe(1)
  })

  it('기마술: 위대한 장군 +1', () => {
    let s = solo('korea')
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'research', techId: 'agriculture' }, { type: 'endProduction' })
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'research', techId: 'horseback' })
    expect(me(s).generals).toBe(1)
  })
})
