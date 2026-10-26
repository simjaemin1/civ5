import { useState } from 'react'
import { createRoom, joinRoom, loadCreds, saveCreds } from './api'
import type { Creds } from './api'
import { Lobby } from './Lobby'
import { OnlineGameScreen } from './OnlineGameScreen'
import { useOnlineRoom } from './useOnlineRoom'

const NAME_KEY = 'civ5-online-name'
const getName = (): string => {
  try { return localStorage.getItem(NAME_KEY) ?? '' } catch { return '' }
}

/** 온라인 모드 진입점: 방 만들기 / 방 번호로 입장 → 로비 → 게임 */
export function OnlineApp({ initialRoom, onBack }: { initialRoom: string; onBack: () => void }) {
  const [creds, setCreds] = useState<Creds | null>(() => loadCreds())
  const [active, setActive] = useState(() => {
    const c = loadCreds()
    return !!c && (!initialRoom || c.room === initialRoom.toUpperCase())
  })
  const [name, setName] = useState(getName)
  const [code, setCode] = useState(initialRoom)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // 방을 잃으면 자격을 지우고 첫 화면으로 돌아간다
  const online = useOnlineRoom(active ? creds : null, (reason) => {
    saveCreds(null)
    setCreds(null)
    setActive(false)
    setError(reason)
  })

  const enter = async (fn: () => Promise<Creds>) => {
    if (!name.trim()) return setError('이름을 입력하세요')
    setBusy(true)
    setError('')
    try {
      localStorage.setItem(NAME_KEY, name.trim())
    } catch { /* 무시 */ }
    try {
      const c = await fn()
      saveCreds(c)
      setCreds(c)
      setActive(true)
      history.replaceState(null, '', `/?room=${c.room}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (active && creds) {
    if (online.room?.status === 'lobby' || !online.view) {
      return <Lobby online={online} onLeave={() => setActive(false)} />
    }
    return <OnlineGameScreen online={online} onExit={() => setActive(false)} />
  }

  return (
    <div className="setup">
      <h1>온라인 대전</h1>
      <p className="muted">방장이 방을 열고 친구가 주소로 들어옵니다. 2~5명, 시간 제한 없음, 끊겨도 같은 브라우저로 다시 들어오면 그 자리로 돌아옵니다.</p>
      {error && <div className="error banner-error" data-testid="landing-error">⚠ {error}</div>}
      <div className="row">
        <label>
          이름 <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="닉네임" />
        </label>
      </div>
      {creds && (
        <p>
          <button onClick={() => setActive(true)}>저장된 자리로 돌아가기 (방 {creds.room})</button>
        </p>
      )}
      <div className="row">
        <button className="primary" disabled={busy} onClick={() => enter(() => createRoom(name.trim()))}>
          방 만들기 (내가 방장)
        </button>
      </div>
      <div className="row">
        <label>
          방 번호 <input value={code} maxLength={8} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="예: K7M2P" />
        </label>
        <button disabled={busy || !code} onClick={() => enter(() => joinRoom(code.trim(), name.trim()))}>
          입장
        </button>
      </div>
      <p>
        <button onClick={onBack}>← 핫시트(한 화면) 모드로</button>
      </p>
    </div>
  )
}
