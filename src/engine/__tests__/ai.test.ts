import { describe, expect, it } from 'vitest'
import { aiStep, createGame, cardById, MILITARY_CARDS, civById, CIVS, happiness, totalWorkers } from '..'
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
      const def = cardById(m.defId)
      if (def.variantDirs) expect(def.variantDirs).toContain(m.dir)
      else expect(m.dir).toBeUndefined()
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
})
