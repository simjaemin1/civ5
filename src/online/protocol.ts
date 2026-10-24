import type { Action, GameState, GameView } from '../engine'

/** 방 인원 (docs/online-plan.md 3.4) */
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 5

export type RoomStatus = 'lobby' | 'playing' | 'over'

export interface SeatInfo {
  /** 시작하면 이 번호가 곧 엔진의 player id */
  seat: number
  name: string
  /** 아직 안 골랐으면 null */
  civId: string | null
  ai: boolean
  host: boolean
  /** AI 자리는 항상 true */
  connected: boolean
}

export interface RoomInfo {
  id: string
  status: RoomStatus
  seats: SeatInfo[]
}

/** 클라이언트 → 서버 (WebSocket, JSON) */
export type ClientMsg =
  | { type: 'hello'; room: string; token: string }
  | { type: 'setCiv'; civId: string | null }
  | { type: 'addAI'; civId?: string }
  | { type: 'removeSeat'; seat: number }
  | { type: 'leave' }
  | { type: 'start' }
  | { type: 'action'; action: Action }
  /** 방장 전용: 차례를 넘어 마지막 사람 행동 하나를 되돌린다 */
  | { type: 'undo' }
  /** 자기 차례 안 되돌리기: 이번 차례에 내가 한 마지막 행동 steps개를 되돌린다 */
  | { type: 'undoTurn'; steps: number }
  | { type: 'closeRoom' }

/** 서버 → 클라이언트 */
export type ServerMsg =
  | { type: 'room'; room: RoomInfo; you: { seat: number; host: boolean } }
  | { type: 'state'; view: GameView; seq: number; undo?: UndoInfo }
  | { type: 'error'; message: string }
  | { type: 'closed'; reason: string }

/**
 * 이번 차례에 내가 되돌릴 수 있는 행동들: 각 행동을 하기 직전의 단계 (오래된 것부터).
 * locked: 무작위 결과나 덱의 카드를 보여 준 행동이 있어 그 전으로는 되돌릴 수 없다 (엔진 revealsInfo).
 * 온라인 뷰에는 난수·덱이 없어서 클라이언트가 직접 판정할 수 없으므로 서버가 알려 준다.
 */
export interface UndoInfo {
  phases: GameState['phase'][]
  locked: boolean
}

/** HTTP: POST /api/rooms {name} → CreateResult, POST /api/rooms/:id/join {name} → JoinResult */
export interface JoinResult {
  room: string
  token: string
  seat: number
}
