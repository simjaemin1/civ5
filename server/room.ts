import { CIVS, RuleError, actorOf, aiStep, apply, createGame, revealsInfo, turnKey, view } from '../src/engine'
import type { Action, GameState, GameView } from '../src/engine'
import { MAX_PLAYERS, MIN_PLAYERS } from '../src/online/protocol'
import type { RoomInfo, RoomStatus, SeatInfo, UndoInfo } from '../src/online/protocol'

/** 사용자에게 그대로 보여 줄 수 있는 오류 */
export class ServerError extends Error {}

export interface Seat {
  token: string
  name: string
  civId: string | null
  ai: boolean
}

/** 행동 기록: 같은 시드로 처음부터 다시 apply하면 상태가 복원된다 */
export interface LogEntry {
  seat: number
  ai: boolean
  action: Action
  /** 사람 행동만: 행동 직전의 차례 열쇠·단계, 무작위 결과나 덱의 카드를 보여 줬는지 (차례 안 되돌리기용) */
  turn?: string | null
  phase?: GameState['phase']
  reveal?: boolean
}

export interface RoomMeta {
  id: string
  hostToken: string
  status: RoomStatus
  seed: number
  seats: Seat[]
  /** 무승부로 끝나는 라운드 (시험용). 없으면 사람이 하는 게임이므로 끝없이 계속 */
  roundLimit?: number
}

/** AI가 한 번에 너무 오래 돌지 않게 하는 안전장치 */
const MAX_AI_STEPS = 20000

export class Room {
  state: GameState | null = null
  log: LogEntry[] = []

  meta: RoomMeta

  constructor(meta: RoomMeta) {
    this.meta = meta
  }

  get id(): string { return this.meta.id }
  get status(): RoomStatus { return this.meta.status }
  get seats(): Seat[] { return this.meta.seats }

  /** 저장된 메타와 기록으로 방을 복원한다 */
  static restore(meta: RoomMeta, log: LogEntry[]): Room {
    const room = new Room(meta)
    if (meta.status !== 'lobby') room.replay(log)
    return room
  }

  seatOf(token: string): number {
    return this.seats.findIndex((s) => !s.ai && s.token === token)
  }

  isHost(seat: number): boolean {
    return seat >= 0 && this.seats[seat]?.token === this.meta.hostToken
  }

  info(connected: (seat: number) => boolean): RoomInfo {
    const seats: SeatInfo[] = this.seats.map((s, seat) => ({
      seat,
      name: s.name,
      civId: s.civId,
      ai: s.ai,
      host: s.token === this.meta.hostToken,
      connected: s.ai || connected(seat),
    }))
    return { id: this.id, status: this.status, seats }
  }

  viewFor(seat: number): GameView | null {
    return this.state ? view(this.state, seat) : null
  }

  // ───── 로비 ─────

  private requireLobby(): void {
    if (this.status !== 'lobby') throw new ServerError('이미 시작한 방입니다')
  }

  private requireHost(seat: number): void {
    if (!this.isHost(seat)) throw new ServerError('방장만 할 수 있습니다')
  }

  addHuman(name: string, token: string): number {
    this.requireLobby()
    if (this.seats.length >= MAX_PLAYERS) throw new ServerError(`방이 가득 찼습니다 (최대 ${MAX_PLAYERS}명)`)
    this.seats.push({ token, name: cleanName(name), civId: null, ai: false })
    return this.seats.length - 1
  }

  setCiv(seat: number, civId: string | null): void {
    this.requireLobby()
    this.assignCiv(seat, civId)
  }

  private assignCiv(seat: number, civId: string | null): void {
    if (civId !== null) {
      if (!CIVS.some((c) => c.id === civId)) throw new ServerError('없는 문명입니다')
      if (this.seats.some((s, i) => i !== seat && s.civId === civId)) throw new ServerError('다른 사람이 이미 고른 문명입니다')
    }
    this.seats[seat].civId = civId
  }

  addAI(seat: number, civId?: string): void {
    this.requireLobby()
    this.requireHost(seat)
    if (this.seats.length >= MAX_PLAYERS) throw new ServerError(`방이 가득 찼습니다 (최대 ${MAX_PLAYERS}명)`)
    this.seats.push({ token: '', name: `AI ${this.seats.filter((s) => s.ai).length + 1}`, civId: null, ai: true })
    try {
      if (civId) this.assignCiv(this.seats.length - 1, civId)
    } catch (e) {
      this.seats.pop()
      throw e
    }
  }

  /** 방장이 자리를 비운다 (사람이면 내보내기, AI면 제거). 방장 자신은 제거할 수 없다 */
  removeSeat(by: number, seat: number): void {
    this.requireLobby()
    this.requireHost(by)
    if (!this.seats[seat]) throw new ServerError('없는 자리입니다')
    if (seat === by) throw new ServerError('방장은 자리를 비울 수 없습니다 (방을 닫으세요)')
    this.seats.splice(seat, 1)
  }

  /** 방장이 아닌 사람이 로비에서 나간다 */
  leave(seat: number): void {
    this.requireLobby()
    if (this.isHost(seat)) throw new ServerError('방장은 나갈 수 없습니다 (방을 닫으세요)')
    this.seats.splice(seat, 1)
  }

  start(by: number): void {
    this.requireLobby()
    this.requireHost(by)
    const n = this.seats.length
    if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new ServerError(`${MIN_PLAYERS}~${MAX_PLAYERS}명이어야 시작할 수 있습니다`)
    const pending = this.seats.filter((s) => !s.ai && !s.civId)
    if (pending.length > 0) throw new ServerError(`문명을 아직 고르지 않은 사람이 있습니다: ${pending.map((s) => s.name).join(', ')}`)
    this.meta.seed = Math.floor(Math.random() * 2 ** 32) >>> 0
    // 고르지 않은 AI 자리는 남은 문명 중에서 시드로 정한다
    const free = CIVS.map((c) => c.id).filter((id) => !this.seats.some((s) => s.civId === id))
    let r = this.meta.seed
    for (const s of this.seats) {
      if (s.civId) continue
      r = (Math.imul(r, 1664525) + 1013904223) >>> 0
      s.civId = free.splice(r % free.length, 1)[0]
    }
    this.meta.status = 'playing'
    this.log = []
    this.state = createGame({ seed: this.meta.seed, civIds: this.seats.map((s) => s.civId!), roundLimit: this.meta.roundLimit ?? null })
    this.runAI()
    this.refreshStatus()
  }

  // ───── 게임 ─────

  /** 사람 한 명의 행동. 규칙 위반은 ServerError로 돌려주고 상태는 그대로 둔다 */
  act(seat: number, action: Action): void {
    const s = this.state
    if (this.status !== 'playing' || !s) throw new ServerError('게임이 진행 중이 아닙니다')
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw new ServerError('잘못된 행동입니다')
    if (action.type === 'arrangeBattle' || action.type === 'chooseTargets') {
      // 전투 배치·대상 선택은 playerId를 직접 받는다: 본인 이름으로만 낼 수 있다
      if (action.playerId !== seat) throw new ServerError('자기 자리만 낼 수 있습니다')
    } else if (actorOf(s) !== seat) {
      throw new ServerError('지금은 당신이 입력할 차례가 아닙니다')
    }
    let next: GameState
    try {
      next = apply(s, action)
    } catch (e) {
      if (e instanceof RuleError) throw new ServerError(e.message)
      throw new ServerError('처리할 수 없는 행동입니다')
    }
    if (!next || typeof next !== 'object') throw new ServerError('알 수 없는 행동입니다')
    this.state = next
    this.log.push({ seat, ai: false, action, turn: turnKey(s), phase: s.phase, reveal: revealsInfo(s, next) })
    this.runAI()
    this.refreshStatus()
  }

  /** 지금 입력할 차례가 AI 자리면 AI가 대신 둔다 (사람 자리에서는 무제한 기다린다) */
  private runAI(): void {
    for (let i = 0; i < MAX_AI_STEPS; i++) {
      const s = this.state!
      if (s.phase === 'over') return
      const actor = actorOf(s)
      if (!this.seats[actor]?.ai) return
      const { state, action } = aiStep(s)
      this.state = state
      this.log.push({ seat: actor, ai: true, action })
    }
    throw new Error('AI가 끝나지 않습니다')
  }

  private refreshStatus(): void {
    this.meta.status = this.state?.phase === 'over' ? 'over' : 'playing'
  }

  /**
   * 자기 차례 안에서 되돌릴 수 있는 행동들 (docs/online-plan.md 3.4).
   * 지금 이 자리가 입력할 차례이고, 기록 끝에서부터 같은 차례에 이 자리가 한 행동만 센다.
   * 무작위 결과나 덱의 카드를 보여 준 행동을 만나면 거기서 멈춘다 (그 행동과 그 전은 되돌릴 수 없다).
   */
  undoInfo(seat: number): UndoInfo {
    const out: UndoInfo = { phases: [], locked: false }
    const s = this.state
    if (!s || this.status !== 'playing') return out
    const key = turnKey(s)
    if (!key || actorOf(s) !== seat) return out
    for (let i = this.log.length - 1; i >= 0; i--) {
      const e = this.log[i]
      if (e.ai || e.seat !== seat || e.turn !== key) break
      if (e.reveal) {
        out.locked = true
        break
      }
      out.phases.unshift(e.phase!)
    }
    return out
  }

  /** 자기 차례 안 되돌리기: 이번 차례에 내가 한 마지막 행동 steps개를 되돌린다 (누구나, 자기 것만) */
  undoTurn(seat: number, steps: number): void {
    const info = this.undoInfo(seat)
    if (!Number.isInteger(steps) || steps < 1) throw new ServerError('잘못된 되돌리기입니다')
    if (steps > info.phases.length) {
      throw new ServerError(info.locked ? '무작위 결과(카드 방향·뽑은 타일)를 본 뒤라 그 전으로는 되돌릴 수 없습니다' : '이번 차례에 되돌릴 수 있는 내 행동이 없습니다')
    }
    this.replay(this.log.slice(0, this.log.length - steps))
    this.refreshStatus()
  }

  /** 방장 전용: 차례를 넘어 마지막 사람 행동 하나(와 그 뒤에 AI가 둔 것)를 되돌린다 */
  undo(by: number): void {
    this.requireHost(by)
    if (this.status === 'lobby') throw new ServerError('아직 시작하지 않았습니다')
    let i = this.log.length - 1
    while (i >= 0 && this.log[i].ai) i--
    if (i < 0) throw new ServerError('되돌릴 행동이 없습니다')
    this.replay(this.log.slice(0, i))
    this.refreshStatus()
  }

  private replay(log: LogEntry[]): void {
    let s = createGame({ seed: this.meta.seed, civIds: this.seats.map((x) => x.civId!), roundLimit: this.meta.roundLimit ?? null })
    for (const e of log) s = apply(s, e.action)
    this.state = s
    this.log = log.slice()
  }
}

function cleanName(name: unknown): string {
  const n = typeof name === 'string' ? name.trim().slice(0, 20) : ''
  if (!n) throw new ServerError('이름을 입력하세요')
  return n
}
