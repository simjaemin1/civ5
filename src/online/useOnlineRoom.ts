import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameView } from '../engine'
import type { Creds } from './api'
import type { ClientMsg, RoomInfo, ServerMsg } from './protocol'

export interface OnlineRoom {
  status: 'connecting' | 'open'
  room: RoomInfo | null
  you: { seat: number; host: boolean } | null
  view: GameView | null
  seq: number
  /** 서버가 보낸 오류 (다음 상태를 받으면 지운다) */
  error: string
  send: (msg: ClientMsg) => void
  clearError: () => void
}

const wsUrl = (): string => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

/**
 * 방에 WebSocket으로 붙는다. 방을 잃으면(내보내짐·폭파·없는 방) onClosed를 부르고 더 이상 재접속하지 않는다.
 * 끊기면 자동으로 다시 붙는다 (서버는 무제한 기다린다) */
export function useOnlineRoom(creds: Creds | null, onClosed: (reason: string) => void): OnlineRoom {
  const [status, setStatus] = useState<OnlineRoom['status']>('connecting')
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [you, setYou] = useState<OnlineRoom['you']>(null)
  const [view, setView] = useState<GameView | null>(null)
  const [seq, setSeq] = useState(0)
  const [error, setError] = useState('')
  const wsRef = useRef<WebSocket | null>(null)
  const onClosedRef = useRef(onClosed)
  useEffect(() => {
    onClosedRef.current = onClosed
  })

  useEffect(() => {
    if (!creds) return
    let stopped = false
    let retry = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let gotRoom = false

    const open = () => {
      setStatus('connecting')
      const ws = new WebSocket(wsUrl())
      wsRef.current = ws
      ws.onopen = () => {
        retry = 0
        setStatus('open')
        ws.send(JSON.stringify({ type: 'hello', room: creds.room, token: creds.token } satisfies ClientMsg))
      }
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as ServerMsg
        if (msg.type === 'room') {
          gotRoom = true
          setRoom(msg.room)
          setYou(msg.you)
        } else if (msg.type === 'state') {
          setView(msg.view)
          setSeq(msg.seq)
          setError('')
        } else if (msg.type === 'error') {
          if (!gotRoom) {
            stopped = true // 입장 자체가 거절됨: 자리가 없거나 방이 닫힘
            onClosedRef.current(msg.message)
            ws.close()
          } else setError(msg.message)
        } else if (msg.type === 'closed') {
          stopped = true
          onClosedRef.current(msg.reason)
        }
      }
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null
        if (stopped) return
        setStatus('connecting')
        timer = setTimeout(open, Math.min(500 * 2 ** retry++, 8000))
      }
    }
    open()
    return () => {
      stopped = true
      clearTimeout(timer)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [creds])

  const send = useCallback((msg: ClientMsg) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
    else setError('서버와 연결이 끊겨 있습니다. 다시 연결되면 시도해 주세요.')
  }, [])

  return { status, room, you, view, seq, error, send, clearError: () => setError('') }
}
