import { useState } from 'react'
import { CIVS } from '../engine'
import { CivCard } from '../ui/cards/CivCard'
import type { OnlineRoom } from './useOnlineRoom'
import { MAX_PLAYERS, MIN_PLAYERS } from './protocol'

interface Props {
  online: OnlineRoom
  onLeave: () => void
}

/** 로비: 자리마다 문명을 고르고(각자, 겹치기 불가), 방장이 AI를 넣고 시작한다 */
export function Lobby({ online, onLeave }: Props) {
  const { room, you, send } = online
  const [aiCiv, setAiCiv] = useState('')
  if (!room || !you) return <p className="muted">방에 들어가는 중…</p>
  const taken = new Set(room.seats.map((s) => s.civId).filter(Boolean))
  const invite = `${location.origin}/?room=${room.id}`
  const unpicked = room.seats.filter((s) => !s.ai && !s.civId)
  const canStart = room.seats.length >= MIN_PLAYERS && unpicked.length === 0

  const civSelect = (value: string | null, onChange: (id: string | null) => void, disabled: boolean, blank = '(문명 선택)') => (
    <select value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{blank}</option>
      {CIVS.map((c) => (
        <option key={c.id} value={c.id} disabled={taken.has(c.id) && c.id !== value}>
          {c.name} (우선도 {c.priority}, 행복 {c.happiness}) — {c.ability}
        </option>
      ))}
    </select>
  )

  return (
    <div className="setup">
      <h1>방 {room.id}</h1>
      <p className="muted">
        친구에게 이 주소를 보내세요: <code data-testid="invite">{invite}</code>{' '}
        <button onClick={() => navigator.clipboard?.writeText(invite).catch(() => {})}>복사</button>
      </p>
      {online.error && <div className="error banner-error">⚠ {online.error}</div>}
      <div className="scroll">
        <table className="table">
          <tbody>
            {room.seats.map((s) => {
              const mine = s.seat === you.seat
              return (
                <tr key={s.seat}>
                  <td>
                    {s.seat + 1}번 {s.ai ? '🤖' : '👤'} {s.name}
                    {s.host && ' (방장)'}
                    {mine && ' ← 나'}
                  </td>
                  <td>
                    {mine && civSelect(s.civId, (id) => send({ type: 'setCiv', civId: id }), false)}
                    {s.civId ? <CivCard civId={s.civId} width={230} /> : !mine && <span className="muted">{s.ai ? '(시작할 때 정해짐)' : '(아직 안 골랐음)'}</span>}
                  </td>
                  <td>{s.ai ? '' : s.connected ? '🟢 접속 중' : '⚪ 끊김'}</td>
                  <td>{you.host && !mine && <button onClick={() => send({ type: 'removeSeat', seat: s.seat })}>{s.ai ? '삭제' : '내보내기'}</button>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="row">
        {you.host && room.seats.length < MAX_PLAYERS && (
          <>
            {civSelect(aiCiv || null, (id) => setAiCiv(id ?? ''), false, '(AI 문명: 무작위)')}
            <button onClick={() => { send(aiCiv ? { type: 'addAI', civId: aiCiv } : { type: 'addAI' }); setAiCiv('') }}>+ AI 자리 추가</button>
          </>
        )}
        {you.host ? (
          <>
            <button className="primary" disabled={!canStart} onClick={() => send({ type: 'start' })}>
              게임 시작
            </button>
            <button onClick={() => confirm('방을 닫을까요? 모두 쫓겨납니다.') && send({ type: 'closeRoom' })}>방 닫기</button>
          </>
        ) : (
          <button onClick={() => send({ type: 'leave' })}>방에서 나가기</button>
        )}
        <button onClick={onLeave}>첫 화면으로 (자리는 유지)</button>
      </div>
      <p className="muted">
        {room.seats.length}/{MAX_PLAYERS}명 (최소 {MIN_PLAYERS}명).{' '}
        {unpicked.length > 0 ? `문명을 아직 안 고른 사람: ${unpicked.map((s) => s.name).join(', ')}. ` : ''}
        {you.host ? 'AI 자리는 문명을 안 고르면 남은 문명 중에서 정해집니다.' : '방장이 시작하기를 기다리세요.'}
      </p>
    </div>
  )
}
