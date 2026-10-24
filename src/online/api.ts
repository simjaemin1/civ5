import type { JoinResult, RoomInfo } from './protocol'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error ?? `요청 실패 (${res.status})`)
  return body as T
}

const post = (path: string, name: string) => call<JoinResult>(path, { method: 'POST', body: JSON.stringify({ name }) })

export const createRoom = (name: string) => post('/api/rooms', name)
export const joinRoom = (room: string, name: string) => post(`/api/rooms/${encodeURIComponent(room)}/join`, name)
export const fetchRoom = (room: string) => call<RoomInfo>(`/api/rooms/${encodeURIComponent(room)}`)

/** 재접속용 자격: 같은 브라우저에서 같은 자리로 돌아온다 */
export type Creds = JoinResult

const KEY = 'civ5-online-v1'

export function loadCreds(): Creds | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Creds) : null
  } catch {
    return null
  }
}

export function saveCreds(c: Creds | null): void {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c))
    else localStorage.removeItem(KEY)
  } catch {
    /* 저장할 수 없는 환경이면 무시 */
  }
}
