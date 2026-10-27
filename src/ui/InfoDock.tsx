import type { GameState, Player } from '../engine'
import { CivCard } from './cards/CivCard'
import { TechTree } from './InfoTabs'
import { RecentLog, Threats, TurnOrder, WonderRace } from './SidePanel'
import { useWide } from './hooks'
import { usePrefs } from './prefsStore'

/**
 * 오른쪽 정보 칸. 넓은 화면에서는 내 문명 카드와 기술표를 늘 펼쳐 두고 (맨 위 문명 기호·네모 버튼으로 켜고 끈다),
 * 그 아래에 차례 순서·선전포고·불가사의 경쟁·최근 기록을 둔다. 좁은 화면에서는 문명 카드·기술표를 버튼으로 띄운다.
 */
export function InfoDock({ game, seats, actor, viewer, player }: { game: GameState; seats: { ai: boolean }[]; actor: number; viewer: number; player: Player }) {
  const wide = useWide()
  const { prefs } = usePrefs()
  const civ = wide && prefs.dockCiv
  const tech = wide && prefs.dockTech
  return (
    <aside className={`side dock${tech ? ' wide' : ''}`} aria-label="정보">
      <div className="dock-top">
        {civ && (
          <div className="dock-civ">
            <CivCard civId={player.civId} width={tech ? 300 : 316} />
          </div>
        )}
        <TurnOrder game={game} seats={seats} actor={actor} />
      </div>
      {tech && (
        <section className="side-sec dock-tech" aria-label="기술표">
          <h4>기술표 (선행 → 후행)</h4>
          <TechTree player={player} />
        </section>
      )}
      <Threats game={game} viewer={viewer} />
      <WonderRace game={game} viewer={viewer} />
      <RecentLog game={game} />
    </aside>
  )
}
