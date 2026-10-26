import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { actorOf, aiStep } from '../../src/engine'
import type { GameView } from '../../src/engine'
import type { JoinResult, ServerMsg } from '../../src/online/protocol'
import { lanAddresses, startServer } from '../index'
import type { RunningServer } from '../index'
import { MemoryStore } from '../store'

let running: RunningServer | null = null
afterEach(async () => {
  await running?.close()
  running = null
})

async function post(port: number, path: string, body: object): Promise<{ status: number; json: any }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', body: JSON.stringify(body) })
  return { status: res.status, json: await res.json() }
}

class Client {
  msgs: ServerMsg[] = []
  ws: WebSocket
  ready: Promise<void>
  who: JoinResult
  constructor(port: number, who: JoinResult) {
    this.who = who
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    this.ws.on('message', (d) => this.msgs.push(JSON.parse(d.toString())))
    this.ready = new Promise((res) => this.ws.on('open', () => { this.send({ type: 'hello', room: who.room, token: who.token }); res() }))
  }
  send(msg: object): void { this.ws.send(JSON.stringify(msg)) }
  async waitFor<T extends ServerMsg['type']>(type: T, pred: (m: Extract<ServerMsg, { type: T }>) => boolean = () => true, from = 0): Promise<Extract<ServerMsg, { type: T }>> {
    for (let i = 0; i < 200; i++) {
      const m = this.msgs.slice(from).find((x) => x.type === type && pred(x as never))
      if (m) return m as never
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`${type} 메시지가 오지 않았다`)
  }
}

describe('HTTP + WebSocket', () => {
  it('방 만들기 → 입장 → 문명 선택 → 시작 → 행동 → 재접속', async () => {
    running = await startServer({ port: 0, store: new MemoryStore() })
    const { port, hub } = running
    const host = (await post(port, '/api/rooms', { name: '방장' })).json as JoinResult
    expect((await post(port, '/api/rooms', { name: '' })).status).toBe(400)
    const guest = (await post(port, `/api/rooms/${host.room}/join`, { name: '손님' })).json as JoinResult
    expect((await post(port, '/api/rooms/ZZZZZ/join', { name: 'x' })).status).toBe(400)
    const info = (await (await fetch(`http://127.0.0.1:${port}/api/rooms/${host.room}`)).json()) as { seats: { name: string }[] }
    expect(info.seats.map((s) => s.name)).toEqual(['방장', '손님'])

    const a = new Client(port, host)
    const b = new Client(port, guest)
    await Promise.all([a.ready, b.ready])
    await a.waitFor('room', (m) => m.room.seats.every((s) => s.connected))
    a.send({ type: 'setCiv', civId: 'egypt' })
    b.send({ type: 'setCiv', civId: 'egypt' })
    await b.waitFor('error')
    b.send({ type: 'setCiv', civId: 'korea' })
    await a.waitFor('room', (m) => m.room.seats[1].civId === 'korea')
    a.send({ type: 'start' })
    const sa = await a.waitFor('state')
    const sb = await b.waitFor('state')
    expect(sa.view.viewer).toBe(0)
    expect(sb.view.viewer).toBe(1)
    expect(JSON.stringify(sb)).not.toContain('"rng":1')

    // 차례인 사람이 행동 → 둘 다 새 상태를 받는다
    const room = hub.rooms.get(host.room)!
    const actor = actorOf(room.state!)
    const mover = actor === 0 ? a : b
    const other = actor === 0 ? b : a
    const mark = other.msgs.length
    mover.send({ type: 'action', action: aiStep(room.state!).action })
    const next = await other.waitFor('state', (m) => m.seq === 1, mark)
    expect((next.view as GameView).viewer).toBe(actor === 0 ? 1 : 0)

    // 연결이 끊겼다가 같은 토큰으로 돌아온다
    other.ws.close()
    await mover.waitFor('room', (m) => m.room.seats[other.who.seat].connected === false)
    const back = new Client(port, other.who)
    const st = await back.waitFor('state')
    expect(st.seq).toBe(1)

    // 방장이 폭파
    const [hostClient, guestClient] = back.who.seat === 0 ? [back, mover] : [mover, back]
    hostClient.send({ type: 'closeRoom' })
    await guestClient.waitFor('closed')
    expect(hub.rooms.size).toBe(0)
    mover.ws.close()
    back.ws.close()
  })

  it('잘못된 JSON이나 방에 들어가기 전 메시지는 오류로만 답한다', async () => {
    running = await startServer({ port: 0, store: new MemoryStore() })
    const ws = new WebSocket(`ws://127.0.0.1:${running.port}/ws`)
    const msgs: ServerMsg[] = []
    ws.on('message', (d) => msgs.push(JSON.parse(d.toString())))
    await new Promise((r) => ws.on('open', r))
    ws.send('{not json')
    ws.send(JSON.stringify({ type: 'start' }))
    ws.send(JSON.stringify({ type: 'hello', room: 'NOPE', token: 'x' }))
    for (let i = 0; i < 100 && msgs.length < 3; i++) await new Promise((r) => setTimeout(r, 10))
    expect(msgs.map((m) => m.type)).toEqual(['error', 'error', 'error'])
    ws.close()
  })

  it('초대 주소 후보: 공개 주소(터널·PUBLIC_URL)와 같은 와이파이 주소를 알려 준다', async () => {
    let url: string | null = null
    running = await startServer({ port: 0, store: new MemoryStore(), publicUrl: () => url })
    const get = async () => (await (await fetch(`http://127.0.0.1:${running!.port}/api/info`)).json()) as { publicUrl: string | null; lan: string[] }
    expect(await get()).toMatchObject({ publicUrl: null })
    url = 'https://abc.trycloudflare.com' // 터널 주소는 서버가 켜진 뒤에 생긴다
    const info = await get()
    expect(info.publicUrl).toBe(url)
    expect(Array.isArray(info.lan)).toBe(true)
    expect(info.lan.every((u: string) => !u.includes('127.0.0.1') && u.endsWith(`:${running!.port}`))).toBe(true)
  })

  it('같은 와이파이 주소는 실제 어댑터를 먼저, 가상 어댑터(WSL 등)를 뒤에 둔다', () => {
    const a = (address: string, internal = false) => ({ address, family: 'IPv4', internal, netmask: '', mac: '', cidr: null }) as never
    const list = lanAddresses(8787, {
      'vEthernet (WSL)': [a('172.22.80.1')],
      'Wi-Fi': [a('192.168.0.12')],
      'Loopback Pseudo-Interface 1': [a('127.0.0.1', true)],
      이더넷: [a('10.0.0.5')],
    })
    expect(list).toEqual(['http://192.168.0.12:8787', 'http://10.0.0.5:8787', 'http://172.22.80.1:8787'])
  })
})
