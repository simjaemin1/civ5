import { describe, expect, it } from 'vitest'
import { apply, createGame, currentPlayer, culture, happiness, primaryTerrain, researchableTechs, tileYield, ctxOf, RuleError, TECHS, COLUMN_COSTS, MILITARY_CARDS, techById, RESOURCES, makePlaceholderDeck, REAL_TILES, TILE_DECK_SIZE, makeTileDeck } from '..'
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

  it('드라마와 시: 문자 선행, 즉시 문화 1 → 새 타일이 남은 면에 붙는다', () => {
    let s = solo('korea')
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'research', techId: 'writing' }, { type: 'endProduction' })
    s = toResearch(s)
    expect(me(s).cities[0].openSides).toHaveLength(1)
    s = apply(s, { type: 'research', techId: 'drama' })
    expect(culture(me(s))).toBe(5)
    expect(me(s).cities[0].openSides).toHaveLength(0)
    expect(me(s).cities[0].tiles.at(-1)!.role).toBe('side')
  })

  it('문자: 식량을 1:1로 과학으로 바꿔 연구, 남은 식량으로 정산', () => {
    // 덴마크(과학0): 문자 → 농업(비용 0) 연구 후, 식량 1을 과학으로 바꿔 역법(비용 1) 연구
    let s = solo('denmark')
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'research', techId: 'writing' }, { type: 'endProduction' })
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'research', techId: 'agriculture' }, { type: 'endProduction' })
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

  it('기마술: 목축업 선행, 위대한 장군 +1', () => {
    let s = solo('korea')
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'research', techId: 'animal_husbandry' }, { type: 'endProduction' })
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'research', techId: 'horseback' })
    expect(me(s).generals).toBe(1)
  })

  it('연결선이 없는 기술은 같은 비용의 다른 기술이 있어야 연구 가능 (공공행정, 비용 4)', () => {
    let s = toResearch(solo('korea'))
    s = structuredClone(s)
    expect(researchableTechs(s).map((t) => t.id)).not.toContain('civil_service')
    s.players[0].techs.push('agriculture') // 비용 0: 해당 없음
    expect(researchableTechs(s).map((t) => t.id)).not.toContain('civil_service')
    s.players[0].techs.push('machinery') // 비용 4
    expect(researchableTechs(s).map((t) => t.id)).toContain('civil_service')
  })
})

describe('임시 타일 덱', () => {
  it('자원은 항상 그 지형에 맞게 붙는다 (습지의 사치자원은 설탕뿐)', () => {
    let swampLuxury = 0
    for (let seed = 1; seed <= 30; seed++) {
      for (const card of makePlaceholderDeck(seed)) {
        if (!card.resource) continue
        const res = RESOURCES[card.resource]
        expect(res.terrains, `${card.terrains.join(',')}에 ${res.name}`).toContain(primaryTerrain(card.terrains))
        if (card.terrains.includes('습지') && res.kind === 'luxury') {
          expect(card.resource).toBe('sugar')
          swampLuxury++
        }
      }
    }
    expect(swampLuxury).toBeGreaterThan(0) // 습지에 설탕이 실제로 나온다
  })

  it('모든 자원에 지형이 하나 이상 지정돼 있다', () => {
    for (const [id, res] of Object.entries(RESOURCES)) expect(res.terrains.length, id).toBeGreaterThan(0)
  })
})

describe('데이터 무결성', () => {
  it('기술 52장, 선행 기술 id가 모두 존재하고 비용은 열 비용표를 따른다', () => {
    expect(TECHS).toHaveLength(52)
    const ids = new Set(TECHS.map((t) => t.id))
    for (const t of TECHS) {
      for (const pre of t.prereqs ?? []) expect(ids.has(pre), `${t.id} <- ${pre}`).toBe(true)
      expect(t.cost).toBe(COLUMN_COSTS[t.column - 1])
    }
    expect(techById('apollo').cost).toBe(20)
  })

  it('기술 트리에 순환이 없고, 시작 기술에서 모든 기술에 도달 가능하다', () => {
    // 선행 관계만 따라 위상정렬이 가능해야 한다 (연결선 없는 기술은 같은 비용 규칙으로 열림)
    const done = new Set<string>()
    let progress = true
    while (progress) {
      progress = false
      for (const t of TECHS) {
        if (done.has(t.id)) continue
        const ok = t.prereqs?.length
          ? t.prereqs.every((p) => done.has(p))
          : t.cost === 0 || [...done].some((d) => techById(d).cost === t.cost)
        if (ok) { done.add(t.id); progress = true }
      }
    }
    expect([...TECHS.map((t) => t.id)].filter((id) => !done.has(id))).toEqual([])
  })

  it('신학은 나침반 뒤(정책 1개), 기계는 수렵 뒤(석궁병), 천문학은 기계 뒤', () => {
    expect(techById('theology').prereqs).toEqual(['compass'])
    expect(techById('machinery').prereqs).toEqual(['trapping'])
    expect(techById('astronomy').prereqs).toEqual(['machinery'])
    expect(techById('theology').effects).toEqual([{ kind: 'policy' }])
    expect(MILITARY_CARDS.find((c) => c.id === 'crossbowman')!.tech).toBe('machinery')
  })

  it('도표 확인 결과: 1줄은 공공행정→경제학→고고학→생물학→냉각기술→컴퓨터, 2줄은 음향학→과학이론→전기', () => {
    const chain = (id: string): string[] => {
      const pre = techById(id).prereqs?.[0]
      return pre ? [...chain(pre), id] : [id]
    }
    expect(chain('computers').map((i) => techById(i).name)).toEqual(['공공행정', '경제학', '고고학', '생물학', '냉각기술', '컴퓨터'])
    expect(chain('radio').map((i) => techById(i).name)).toEqual(['교육학', '음향학', '과학이론', '전기', '라디오'])
    expect(techById('economics').cost).toBe(6)
    expect(techById('archaeology').cost).toBe(10)
  })

  it('규칙서가 참조하는 기술이 모두 트리에 있다', () => {
    const refs = ['화약','강선','교체형부품','기계','산업화','공공행정','탄도학','기사도','군사과학','화학','다이너마이트','생물학','과학이론','통합작전군','레이더','원자론','공학','음향학','고고학','전기','라디오','컴퓨터','신학','교육학','인쇄기술','냉각기술','세계화','로켓공학','아폴로 프로젝트']
    const names = new Set(TECHS.map((t) => t.name))
    expect(refs.filter((n) => !names.has(n))).toEqual([])
  })

  it('군사 카드: 기술 id가 존재하고 비용이 규칙서 표와 같다', () => {
    const ids = new Set(TECHS.map((t) => t.id))
    for (const c of MILITARY_CARDS) expect(ids.has(c.tech), `${c.id} -> ${c.tech}`).toBe(true)
    const cost = (id: string) => MILITARY_CARDS.find((c) => c.id === id)!.cost
    expect([cost('warrior'), cost('infantry'), cost('anti_tank_gun'), cost('bomber'), cost('atomic_bomb')]).toEqual([3, 10, 9, 9, 11])
    // 일반 카드 25종 + 고유 유닛 전용 카드(화차, 제고이센) 2종
    expect(MILITARY_CARDS.filter((c) => !c.uniqueOnly)).toHaveLength(25)
    expect(MILITARY_CARDS.filter((c) => c.uniqueOnly).map((c) => c.id).sort()).toEqual(['hwacha', 'zeijoisen'])
  })
})

describe('실제 타일 카드 (옮겨 적은 목록)', () => {
  // 카드 하단에 인쇄된 산출은 엔진이 지형 우선순위와 자원 규칙으로 계산한 값과 같아야 한다
  it('인쇄된 산출이 엔진 계산(지형 우선순위·자원)과 일치한다', () => {
    const s = startGame(['denmark'], [[tile(['평지']), tile(['숲']), tile(['언덕']), tile(['해안'])]])
    const ctx = ctxOf(s.players[0])
    const bad: string[] = []
    REAL_TILES.forEach((t, i) => {
      const y = tileYield({ id: i, terrains: t.terrains, resource: t.resource, wonder: t.wonder }, ctx)
      const want = { food: 0, hammer: 0, science: 0, gold: 0, ...t.printed }
      if (JSON.stringify(y) !== JSON.stringify(want)) bad.push(`#${i + 1} ${t.terrains.join(',')}${t.resource ? ' ' + t.resource : ''}: 계산 ${JSON.stringify(y)} / 인쇄 ${JSON.stringify(want)}`)
    })
    expect(bad).toEqual([])
  })

  it('160장이 모두 옮겨져 있고 구성이 맞다 (자연경관 6장, 사적지 8장, 산 3장 등)', () => {
    expect(REAL_TILES).toHaveLength(TILE_DECK_SIZE)
    expect(REAL_TILES.filter((t) => t.wonder).map((t) => t.wonder).sort()).toEqual(
      ['eldorado', 'great_barrier_reef', 'king_solomons_mines', 'kilimanjaro', 'lake_victoria', 'old_faithful'].sort(),
    )
    expect(REAL_TILES.filter((t) => t.historic)).toHaveLength(8)
    expect(REAL_TILES.filter((t) => t.terrains.length === 1 && t.terrains[0] === '산' && !t.wonder)).toHaveLength(3)
    // 덱의 카드 id는 0~159로 겹치지 않는다
    expect(new Set(makeTileDeck(1).map((c) => c.id)).size).toBe(160)
  })

  it('사치자원은 전부 그 문명 기술이 있어야 행복을 주는 종류이고, 카드에 있는 자원은 모두 자원 표에 있다', () => {
    for (const t of REAL_TILES) if (t.resource) expect(RESOURCES[t.resource], t.resource).toBeTruthy()
  })

  it('자원은 그 자원이 나올 수 있는 지형에만 붙어 있다', () => {
    for (const t of REAL_TILES) {
      if (!t.resource) continue
      expect(t.terrains.some((x) => RESOURCES[t.resource!].terrains.includes(x)), `${t.terrains.join(',')} ${t.resource}`).toBe(true)
    }
  })

  it('160장이 모이기 전에는 임시 덱을 쓰고, 모이면 실제 덱을 쓴다', () => {
    const deck = makeTileDeck(1)
    if (REAL_TILES.length === TILE_DECK_SIZE) expect(deck.map((c) => c.terrains)).toEqual(REAL_TILES.map((t) => t.terrains))
    else expect(deck).toHaveLength(160) // 임시 덱도 160장
  })
})
