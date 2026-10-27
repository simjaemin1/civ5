import { useEffect, useState } from 'react'
import type { Player } from '../engine'
import { cardStats, civById, culture, happiness, totalWorkers, tourism, wonderCardById } from '../engine'
import { CivCard } from './cards/CivCard'
import { civEmblem } from './civEmblems'
import { TechTree } from './InfoTabs'
import { Icon } from './icons'
import { ICON, policyName } from './format'

/**
 * 화면 오른쪽 위의 문명 기호. 누르면 "내 문명 자세히" 창이 맨 위에서 화면 위에 겹쳐 뜬다 (아래 내용이 밀리지 않는다).
 * 창에는 내 문명 정보만 있다: 문명 카드, 지금 상태(문화·일꾼·장군·정책·불가사의·군사 카드), 기술표. 차례 순서 같은 판 전체 정보는 오른쪽 칸에 있다. 다시 누르거나 닫기, Esc로 닫는다.
 * 기호 그림이 없는 문명은 이름 첫 글자로 대신한다.
 */
export function CivEmblem({ player }: { player: Player }) {
  const [open, setOpen] = useState(false)
  const civ = civById(player.civId)
  const img = civEmblem(player.civId)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <>
      <button
        className={`civ-emblem${open ? ' on' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={`${civ.name} — 눌러서 내 문명 자세히 보기`}
        aria-label={`${civ.name} 문명 정보`}
      >
        {img ? <img src={img} alt="" draggable={false} /> : <span>{civ.name.slice(0, 1)}</span>}
      </button>
      {open && (
        <div className="civ-float" role="dialog" aria-label={`${civ.name} 자세히`}>
          <div className="tree-overlay-head">
            <b>{civ.name} 자세히</b>
            <button onClick={() => setOpen(false)}>닫기 ✕</button>
          </div>
          <div className="civ-float-top">
            <CivCard civId={player.civId} width={Math.min(320, window.innerWidth - 48)} />
            <MyCiv p={player} />
          </div>
          <h4>기술표 (선행 → 후행)</h4>
          <TechTree player={player} />
        </div>
      )}
    </>
  )
}

/** 내 문명의 지금 상태 */
function MyCiv({ p }: { p: Player }) {
  return (
    <section className="side-sec my-civ">
      <h4>지금 상태</h4>
      <ul className="plain">
        <li>
          {ICON.culture} 문화 {culture(p)} · 관광 {tourism(p)}
        </li>
        <li>
          <Icon name="worker" size={16} /> 일꾼 {totalWorkers(p)} / <Icon name="happy" size={16} title="행복" /> {p.cities.length ? happiness(p) : '-'} · 도시 {p.cities.length}
        </li>
        <li>
          <Icon name="general" size={16} /> 위대한 장군 {p.generals}
        </li>
        <li>📜 정책: {policyName(p.policy)}</li>
        <li>🏛 불가사의: {p.wonders.length ? p.wonders.map((id) => wonderCardById(id).name).join(', ') : '없음'}</li>
        <li>
          ⚔ 군사 카드 {p.military.length}장{p.military.length > 0 && <small className="muted"> — {p.military.map((c) => cardStats(c).name).join(', ')}</small>}
        </li>
        <li>
          🔬 기술 {p.techs.length}개
        </li>
      </ul>
    </section>
  )
}
