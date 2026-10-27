import { useEffect, useState } from 'react'
import type { BattleReport, BattleUnitReport, GameState } from '../engine'
import { civById } from '../engine'
import { UnitCard } from './cards/UnitCard'

type Live = { dmg: number; attacking: boolean; hit: number }

/** 한 카드: 그림(또는 카드 얼굴), 남은 체력 막대, 지금 진행 중인 공격 표시 */
function Unit({ u, live, dir, final }: { u: BattleUnitReport | null; live: Live; dir: 'up' | 'down'; final: boolean }) {
  if (!u) return <div className="unit empty">빈칸</div>
  const left = Math.max(0, u.hp - live.dmg)
  const dead = live.dmg >= u.hp
  const taken = u.attackDamage + u.counterDamage
  return (
    <div className={`unit ${dead ? 'dead' : 'alive'}${live.attacking ? ` lunge-${dir}` : ''}${live.hit ? ' hit' : ''}`} key={live.hit}>
      <div className="cardwrap">
        <UnitCard card={u.inst} width={150} zoomable={false} flip={dir === 'down'} />
        {live.hit > 0 && <span className="pop">−{live.hit}</span>}
      </div>
      <div className="hpbar" title={`체력 ${left}/${u.hp}`}>
        {Array.from({ length: u.hp }, (_, i) => (
          <i key={i} className={i < left ? 'on' : ''} />
        ))}
      </div>
      <span className="dmg">
        체력 {left} / {u.hp}
        {final && (
          <small>
            {' '}
            — 받은 대미지 {taken}
            {u.counterDamage > 0 && ` (공격 ${u.attackDamage} + 반격 ${u.counterDamage})`}
          </small>
        )}
      </span>
      <span className="state">{dead ? '💥 파괴' : final ? '✔ 생존' : '\u00a0'}</span>
    </div>
  )
}

/** 공격 기록을 한 번씩 재생하는 단계. 각 단계: 공격한 카드, 맞은 카드, 맞은 대미지, 공격자가 받은 반격 */
interface Step {
  from: { pid: number; slot: number }
  to: { pid: number; slot: number }
  power: number
  counter: number
}
function stepsOf(report: BattleReport): Step[] {
  const hits = [...report.hits].sort((a, b) => a.from.pid - b.from.pid || a.from.slot - b.from.slot)
  const unitOf = (pid: number, slot: number) => report.units.find((u) => u.owner === pid && u.slot === slot)
  const seen = new Map<string, number>()
  const total = new Map<string, number>()
  for (const h of hits) total.set(`${h.from.pid}:${h.from.slot}`, (total.get(`${h.from.pid}:${h.from.slot}`) ?? 0) + 1)
  return hits.map((h) => {
    const key = `${h.from.pid}:${h.from.slot}`
    const idx = (seen.get(key) ?? 0) + 1
    seen.set(key, idx)
    const all = unitOf(h.from.pid, h.from.slot)?.counterDamage ?? 0
    const n = total.get(key)!
    // 반격은 공격 횟수에 나누어 보여 주되 합이 맞도록 누적으로 나눈다
    const counter = Math.floor((all * idx) / n) - Math.floor((all * (idx - 1)) / n)
    return { from: h.from, to: h.to, power: h.power, counter }
  })
}

/** 전투가 끝나면 한 번 띄우는 전투 장면. 확인을 눌러야 다음으로 넘어간다. */
export function BattleReportModal({ game, report, viewerId, onClose }: { game: GameState; report: BattleReport; viewerId?: number; onClose: () => void }) {
  const att = game.players[report.attackerId]
  const def = game.players[report.defenderId]
  const unitAt = (pid: number, slot: number) => report.units.find((u) => u.owner === pid && u.slot === slot) ?? null
  const cols = [1, 2, 3, 4]
  // 보는 사람(나)이 아래쪽, 상대가 위쪽 (상대 카드는 마주 보도록 뒤집힌다)
  const viewer = viewerId === report.attackerId || viewerId === report.defenderId ? viewerId : report.attackerId
  const bottomId = viewer
  const topId = bottomId === report.attackerId ? report.defenderId : report.attackerId
  const roleOf = (pid: number) => (pid === report.attackerId ? '공격' : '수비')
  const winnerName = civById((report.winner === 'attacker' ? att : def).civId).name
  const kind = { normal: '일반 선전포고', retake: '탈환 선전포고', city: '도시 공격' }[report.kind]
  const hits = [...report.hits].sort((a, b) => a.from.pid - b.from.pid || a.from.slot - b.from.slot)
  const steps = stepsOf(report)
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  // step: 0 = 시작, i = i번째 공격까지 재생, steps.length = 끝
  const [step, setStep] = useState(reduce ? steps.length : 0)
  const [run, setRun] = useState(!reduce)
  useEffect(() => {
    if (!run || step >= steps.length) return
    const t = setTimeout(() => setStep((n) => n + 1), step === 0 ? 700 : 1000)
    return () => clearTimeout(t)
  }, [run, step, steps.length])
  const done = step >= steps.length
  const current = step > 0 ? steps[step - 1] : null
  /** 지금까지 쌓인 대미지와 지금 진행 중인 공격 */
  const liveOf = (pid: number, slot: number): Live => {
    let dmg = 0
    for (let i = 0; i < step; i++) {
      const st = steps[i]
      if (st.to.pid === pid && st.to.slot === slot) dmg += st.power
      if (st.from.pid === pid && st.from.slot === slot) dmg += st.counter
    }
    const now = current && !done ? current : null
    const attacking = !!now && now.from.pid === pid && now.from.slot === slot
    const hit = now && now.to.pid === pid && now.to.slot === slot ? now.power : 0
    return { dmg, attacking, hit }
  }
  const skip = () => {
    setRun(false)
    setStep(steps.length)
  }
  const replay = () => {
    setStep(0)
    setRun(true)
  }
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="전투 결과">
      <div className="modal">
        <h2>
          ⚔ 전투 결과 — {civById(att.civId).name}(공격) vs {civById(def.civId).name}(수비)
        </h2>
        <p className="muted">
          {kind} · 목표 타일: {report.terrains.length ? report.terrains.join('·') : '?'}
          {report.coastal ? ' (해안 타일 전투)' : ''} · 라운드 {report.round}
        </p>
          <div className="scene">
            <div className="side-label">
              {civById(game.players[topId].civId).name} ({roleOf(topId)}) {topId !== viewer && '— 상대'}
            </div>
            <div className="scene-row">
              {cols.map((c) => (
                <div key={`t${c}`} className="cell" data-slot={`${topId}:${5 - c}`}>
                  <small>
                    {roleOf(topId)} {5 - c}번
                  </small>
                  <Unit u={unitAt(topId, 5 - c)} live={liveOf(topId, 5 - c)} dir="down" final={done} />
                </div>
              ))}
            </div>
            <div className="scene-row vs">
              {cols.map((c) => (
                <div key={`v${c}`} className="cell arrow-gap">
                  &nbsp;
                </div>
              ))}
            </div>
            <div className="scene-row">
              {cols.map((c) => (
                <div key={`b${c}`} className="cell" data-slot={`${bottomId}:${c}`}>
                  <small>
                    {roleOf(bottomId)} {c}번
                  </small>
                  <Unit u={unitAt(bottomId, c)} live={liveOf(bottomId, c)} dir="up" final={done} />
                </div>
              ))}
            </div>
            <div className="side-label">
              {civById(game.players[bottomId].civId).name} ({roleOf(bottomId)}) — 나
            </div>
          </div>
        <div className="row anim-bar">
          {!done && (
            <span className="muted">
              {current ? `${civById(game.players[current.from.pid].civId).name} ${current.from.slot}번 → ${civById(game.players[current.to.pid].civId).name} ${current.to.slot}번 (대미지 ${current.power}${current.counter ? `, 반격 ${current.counter}` : ''})` : '전투 시작…'}
            </span>
          )}
          {done ? <button onClick={replay}>↻ 다시 보기</button> : <button onClick={skip}>⏭ 건너뛰기</button>}
        </div>
        <details className="hits">
          <summary>공격 기록 ({hits.length}번)</summary>
          {hits.length === 0 && <div className="muted">서로 마주 본 공격이 없었습니다.</div>}
          {hits.map((h, i) => (
            <div key={i}>
              {civById(game.players[h.from.pid].civId).name} {h.from.slot}번 → {civById(game.players[h.to.pid].civId).name} {h.to.slot}번 : 대미지 {h.power}
            </div>
          ))}
        </details>
        <div className="result" style={{ visibility: done ? 'visible' : 'hidden' }}>
          남은 카드 — 공격 {report.survivors.attacker}장 / 수비 {report.survivors.defender}장 (같으면 수비 승)
          <h3>
            🏆 {winnerName} 승 — {report.outcome}
          </h3>
        </div>
        <button className="primary" autoFocus disabled={!done} onClick={onClose}>
          확인
        </button>
      </div>
    </div>
  )
}
