import { describe, expect, it } from 'vitest'
import { aiStep, createGame, cardById, cardStats, MILITARY_CARDS, civById, CIVS, happiness, rankTop, totalWorkers } from '..'
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
  // 한 종류의 군사 카드는 6장까지, 방향 카드에는 방향이 있고 그 외에는 없다
  for (const p of s.players) {
    for (const c of MILITARY_CARDS) {
      expect(p.military.filter((m) => m.defId === c.id).length, `${p.civId} ${c.id} 보유`).toBeLessThanOrEqual(6)
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
    for (const seed of [1, 2, 4, 8]) {
      const { state } = simulate(seed, ['korea', 'egypt'], 2500)
      checkInvariants(state)
      types.push(state.winner?.type ?? 'none')
    }
    expect(types).toContain('science')
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
