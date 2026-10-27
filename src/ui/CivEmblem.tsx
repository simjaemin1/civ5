import type { Player } from '../engine'
import { civById } from '../engine'
import { civEmblem } from './civEmblems'

/**
 * 화면 오른쪽 위의 내 문명 기호 (다른 문명을 보는 중에도 늘 내 문명).
 * 누르면 내 내정 화면으로 돌아온다 (차례 순서에서 문명을 눌러 연 시점 화면을 닫는다).
 * 기호 그림이 없는 문명은 이름 첫 글자로 대신한다.
 */
export function CivEmblem({ player, onHome, away }: { player: Player; onHome?: () => void; away?: boolean }) {
  const civ = civById(player.civId)
  const img = civEmblem(player.civId)
  return (
    <button
      className={`civ-emblem${away ? ' away' : ''}`}
      onClick={onHome}
      title={away ? `${civ.name} — 눌러서 내 내정 화면으로` : civ.name}
      aria-label={away ? `${civ.name} — 내 내정 화면으로` : civ.name}
    >
      {img ? <img src={img} alt="" draggable={false} /> : <span>{civ.name.slice(0, 1)}</span>}
    </button>
  )
}
