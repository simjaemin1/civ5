import { randomBytes } from 'node:crypto'
import type { Action } from '../src/engine'
import type { ClientMsg, JoinResult, ServerMsg } from '../src/online/protocol'
import { Room, ServerError } from './room'
import type { Store } from './store'

/** 연결 하나. 전송 계층(WebSocket 등)이 구현한다 */
export interface Conn {
  send(msg: ServerMsg): void
  close(): void
}

interface Ctx {
  conn: Conn
  roomId: string | null
  seat: number
  token: string
}

const ID_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const newToken = (): string => randomBytes(16).toString('hex')

/** 방들과 연결들을 묶는다. 네트워크는 모르고 `Conn`만 안다 (테스트에서 가짜 연결을 쓴다) */
export class Hub {
  rooms = new Map<string, Room>()
  private ctxs = new Set<Ctx>()

  private store: Store

  constructor(store: Store) {
    this.store = store
    for (const { meta, log } of store.loadAll()) {
      try {
        this.rooms.set(meta.id, Room.restore(meta, log))
      } catch (e) {
        console.error(`방 ${meta.id} 복원 실패:`, e)
      }
    }
  }

  // ───── HTTP에 해당하는 부분 ─────

  createRoom(name: string): JoinResult {
    let id: string
    do {
      id = Array.from(randomBytes(5), (b) => ID_CHARS[b % ID_CHARS.length]).join('')
    } while (this.rooms.has(id))
    const token = newToken()
    const room = new Room({ id, hostToken: token, status: 'lobby', seed: 0, seats: [] })
    const seat = room.addHuman(name, token)
    this.rooms.set(id, room)
    this.store.saveMeta(room.meta)
    return { room: id, token, seat }
  }

  joinRoom(id: string, name: string): JoinResult {
    const room = this.rooms.get(id.toUpperCase())
    if (!room) throw new ServerError('없는 방입니다')
    const token = newToken()
    const seat = room.addHuman(name, token)
    this.store.saveMeta(room.meta)
    this.broadcast(room)
    return { room: room.id, token, seat }
  }

  /** 방 정보(로비 화면용). 토큰은 보내지 않는다 */
  roomInfo(id: string) {
    const room = this.rooms.get(id.toUpperCase())
    if (!room) throw new ServerError('없는 방입니다')
    return room.info((seat) => this.isConnected(room.id, seat))
  }

  // ───── WebSocket에 해당하는 부분 ─────

  connect(conn: Conn): Ctx {
    const ctx: Ctx = { conn, roomId: null, seat: -1, token: '' }
    this.ctxs.add(ctx)
    return ctx
  }

  disconnect(ctx: Ctx): void {
    this.ctxs.delete(ctx)
    const room = ctx.roomId ? this.rooms.get(ctx.roomId) : undefined
    if (room) this.broadcast(room, false) // 접속 표시만 갱신
  }

  private isConnected(roomId: string, seat: number): boolean {
    for (const c of this.ctxs) if (c.roomId === roomId && c.seat === seat) return true
    return false
  }

  /** 받은 메시지 처리. 오류는 보낸 사람에게만 돌려준다 */
  handle(ctx: Ctx, raw: string): void {
    try {
      const msg = JSON.parse(raw) as ClientMsg
      if (!msg || typeof msg.type !== 'string') throw new ServerError('잘못된 메시지입니다')
      this.dispatch(ctx, msg)
    } catch (e) {
      const message = e instanceof ServerError ? e.message : e instanceof SyntaxError ? '잘못된 메시지입니다' : '서버 오류'
      if (!(e instanceof ServerError) && !(e instanceof SyntaxError)) console.error(e)
      ctx.conn.send({ type: 'error', message })
    }
  }

  private dispatch(ctx: Ctx, msg: ClientMsg): void {
    if (msg.type === 'hello') {
      const room = this.rooms.get(String(msg.room).toUpperCase())
      const seat = room ? room.seatOf(String(msg.token)) : -1
      if (!room || seat < 0) throw new ServerError('방이나 자리를 찾을 수 없습니다 (내보내졌거나 방이 닫혔습니다)')
      ctx.roomId = room.id
      ctx.seat = seat
      ctx.token = msg.token
      this.broadcast(room)
      return
    }
    const room = ctx.roomId ? this.rooms.get(ctx.roomId) : undefined
    if (!room) throw new ServerError('먼저 방에 들어가야 합니다')
    // 로비에서 자리 번호가 바뀔 수 있으니 매번 토큰으로 다시 찾는다
    const seat = room.seatOf(ctx.token)
    if (seat < 0) throw new ServerError('자리를 잃었습니다')
    ctx.seat = seat

    switch (msg.type) {
      case 'setCiv':
        room.setCiv(seat, msg.civId)
        this.persistMeta(room)
        break
      case 'addAI':
        room.addAI(seat, msg.civId)
        this.persistMeta(room)
        break
      case 'removeSeat': {
        const target = room.seats[msg.seat]
        const kicked = [...this.ctxs].filter((c) => c.roomId === room.id && target && !target.ai && c.token === target.token)
        room.removeSeat(seat, msg.seat)
        this.persistMeta(room)
        for (const c of kicked) {
          c.conn.send({ type: 'closed', reason: '방장이 내보냈습니다' })
          c.roomId = null
          c.seat = -1
        }
        break
      }
      case 'leave':
        room.leave(seat)
        this.persistMeta(room)
        ctx.conn.send({ type: 'closed', reason: '방에서 나왔습니다' })
        ctx.roomId = null
        ctx.seat = -1
        break
      case 'start':
        room.start(seat)
        this.persistMeta(room)
        this.store.rewriteLog(room.id, room.log)
        break
      case 'action': {
        const before = room.log.length
        room.act(seat, msg.action as Action)
        this.store.appendLog(room.id, room.log.slice(before))
        this.persistMeta(room)
        break
      }
      case 'undo':
        room.undo(seat)
        this.store.rewriteLog(room.id, room.log)
        this.persistMeta(room)
        break
      case 'closeRoom':
        if (!room.isHost(seat)) throw new ServerError('방장만 할 수 있습니다')
        this.closeRoom(room)
        return
      default:
        throw new ServerError('알 수 없는 메시지입니다')
    }
    this.broadcast(room)
  }

  private persistMeta(room: Room): void {
    this.store.saveMeta(room.meta)
  }

  /** 방을 폭파한다: 모든 접속을 끊고 저장된 기록을 지운다 */
  closeRoom(room: Room): void {
    this.rooms.delete(room.id)
    this.store.remove(room.id)
    for (const c of [...this.ctxs]) {
      if (c.roomId !== room.id) continue
      c.conn.send({ type: 'closed', reason: '방장이 방을 닫았습니다' })
      c.conn.close()
      this.ctxs.delete(c)
    }
  }

  /** 방의 모든 접속에 각자의 뷰를 보낸다. full=false면 방 정보만 */
  private broadcast(room: Room, full = true): void {
    const info = room.info((seat) => this.isConnected(room.id, seat))
    for (const c of this.ctxs) {
      if (c.roomId !== room.id) continue
      const seat = room.seatOf(c.token)
      if (seat < 0) continue
      c.conn.send({ type: 'room', room: info, you: { seat, host: room.isHost(seat) } })
      if (full && room.state) c.conn.send({ type: 'state', view: room.viewFor(seat)!, seq: room.log.length })
    }
  }
}
