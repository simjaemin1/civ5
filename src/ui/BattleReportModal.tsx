import { useEffect, useRef, useState } from 'react'
import type { BattleReport, BattleUnitReport, GameState } from '../engine'
import { civById } from '../engine'
import { UnitCard } from './cards/UnitCard'
import { playSound } from './sounds'
import { usePrefs } from './prefsStore'

/** 맨 위 제목의 공격 측 이름: 일반 선전포고는 침략, 탈환 선전포고는 탈환, 도시 공격은 공격 */
const ATTACK_TITLE = { normal: '침략', retake: '탈환', city: '공격' } as const

type Live = { dmg: number; attacking: boolean; hit: number }

/** 한 카드: 그림(또는 카드 얼굴), 남은 체력 막대, 지금 진행 중인 공격 표시 */
function Unit({ u, live, dir, final }: { u: BattleUnitReport | null; live: Live; dir: 'up' | 'down'; final: boolean }) {
  // 빈칸도 군사 카드와 같은 크기의 칸으로 그린다 (카드가 있는 칸과 높이가 같도록 아래 줄도 비워 둔다)
  if (!u)
    return (
      <div className="unit empty">
        <div className="cardwrap">
          <div className="empty-card" style={{ width: 150 }}>
            빈칸
          </div>
        </div>
        <div className="hpbar" aria-hidden="true" />
        <span className="dmg">{'\u00a0'}</span>
        <span className="state">{'\u00a0'}</span>
      </div>
    )
  const left = Math.max(0, u.hp - live.dmg)
  // 모든 카드는 동시에 공격하므로 파괴는 재생이 끝난 뒤에 한꺼번에 보여 준다 (그 전에는 치명상 표시만).
  // 끝난 뒤의 파괴 여부는 엔진 판정(destroyed)을 따른다: 예니체리처럼 체력 0이어도 살아남는 효과가 있다.
  const dead = final && u.destroyed
  const doomed = !final && live.dmg >= u.hp
  const taken = u.attackDamage + u.counterDamage
  return (
    // 카드 위에는 아무것도 겹치지 않는다 (사용자 결정): 공격·피격은 칸 테두리 색으로, 공격 선과 대미지는 두 줄 사이 빈 곳에 그린다
    <div className={`unit ${dead ? 'dead' : 'alive'}${doomed ? ' doomed' : ''}${live.attacking ? ' attacking' : ''}${live.hit ? ' hit' : ''}`} key={live.hit}>
      <div className="cardwrap">
        <UnitCard card={u.inst} width={150} zoomable={false} flip={dir === 'down'} />
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
      <span className="state">{dead ? '💥 파괴' : final ? '✔ 생존' : doomed ? '⚠ 치명상 (전투 끝에 파괴)' : '\u00a0'}</span>
    </div>
  )
}

/** 두 줄(위·아래 진영) 사이 빈 곳에 지금 공격을 긴 화살표로 그리고, 대미지·반격은 화살표 가운데에 적는다 */
function AttackLine({ step, topId }: { step: Step | null; topId: number }) {
  // 위 줄은 왼쪽부터 4·3·2·1번, 아래 줄은 1·2·3·4번
  const colOf = (p: { pid: number; slot: number }) => (p.pid === topId ? 5 - p.slot : p.slot)
  if (!step) return <div className="attack-gap" aria-hidden="true" />
  const x1 = (colOf(step.from) - 0.5) * 100
  const x2 = (colOf(step.to) - 0.5) * 100
  const down = step.from.pid === topId
  const [y1, y2] = down ? [2, 46] : [46, 2]
  return (
    <div className="attack-gap" aria-hidden="true">
      <svg viewBox="0 0 400 48" preserveAspectRatio="none">
        <line x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className={`attack-head ${down ? 'down' : 'up'}`} style={{ left: `${x2 / 4}%` }}>
        {down ? '▼' : '▲'}
      </span>
      <span className="attack-dmg" style={{ left: `${(x1 + x2) / 8}%` }}>
        −{step.power}
        {step.counter ? ` · 반격 −${step.counter}` : ''}
      </span>
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
  // 양쪽 공격이 고루 보이도록 공격 측·수비 측 카드를 번갈아 재생한다 (같은 카드의 여러 공격은 붙여서)
  const bySide = (pid: number) => [...report.hits].filter((h) => h.from.pid === pid).sort((a, b) => a.from.slot - b.from.slot)
  const cardsOf = (pid: number) => {
    const out: (typeof report.hits)[] = []
    for (const h of bySide(pid)) {
      const last = out[out.length - 1]
      if (last && last[0].from.slot === h.from.slot) last.push(h)
      else out.push([h])
    }
    return out
  }
  const a = cardsOf(report.attackerId)
  const d = cardsOf(report.defenderId)
  const hits: typeof report.hits = []
  for (let i = 0; i < Math.max(a.length, d.length); i++) hits.push(...(a[i] ?? []), ...(d[i] ?? []))
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
/**
 * lossSound: 내 전투일 때만 true. 재생이 끝났을 때 아래쪽(내) 카드가 파괴되었으면 파괴 효과음을 낸다 (관전 중에는 소리 없음).
 */
export function BattleReportModal({ game, report, viewerId, onClose, lossSound = false }: { game: GameState; report: BattleReport; viewerId?: number; onClose: () => void; lossSound?: boolean }) {
  const att = game.players[report.attackerId]
  const def = game.players[report.defenderId]
  const unitAt = (pid: number, slot: number) => report.units.find((u) => u.owner === pid && u.slot === slot) ?? null
  const cols = [1, 2, 3, 4]
  // 내 전투면 내가 아래쪽, 상대가 위쪽 (상대 카드는 마주 보도록 뒤집힌다).
  // 남의 전투를 관전하면 공격자가 위, 수비자가 아래 (사용자 결정)
  const viewer = viewerId === report.attackerId || viewerId === report.defenderId ? viewerId : report.defenderId
  const bottomId = viewer
  const topId = bottomId === report.attackerId ? report.defenderId : report.attackerId
  const roleOf = (pid: number) => (pid === report.attackerId ? '공격' : '수비')
  const winnerName = civById((report.winner === 'attacker' ? att : def).civId).name
  const kind = { normal: '일반 선전포고', retake: '탈환 선전포고', city: '도시 공격' }[report.kind]
  const hits = [...report.hits].sort((a, b) => a.from.pid - b.from.pid || a.from.slot - b.from.slot)
  const steps = stepsOf(report)
  // step: 0 = 시작, i = i번째 공격까지 재생, steps.length = 끝.
  // 운영체제의 "애니메이션 효과 끄기(움직임 줄이기)"와 상관없이 항상 재생한다 (사용자 결정). 보기 싫으면 건너뛰기를 누른다.
  // 휴대폰(세로 화면)에서는 재생하지 않고 끝난 모습을 바로 한 화면에 작게 보여 준다 (사용자 결정)
  const [compact] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 760px)').matches)
  const [step, setStep] = useState(() => (compact ? steps.length : 0))
  const [run, setRun] = useState(!compact)
  useEffect(() => {
    if (!run || step >= steps.length) return
    const t = setTimeout(() => setStep((n) => n + 1), step === 0 ? 700 : 1000)
    return () => clearTimeout(t)
  }, [run, step, steps.length])
  const done = step >= steps.length
  const { prefs } = usePrefs()
  const lostMine = lossSound && report.units.some((u) => u.owner === bottomId && u.destroyed)
  const played = useRef(false)
  useEffect(() => {
    if (!done || !lostMine || played.current) return
    played.current = true
    playSound('killed', prefs.sound)
  }, [done, lostMine, prefs.sound])
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
      <div className={`modal${compact ? ' compact' : ''}`}>
        <h2>
          ⚔ 전투 결과 — {civById(att.civId).name}({ATTACK_TITLE[report.kind]}) vs {civById(def.civId).name}(수비)
        </h2>
        <p className="muted">
          {kind} · 목표 타일: {report.terrains.length ? report.terrains.join('·') : '?'}
          {report.coastal ? ' (해안 타일 전투)' : ''} · 라운드 {report.round}
        </p>
          <div className="scene">
            <div className="side-label">
              {civById(game.players[topId].civId).name} ({roleOf(topId)})
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
            <AttackLine step={done ? null : current} topId={topId} />
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
              {civById(game.players[bottomId].civId).name} ({roleOf(bottomId)})
            </div>
          </div>
        {!compact && (
        <div className="row anim-bar">
          {!done && (
            <span className="muted">
              {current ? `${civById(game.players[current.from.pid].civId).name} ${current.from.slot}번 → ${civById(game.players[current.to.pid].civId).name} ${current.to.slot}번 (대미지 ${current.power}${current.counter ? `, 반격 ${current.counter}` : ''})` : '전투 시작…'}
            </span>
          )}
          {done ? <button onClick={replay}>↻ 다시 보기</button> : <button onClick={skip}>⏭ 건너뛰기</button>}
        </div>
        )}
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
