import { describe, expect, it } from 'vitest'
import { apply, createGame, culture, happiness, tourism, computeYields, RuleError, WONDER_CARDS, TECHS } from '..'
import type { GameState, TileCard } from '..'
import { found, me, play, startGame, tile } from './helpers'

const hand4 = (extra: Partial<TileCard>[] = []) => [
  tile(['평지'], extra[0]), tile(['숲'], extra[1]), tile(['언덕'], extra[2]), tile(['해안'], extra[3]),
]

function solo(civ = 'denmark', hand = hand4()): GameState {
  return found(startGame([civ], [hand]))
}
/** 상태를 직접 고쳐 기술·정책 등을 지정한다 */
function mod(s: GameState, fn: (s: GameState) => void): GameState {
  const c = structuredClone(s)
  fn(c)
  return c
}
/** 일꾼을 놓지 않고 research 단계로 */
const toResearch = (s: GameState) => apply(s, { type: 'placeWorkers', placements: [] })
/** research 단계에서 생산 단계로 (연구 안 함) */
const toProduce = (s: GameState) => apply(toResearch(s), { type: 'skipResearch' })
const setHammers = (s: GameState, n: number, cityIdx = 0) =>
  mod(s, (c) => (c.players[0].turn!.yields.cities[cityIdx].hammer = n))

describe('정책', () => {
  it('정책 기술(철학)을 연구하면 즉시 정책을 골라야 정산할 수 있다', () => {
    let s = mod(solo('korea'), (c) => c.players[0].techs.push('mathematics'))
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'research', techId: 'philosophy' })
    expect(me(s).pendingPolicies).toBe(1)
    expect(() => apply(s, { type: 'endProduction' })).toThrow(RuleError)
    s = apply(s, { type: 'choosePolicy', policy: 'aesthetics' })
    expect(me(s).policy).toBe('aesthetics')
    expect(me(s).pendingPolicies).toBe(0)
  })

  it('선택권이 없으면 정책을 고를 수 없다', () => {
    const s = toProduce(solo())
    expect(() => apply(s, { type: 'choosePolicy', policy: 'liberty' })).toThrow(RuleError)
  })

  it('미학: 고를 때마다 문화 1 (같은 정책을 다시 골라도 발동)', () => {
    let s = mod(toProduce(solo()), (c) => (c.players[0].pendingPolicies = 2))
    s = apply(s, { type: 'choosePolicy', policy: 'aesthetics' })
    expect(culture(me(s))).toBe(5)
    s = apply(s, { type: 'choosePolicy', policy: 'aesthetics' })
    expect(culture(me(s))).toBe(6)
  })

  it('전제정치: 위대한 장군 +1', () => {
    let s = mod(toProduce(solo()), (c) => (c.players[0].pendingPolicies = 1))
    s = apply(s, { type: 'choosePolicy', policy: 'despotism' })
    expect(me(s).generals).toBe(1)
  })

  it('전통: 일꾼 3개를 버리면 문화 2, 그 차례 식량 정산 생략', () => {
    let s = mod(toProduce(solo()), (c) => {
      c.players[0].pendingPolicies = 1
      c.players[0].cities[0].workers = 4
    })
    s = apply(s, { type: 'choosePolicy', policy: 'tradition', discard: [{ cityId: 0, count: 3 }] })
    expect(me(s).cities[0].workers).toBe(1)
    expect(culture(me(s))).toBe(6)
    // 식량이 0이어도 일꾼을 잃지 않는다 (정산 생략)
    s = mod(s, (c) => (c.players[0].turn!.yields.cities[0].food = 0))
    s = apply(s, { type: 'endProduction' })
    expect(me(s).cities[0].workers).toBe(1)
  })

  it('전통: 버릴 일꾼이 3개가 아니면 오류', () => {
    const s = mod(toProduce(solo()), (c) => {
      c.players[0].pendingPolicies = 1
      c.players[0].cities[0].workers = 4
    })
    expect(() => apply(s, { type: 'choosePolicy', policy: 'tradition', discard: [{ cityId: 0, count: 2 }] })).toThrow(RuleError)
  })

  it('체제: 일꾼 3개를 얻되 행복(덴마크 5)을 넘으면 버린다', () => {
    let s = mod(toProduce(solo()), (c) => (c.players[0].pendingPolicies = 1))
    s = apply(s, { type: 'choosePolicy', policy: 'regime' })
    expect(me(s).cities[0].workers).toBe(4) // 1 + 3 (행복 5 이내)
    let t = mod(toProduce(solo('korea')), (c) => (c.players[0].pendingPolicies = 1))
    t = apply(t, { type: 'choosePolicy', policy: 'regime' })
    expect(me(t).cities[0].workers).toBe(3) // 행복 3이 한도
  })

  it('자유: 식량이 모자라도 일꾼을 잃지 않는다', () => {
    let s = mod(toProduce(solo()), (c) => {
      c.players[0].policy = 'liberty'
      c.players[0].cities[0].workers = 2
      c.players[0].turn!.yields.cities[0].food = 0
    })
    s = apply(s, { type: 'endProduction' })
    expect(me(s).cities[0].workers).toBe(2)
  })

  it('합리주의: 매 차례 과학 +4 (한국은 6)', () => {
    const base = solo('denmark')
    const withP = mod(base, (c) => (c.players[0].policy = 'rationalism'))
    expect(computeYields(me(withP)).science - computeYields(me(base)).science).toBe(4)
    const k = solo('korea')
    const kp = mod(k, (c) => (c.players[0].policy = 'rationalism'))
    expect(computeYields(me(kp)).science - computeYields(me(k)).science).toBe(6)
  })

  it('평등: 문화 3당 관광 1', () => {
    const s = mod(solo(), (c) => {
      c.players[0].policy = 'equality'
    })
    expect(tourism(me(s))).toBe(Math.floor(culture(me(s)) / 3))
  })

  it('세계화·냉각기술: 문화 3당 관광 1씩', () => {
    let s = mod(solo(), (c) => c.players[0].techs.push('globalization', 'refrigeration'))
    const third = Math.floor(culture(me(s)) / 3)
    expect(tourism(me(s))).toBe(2 * third)
    s = mod(s, (c) => (c.players[0].policy = 'equality'))
    expect(tourism(me(s))).toBe(3 * third)
  })
})

describe('두 번째 도시 (인쇄기술)', () => {
  const printing = () =>
    mod(solo('korea'), (c) => c.players[0].techs.push('engineering'))

  it('인쇄기술을 연구하면 타일 4장을 받고, 도시를 세워야 정산할 수 있다', () => {
    // 한국 과학 2로는 비용 5를 못 내므로 식량 변환 없이 과학을 직접 채운다
    let s = mod(printing(), (c) => c.players[0].techs.push('writing'))
    s = apply(s, { type: 'placeWorkers', placements: [] })
    s = mod(s, (c) => (c.players[0].turn!.yields.science = 6))
    s = apply(s, { type: 'research', techId: 'printing_press' })
    expect(me(s).pendingCity).toHaveLength(4)
    expect(() => apply(s, { type: 'endProduction' })).toThrow(RuleError)
    const [a, b, c, d] = me(s).pendingCity!
    s = apply(s, { type: 'buildSecondCity', cityTileId: a.id, sideTiles: { N: b.id, E: c.id, S: d.id } })
    expect(me(s).cities).toHaveLength(2)
    expect(me(s).cities[1].openSides).toEqual(['W'])
    expect(culture(me(s))).toBe(8)
    // 일꾼은 새로 받지 않고 첫 도시에서 1개 옮겨온다
    expect(me(s).cities[0].workers).toBe(0)
    expect(me(s).cities[1].workers).toBe(1)
    expect(me(s).pendingCity).toBeNull()
    s = apply(s, { type: 'endProduction' })
  })

  it('도시마다 따로 산출·식량 정산한다', () => {
    let s = mod(printing(), (c) => {
      const p = c.players[0]
      p.cities.push({
        id: 1,
        tiles: [{ card: tile(['평지']), role: 'city' }],
        workers: 1,
        placed: [],
        openSides: ['N', 'E', 'S', 'W'],
      })
      p.cities[0].workers = 1
      p.pendingPolicies = 0
    })
    s = toProduce(s)
    s = mod(s, (c) => {
      c.players[0].turn!.yields.cities[0].food = 0 // 첫 도시: 굶음
      c.players[0].turn!.yields.cities[1].food = 2 // 둘째 도시: 일꾼 1개 → 2 >= 2×1 성장
    })
    s = apply(s, { type: 'endProduction' })
    expect(me(s).cities[0].workers).toBe(0)
    expect(me(s).cities[1].workers).toBe(2)
  })
})

describe('불가사의', () => {
  const withTech = (techs: string[], civ = 'denmark', hand = hand4()) =>
    mod(solo(civ, hand), (c) => c.players[0].techs.push(...techs))

  it('필요한 기술이 없으면 투자할 수 없다', () => {
    const s = setHammers(toProduce(solo()), 10)
    expect(() => apply(s, { type: 'invest', cityId: 0, wonderId: 'statue_of_zeus', hammers: 3 })).toThrow(RuleError)
  })

  it('최소 망치 미만이거나 가진 망치보다 많이 투자할 수 없다', () => {
    const s = setHammers(toProduce(withTech(['bronze_working'])), 5)
    expect(() => apply(s, { type: 'invest', cityId: 0, wonderId: 'statue_of_zeus', hammers: 2 })).toThrow(RuleError)
    expect(() => apply(s, { type: 'invest', cityId: 0, wonderId: 'statue_of_zeus', hammers: 6 })).toThrow(RuleError)
    const ok = apply(s, { type: 'invest', cityId: 0, wonderId: 'statue_of_zeus', hammers: 3 })
    expect(ok.investments).toHaveLength(1)
  })

  it('이집트는 최소 망치 조건 -1', () => {
    const s = setHammers(toProduce(withTech(['bronze_working'], 'egypt')), 5)
    expect(() => apply(s, { type: 'invest', cityId: 0, wonderId: 'statue_of_zeus', hammers: 2 })).not.toThrow()
  })

  it('도시마다 한 차례에 생산 1개만', () => {
    let s = setHammers(toProduce(withTech(['bronze_working', 'archery'])), 10)
    s = apply(s, { type: 'invest', cityId: 0, wonderId: 'statue_of_zeus', hammers: 3 })
    expect(() => apply(s, { type: 'invest', cityId: 0, wonderId: 'temple_of_artemis', hammers: 5 })).toThrow(RuleError)
  })

  it('건설 조건: 마우솔레움은 석재 타일이 있는 도시', () => {
    const without = setHammers(toProduce(withTech(['masonry'])), 10)
    expect(() => apply(without, { type: 'invest', cityId: 0, wonderId: 'mausoleum', hammers: 5 })).toThrow(RuleError)
    const withStone = setHammers(
      toProduce(withTech(['masonry'], 'denmark', hand4([{}, {}, { resource: 'stone' }, {}]))),
      10,
    )
    expect(() => apply(withStone, { type: 'invest', cityId: 0, wonderId: 'mausoleum', hammers: 5 })).not.toThrow()
  })

  it('건설 조건: 거신상은 첫 5타일에 해안', () => {
    const coastal = setHammers(toProduce(withTech(['iron_working'])), 10) // hand4에 해안 포함
    expect(() => apply(coastal, { type: 'invest', cityId: 0, wonderId: 'colossus', hammers: 5 })).not.toThrow()
    const inland = setHammers(
      toProduce(withTech(['iron_working'], 'denmark', [tile(['평지']), tile(['숲']), tile(['언덕']), tile(['사막'])])),
      10,
    )
    expect(() => apply(inland, { type: 'invest', cityId: 0, wonderId: 'colossus', hammers: 5 })).toThrow(RuleError)
  })

  it('건설 조건: 루브르는 정책이 미학일 때', () => {
    const base = withTech(['archaeology'])
    const no = setHammers(toProduce(base), 10)
    expect(() => apply(no, { type: 'invest', cityId: 0, wonderId: 'louvre', hammers: 9 })).toThrow(RuleError)
    const yes = setHammers(toProduce(mod(base, (c) => (c.players[0].policy = 'aesthetics'))), 10)
    expect(() => apply(yes, { type: 'invest', cityId: 0, wonderId: 'louvre', hammers: 9 })).not.toThrow()
  })

  /** 두 문명이 한 라운드에 불가사의에 투자하는 상황을 만든다 */
  function twoPlayerRound(inv: [number, number]): GameState {
    let s = startGame(['korea', 'russia'], [hand4(), hand4()])
    s = found(s)
    s = mod(s, (c) => c.players[c.order[0]].techs.push('bronze_working'))
    s = toProduce(s)
    s = mod(s, (c) => (c.players[c.order[0]].turn!.yields.cities[0].hammer = 9))
    s = apply(s, { type: 'invest', cityId: 0, wonderId: 'statue_of_zeus', hammers: inv[0] })
    s = apply(s, { type: 'endProduction' })
    s = found(s)
    s = mod(s, (c) => c.players[c.order[1]].techs.push('bronze_working'))
    s = toProduce(s)
    s = mod(s, (c) => (c.players[c.order[1]].turn!.yields.cities[0].hammer = 9))
    s = apply(s, { type: 'invest', cityId: 0, wonderId: 'statue_of_zeus', hammers: inv[1] })
    s = apply(s, { type: 'endProduction' })
    return s
  }

  it('정산: 가장 많이 투자한 한 명만 진척도 1을 얻고 망치는 사라진다', () => {
    const s = twoPlayerRound([3, 5])
    expect(s.round).toBe(2)
    const [first, second] = s.order
    expect(s.wonderProgress.statue_of_zeus?.[second]).toBe(1)
    expect(s.wonderProgress.statue_of_zeus?.[first]).toBeUndefined()
    expect(s.investments).toEqual([])
  })

  it('정산: 최다 투자자가 동률이면 아무도 진척도를 얻지 못한다', () => {
    const s = twoPlayerRound([4, 4])
    expect(s.wonderProgress.statue_of_zeus ?? {}).toEqual({})
  })

  it('진척도가 가득 차면 불가사의를 가져오고 완성 보너스를 즉시 적용한다', () => {
    let s = twoPlayerRound([3, 5])
    const [, second] = s.order
    // 진척도를 한 칸 남기고 한 번 더 이긴다
    s = mod(s, (c) => (c.wonderProgress.statue_of_zeus![second] = WONDER_CARDS.find((w) => w.id === 'statue_of_zeus')!.progressNeeded - 1))
    // 다음 라운드: 첫 번째 문명은 투자하지 않고, 두 번째만 투자
    const [firstId] = s.order
    s = toProduce(s) // 첫 번째 문명 (place → research → produce)
    expect(s.players[firstId].wonders).toEqual([])
    s = apply(s, { type: 'endProduction' })
    s = mod(s, (c) => c.players[second].techs.includes('bronze_working') || c.players[second].techs.push('bronze_working'))
    s = toProduce(s)
    s = mod(s, (c) => (c.players[second].turn!.yields.cities[0].hammer = 9))
    s = apply(s, { type: 'invest', cityId: 0, wonderId: 'statue_of_zeus', hammers: 3 })
    s = apply(s, { type: 'endProduction' })
    expect(s.wonderOwners.statue_of_zeus).toBe(second)
    expect(s.players[second].wonders).toContain('statue_of_zeus')
    expect(s.players[second].generals).toBe(1) // 제우스상: 위대한 장군 1개
  })
})

describe('불가사의 완성 효과', () => {
  const owning = (civ: string, wonders: string[]) =>
    mod(solo(civ), (c) => (c.players[0].wonders = wonders))

  it('행복: 마우솔레움 +1, 치첸이사 +2, 에펠탑 +1', () => {
    const base = happiness(me(solo('denmark')))
    expect(happiness(me(owning('denmark', ['mausoleum'])))).toBe(base + 1)
    expect(happiness(me(owning('denmark', ['chichen_itza'])))).toBe(base + 2)
    expect(happiness(me(owning('denmark', ['mausoleum', 'chichen_itza', 'eiffel_tower'])))).toBe(base + 4)
  })

  it('페르시아는 불가사의 행복 2배', () => {
    const base = happiness(me(solo('persia')))
    expect(happiness(me(owning('persia', ['chichen_itza'])))).toBe(base + 4)
  })

  it('거신상: 턴당 금 +4', () => {
    const base = computeYields(me(solo('denmark'))).gold
    expect(computeYields(me(owning('denmark', ['colossus']))).gold).toBe(base + 4)
  })

  it('관광: 루브르 +2, 에펠탑 +3, 프랑스는 불가사의 관광 2배', () => {
    expect(tourism(me(owning('denmark', ['louvre', 'eiffel_tower'])))).toBe(7)
    expect(tourism(me(owning('france', ['louvre', 'eiffel_tower'])))).toBe(14)
  })

  it('페트라: 사막 타일 식량 +1', () => {
    const desert = tile(['사막'])
    const s = solo('denmark', [tile(['평지']), desert, tile(['언덕']), tile(['해안'])])
    const withIt = mod(s, (c) => c.players[0].wonders.push('petra'))
    const place = [{ cityId: 0, tileId: desert.id }]
    const food = (st: GameState) => apply(st, { type: 'placeWorkers', placements: place }).players[0].turn!.yields.cities[0].food
    expect(food(withIt)).toBe(food(s) + 1)
  })
})

describe('고고학', () => {
  it('연구하는 순간 가진 사적지 1장당 문화 1', () => {
    const hand = [tile(['평지']), tile(['숲'], { historic: true }), tile(['언덕'], { historic: true }), tile(['해안'])]
    let s = mod(solo('korea', hand), (c) => c.players[0].techs.push('writing'))
    // 고고학은 경제학 선행(경제학은 공공행정 선행). 선행 기술을 직접 지정한다
    s = mod(s, (c) => c.players[0].techs.push('civil_service', 'machinery', 'economics'))
    s = apply(s, { type: 'placeWorkers', placements: [] })
    s = mod(s, (c) => (c.players[0].turn!.yields.science = 10))
    const before = culture(me(s))
    s = apply(s, { type: 'research', techId: 'archaeology' })
    expect(culture(me(s))).toBe(before + 2)
  })
})

describe('불가사의 데이터', () => {
  it('규칙서 표의 16개, 필요 기술이 트리에 존재하고 최소 망치가 표와 같다', () => {
    expect(WONDER_CARDS).toHaveLength(16)
    const ids = new Set(TECHS.map((t) => t.id))
    for (const w of WONDER_CARDS) expect(ids.has(w.tech), `${w.id} -> ${w.tech}`).toBe(true)
    const min = (id: string) => WONDER_CARDS.find((w) => w.id === id)!.minHammers
    expect([min('statue_of_zeus'), min('pyramids'), min('sistine_chapel'), min('eiffel_tower'), min('internet_censorship')]).toEqual([3, 5, 6, 8, 10])
  })
})

describe('과학이론: 망치를 과학으로', () => {
  // 한국(과학 2)이 비용 4 기술(공공행정)을 망치 2로 보태 연구
  const base = (techs: string[]) =>
    mod(solo('korea'), (c) => c.players[0].techs.push('machinery', ...techs))
  const placed = (s: GameState, hammers: number) =>
    mod(toResearch(s), (c) => (c.players[0].turn!.yields.cities[0].hammer = hammers))

  it('과학이론이 없으면 변환할 수 없다', () => {
    const s = placed(base([]), 5)
    expect(() => apply(s, { type: 'research', techId: 'civil_service', hammerToScience: 2 })).toThrow(RuleError)
  })

  it('망치 2개를 과학으로 바꿔 연구하고, 바꾼 망치는 생산에 쓸 수 없다', () => {
    // 도시(언덕, 망치 2) + 일꾼을 올린 언덕(망치 2) = 망치 4
    const hills = [tile(['언덕']), tile(['언덕']), tile(['평지']), tile(['평지'])]
    let s = mod(solo('korea', hills), (c) => c.players[0].techs.push('machinery', 'scientific_theory'))
    const hill = me(s).cities[0].tiles.find((t) => t.role === 'side' && t.card.terrains[0] === '언덕')!.card.id
    s = apply(s, { type: 'placeWorkers', placements: [{ cityId: 0, tileId: hill }] })
    expect(me(s).turn!.yields.cities[0].hammer).toBe(4)
    expect(() => apply(s, { type: 'research', techId: 'civil_service' })).toThrow(RuleError) // 과학 2 < 4
    s = apply(s, { type: 'research', techId: 'civil_service', hammerToScience: 2 })
    expect(me(s).techs).toContain('civil_service')
    expect(me(s).turn!.yields.cities[0].hammer).toBe(2) // 바꾼 2개는 생산에 쓸 수 없다
  })

  it('최대 2개까지, 가진 망치까지만 바꿀 수 있다', () => {
    const s = placed(base(['scientific_theory']), 5)
    expect(() => apply(s, { type: 'research', techId: 'civil_service', hammerToScience: 3 })).toThrow(RuleError)
    const few = placed(base(['scientific_theory']), 1)
    expect(() => apply(few, { type: 'research', techId: 'civil_service', hammerToScience: 2 })).toThrow(RuleError)
  })
})

describe('로그 번호', () => {
  it('행동마다 새 로그 줄 수만큼 logSeq가 늘어난다', () => {
    let s = mod(toProduce(solo()), (c) => (c.players[0].pendingPolicies = 1))
    const before = s.logSeq
    const lines = s.log.length
    s = apply(s, { type: 'choosePolicy', policy: 'aesthetics' }) // 정책 로그 + 문화 로그
    expect(s.logSeq - before).toBe(s.log.length - lines)
    expect(s.logSeq - before).toBeGreaterThanOrEqual(2)
  })
})

describe('레이더', () => {
  it('연구하면 정책이 전제정치로 바뀐다', () => {
    let s = mod(solo('korea'), (c) => {
      c.players[0].policy = 'liberty'
      c.players[0].techs.push('combined_arms')
    })
    s = apply(s, { type: 'placeWorkers', placements: [] })
    s = mod(s, (c) => (c.players[0].turn!.yields.science = 99))
    s = apply(s, { type: 'research', techId: 'radar' } as never)
    expect(s.players[0].policy).toBe('despotism')
  })
})

describe('시작 타일·음향학 문화', () => {
  it('시작 타일이 킬리만자로면 문화 +1 (타일 1장을 더 얻는다)', () => {
    const s = solo('denmark', [tile(['산'], { wonder: 'kilimanjaro' }), tile(['숲']), tile(['언덕']), tile(['해안'])])
    expect(culture(s.players[0])).toBe(5)
  })
  it('음향학을 연구하면 문화 +1', () => {
    let s = solo()
    s = mod(s, (c) => {
      c.players[0].techs.push('education')
    })
    const acoustics = TECHS.find((t) => t.id === 'acoustics')!
    s = mod(toResearch(s), (c) => (c.players[0].turn!.yields.science = acoustics.cost))
    const before = culture(s.players[0])
    s = apply(s, { type: 'research', techId: 'acoustics' })
    expect(culture(s.players[0])).toBe(before + 1)
  })
})

describe('도시 선택 (식량·망치 변환, 문화 타일, 일꾼 버리기)', () => {
  /** 도시 둘: 둘째 도시는 첫 도시를 복사해 id 1로 */
  function two(): GameState {
    return mod(solo('korea'), (c) => {
      const p = c.players[0]
      const second = structuredClone(p.cities[0])
      second.id = 1
      second.tiles = second.tiles.map((t, i) => ({ ...t, card: { ...t.card, id: 500 + i } }))
      second.workers = 3
      p.cities.push(second)
      p.techs.push('writing', 'scientific_theory')
    })
  }
  const withYields = (s: GameState) =>
    mod(apply(s, { type: 'placeWorkers', placements: [] }), (c) => {
      const y = c.players[0].turn!.yields
      y.cities[0].food = 3; y.cities[0].hammer = 2
      y.cities[1].food = 4; y.cities[1].hammer = 2
      y.science = 5
    })

  it('식량·망치를 도시별로 골라 과학으로 바꾼다', () => {
    let s = withYields(two())
    expect(() => apply(s, { type: 'research', techId: 'writing', foodByCity: { 1: 5 } })).toThrow(RuleError)
    expect(() => apply(s, { type: 'research', techId: 'writing', hammerByCity: { 1: 2, 0: 1 } })).toThrow(RuleError)
    s = apply(s, { type: 'research', techId: 'agriculture', foodByCity: { 1: 2 }, hammerByCity: { 1: 1 } })
    const turn = me(s).turn!
    expect(turn.foodToScience).toBe(2)
    expect(turn.hammerToScience).toBe(1)
  })

  it('문화로 얻는 타일을 붙일 도시를 고른다 (기본은 열린 면이 있는 첫 도시)', () => {
    const acoustics = TECHS.find((t) => t.id === 'acoustics')!
    const run = (choose: boolean) => {
      let s = mod(two(), (c) => c.players[0].techs.push('education'))
      if (choose) s = apply(s, { type: 'setChoices', cultureCity: 1 })
      s = mod(apply(s, { type: 'placeWorkers', placements: [] }), (c) => (c.players[0].turn!.yields.science = acoustics.cost))
      return apply(s, { type: 'research', techId: 'acoustics' })
    }
    const base = run(false)
    const picked = run(true)
    expect(me(base).cities.map((c) => c.tiles.length)).toEqual([5, 4])
    expect(me(picked).cities.map((c) => c.tiles.length)).toEqual([4, 5])
    expect(() => apply(two(), { type: 'setChoices', cultureCity: 9 })).toThrow(RuleError)
  })

  it('맡아둔 타일을 쓰지 않고 새로 뽑기를 고를 수 있다', () => {
    const acoustics = TECHS.find((t) => t.id === 'acoustics')!
    const held = tile(['산'], { wonder: 'kilimanjaro' })
    const run = (useHeld: boolean) => {
      let s = mod(two(), (c) => { c.players[0].techs.push('education'); c.players[0].held = held })
      s = apply(s, { type: 'setChoices', useHeld })
      s = mod(apply(s, { type: 'placeWorkers', placements: [] }), (c) => (c.players[0].turn!.yields.science = acoustics.cost))
      return apply(s, { type: 'research', techId: 'acoustics' })
    }
    expect(me(run(true)).held).toBeNull()
    expect(me(run(false)).held?.id).toBe(held.id)
  })
})

describe('시작 타일 엘도라도', () => {
  const eldoradoIn = (hand: TileCard[]) => hand.some((c) => c.wonder === 'eldorado')
  it('시작 손에서 엘도라도를 처음 발견하면 손이 5장, 도시를 세우면 영토 효과로 6장', () => {
    let hit = 0
    for (let seed = 1; seed <= 400 && hit < 3; seed++) {
      let s = createGame({ seed, civIds: ['denmark', 'china'] })
      const hand = s.players[s.order[0]].hand
      if (!eldoradoIn(hand)) continue
      hit++
      expect(hand).toHaveLength(5)
      expect(s.eldoradoFound).toBe(true)
      s = found(s)
      expect(culture(me(s))).toBe(6)
    }
    expect(hit).toBeGreaterThan(0)
  })
  it('시작 손이 이미 5장인 문명(시작 문화 1)은 발견 타일을 도시를 세운 뒤 영토로 받는다', () => {
    let hit = 0
    for (let seed = 1; seed <= 600 && hit < 2; seed++) {
      let s = createGame({ seed, civIds: ['persia', 'greece'] })
      const p = s.players[s.order[0]]
      if (p.civId !== 'persia' || !eldoradoIn(p.hand)) continue
      hit++
      expect(p.hand).toHaveLength(5)
      expect(p.startExtras).toHaveLength(1)
      s = found(s)
      expect(culture(me(s))).toBe(7)
    }
    expect(hit).toBeGreaterThan(0)
  })
  it('엘도라도가 없는 시작 손은 4장', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = createGame({ seed, civIds: ['denmark', 'china'] })
      const hand = s.players[s.order[0]].hand
      if (!eldoradoIn(hand)) expect(hand).toHaveLength(4)
    }
  })
})

describe('일꾼이 모자랄 때', () => {
  it('일꾼이 0명인데 맡아둔 타일이 있으면 타일을 덱으로 돌려주고 배치를 계속한다 (진행 불능 방지)', () => {
    const held = tile(['평지'])
    let s = mod(solo(), (c) => {
      c.players[0].cities[0].workers = 0
      c.players[0].held = held
    })
    s = apply(s, { type: 'placeWorkers', placements: [] })
    expect(me(s).held).toBeNull()
    expect(s.deck.some((c) => c.id === held.id)).toBe(true)
    expect(s.phase).toBe('research')
  })
})
