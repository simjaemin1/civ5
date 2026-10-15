import type { BattleReport, BattleUnitReport, GameState } from '../engine'
import { cardStats, civById } from '../engine'
import { DIR_LABEL } from './format'

/** 한 카드: 이름, 공격(방향·전투력), 체력, 방어력과 이번 전투의 결과 */
function Unit({ u }: { u: BattleUnitReport | null }) {
  if (!u) return <div className="unit empty">빈칸</div>
  const st = cardStats(u.inst)
  const taken = u.attackDamage + u.counterDamage
  const atk =
    st.choose !== undefined
      ? `⚔${st.choose} 대상 선택`
      : st.marks.length
        ? st.marks.map((m) => `⚔${m.power}${DIR_LABEL[m.dir]}`).join('·')
        : st.markPower !== undefined
          ? `⚔${st.markPower}`
          : '공격 없음'
  return (
    <div className={`unit ${u.destroyed ? 'dead' : 'alive'}`}>
      <b>{st.name}</b>
      <span>{atk}</span>
      <span>
        ♥{u.hp} 🛡{st.def}
      </span>
      <span className="dmg">
        받은 대미지 {taken}
        {u.counterDamage > 0 && <small> (공격 {u.attackDamage} + 반격 {u.counterDamage})</small>}
      </span>
      <span className="state">{u.destroyed ? '💥 파괴' : '✔ 생존'}</span>
    </div>
  )
}

/** 전투가 끝나면 한 번 띄우는 전투 장면. 확인을 눌러야 다음으로 넘어간다. */
export function BattleReportModal({ game, report, onClose }: { game: GameState; report: BattleReport; onClose: () => void }) {
  const att = game.players[report.attackerId]
  const def = game.players[report.defenderId]
  const unitAt = (pid: number, slot: number) => report.units.find((u) => u.owner === pid && u.slot === slot) ?? null
  const cols = [1, 2, 3, 4]
  const winnerName = civById((report.winner === 'attacker' ? att : def).civId).name
  const kind = { normal: '일반 선전포고', retake: '탈환 선전포고', city: '도시 공격' }[report.kind]
  const hits = [...report.hits].sort((a, b) => a.from.pid - b.from.pid || a.from.slot - b.from.slot)
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
          <div className="side-label">{civById(def.civId).name} (수비)</div>
          <div className="scene-row">
            {cols.map((c) => (
              <div key={`d${c}`} className="cell">
                <small>수비 {5 - c}번</small>
                <Unit u={unitAt(report.defenderId, 5 - c)} />
              </div>
            ))}
          </div>
          <div className="scene-row vs">
            {cols.map((c) => (
              <div key={`v${c}`} className="cell">
                ↕
              </div>
            ))}
          </div>
          <div className="scene-row">
            {cols.map((c) => (
              <div key={`a${c}`} className="cell">
                <small>공격 {c}번</small>
                <Unit u={unitAt(report.attackerId, c)} />
              </div>
            ))}
          </div>
          <div className="side-label">{civById(att.civId).name} (공격)</div>
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
        <div className="result">
          남은 카드 — 공격 {report.survivors.attacker}장 / 수비 {report.survivors.defender}장 (같으면 수비 승)
          <h3>
            🏆 {winnerName} 승 — {report.outcome}
          </h3>
        </div>
        <button className="primary" autoFocus onClick={onClose}>
          확인
        </button>
      </div>
    </div>
  )
}
