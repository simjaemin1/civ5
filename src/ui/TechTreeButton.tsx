import { useEffect, useState } from 'react'
import type { Player } from '../engine'
import { civById } from '../engine'
import { TechTree } from './InfoTabs'
import { civEmblem } from './civEmblems'
import { treeFitBox as fitBox } from './treeFit'
import techIconUrl from '../assets/icons/tech.png'

/**
 * 맨 위 줄의 과학 플라스크 버튼: 누르면 기술표가 화면 위에 겹쳐 펼쳐진다 (아래 내용이 밀리지 않는다).
 * 표 전체가 한 화면에 들어가도록 카드 크기를 창 크기에 맞춘다 (휠로 내릴 필요 없음). 카드를 누르면 크게 보고 효과를 읽는다.
 * 창 왼쪽에 사전 색인처럼 문명 표시가 튀어나와 있어, 누르면 그 문명의 기술 상태를 본다 (열 때는 늘 내 문명).
 * 어느 단계에서든 열 수 있고, 다시 누르거나 닫기, Esc로 닫는다.
 */
export function TechTreeButton({ player, players = [player] }: { player: Player; players?: Player[] }) {
  const [open, setOpen] = useState(false)
  const [who, setWho] = useState(player.id)
  const [box, setBox] = useState(fitBox)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onResize = () => setBox(fitBox())
    onResize()
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open])
  const toggle = () => {
    setWho(player.id)
    setOpen(!open)
  }
  const shown = players.find((p) => p.id === who) ?? player
  const mine = shown.id === player.id
  return (
    <>
      <button className={`tree-btn${open ? ' on' : ''}`} onClick={toggle} aria-expanded={open} aria-label="기술표" title="기술표 (선행·후행 기술)">
        <img src={techIconUrl} alt="" draggable={false} />
      </button>
      {open && (
        <div className="tree-dock">
          {players.length > 1 && (
            <div className="tree-civ-tabs" role="tablist" aria-label="문명별 기술">
              {players.map((p) => {
                const name = civById(p.civId).name
                const img = civEmblem(p.civId)
                return (
                  <button
                    key={p.id}
                    role="tab"
                    aria-selected={p.id === shown.id}
                    className={`${p.id === shown.id ? 'active' : ''}${p.eliminated ? ' out' : ''}`}
                    onClick={() => setWho(p.id)}
                    title={`${name}${p.id === player.id ? ' (나)' : ''} 기술 ${p.techs.length}개`}
                    aria-label={`${name} 기술`}
                  >
                    {img ? <img src={img} alt="" draggable={false} /> : <span>{name.slice(0, 1)}</span>}
                  </button>
                )
              })}
            </div>
          )}
          <div className="tree-float" role="dialog" aria-label="기술표">
            <div className="tree-overlay-head">
              <b>
                기술표 — {civById(shown.civId).name}
                {mine ? ' (나)' : ''} · {shown.techs.length}개 <small className="muted">카드를 누르면 효과를 크게 봅니다</small>
              </b>
              <button onClick={() => setOpen(false)}>닫기 ✕</button>
            </div>
            <TechTree key={shown.id} player={shown} fit={box} glow={mine} />
          </div>
        </div>
      )}
    </>
  )
}
