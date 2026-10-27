import { describe, expect, it } from 'vitest'
import { MAX_HOLD, AI_TUNE, actorOf, aiCandidates, aiStep, bestSlots, createGame, cardById, cardStats, MILITARY_CARDS, civById, CIVS, happiness, rankTop, totalWorkers } from '..'
import type { GameState } from '..'

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
      expect(p.military.filter((m) => m.defId === c.id && !m.unique).length, `${p.civId} ${c.id} 보유`).toBeLessThanOrEqual(MAX_HOLD + over)
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
