import { beforeEach, describe, expect, it, vi } from 'vitest'
import { actorOf, aiStep } from '../../src/engine'
import type { GameView } from '../../src/engine'
import type { ServerMsg } from '../../src/online/protocol'
import { Hub } from '../hub'
import type { Conn } from '../hub'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileStore, MemoryStore } from '../store'
import type { Store } from '../store'

const CIVS = ['egypt', 'korea', 'china', 'japan', 'russia']

// 시드는 Math.random으로 정해진다: 테스트가 판마다 달라지지 않게 고정된 수열을 쓴다
beforeEach(() => {
  let n = 0
  vi.spyOn(Math, 'random').mockImplementation(() => ((++n * 0.6180339887) % 1))
})

class FakeConn implements Conn {
  msgs: ServerMsg[] = []
  closed = false
  send(msg: ServerMsg): void { this.msgs.push(JSON.parse(JSON.stringify(msg))) }
  close(): void { this.closed = true }
  last<T extends ServerMsg['type']>(type: T): Extract<ServerMsg, { type: T }> | undefined {
    return this.msgs.findLast((m) => m.type === type) as Extract<ServerMsg, { type: T }> | undefined
  }
  get error(): string | undefined { return this.last('error')?.message }
}

interface Player { token: string; seat: number; conn: FakeConn; ctx: ReturnType<Hub['connect']> }

function enter(hub: Hub, room: string, token: string, seat: number): Player {
  const conn = new FakeConn()
  const ctx = hub.connect(conn)
  hub.handle(ctx, JSON.stringify({ type: 'hello', room, token }))
  return { token, seat, conn, ctx }
}

const send = (hub: Hub, p: Player, msg: object): string | undefined => {
  const before = p.conn.msgs.length
  hub.handle(p.ctx, JSON.stringify(msg))
  const err = p.conn.msgs.slice(before).find((m) => m.type === 'error')
  return err?.type === 'error' ? err.message : undefined
}

/** 방장 + 사람 n-1명이 들어온 로비 */
function lobby<S extends Store = MemoryStore>(n: number, given?: S) {
  const store = (given ?? new MemoryStore()) as S
  const hub = new Hub(store)
  const created = hub.createRoom('방장')
  const players = [enter(hub, created.room, created.token, created.seat)]
  for (let i = 1; i < n; i++) {
    const j = hub.joinRoom(created.room, `손님${i}`)
    players.push(enter(hub, j.room, j.token, j.seat))
  }
  return { hub, store, id: created.room, players }
}

function startedGame<S extends Store = MemoryStore>(humans: number, ais: number, store?: S) {
  const g = lobby<S>(humans, store)
  g.players.forEach((p, i) => expect(send(g.hub, p, { type: 'setCiv', civId: CIVS[i] })).toBeUndefined())
  for (let i = 0; i < ais; i++) expect(send(g.hub, g.players[0], { type: 'addAI' })).toBeUndefined()
  expect(send(g.hub, g.players[0], { type: 'start' })).toBeUndefined()
  return g
}

/** 지금 입력할 사람의 행동을 (서버 상태를 보는 AI로) 하나 만들어 그 사람 이름으로 보낸다 */
function playOne(g: { hub: Hub; id: string; players: Player[] }): boolean {
  const room = g.hub.rooms.get(g.id)!
  const s = room.state!
  if (s.phase === 'over') return false
  const p = g.players.find((x) => x.seat === actorOf(s))
  if (!p) throw new Error('사람이 입력할 차례가 아닌데 멈춰 있다')
  const err = send(g.hub, p, { type: 'action', action: aiStep(s).action })
  if (err) throw new Error(err)
  return true
}

describe('파일 저장소', () => {
  it('파일에 저장한 방을 새 허브가 같은 상태로 복원하고, 되돌리기·폭파가 파일에도 반영된다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'civ5-rooms-'))
    try {
      const g = startedGame(2, 1, new FileStore(dir))
      for (let i = 0; i < 60; i++) playOne(g)
      const room = g.hub.rooms.get(g.id)!
      const hub2 = new Hub(new FileStore(dir))
      expect(JSON.stringify(hub2.rooms.get(g.id)!.state)).toBe(JSON.stringify(room.state))
      send(g.hub, g.players[0], { type: 'undo' })
      const hub3 = new Hub(new FileStore(dir))
      expect(JSON.stringify(hub3.rooms.get(g.id)!.state)).toBe(JSON.stringify(room.state))
      send(g.hub, g.players[0], { type: 'closeRoom' })
      expect(new Hub(new FileStore(dir)).rooms.size).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})

describe('로비', () => {
  it('방장이 방을 열고 최대 5명까지 들어온다', () => {
    const { hub, id, players } = lobby(5)
    expect(hub.roomInfo(id).seats).toHaveLength(5)
    expect(() => hub.joinRoom(id, '여섯째')).toThrow(/가득/)
    expect(players[0].conn.last('room')!.you).toEqual({ seat: 0, host: true })
    expect(players[3].conn.last('room')!.you).toEqual({ seat: 3, host: false })
  })

  it('방 정보에 토큰이 들어가지 않는다', () => {
    const { hub, id, players } = lobby(2)
    const json = JSON.stringify(hub.roomInfo(id)) + JSON.stringify(players[1].conn.last('room'))
    for (const p of players) expect(json).not.toContain(p.token)
  })

  it('문명은 각자 고르고 겹치면 안 된다', () => {
    const { hub, players } = lobby(3)
    expect(send(hub, players[0], { type: 'setCiv', civId: 'egypt' })).toBeUndefined()
    expect(send(hub, players[1], { type: 'setCiv', civId: 'egypt' })).toMatch(/이미 고른/)
    expect(send(hub, players[1], { type: 'setCiv', civId: 'nope' })).toMatch(/없는 문명/)
    expect(send(hub, players[1], { type: 'setCiv', civId: 'korea' })).toBeUndefined()
    expect(send(hub, players[0], { type: 'setCiv', civId: null })).toBeUndefined()
    expect(send(hub, players[2], { type: 'setCiv', civId: 'egypt' })).toBeUndefined()
  })

  it('방장만 시작·AI 추가·내보내기·되돌리기·폭파를 할 수 있다', () => {
    const { hub, players } = lobby(3)
    for (const msg of [{ type: 'start' }, { type: 'addAI' }, { type: 'removeSeat', seat: 2 }, { type: 'undo' }, { type: 'closeRoom' }]) {
      expect(send(hub, players[1], msg), msg.type).toMatch(/방장/)
    }
  })

  it('2명 미만이면, 문명을 안 골랐으면 시작할 수 없다', () => {
    const solo = lobby(1)
    expect(send(solo.hub, solo.players[0], { type: 'start' })).toMatch(/2~5명/)
    const two = lobby(2)
    send(two.hub, two.players[0], { type: 'setCiv', civId: 'egypt' })
    expect(send(two.hub, two.players[0], { type: 'start' })).toMatch(/고르지 않은/)
  })

  it('AI 자리는 문명을 안 골라도 남은 문명 중에서 정해진다', () => {
    const { hub, id, players } = lobby(1)
    send(hub, players[0], { type: 'setCiv', civId: 'egypt' })
    send(hub, players[0], { type: 'addAI' })
    send(hub, players[0], { type: 'addAI', civId: 'korea' })
    expect(send(hub, players[0], { type: 'start' })).toBeUndefined()
    const civs = hub.rooms.get(id)!.seats.map((s) => s.civId)
    expect(new Set(civs).size).toBe(3)
    expect(civs[2]).toBe('korea')
  })

  it('방장이 사람을 내보내면 그 사람의 토큰은 쓸 수 없다', () => {
    const { hub, id, players } = lobby(3)
    expect(send(hub, players[0], { type: 'removeSeat', seat: 1 })).toBeUndefined()
    expect(players[1].conn.last('closed')).toBeDefined()
    expect(hub.roomInfo(id).seats).toHaveLength(2)
    const again = enter(hub, id, players[1].token, 1)
    expect(again.conn.error).toMatch(/찾을 수 없/)
  })

  it('시작한 뒤에는 새 사람이 못 들어온다', () => {
    const g = startedGame(2, 0)
    expect(() => g.hub.joinRoom(g.id, '늦은 사람')).toThrow(/이미 시작/)
  })
})

describe('진행', () => {
  it('차례가 아닌 사람의 행동은 거절되고 상태가 안 바뀐다', () => {
    const g = startedGame(2, 0)
    const room = g.hub.rooms.get(g.id)!
    const actor = actorOf(room.state!)
    const other = g.players.find((p) => p.seat !== actor)!
    const before = JSON.stringify(room.state)
    expect(send(g.hub, other, { type: 'action', action: aiStep(room.state!).action })).toMatch(/차례가 아닙니다/)
    expect(JSON.stringify(room.state)).toBe(before)
  })

  it('규칙 위반과 엉터리 행동은 보낸 사람에게만 오류로 돌아간다', () => {
    const g = startedGame(2, 0)
    const room = g.hub.rooms.get(g.id)!
    const actor = g.players.find((p) => p.seat === actorOf(room.state!))!
    const before = JSON.stringify(room.state)
    expect(send(g.hub, actor, { type: 'action', action: { type: 'research', techId: 'nope' } })).toBeDefined()
    expect(send(g.hub, actor, { type: 'action', action: { type: 'nonsense' } })).toBeDefined()
    expect(send(g.hub, actor, { type: 'action', action: null })).toBeDefined()
    expect(send(g.hub, actor, { type: 'action' })).toBeDefined()
    expect(JSON.stringify(room.state)).toBe(before)
  })

  it('각자 자기 뷰만 받는다: 남의 손·덱이 없다', () => {
    const g = startedGame(3, 0)
    const room = g.hub.rooms.get(g.id)!
    for (const p of g.players) {
      const v = p.conn.last('state')!.view as GameView
      expect(v.viewer).toBe(p.seat)
      expect(v.deck).toEqual([])
      for (const q of v.players) {
        if (q.id === p.seat) expect(q.hand).toEqual(room.state!.players[q.id].hand)
        else expect(q.hand).toEqual([])
      }
    }
  })

  it('사람 2명 + AI 1명이 한참 진행하고, 서버 재시작 뒤에도 같은 상태로 이어진다', () => {
    const store = new MemoryStore()
    const g = startedGame(2, 1, store)
    for (let i = 0; i < 400 && playOne(g); i++);
    const room = g.hub.rooms.get(g.id)!
    expect(room.log.length).toBeGreaterThan(400)
    expect(room.log.some((e) => e.ai)).toBe(true)

    // 재시작: 같은 저장소로 새 허브
    const hub2 = new Hub(store)
    const restored = hub2.rooms.get(g.id)!
    expect(JSON.stringify(restored.state)).toBe(JSON.stringify(room.state))
    expect(restored.seats.map((s) => s.token)).toEqual(room.seats.map((s) => s.token))
    // 같은 토큰으로 재접속하면 같은 자리로 돌아온다
    const back = enter(hub2, g.id, g.players[1].token, 1)
    expect(back.conn.last('room')!.you.seat).toBe(1)
    expect((back.conn.last('state')!.view as GameView).viewer).toBe(1)
    // 이어서 둘 수 있다
    const g2 = { ...g, hub: hub2, players: [enter(hub2, g.id, g.players[0].token, 0), back] }
    for (let i = 0; i < 20; i++) playOne(g2)
    expect(hub2.rooms.get(g.id)!.log.length).toBeGreaterThan(room.log.length)
  }, 120_000)

  it('접속이 끊겨도 방은 그대로 기다리고, 접속 표시만 바뀐다', () => {
    const g = startedGame(2, 0)
    const [host, guest] = g.players
    expect(host.conn.last('room')!.room.seats[1].connected).toBe(true)
    g.hub.disconnect(guest.ctx)
    expect(host.conn.last('room')!.room.seats[1].connected).toBe(false)
    const before = JSON.stringify(g.hub.rooms.get(g.id)!.state)
    expect(JSON.stringify(g.hub.rooms.get(g.id)!.state)).toBe(before)
    const again = enter(g.hub, g.id, guest.token, 1)
    expect(host.conn.last('room')!.room.seats[1].connected).toBe(true)
    expect(again.conn.last('state')).toBeDefined()
  })

  it('방장만 되돌릴 수 있고, 마지막 사람 행동 하나가 사라진다', () => {
    const g = startedGame(2, 1)
    for (let i = 0; i < 30; i++) playOne(g)
    const room = g.hub.rooms.get(g.id)!
    const snapshot = JSON.stringify(room.state)
    const logLen = room.log.length
    playOne(g)
    expect(JSON.stringify(room.state)).not.toBe(snapshot)
    const guest = g.players[1]
    expect(send(g.hub, guest, { type: 'undo' })).toMatch(/방장/)
    expect(send(g.hub, g.players[0], { type: 'undo' })).toBeUndefined()
    expect(JSON.stringify(room.state)).toBe(snapshot)
    expect(room.log.length).toBe(logLen)
    // 되돌린 뒤에도 저장 기록이 맞다
    expect(new Hub(g.store).rooms.get(g.id)!.log.length).toBe(logLen)
    // 되돌린 걸 다시 둘 수 있다
    playOne(g)
  }, 60_000)

  it('처음으로는 더 되돌릴 수 없다', () => {
    const g = startedGame(2, 0)
    expect(send(g.hub, g.players[0], { type: 'undo' })).toMatch(/되돌릴 행동이 없/)
  })

  it('전투 배치는 playerId가 본인이어야 하고, 낸 배치는 상대 뷰에 안 보인다', () => {
    // 전투가 생길 때까지 AI 3명 + 사람 2명으로 진행
    for (const store of [new MemoryStore(), new MemoryStore(), new MemoryStore()]) {
      const g = startedGame(2, 1, store)
      const room = g.hub.rooms.get(g.id)!
      for (let i = 0; i < 3000; i++) {
        const b = room.state!.battle
        if (b && b.step === 'arrange') {
          const humans = [b.decl.attackerId, b.decl.defenderId].filter((id) => !room.seats[id].ai)
          if (humans.length === 2) {
            const [a, d] = humans.map((id) => g.players.find((p) => p.seat === id)!)
            // 남의 이름으로 낼 수 없다
            expect(send(g.hub, a, { type: 'action', action: { type: 'arrangeBattle', playerId: d.seat, slots: [null, null, null, null] } })).toMatch(/자기 자리/)
            // 먼저 낸 쪽의 배치는 상대 뷰에서 가려진다
            if (!b.slots[a.seat] && !b.slots[d.seat]) {
              const mine = room.state!.players[a.seat].military[0]
              const slots = [mine?.uid ?? null, null, null, null]
              const err = send(g.hub, a, { type: 'action', action: { type: 'arrangeBattle', playerId: a.seat, slots } })
              if (!err) {
                const v = d.conn.last('state')!.view as GameView
                expect(v.battle!.slots[a.seat]).toEqual([-1, -1, -1, -1])
                expect((a.conn.last('state')!.view as GameView).battle!.slots[a.seat]).toEqual(slots)
                return
              }
            }
          }
        }
        if (!playOne(g)) break
      }
    }
    throw new Error('사람끼리의 전투를 만들지 못했다')
  }, 180_000)

  it('방장이 방을 폭파하면 모두 끊기고 기록이 지워진다', () => {
    const g = startedGame(2, 1)
    for (let i = 0; i < 5; i++) playOne(g)
    expect(g.store.metas.has(g.id)).toBe(true)
    expect(send(g.hub, g.players[0], { type: 'closeRoom' })).toBeUndefined()
    for (const p of g.players) {
      expect(p.conn.last('closed')).toBeDefined()
      expect(p.conn.closed).toBe(true)
    }
    expect(g.store.metas.has(g.id)).toBe(false)
    expect(g.store.logs.has(g.id)).toBe(false)
    expect(() => g.hub.roomInfo(g.id)).toThrow(/없는 방/)
    expect(new Hub(g.store).rooms.size).toBe(0)
  })

  it('한 판을 끝까지 진행하면 방이 over가 된다', () => {
    const g = startedGame(2, 1)
    let n = 0
    while (playOne(g)) n++
    expect(n).toBeGreaterThan(100)
    expect(g.hub.rooms.get(g.id)!.status).toBe('over')
    expect(g.players[0].conn.last('room')!.room.status).toBe('over')
    expect(send(g.hub, g.players[0], { type: 'action', action: { type: 'endTurn' } })).toMatch(/진행 중이 아닙니다/)
  }, 300_000)
})
