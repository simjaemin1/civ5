import { describe, expect, it } from 'vitest'
import { HIDDEN_SLOT, actorOf, aiStep, apply, createGame, view } from '..'
import type { GameState, GameView } from '..'

const CIVS = ['egypt', 'korea', 'china', 'japan', 'russia']

/** JSON 안에서 타일 카드(terrains가 있는 객체)의 id를 모두 모은다. */
function tileIds(node: unknown, out: Set<number> = new Set()): Set<number> {
  if (Array.isArray(node)) node.forEach((n) => tileIds(n, out))
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (Array.isArray(o.terrains) && typeof o.id === 'number') out.add(o.id)
    Object.values(o).forEach((n) => tileIds(n, out))
  }
  return out
}

/** `dirs` 키가 나타나는 경로 */
function dirPaths(node: unknown, path = '', out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n, i) => dirPaths(n, `${path}[${i}]`, out))
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'dirs') out.push(path)
      dirPaths(v, `${path}.${k}`, out)
    }
  }
  return out
}

function checkNoLeak(s: GameState, viewer: number): void {
  const v = view(s, viewer)
  // JSON을 거쳐도 같아야 한다 (네트워크로 보내는 모양)
  const json = JSON.parse(JSON.stringify(v)) as GameView
  const shown = tileIds({ ...json, battleReports: [] })
  const hidden = new Set<number>(s.deck.map((t) => t.id))
  for (const p of s.players) {
    if (p.id === viewer) continue
    p.hand.forEach((t) => hidden.add(t.id))
    p.pendingCity?.forEach((t) => hidden.add(t.id))
    if (p.scouted) hidden.add(p.scouted.id)
    if (p.held) hidden.add(p.held.id)
    p.startExtras?.forEach((t) => hidden.add(t.id))
  }
  for (const id of hidden) expect(shown.has(id), `타일 ${id} 유출`).toBe(false)
  expect(json.deck).toEqual([])
  expect(json.rng).toBe(0)
  expect(json.deckCount).toBe(s.deck.length)

  const b = s.battle
  // 공격 방향은 내 카드, 끝난 전투 보고, (대상 선택 단계에서) 공개된 판 위의 카드에만 있다
  const onBoard = new Set<number>()
  if (b && b.step === 'choose') for (const slots of Object.values(b.slots)) slots?.forEach((u) => u !== null && onBoard.add(u))
  for (const path of dirPaths({ ...json, battleReports: [] })) {
    const m = /^\.players\[(\d+)\]\.military\[(\d+)\]$/.exec(path)
    expect(m, `방향 유출 ${path}`).not.toBeNull()
    const [pid, idx] = [Number(m![1]), Number(m![2])]
    if (pid !== viewer) expect(onBoard.has(s.players[pid].military[idx].uid), `방향 유출 ${path}`).toBe(true)
  }

  // 아직 공개 전인 상대 배치
  if (b && b.step === 'arrange') {
    for (const pid of Object.keys(b.slots).map(Number)) {
      const mine = json.battle!.slots[pid]
      if (pid === viewer) expect(mine).toEqual(b.slots[pid])
      else if (b.slots[pid]) expect(mine).toEqual([HIDDEN_SLOT, HIDDEN_SLOT, HIDDEN_SLOT, HIDDEN_SLOT])
      else expect(mine).toBeNull()
    }
  }
  if (b && b.step === 'choose') {
    // 공개된 판 위의 카드는 방향이 보이고, 확정한 선택(picks)도 보인다
    expect(json.battle!.picks).toEqual(b.picks)
  }
  // 내 것은 그대로
  const me = s.players[viewer]
  expect(json.players[viewer].hand).toEqual(me.hand)
  expect(json.players[viewer].pendingCity).toEqual(me.pendingCity)
  expect(json.players[viewer].military).toEqual(me.military)
}

describe('view: 비공개 정보 걸러 보내기', () => {
  it('AI 대국 내내 어느 문명의 뷰에도 상대의 손·방향·덱·미공개 배치가 없다', () => {
    let sawHiddenSlots = false
    let sawDirs = false
    for (const [seed, n] of [[3, 3], [11, 2], [29, 4], [41, 5]] as const) {
      let s = createGame({ seed, civIds: CIVS.slice(0, n) })
      for (let step = 0; step < 1200 && s.phase !== 'over'; step++) {
        if (step % 9 === 0 || s.battle) for (let viewer = 0; viewer < n; viewer++) checkNoLeak(s, viewer)
        if (s.battle?.step === 'arrange' && Object.values(s.battle.slots).filter(Boolean).length === 1) sawHiddenSlots = true
        if (s.players.some((p) => p.military.some((m) => m.dirs))) sawDirs = true
        s = aiStep(s).state
      }
    }
    expect(sawDirs, '방향 카드가 한 번도 안 나왔다').toBe(true)
    expect(sawHiddenSlots, '한쪽만 낸 배치 상태를 못 봤다').toBe(true)
  }, 120_000)

  it('맡아둔 타일을 쓸지 같은 선택(choices)은 본인만 본다', () => {
    const s = createGame({ seed: 7, civIds: CIVS.slice(0, 3) })
    s.players[0].choices = { useHeld: false, cultureCity: 0 }
    expect(view(s, 0).players[0].choices).toEqual({ useHeld: false, cultureCity: 0 })
    expect(view(s, 1).players[0].choices).toBeUndefined()
  })

  it('뷰는 원본 상태를 바꾸지 않는다', () => {
    const s = createGame({ seed: 5, civIds: CIVS.slice(0, 3) })
    const before = JSON.stringify(s)
    view(s, 1)
    expect(JSON.stringify(s)).toBe(before)
  })

  it('첫 차례의 손은 본인만 보고, 남의 손은 장수만 센다', () => {
    const s = createGame({ seed: 7, civIds: CIVS.slice(0, 3) })
    const actor = actorOf(s)
    const other = s.players.find((p) => p.id !== actor)!.id
    expect(view(s, actor).players[actor].hand.length).toBeGreaterThan(0)
    expect(view(s, other).players[actor].hand).toEqual([])
    expect(view(s, other).handCounts[actor]).toBe(s.players[actor].hand.length)
  })

  it('양쪽이 낸 뒤에는 배치와 판 위 카드의 방향이 공개되고, 나머지 카드의 방향은 가려진다', () => {
    // 전투가 처음 생기는 상태까지 AI를 돌린다
    for (const seed of [3, 11, 29, 41, 55, 60, 71]) {
      let s = createGame({ seed, civIds: CIVS.slice(0, 3) })
      for (let step = 0; step < 1500 && s.phase !== 'over'; step++) {
        if (s.battle?.step === 'choose') {
          const { attackerId, defenderId } = s.battle.decl
          const v = view(s, attackerId)
          expect(v.battle!.slots[defenderId]).toEqual(s.battle.slots[defenderId])
          // 판 위의 카드는 방향이 보이고, 판 밖의 카드는 안 보인다
          const onBoard = new Set(s.battle.slots[defenderId])
          for (const m of v.players[defenderId].military) {
            expect(m.dirs === undefined || onBoard.has(m.uid)).toBe(true)
          }
          expect(v.players[defenderId].military.filter((m) => onBoard.has(m.uid))).toEqual(s.players[defenderId].military.filter((m) => onBoard.has(m.uid)))
          return
        }
        s = aiStep(s).state
      }
    }
    throw new Error('대상 선택 단계에 들어간 전투가 없었다')
  })

  it('뷰로 계산한 actorOf는 서버 상태와 같다', () => {
    let s = createGame({ seed: 9, civIds: CIVS.slice(0, 3) })
    for (let step = 0; step < 300 && s.phase !== 'over'; step++) {
      expect(actorOf(view(s, 0))).toBe(actorOf(s))
      s = aiStep(s).state
    }
    expect(apply).toBeTypeOf('function')
  })
})
