import { useEffect, useState } from 'react'
import type { Player } from '../engine'
import { WONDER_CARDS, cardById, civById } from '../engine'
import { civEmblem } from './civEmblems'
import { WonderCard } from './cards/WonderCard'

/** 가진 군사 카드를 종류별로 센다 (고유 유닛은 따로). 종류별 보유 수는 공개 정보다 */
function militaryCounts(p: Player): { name: string; n: number }[] {
  const by = new Map<string, number>()
  for (const c of p.military) {
    const key = c.unique ? `${c.unique} (고유)` : cardById(c.defId).name
    by.set(key, (by.get(key) ?? 0) + 1)
  }
  return [...by].map(([name, n]) => ({ name, n }))
}

/**
 * 화면 오른쪽 위 문명 기호: 지금 보고 있는 문명(차례 순서에서 고른 시점, 아니면 내 문명).
 * 누르면 그 문명이 지금 가진 것만 모아 보여 준다: 군사 카드(글자, 종류별 장수)와 지은 불가사의(작은 그림 카드).
 * 기호 그림이 없는 문명은 이름 첫 글자로 대신한다.
 */
export function CivEmblem({ player }: { player: Player }) {
  const civ = civById(player.civId)
  const img = civEmblem(player.civId)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  const counts = militaryCounts(player)
  const wonders = player.wonders.map((id) => WONDER_CARDS.find((w) => w.id === id)).filter((w) => !!w)
  return (
    <>
      <button
        className={`civ-emblem${open ? ' on' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={`${civ.name} — 가진 군사 카드·지은 불가사의 보기`}
        aria-label={`${civ.name} 군사 카드·불가사의`}
      >
        {img ? <img src={img} alt="" draggable={false} /> : <span>{civ.name.slice(0, 1)}</span>}
      </button>
      {open && (
        <div className="tree-float civ-pop" role="dialog" aria-label={`${civ.name} 군사 카드·불가사의`}>
          <div className="tree-overlay-head">
            <b>{civ.name}</b>
            <button onClick={() => setOpen(false)}>닫기 ✕</button>
          </div>
          <h4>군사 카드 {player.military.length}장</h4>
          {counts.length ? (
            <ul className="plain civ-pop-units">
              {counts.map((c) => (
                <li key={c.name}>
                  {c.name} <b>×{c.n}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">없음</p>
          )}
          <h4>지은 불가사의 {wonders.length}개</h4>
          {wonders.length ? (
            <div className="civ-pop-wonders">
              {wonders.map((w) => (
                <WonderCard key={w.id} wonder={w} width={150} owned />
              ))}
            </div>
          ) : (
            <p className="muted">없음</p>
          )}
        </div>
      )}
    </>
  )
}
