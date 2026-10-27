import { useEffect, useState } from 'react'
import type { GameState, Player } from '../engine'
import { civById } from '../engine'
import { CivCard } from './cards/CivCard'
import { civEmblem } from './civEmblems'
import { TechTree } from './InfoTabs'
import { TurnOrder } from './SidePanel'

/**
 * 화면 오른쪽 위의 문명 기호. 누르면 "내 문명 자세히" 창이 맨 위에서 화면 위에 겹쳐 뜬다 (아래 내용이 밀리지 않는다).
 * 창에는 문명 카드, 차례 순서, 기술표가 있다. 다시 누르거나 닫기, Esc로 닫는다.
 * 기호 그림이 없는 문명은 이름 첫 글자로 대신한다.
 */
export function CivEmblem({ game, player, seats, actor }: { game: GameState; player: Player; seats: { ai: boolean }[]; actor: number }) {
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
            <TurnOrder game={game} seats={seats} actor={actor} />
          </div>
          <h4>기술표 (선행 → 후행)</h4>
          <TechTree player={player} />
        </div>
      )}
    </>
  )
}
