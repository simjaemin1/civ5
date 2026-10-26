import type { Action, GameView } from '../engine'

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
  | { type: 'undo' }
  | { type: 'closeRoom' }

/** 서버 → 클라이언트 */
export type ServerMsg =
  | { type: 'room'; room: RoomInfo; you: { seat: number; host: boolean } }
  | { type: 'state'; view: GameView; seq: number }
  | { type: 'error'; message: string }
  | { type: 'closed'; reason: string }

/** HTTP: POST /api/rooms {name} → CreateResult, POST /api/rooms/:id/join {name} → JoinResult */
export interface JoinResult {
  room: string
  token: string
  seat: number
}
