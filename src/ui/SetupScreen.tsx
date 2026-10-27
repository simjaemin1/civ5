import { useState } from 'react'
import { CIVS } from '../engine'
import { CivCard } from './cards/CivCard'

export interface Seat {
  civId: string
  ai: boolean
}

interface Props {
  onStart: (seats: Seat[], seed: number) => void
  onResume?: () => void
  onOnline?: () => void
  /** 모의 전투 랩 */
  onLab?: () => void
}

/** 시작 화면: 문명과 사람/AI를 고른다 (2~6명) */
export function SetupScreen({ onStart, onResume, onOnline, onLab }: Props) {
  const [seats, setSeats] = useState<Seat[]>([
    { civId: 'korea', ai: false },
    { civId: 'russia', ai: true },
  ])
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000))
  const taken = new Set(seats.map((s) => s.civId))

  return (
    <div className="setup">
      <h1>문명 보드게임 프로토타입</h1>
      <p className="muted">규칙 검증용 핫시트. 사람 자리는 돌려가며 플레이하고, AI 자리는 자동으로 진행합니다.</p>
      {onResume && (
        <p>
          <button onClick={onResume}>이어하기 (자동 저장된 게임)</button>
        </p>
      )}
      {onOnline && (
        <p>
          <button onClick={onOnline}>🌐 온라인으로 하기 (방 만들기 / 입장)</button>
        </p>
      )}
      {onLab && (
        <p>
          <button onClick={onLab}>⚔ 모의 전투 랩 (카드를 골라 전투만 해 보기)</button>
        </p>
      )}
      <div className="scroll">
      <table className="table">
        <tbody>
          {seats.map((s, i) => (
            <tr key={i}>
              <td>{i + 1}번 자리</td>
              <td>
                <CivCard civId={s.civId} width={230} />
              </td>
              <td>
                <select
                  value={s.civId}
                  onChange={(e) => setSeats(seats.map((x, j) => (j === i ? { ...x, civId: e.target.value } : x)))}
                >
                  {CIVS.map((c) => (
                    <option key={c.id} value={c.id} disabled={taken.has(c.id) && c.id !== s.civId}>
                      {c.name} (우선도 {c.priority}, 행복 {c.happiness}) — {c.ability}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <label>
                  <input type="checkbox" checked={s.ai} onChange={(e) => setSeats(seats.map((x, j) => (j === i ? { ...x, ai: e.target.checked } : x)))} /> AI
                </label>
              </td>
              <td>
                {seats.length > 2 && <button onClick={() => setSeats(seats.filter((_, j) => j !== i))}>삭제</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div className="row">
        {seats.length < 6 && (
          <button
            onClick={() => {
              const free = CIVS.find((c) => !taken.has(c.id))
              if (free) setSeats([...seats, { civId: free.id, ai: true }])
            }}
          >
            + 자리 추가
          </button>
        )}
        <label>
          시드 <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} style={{ width: 90 }} />
        </label>
        <button className="primary" onClick={() => onStart(seats, seed)}>
          게임 시작
        </button>
      </div>
    </div>
  )
}
