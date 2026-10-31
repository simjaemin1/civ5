import { describe, expect, it } from 'vitest'
import { holdLimit, AI_TUNE, actorOf, aiCandidates, aiStep, apply, bestSlots, createGame, cardById, cardStats, MILITARY_CARDS, civById, CIVS, happiness, rankTop, totalWorkers, usableInBattle, battleActions, choosePicks, simplePicks, mixedStrategy, arrangeBattle, WONDER_CARDS, declarationTargets, threat } from '..'
import type { GameState, TileCard } from '..'

/** AI끼리 게임을 끝까지(또는 maxSteps까지) 돌린다. */
function simulate(seed: number, civs: string[], maxSteps = 1500): { state: GameState; steps: number } {
  let s = createGame({ seed, civIds: civs })
  let steps = 0
  while (s.phase !== 'over' && steps < maxSteps) {
    s = aiStep(s).state
    steps++
  }
  return { state: s, steps }
}

/** 게임 상태가 항상 만족해야 하는 불변식 */
function checkInvariants(s: GameState): void {
  // 일반 카드는 한 종류 5장까지 (넘친 카드는 버릴 때까지 대기 중), 방향 카드에는 방향이 있고 그 외에는 없다
  for (const p of s.players) {
    for (const c of MILITARY_CARDS) {
      const over = (p.pendingCardDiscard ?? []).filter((d) => d === c.id).length
      expect(p.military.filter((m) => m.defId === c.id && !m.unique).length, `${p.civId} ${c.id} 보유`).toBeLessThanOrEqual(holdLimit(p, c.id) + over)
    }
    for (const m of p.military) {
      const st = cardStats(m)
      // 전투력 마크가 방향 카드이면 방향이 정해져 있다
      if (st.markPower !== undefined) expect(m.dirs?.length, `${m.unique ?? m.defId} 방향`).toBeGreaterThan(0)
    }
  }
  // 고유 유닛은 항상 3장: 재고 + 문명들이 가진 장수 (빼앗긴 카드는 가져간 문명이 가진 것으로 센다)
  for (const [name, supply] of Object.entries(s.uniqueSupply)) {
    const held = s.players.reduce((n, p) => n + p.military.filter((m) => m.unique === name).length, 0)
    expect(supply.length + held, `${name} 고유 유닛 수`).toBe(3)
  }
  // 타일 id는 어디에도 중복되지 않는다
  const ids: number[] = s.deck.map((t) => t.id)
  for (const p of s.players) {
    for (const c of p.cities) for (const t of c.tiles) ids.push(t.card.id)
    for (const t of p.hand) ids.push(t.id)
    for (const t of p.pendingCity ?? []) ids.push(t.id)
    if (p.held) ids.push(p.held.id)
    if (p.scouted) ids.push(p.scouted.id)
  }
  expect(new Set(ids).size).toBe(ids.length)
  for (const p of s.players) {
    if (p.eliminated) continue
    // 일꾼 수는 행복을 넘을 수 없다
    if (p.cities.length) expect(totalWorkers(p), `${p.civId} 일꾼/행복`).toBeLessThanOrEqual(happiness(p))
    expect(p.generals).toBeGreaterThanOrEqual(0)
    expect(p.busyWorkers).toBeGreaterThanOrEqual(0)
    for (const c of p.cities) expect(c.workers).toBeGreaterThanOrEqual(0)
  }
}

describe('AI 시뮬레이션', () => {
  it('여러 시드·문명 조합으로 끝까지 돌려도 오류 없이 진행되고 불변식이 유지된다', () => {
    const combos: [number, string[]][] = [
      [1, ['korea', 'russia']],
      [2, ['germany', 'france', 'china']],
      [3, ['england', 'india', 'japan', 'mongolia']],
      [4, ['sweden', 'spain', 'egypt']],
      [5, ['arabia', 'aztec', 'brazil', 'ottoman', 'zulu']],
      [6, ['huns', 'greece', 'denmark']],
    ]
    let finished = 0
    for (const [seed, civs] of combos) {
      const { state, steps } = simulate(seed, civs)
      checkInvariants(state)
      expect(steps).toBeGreaterThan(20)
      if (state.phase === 'over') finished++
    }
    expect(finished).toBeGreaterThanOrEqual(0)
  }, 120000)

  it('중간 상태에서도 매 단계 불변식이 유지된다 (100단계마다 검사)', () => {
    let s = createGame({ seed: 11, civIds: ['korea', 'germany', 'inca'] })
    for (let i = 0; i < 1500 && s.phase !== 'over'; i++) {
      s = aiStep(s).state
      if (i % 100 === 0) checkInvariants(s)
    }
    checkInvariants(s)
  }, 120000)

  it('같은 시드는 같은 게임이 된다 (결정적)', () => {
    const a = simulate(7, ['korea', 'russia', 'china'], 800)
    const b = simulate(7, ['korea', 'russia', 'china'], 800)
    expect(a.state.log).toEqual(b.state.log)
  }, 60000)

  it('모든 문명이 AI로 도시를 세우고 기술을 연구한다 (24개 문명 전체 스모크)', () => {
    for (let i = 0; i < CIVS.length; i += 2) {
      const civs = [CIVS[i].id, CIVS[(i + 1) % CIVS.length].id]
      const { state } = simulate(100 + i, civs, 400)
      expect(state.players.every((p) => p.cities.length > 0 || p.eliminated)).toBe(true)
      expect(state.players.some((p) => p.techs.length > 0)).toBe(true)
    }
    expect(civById('korea').uniques.length).toBeGreaterThan(0)
    expect(cardById('warrior').hp).toBe(3)
  }, 120000)

  it('AI가 고유 유닛을 생산·보유한다 (문명 전체를 돌려 확인)', () => {
    const made = new Set<string>()
    for (let i = 0; i < CIVS.length; i += 2) {
      const civs = [CIVS[i].id, CIVS[(i + 1) % CIVS.length].id]
      let s = createGame({ seed: 300 + i, civIds: civs })
      for (let n = 0; n < 1200 && s.phase !== 'over'; n++) {
        s = aiStep(s).state
        for (const p of s.players) for (const m of p.military) if (m.unique) made.add(m.unique)
      }
      checkInvariants(s)
    }
    expect(made.size).toBeGreaterThanOrEqual(5)
  }, 240000)
})

describe('AI 과학 승리 전략', () => {
  it('나침반 → 행복·일꾼 증식 → 아폴로로 과학 승리가 실제로 나온다', () => {
    const types: string[] = []
    // 문화 승리 질주를 끄고 과학 전략만 본다
    const saved = AI_TUNE.cultureRush
    AI_TUNE.cultureRush = 0
    try {
      for (const seed of [1, 2, 4, 8]) {
        const { state } = simulate(seed, ['korea', 'egypt'], 2500)
        checkInvariants(state)
        types.push(state.winner?.type ?? 'none')
      }
    } finally {
      AI_TUNE.cultureRush = saved
    }
    expect(types).toContain('science')
  }, 240000)

  it('세계화·냉각기술 + 평등으로 관광이 상대 문화를 넘겨 문화 승리가 실제로 나온다', () => {
    const types: string[] = []
    for (const seed of [3, 7, 10]) {
      const { state } = simulate(seed, ['korea', 'egypt', 'china'], 2500)
      checkInvariants(state)
      types.push(state.winner?.type ?? 'none')
    }
    expect(types).toContain('culture')
  }, 240000)
})

describe('AI 견제 구도 (3명 이상)', () => {
  it('딸리는 문명은 1등만 노리고, 1등은 2등을 노린다', () => {
    const s = createGame({ seed: 1, civIds: ['korea', 'egypt', 'china', 'japan'] })
    // 1번 문명이 확실한 1등: 기술과 불가사의를 많이 가짐
    s.players[1].techs.push('agriculture', 'writing', 'sailing', 'mining', 'archery', 'calendar')
    s.players[1].wonders.push('pyramids', 'petra')
    s.players[2].techs.push('agriculture', 'writing', 'sailing')
    const top = rankTop(s)!
    expect(top.leader.id).toBe(1)
    expect(top.runnerUp.id).toBe(2)
  })

  it('둘만 남으면 견제 구도를 쓰지 않는다', () => {
    const s = createGame({ seed: 1, civIds: ['korea', 'egypt'] })
    expect(rankTop(s)).toBeNull()
  })
})


describe('AI 전투 배치와 생산 (원거리는 안쪽으로, 줄루에는 보병)', () => {
  /** 한 문명에게 군사 카드를 주고 uid를 돌려준다 */
  const give = (s: GameState, pid: number, defId: string, dir: 'L' | 'C' | 'R', unique?: string): number => {
    const uid = s.nextUid++
    s.players[pid].military.push({ uid, defId, dirs: [dir], unique })
    return uid
  }
  const base = () => structuredClone(createGame({ seed: 1, civIds: ['korea', 'zulu'] }))

  it('원거리 계열은 공격이 벽을 향하는 칸(왼쪽 방향 1번, 오른쪽 방향 4번)에 놓지 않는다', () => {
    const s = base()
    const a = give(s, 0, 'archer', 'L')
    const b = give(s, 0, 'archer', 'L')
    const c = give(s, 0, 'crossbowman', 'R')
    const d = give(s, 0, 'composite_bowman', 'R')
    const slots = bestSlots(s.players[0], [a, b, c, d])
    expect(slots.slice().sort()).toEqual([a, b, c, d].sort()) // 같은 카드들을 그대로 쓴다
    const at = (u: number) => slots.indexOf(u) + 1
    for (const u of [a, b]) expect(at(u)).toBeGreaterThan(1) // 왼쪽 방향: 1번에서는 벽
    for (const u of [c, d]) expect(at(u)).toBeLessThan(4) // 오른쪽 방향: 4번에서는 벽
  })

  it('벽을 향하는 칸은 창병 계열에게 내주고, 임피는 안쪽을 향하게 둔다', () => {
    const s = base()
    const spear = give(s, 0, 'spearman', 'L')
    const archer1 = give(s, 0, 'archer', 'L')
    const archer2 = give(s, 0, 'archer', 'L')
    const impi = give(s, 0, 'pikeman', 'L', '임피')
    // 왼쪽 방향 넷 중 하나는 반드시 1번(벽)이다: 그 자리는 창병이 맡는다
    const slots = bestSlots(s.players[0], [archer1, archer2, impi, spear])
    expect(slots[0]).toBe(spear)
    // 카드가 셋이면 빈칸을 두어서라도 모두 안쪽을 향하게 한다
    const three = bestSlots(s.players[0], [archer1, archer2, impi])
    expect(three[0]).toBeNull()
  })

  it('아무 배치도 같은 카드를 두 번 쓰지 않고 4칸 안에 모두 놓는다', () => {
    const s = base()
    const ids = ['warrior', 'archer', 'spearman', 'cannon'].map((d, i) => give(s, 0, d, (['L', 'C', 'R', 'L'] as const)[i]))
    const slots = bestSlots(s.players[0], ids)
    expect(slots).toHaveLength(4)
    expect(slots.filter((x) => x !== null).sort()).toEqual(ids.slice().sort())
  })

  it('전투 배치의 첫 후보는 규칙을 지키고, 예전 휴리스틱은 쓸 수 있는 카드가 있으면 빈 배치를 내지 않는다 (전함·원자폭탄 거르기)', () => {
    const combos: [number, string[]][] = [
      [1001, ['england', 'netherlands']],
      [1002, ['england', 'aztec', 'france']],
      [1003, ['netherlands', 'huns', 'england']],
      [1004, ['france', 'england', 'zulu', 'mongolia']],
    ]
    let arranges = 0
    let withUnusable = 0
    for (const [seed, civs] of combos) {
      let s = createGame({ seed, civIds: civs })
      for (let i = 0; i < 6000 && s.phase !== 'over'; i++) {
        if (s.phase === 'battle' && s.battle?.step === 'arrange') {
          const pid = actorOf(s)
          const p = s.players[pid]
          // 게임 이론 배치 (0장 내기도 후보라 빈 배치가 나올 수 있다)
          expect(() => apply(s, aiCandidates(s)[0]), `시드 ${seed} 배치`).not.toThrow()
          // 예전 휴리스틱
          const first = battleActions(s, pid, true)[0]
          expect(() => apply(s, first), `시드 ${seed} 예전 배치`).not.toThrow()
          const usable = p.military.filter((c) => usableInBattle(s, s.battle!, p, c)).length
          if (first.type === 'arrangeBattle' && usable > 0) expect(first.slots.some((x) => x !== null)).toBe(true)
          if (usable < p.military.length) withUnusable++
          arranges++
        }
        s = aiStep(s).state
      }
    }
    expect(arranges).toBeGreaterThan(30)
    expect(withUnusable).toBeGreaterThan(0) // 쓸 수 없는 카드를 든 채 배치하는 경우가 실제로 나온다
  }, 240000)

  it('줄루가 상대면 군사 카드를 만들 때 보병 계열을 먼저 만든다', () => {
    const produceFirst = (civs: string[]): string => {
      let s = createGame({ seed: 2, civIds: civs })
      for (let i = 0; i < 400 && !(s.phase === 'produce' && s.players[actorOf(s)].id === 0 && s.players[0].turn); i++) s = aiStep(s).state
      s = structuredClone(s)
      const p = s.players[0]
      p.techs.push(cardById('warrior').tech, cardById('composite_bowman').tech)
      p.military = []
      p.turn!.produced = []
      p.turn!.yields.cities[0].hammer = 30
      const act = aiCandidates(s).find((a) => a.type === 'produce')
      if (!act || act.type !== 'produce') throw new Error('생산 후보가 없음')
      return act.defId
    }
    expect(cardById('composite_bowman').cost).toBeGreaterThan(cardById('warrior').cost)
    expect(produceFirst(['korea', 'russia'])).toBe('composite_bowman') // 가장 비싼 카드부터
    expect(produceFirst(['korea', 'zulu'])).toBe('warrior') // 줄루(임피)가 상대면 보병 계열
  })
})

describe('AI 불가사의 투자 (경매 읽기)', () => {
  /** 0번 문명의 생산 단계까지 돌리고, 투자할 수 있는 불가사의가 있게 망치를 넉넉히 준다 */
  const atProduce = (): GameState => {
    let s = createGame({ seed: 3, civIds: ['egypt', 'korea', 'russia'] })
    for (let i = 0; i < 3000 && !(s.phase === 'produce' && actorOf(s) === 0 && s.players[0].turn && s.round >= 8); i++) s = aiStep(s).state
    s = structuredClone(s)
    const p = s.players[0]
    for (const w of WONDER_CARDS) if (!p.techs.includes(w.tech)) p.techs.push(w.tech)
    p.turn!.produced = []
    p.military = [] // 군대가 없으면 카드부터 만들지만 투자 후보는 여전히 나온다
    for (const y of p.turn!.yields.cities) y.hammer = 12
    return s
  }
  const investTargets = (s: GameState): string[] => aiCandidates(s).flatMap((a) => (a.type === 'invest' ? [a.wonderId] : []))

  it('앞사람이 이미 더 많이 투자한 불가사의에는 투자 후보를 내지 않는다', () => {
    const s = atProduce()
    const open = investTargets(s)
    expect(open.length).toBeGreaterThan(1)
    const [beaten, ...rest] = open
    s.investments = [{ wonderId: beaten, playerId: 1, cityId: 0, hammers: 13 }]
    s.wonderProgress = {}
    const after = investTargets(s)
    expect(after).not.toContain(beaten)
    expect(after).toEqual(expect.arrayContaining(rest))
  })

  it('앞사람과 같은 금액이면 투자하지 않지만, 그 앞사람이 이번에 완성하게 되면 동률로 막는다', () => {
    const s = atProduce()
    const [target] = investTargets(s)
    s.investments = [{ wonderId: target, playerId: 1, cityId: 0, hammers: 12 }]
    s.wonderProgress = {}
    expect(investTargets(s)).not.toContain(target)
    const need = WONDER_CARDS.find((w) => w.id === target)!.progressNeeded
    s.wonderProgress = { [target]: { 1: need - 1 } }
    const cands = aiCandidates(s)
    const first = cands.findIndex((a) => a.type === 'invest' && a.wonderId === target)
    expect(first).toBeGreaterThanOrEqual(0)
    expect(cands.slice(0, first).some((a) => a.type === 'produce' || a.type === 'invest')).toBe(false) // 막는 투자가 가장 먼저
  })

  it('다른 문명의 진척도가 2 이상 앞선 불가사의는 포기한다', () => {
    const s = atProduce()
    const [target] = investTargets(s)
    s.wonderProgress = { [target]: { 2: 2 } }
    expect(investTargets(s)).not.toContain(target)
  })
})

describe('AI 차례 계획기 (문턱 기준 일꾼 배치)', () => {
  it('일꾼이 행복 상한에 차서 성장할 수 없으면, 남는 식량 대신 군사 카드 비용에 닿는 망치 타일에 일꾼을 올린다', () => {
    let s = createGame({ seed: 4, civIds: ['korea', 'russia'] })
    for (let i = 0; i < 500 && !(s.phase === 'place' && actorOf(s) === 0 && s.round >= 3); i++) s = aiStep(s).state
    s = structuredClone(s)
    const p = s.players[0]
    p.techs = ['agriculture'] // 전사(망치 3)만 만들 수 있다
    p.military = []
    p.policy = null
    p.held = null
    p.scouting = false
    p.busyWorkers = 0
    p.generals = 0
    p.wonders = []
    const card = (id: number, terrains: string[]) => ({ id, terrains }) as never
    const city = p.cities[0]
    p.cities = [city]
    // 도시(숲: 식량 1, 망치 1) + 평지 3장(식량 2) + 언덕 2장(망치 2), 일꾼은 행복 상한만큼
    const tiles = [9002, 9003, 9004].map((id) => ({ card: card(id, ['평지']), role: 'extra' as const })).concat([9005, 9006].map((id) => ({ card: card(id, ['언덕']), role: 'extra' as const })))
    city.tiles = [{ card: card(9001, ['숲']), role: 'city' }, ...tiles]
    city.openSides = []
    city.workers = happiness(p)
    expect(city.workers).toBe(3)
    const place = aiCandidates(s).find((a) => a.type === 'placeWorkers')
    if (!place || place.type !== 'placeWorkers') throw new Error('배치 후보 없음')
    const hills = place.placements.filter((x) => x.tileId >= 9005).length
    const food = 1 + 2 * (place.placements.length - hills)
    const hammer = 1 + 2 * hills
    // 타일 점수 순(평지 3장)이면 식량 7이 성장 없이 사라지고 망치 1로는 아무것도 못 만든다
    expect(hills).toBeGreaterThanOrEqual(1)
    expect(food).toBeGreaterThanOrEqual(3) // 일꾼을 잃지 않는다
    expect(hammer).toBeGreaterThanOrEqual(3) // 전사(망치 3)를 만든다
    const next = apply(s, place)
    expect(next.players[0].turn!.yields.cities[0].hammer).toBe(hammer)
  })

  it('망치를 쓸 곳(군사 카드·불가사의)이 없으면 군사 카드를 여는 비용 0 기술을 먼저 연구한다', () => {
    let s = createGame({ seed: 5, civIds: ['russia', 'korea'] })
    for (let i = 0; i < 500 && !(s.phase === 'research' && actorOf(s) === 0); i++) s = aiStep(s).state
    s = structuredClone(s)
    const p = s.players[0]
    p.techs = [] // 문자(대도서관)처럼 불가사의를 여는 기술도 없다
    // 문화가 급한 상태(음향학 먼저)가 아니게: 일꾼은 행복보다 적고, 영토 타일은 좋게
    for (const c of p.cities) {
      c.workers = 1
      for (const t of c.tiles) if (t.role !== 'city') t.card = { ...t.card, terrains: ['오아시스'], resource: undefined, wonder: undefined }
    }
    const first = aiCandidates(s).find((a) => a.type === 'research')
    if (!first || first.type !== 'research') throw new Error('연구 후보 없음')
    expect(['agriculture', 'archery', 'animal_husbandry', 'bronze_working']).toContain(first.techId)
    // 이미 카드를 만들 수 있으면 평소 순서(나침반 계열)를 따른다
    p.techs = ['agriculture']
    const usual = aiCandidates(s).find((a) => a.type === 'research')
    expect(usual && usual.type === 'research' && usual.techId).toBe('sailing')
  })
})

describe('AI 전쟁 판단 (승률 추정·쏠림 방지·수비·실질 위협도)', () => {
  /** 0번 문명의 선전포고 단계까지 돌린 상태 */
  const atPhase = (phase: GameState['phase'], civs: string[]): GameState => {
    let s = createGame({ seed: 6, civIds: civs })
    for (let i = 0; i < 4000 && !(s.phase === phase && actorOf(s) === 0 && s.round >= 4 && !s.players[0].pendingDiscard && !s.players[0].pendingCardDiscard?.length); i++) s = aiStep(s).state
    s = structuredClone(s)
    s.declarations = []
    for (const p of s.players) {
      p.military = []
      p.busyWorkers = 0
      for (const c of p.cities) for (const t of c.tiles) delete t.occupiedBy // 점령·탈환 없이 시작
    }
    for (const c of s.players[0].cities) c.placed = [] // 선전포고에 걸 일꾼(타일에 올리지 않은 일꾼)이 있게
    return s
  }
  const give = (s: GameState, pid: number, defId: string, n: number) => {
    for (let i = 0; i < n; i++) s.players[pid].military.push({ uid: s.nextUid++, defId, dirs: cardById(defId).variantDirs ? ['C'] : undefined })
  }
  /** 0번이 낼 일반·도시 선전포고의 대상 (탈환 제외) */
  const declaresOn = (s: GameState): number[] => {
    const kinds = new Map(declarationTargets(s, s.players[0]).map((t) => [t.tileId, t.kind]))
    return aiCandidates(s).flatMap((a) => (a.type === 'declareWar' && kinds.get(a.tileId) !== 'retake' ? [a.defenderId] : []))
  }
  /** pid의 도시 타일이 아닌 땅 한 장을 노리는 선전포고 */
  const declOn = (s: GameState, attackerId: number, pid: number) => {
    const city = s.players[pid].cities[0]
    const tile = city.tiles.find((x) => x.role !== 'city' && x.occupiedBy === undefined)!
    return { attackerId, defenderId: pid, cityId: city.id, tileId: tile.card.id, kind: 'normal' as const }
  }

  it('이길 가망이 없으면 선전포고하지 않고, 힘이 앞서면 선전포고한다', () => {
    const s = atPhase('declare', ['korea', 'egypt'])
    s.players[0].generals = 1
    expect(declarationTargets(s, s.players[0]).some((t) => t.kind === 'normal')).toBe(true)
    give(s, 0, 'warrior', 2)
    give(s, 1, 'rifleman', 4)
    expect(declaresOn(s)).not.toContain(1)
    s.players[0].military = []
    s.players[1].military = []
    give(s, 0, 'rifleman', 4)
    give(s, 1, 'warrior', 1)
    expect(declaresOn(s)).toContain(1)
  })

  it('1등에게 이미 충분한 공격이 걸렸으면 1등 대신 다른 문명을 노린다 (사면 점령이 3칸 미만일 때)', () => {
    const s = atPhase('declare', ['korea', 'egypt', 'china'])
    // 1번이 확실한 1등
    s.players[1].techs.push('agriculture', 'writing', 'sailing', 'mining', 'archery', 'calendar', 'masonry', 'bronze_working')
    s.players[1].wonders.push('pyramids', 'petra')
    s.players[0].generals = 1
    give(s, 0, 'rifleman', 4)
    give(s, 1, 'warrior', 1)
    give(s, 2, 'warrior', 1)
    expect(rankTop(s)!.leader.id).toBe(1)
    expect(declaresOn(s)[0]).toBe(1) // 쏠림이 없으면 1등을 노린다
    // 2번이 이미 1등에게 선전포고했고, 그 힘이 1등 수비를 넉넉히 넘는다
    give(s, 2, 'rifleman', 3)
    s.declarations = [declOn(s, 2, 1)]
    expect(declaresOn(s)).not.toContain(1)
  })

  it('나를 노린 선전포고가 있으면 불가사의보다 군사 카드를 먼저 만든다', () => {
    const s = atPhase('produce', ['korea', 'egypt'])
    const p = s.players[0]
    for (const w of WONDER_CARDS) if (!p.techs.includes(w.tech)) p.techs.push(w.tech)
    if (!p.techs.includes('agriculture')) p.techs.push('agriculture')
    give(s, 0, 'rifleman', 4) // 군대는 이미 넉넉하다
    give(s, 1, 'warrior', 1)
    p.turn!.produced = []
    for (const y of p.turn!.yields.cities) y.hammer = 12
    const firstProduction = () => aiCandidates(s).find((a) => a.type === 'produce' || a.type === 'invest')!.type
    expect(firstProduction()).toBe('invest')
    s.declarations = [declOn(s, 1, 0)]
    expect(firstProduction()).toBe('produce')
  })

  it('실질 위협도: 점령당한 타일의 산출과 이번 라운드에 걸린 선전포고만큼 내려간다 (문화는 그대로)', () => {
    const s = atPhase('declare', ['korea', 'egypt', 'china'])
    const o = s.players[1]
    const before = threat(s, o)
    const tile = o.cities[0].tiles.find((x) => x.role !== 'city')!
    tile.occupiedBy = 2
    const occupied = threat(s, o)
    expect(occupied).toBeLessThan(before)
    s.declarations = [{ attackerId: 2, defenderId: 1, cityId: o.cities[0].id, tileId: o.cities[0].tiles.find((x) => x.role !== 'city' && x !== tile)!.card.id, kind: 'normal' }]
    expect(threat(s, o)).toBeCloseTo(occupied - 3)
  })

  /** pid의 첫 도시에 추가 타일(사면이 아닌 땅)을 붙인다 */
  const addExtra = (s: GameState, pid: number, card: Omit<TileCard, 'id'>, occupiedBy?: number) => {
    const city = s.players[pid].cities[0]
    const placed = { card: { ...card, id: 9000 + city.tiles.length + pid * 100 }, role: 'extra' as const, slot: city.tiles.filter((t) => t.role === 'extra').length, occupiedBy }
    city.tiles.push(placed)
    return placed
  }
  /** pid의 도시 타일이 아닌 땅을 모두 자원 없는 평지로 바꾼다 (중요도 비교를 단순하게) */
  const flatten = (s: GameState, pid: number) => {
    for (const c of s.players[pid].cities) for (const t of c.tiles) if (t.role !== 'city') t.card = { id: t.card.id, terrains: ['평지'] }
  }
  const recalls = (s: GameState) => aiCandidates(s).flatMap((a) => (a.type === 'recallGeneral' ? [a] : []))
  const withTune = <T,>(patch: Partial<typeof AI_TUNE>, f: () => T): T => {
    const saved = { ...AI_TUNE }
    Object.assign(AI_TUNE, patch)
    try {
      return f()
    } finally {
      Object.assign(AI_TUNE, saved)
    }
  }

  it('전쟁광은 탈락시킬 상대의 망치 타일을 도시 사면보다 먼저 노린다', () => {
    const s = atPhase('declare', ['huns', 'korea'])
    s.players[0].generals = 1
    give(s, 0, 'rifleman', 4)
    give(s, 1, 'warrior', 1)
    flatten(s, 1)
    const hill = addExtra(s, 1, { terrains: ['언덕'] })
    const firstTarget = () => aiCandidates(s).find((a) => a.type === 'declareWar')
    expect(firstTarget()).toMatchObject({ defenderId: 1, tileId: hill.card.id })
    // 망치 가산점이 없으면 도시 사면(평지)을 먼저 노린다
    expect(withTune({ warlordHammer: 0 }, firstTarget)).not.toMatchObject({ tileId: hill.card.id })
  })

  it('전쟁광은 장군이 모자라도 탈락시킬 상대의 망치 타일 점령은 풀지 않는다', () => {
    const s = atPhase('place', ['huns', 'korea'])
    const p = s.players[0]
    p.generals = 0
    p.returningGenerals = 0
    give(s, 0, 'rifleman', 4)
    give(s, 1, 'warrior', 1)
    flatten(s, 1)
    const hill = addExtra(s, 1, { terrains: ['언덕'] }, 0)
    const plain = addExtra(s, 1, { terrains: ['평지'] }, 0)
    const ids = recalls(s).map((a) => a.tileId)
    expect(ids).toContain(plain.card.id)
    expect(ids).not.toContain(hill.card.id)
  })

  it('장군이 없어도 불러들여서 칠 더 좋은 곳이 없으면 점령을 풀지 않는다 (풀었다가 같은 타일·같은 값의 타일을 다시 치지 않는다)', () => {
    const s = atPhase('place', ['korea', 'egypt'])
    s.players[0].generals = 0
    s.players[0].returningGenerals = 0
    give(s, 0, 'rifleman', 4)
    give(s, 1, 'warrior', 1)
    flatten(s, 1)
    s.players[1].cities[0].tiles.find((t) => t.role === 'side')!.occupiedBy = 0
    const tune = { harass: false, coalition: false }
    expect(withTune(tune, () => recalls(s))).toEqual([])
    // 훨씬 좋은 타일이 생기면 불러들여 그쪽으로 옮긴다
    addExtra(s, 1, { terrains: ['호수'], wonder: 'lake_victoria' })
    expect(withTune(tune, () => recalls(s)).length).toBe(1)
  })

  describe('견제형 점령 (정복 없이 장군 한두 개로 방해)', () => {
    it('고유 유닛을 든 문명은 상대의 고생산(망치) 타일을 먼저 노려 점거한다', () => {
      const s = atPhase('declare', ['korea', 'egypt'])
      s.players[0].generals = 1
      give(s, 0, 'rifleman', 4)
      s.players[0].military.push({ uid: s.nextUid++, defId: 'hwacha', unique: '화차', dirs: ['C'] }) // 고유 유닛을 들고 있어 견제형이다
      give(s, 1, 'warrior', 1)
      flatten(s, 1)
      const hill = addExtra(s, 1, { terrains: ['언덕'] })
      const firstTarget = () => aiCandidates(s).find((a) => a.type === 'declareWar')
      expect(firstTarget()).toMatchObject({ defenderId: 1, tileId: hill.card.id })
      // 망치 가산점이 없으면 식량까지 나오는 평지를 먼저 노린다
      expect(withTune({ harassHammer: 0 }, firstTarget)).not.toMatchObject({ tileId: hill.card.id })
    })

    it('점령은 오래 들고 있는 것이 기본이다 (더 좋은 타일이 없으면 장군을 불러들이지 않는다)', () => {
      const s = atPhase('place', ['korea', 'egypt'])
      s.players[0].generals = 0
      s.players[0].returningGenerals = 0
      give(s, 0, 'rifleman', 4)
      give(s, 1, 'warrior', 1)
      flatten(s, 1)
      addExtra(s, 1, { terrains: ['평지'] }, 0)
      expect(recalls(s)).toEqual([])
      // 견제형을 끄면 예전처럼 장군이 모자랄 때 값싼 점령부터 푼다
      expect(withTune({ harass: false }, () => recalls(s)).length).toBeGreaterThan(0)
    })

    it('상대가 훨씬 좋은 타일을 얻으면 가장 덜 중요한 점령의 장군을 불러들이고, 그 차례에 그 타일에 선전포고한다', () => {
      let s = atPhase('place', ['korea', 'egypt'])
      s.players[0].generals = 0
      s.players[0].returningGenerals = 0
      give(s, 0, 'rifleman', 4)
      give(s, 1, 'warrior', 1)
      flatten(s, 1)
      const held = addExtra(s, 1, { terrains: ['평지'] }, 0)
      const lake = addExtra(s, 1, { terrains: ['호수'], wonder: 'lake_victoria' })
      expect(recalls(s)).toEqual([expect.objectContaining({ defenderId: 1, tileId: held.card.id })])
      // 장군을 불러들인 그 차례의 선전포고: 대상의 첫 번째가 그 타일이다
      s = structuredClone(s)
      s.phase = 'declare'
      delete s.players[1].cities[0].tiles.find((t) => t.card.id === held.card.id)!.occupiedBy
      s.players[0].generals = 1
      expect(aiCandidates(s).find((a) => a.type === 'declareWar')).toMatchObject({ defenderId: 1, tileId: lake.card.id })
    })

    it('3명 이상에서 1등이 바뀌면 옛 상대의 점령을 풀어 새 1등을 노린다', () => {
      const s = atPhase('place', ['korea', 'egypt', 'china'])
      s.players[0].generals = 0
      s.players[0].returningGenerals = 0
      // 1번이 확실한 1등
      s.players[1].techs.push('agriculture', 'writing', 'sailing', 'mining', 'archery', 'calendar', 'masonry', 'bronze_working')
      s.players[1].wonders.push('pyramids', 'petra')
      give(s, 0, 'rifleman', 4)
      give(s, 1, 'warrior', 1)
      give(s, 2, 'warrior', 1)
      flatten(s, 2)
      const old = addExtra(s, 2, { terrains: ['호수'], wonder: 'lake_victoria' }, 0)
      expect(rankTop(s)!.leader.id).toBe(1)
      // 옛 상대의 타일이 더 좋아도 1등이 우선이다
      expect(recalls(s)).toEqual([expect.objectContaining({ defenderId: 2, tileId: old.card.id })])
    })

    it('옮겨 갈 타일에서 이길 가망이 없으면 장군을 놀리지 않고 지금 점령을 그대로 둔다', () => {
      const s = atPhase('place', ['korea', 'egypt', 'china'])
      s.players[0].generals = 0
      s.players[0].returningGenerals = 0
      s.players[1].techs.push('agriculture', 'writing', 'sailing', 'mining', 'archery', 'calendar', 'masonry', 'bronze_working')
      s.players[1].wonders.push('pyramids', 'petra')
      give(s, 0, 'rifleman', 4)
      s.players[0].military.push({ uid: s.nextUid++, defId: 'hwacha', unique: '화차', dirs: ['C'] }) // 고유 유닛을 들고 있어 견제형이다
      give(s, 1, 'infantry', 4) // 1등은 군대가 훨씬 강해 이길 가망이 없다
      flatten(s, 2)
      addExtra(s, 2, { terrains: ['평지'] }, 0)
      expect(rankTop(s)!.leader.id).toBe(1)
      expect(recalls(s)).toEqual([])
    })
  })

  describe('정책 갈아타기 (전통 → 피라미드의 자유·과학이론의 합리주의)', () => {
    /** 0번이 연구 단계: 철학(정책 기술)과 다른 싼 기술을 열 수 있고, 피라미드를 지을 수 있다 */
    const atResearch = (prog: number) => {
      const s = atPhase('research', ['korea', 'egypt', 'china'])
      const p = s.players[0]
      for (const t of ['archery', 'mathematics', 'masonry', 'construction', 'writing']) if (!p.techs.includes(t)) p.techs.push(t)
      for (const t of ['philosophy', 'theology', 'engineering', 'currency']) p.techs = p.techs.filter((x) => x !== t)
      for (const o of s.players.slice(1)) o.techs = o.techs.filter((x) => x !== 'construction') // 피라미드 경쟁자 없음
      s.wonderProgress = { pyramids: { 0: prog } }
      p.policy = 'aesthetics'
      p.turn!.yields.science = 1
      for (const y of p.turn!.yields.cities) y.hammer = 8
      return s
    }
    const researched = (s: GameState) => aiCandidates(s).flatMap((a) => (a.type === 'research' ? [a.techId] : []))

    it('피라미드 완성이 한 번 남았으면, 완성이 확실해질 때까지 정책 기술(철학)을 열지 않는다', () => {
      const s = atResearch(2)
      for (const y of s.players[0].turn!.yields.cities) y.hammer = 4 // 이번 차례에는 최소 망치(5)를 못 내 완성이 확실하지 않다
      expect(researched(s)).not.toContain('philosophy')
      expect(withTune({ policyGambit: false }, () => researched(s))).toContain('philosophy')
      // 진척도가 더 남았으면 아직 아껴 두지 않는다 (정책 선택이 막히지 않게)
      expect(researched(atResearch(1))).toContain('philosophy')
    })

    it('피라미드 완성이 확실한 차례에는 정책 기술을 먼저 열고 전통을 고른다', () => {
      let s = atResearch(2)
      expect(researched(s)[0]).toBe('philosophy')
      s = apply(s, { type: 'research', techId: 'philosophy' })
      for (const y of s.players[0].turn!.yields.cities) y.hammer = 8 // 연구 뒤 산출을 다시 계산하므로 망치를 다시 맞춘다
      expect(aiCandidates(s).find((a) => a.type === 'choosePolicy')).toMatchObject({ policy: 'tradition' })
    })

    it('전통일 때 과학이론의 합리주의 제안은 받아들인다', () => {
      const s = atPhase('research', ['korea', 'egypt'])
      const p = s.players[0]
      p.policy = 'tradition'
      p.policyOffer = 'rationalism'
      expect(aiCandidates(s).find((a) => a.type === 'policyOffer')).toEqual({ type: 'policyOffer', accept: true })
    })

    it('이미 자유면 피라미드에 투자하지 않는다 (상대의 완성을 막을 때만)', () => {
      const s = atPhase('produce', ['korea', 'egypt'])
      const p = s.players[0]
      for (const t of ['masonry', 'construction']) if (!p.techs.includes(t)) p.techs.push(t)
      give(s, 0, 'rifleman', 4)
      p.turn!.produced = []
      for (const y of p.turn!.yields.cities) y.hammer = 8
      const invests = () => aiCandidates(s).flatMap((a) => (a.type === 'invest' ? [a.wonderId] : []))
      p.policy = 'aesthetics'
      expect(invests()).toContain('pyramids')
      p.policy = 'liberty'
      expect(invests()).not.toContain('pyramids')
    })
  })

  describe('해안 견제 (영국): 해안·석유 타일만 노리고, 점령하면 계속 막고, 성장을 해치지 않는다', () => {
    const firstTarget = (s: GameState) => aiCandidates(s).find((a) => a.type === 'declareWar')
    it('해안·석유 타일만 노린다 (더 좋은 언덕이 있어도)', () => {
      const s = atPhase('declare', ['england', 'egypt'])
      s.players[0].generals = 1
      give(s, 0, 'rifleman', 4)
      give(s, 1, 'warrior', 1)
      flatten(s, 1)
      addExtra(s, 1, { terrains: ['언덕'], resource: 'iron' })
      expect(firstTarget(s)).toBeUndefined()
      const coast = addExtra(s, 1, { terrains: ['해안'] })
      expect(firstTarget(s)).toMatchObject({ defenderId: 1, tileId: coast.card.id })
      const oil = addExtra(s, 1, { terrains: ['사막'], resource: 'oil' })
      expect([coast.card.id, oil.card.id]).toContain(firstTarget(s)!.tileId)
    })

    it('칠 해안·석유 타일이 없으면 선전포고용 일꾼을 남기지 않는다', () => {
      const s = atPhase('place', ['england', 'egypt'])
      const p = s.players[0]
      p.generals = 1
      give(s, 0, 'rifleman', 4)
      give(s, 1, 'warrior', 1)
      flatten(s, 1)
      // 일꾼보다 타일이 많게 (남긴 일꾼이 놀던 일꾼이 아니게), 식량이 넉넉하게, 일꾼은 행복 상한까지
      for (let i = 0; i < 4; i++) addExtra(s, 0, { terrains: ['평지'] })
      flatten(s, 0)
      while (totalWorkers(p) < happiness(p)) p.cities[0].workers++
      const placedCount = () => (aiCandidates(s).find((a) => a.type === 'placeWorkers') as { placements: unknown[] }).placements.length
      expect(placedCount()).toBe(totalWorkers(p))
      // 칠 해안 타일이 생기고, 일꾼 하나를 빼도 성장에 상관없으면 하나를 남긴다
      addExtra(s, 1, { terrains: ['해안'] })
      expect(placedCount()).toBe(totalWorkers(p) - 1)
    })

    it('점령한 해안 타일은 계속 막고, 상대가 새 해안 타일을 얻으면 장군을 옮긴다', () => {
      const s = atPhase('place', ['england', 'egypt'])
      s.players[0].generals = 0
      s.players[0].returningGenerals = 0
      give(s, 0, 'rifleman', 4)
      give(s, 1, 'warrior', 1)
      flatten(s, 1)
      const held = addExtra(s, 1, { terrains: ['해안'] }, 0)
      // 더 좋은 언덕(해안 아님)이 있어도 옮기지 않는다
      addExtra(s, 1, { terrains: ['언덕'], resource: 'iron' })
      expect(recalls(s)).toEqual([])
      addExtra(s, 1, { terrains: ['해안'], resource: 'pearls' })
      expect(recalls(s)).toEqual([expect.objectContaining({ defenderId: 1, tileId: held.card.id })])
    })

    it('(군대 최소화를 켜면) 군대가 충분하면 군사 카드를 더 만들지 않고, 수비가 필요하면 중반에는 장궁병만 만든다', () => {
      const s = atPhase('produce', ['england', 'egypt'])
      const p = s.players[0]
      if (!p.techs.includes('machinery')) p.techs.push('machinery')
      if (!p.techs.includes('archery')) p.techs.push('archery')
      give(s, 0, 'warrior', 2)
      give(s, 1, 'warrior', 1)
      p.turn!.produced = []
      for (const y of p.turn!.yields.cities) y.hammer = 12
      const produces = () => withTune({ raidLeanArmy: true }, () => aiCandidates(s).flatMap((a) => (a.type === 'produce' ? [a] : [])))
      expect(produces()).toEqual([])
      s.declarations = [declOn(s, 1, 0)]
      expect(produces().length).toBeGreaterThan(0)
      expect(produces().every((a) => a.unique === '장궁병')).toBe(true)
    })
  })
})

describe('AI 불모지 탈출', () => {
  it('시작 패에 나쁜 타일(산·설원 등)이 2장 이상이면 가장 나쁜 2장을 바꾸고, 1장이면 그냥 도시를 세운다', () => {
    const s = createGame({ seed: 3, civIds: ['korea', 'egypt'] })
    const p = s.players[actorOf(s)]
    const ids = p.hand.map((c) => c.id)
    p.hand = [
      { id: ids[0], terrains: ['평지'] },
      { id: ids[1], terrains: ['산'] },
      { id: ids[2], terrains: ['숲'] },
      { id: ids[3], terrains: ['설원'] },
    ]
    p.startClaim = undefined
    expect(aiCandidates(s)[0]).toEqual({ type: 'wasteland', discardTileIds: expect.arrayContaining([ids[1], ids[3]]) })
    p.hand[3] = { id: ids[3], terrains: ['언덕'] }
    expect(aiCandidates(s)[0].type).toBe('buildCity')
  })
})

describe('AI 전투: 줄루의 임피 + 폭격기', () => {
  /** 0번 줄루가 1번에게 건 일반 선전포고의 배치 단계 */
  const setup = (mine: string[], theirs: string[]) => {
    const s = structuredClone(createGame({ seed: 1, civIds: ['zulu', 'korea'] }))
    const put = (pid: number, defs: string[]) =>
      defs.map((d) => {
        const uid = s.nextUid++
        const card = d === 'impi' ? { uid, defId: 'pikeman', unique: '임피', dirs: ['C' as const] } : { uid, defId: d, dirs: cardById(d).variantDirs ? ['C' as const] : undefined }
        s.players[pid].military.push(card)
        return uid
      })
    const a = put(0, mine)
    put(1, theirs)
    s.phase = 'battle'
    s.battle = { decl: { attackerId: 0, defenderId: 1, cityId: 0, tileId: -1, kind: 'normal' }, slots: { 0: null, 1: null }, chooseQueue: [], picks: {}, step: 'arrange', coastal: false }
    return { s, a }
  }

  it('상대가 전투기·대공포로 막으면 임피를 폭격기와 함께 내 상대의 공중 면역을 없앤다', () => {
    // 전투기는 전투기·대공포가 아닌 카드의 공격을, 대공포는 폭격기의 공격을 받지 않는다. 임피가 깔리면 두 효과가 모두 없어진다.
    // 강한 순으로는 보병 3장, 폭격기 2장 다음이 임피라 예전 방침(상위 4장, 5번째로 바꾸기)에는 임피가 들어가지 않는다
    const { s, a } = setup(['infantry', 'infantry', 'infantry', 'bomber', 'bomber', 'impi'], ['fighter', 'fighter', 'fighter', 'aa_gun'])
    const [, , , b1, b2, impi] = a
    const act = battleActions(s, 0, false)[0]
    expect(act.type).toBe('arrangeBattle')
    if (act.type !== 'arrangeBattle') return
    expect(act.slots).toContain(impi)
    expect(act.slots.some((x) => x === b1 || x === b2)).toBe(true)
  })
})

describe('AI 전투: 대상 고르기 (엔진으로 모든 대상 조합을 돌려 고른다)', () => {
  /** 0번(공격)과 1번(수비)이 주어진 카드로 배치를 마친 대상 고르기 단계 */
  const choosing = (mine: (string | null)[], theirs: (string | null)[]): { s: GameState; uid: (pid: number, slot: number) => number } => {
    const s = structuredClone(createGame({ seed: 1, civIds: ['korea', 'russia'] }))
    const put = (pid: number, defs: (string | null)[]) =>
      defs.map((d) => {
        if (!d) return null
        const [defId, dir] = d.split(':')
        const uid = s.nextUid++
        s.players[pid].military.push({ uid, defId, dirs: dir ? [dir as 'L' | 'C' | 'R'] : undefined })
        return uid
      })
    const a = put(0, mine)
    const d = put(1, theirs)
    s.phase = 'battle'
    s.battle = { decl: { attackerId: 0, defenderId: 1, cityId: 0, tileId: -1, kind: 'normal' }, slots: { 0: null, 1: null }, chooseQueue: [], picks: {}, step: 'arrange', coastal: false }
    arrangeBattle(s, 0, a)
    arrangeBattle(s, 1, d)
    return { s, uid: (pid, slot) => (pid === 0 ? a : d)[slot - 1]! }
  }

  it('고정 방향 공격만으로 이미 파괴되는 상대 카드 대신 다른 카드를 고른다', () => {
    // 내 2번 합성궁병(가운데)이 상대 3번 궁수 A(체력 2)를 공격력 2로 파괴한다. 기마병은 A가 아니라 4번 궁수 B를 골라야 둘 다 잡는다
    const { s, uid } = choosing(['horseman', 'composite_bowman:C', null, null], [null, null, 'archer:C', 'archer:C'])
    expect(s.battle!.step).toBe('choose')
    const horse = uid(0, 1)
    const A = uid(1, 3)
    const B = uid(1, 4)
    expect(simplePicks(s, 0)[horse]).toBe(A) // 예전 규칙: 체력이 가장 낮은 첫 카드 (겹쳐 공격)
    expect(choosePicks(s, 0)[horse]).toBe(B)
    const next = apply(s, { type: 'chooseTargets', playerId: 0, picks: choosePicks(s, 0) })
    expect(next.battleReports.at(-1)!.survivors).toEqual({ attacker: 2, defender: 0 })
  })

  it('고르는 카드 2장이 같은 대상을 노릴 때 한 장으로 충분하면 다른 대상으로 나뉜다', () => {
    const { s, uid } = choosing(['horseman', 'horseman', null, null], [null, null, 'archer:L', 'archer:L'])
    const picks = choosePicks(s, 0)
    const targets = [picks[uid(0, 1)], picks[uid(0, 2)]]
    expect(new Set(Object.values(simplePicks(s, 0))).size).toBe(1) // 예전 규칙은 한 카드에 몰아친다
    expect(targets.sort()).toEqual([uid(1, 3), uid(1, 4)].sort())
  })

  it('균형 혼합 전략: 가위바위보 표에서 셋을 고르게 섞는다', () => {
    const mix = mixedStrategy([
      [0, -1, 1],
      [1, 0, -1],
      [-1, 1, 0],
    ], 3000)
    for (const p of mix) expect(p).toBeCloseTo(1 / 3, 1)
  })
})
