import type { GameState } from '../engine'
import { WONDER_CARDS, civById, culture, happiness, totalWorkers, tourism } from '../engine'
import { declTileName, roundBids } from './gameInfo'
import { Icon } from './icons'
import { ICON, policyName } from './format'

const civName = (game: GameState, pid: number) => civById(game.players[pid].civId).name
const KIND = { normal: '선전포고', retake: '탈환', city: '도시 공격' } as const

/** 이번 라운드 차례 순서: 끝남 · 지금 · 남음 */
export function TurnOrder({ game, seats, actor }: { game: GameState; seats: { ai: boolean }[]; actor: number }) {
  const live = game.order.filter((id) => !game.players[id].eliminated)
  const inTurns = game.phase !== 'battle' && game.phase !== 'over'
  return (
    <section className="side-sec">
      <h4>라운드 {game.round} 차례 순서</h4>
      <ol className="turn-order">
        {game.order.map((id, idx) => {
          const p = game.players[id]
          const state = p.eliminated ? 'out' : !inTurns ? 'done' : idx < game.turnIdx ? 'done' : id === actor ? 'now' : 'next'
          return (
            <li key={id} className={state}>
              <span className="who">
                {state === 'now' ? '▶ ' : state === 'done' ? '✓ ' : ''}
                {civName(game, id)} {seats[id]?.ai ? '🤖' : '👤'}
              </span>
              <span className="muted nums">
                {ICON.culture} 문화 {culture(p)} · 관광 {tourism(p)} · <Icon name="worker" size={14} />
                {totalWorkers(p)}/{p.cities.length ? happiness(p) : '-'} · <Icon name="general" size={14} />
                {p.generals} · 군사 {p.military.length} · 기술 {p.techs.length} · {policyName(p.policy)}
              </span>
            </li>
          )
        })}
      </ol>
      {!inTurns && game.phase === 'battle' && <small className="muted">모든 문명의 내정이 끝나 정산 중입니다.</small>}
      {live.length < game.order.length && <small className="muted">탈락한 문명은 흐리게 표시합니다.</small>}
    </section>
  )
}

/** 이번 라운드에 걸린 선전포고. 보는 사람이 목표이면 강조한다 (규칙: 받은 쪽은 자기 차례에 대비할 수 있다). */
export function Threats({ game, viewer }: { game: GameState; viewer: number }) {
  const list = game.declarations
  return (
    <section className="side-sec">
      <h4>⚔ 이번 라운드 선전포고 ({list.length})</h4>
      {list.length === 0 && <small className="muted">아직 없습니다.</small>}
      <ul className="plain">
        {list.map((d, i) => {
          const mine = d.defenderId === viewer
          const by = d.attackerId === viewer
          return (
            <li key={i} className={mine ? 'threat' : by ? 'mine' : ''}>
              <b>{civName(game, d.attackerId)}</b> → <b>{civName(game, d.defenderId)}</b> · {KIND[d.kind]} · {declTileName(game, d)}
              {mine && <span className="tag">나를 노림</span>}
            </li>
          )
        })}
      </ul>
      {game.battle && (
        <small className="muted">
          지금 전투: {civName(game, game.battle.decl.attackerId)} vs {civName(game, game.battle.decl.defenderId)}
        </small>
      )}
    </section>
  )
}

export function WonderRace({ game, viewer }: { game: GameState; viewer: number }) {
  const active = WONDER_CARDS.filter((w) => game.wonderOwners[w.id] === undefined).filter(
    (w) => game.investments.some((x) => x.wonderId === w.id) || Object.values(game.wonderProgress[w.id] ?? {}).some((n) => n > 0),
  )
  return (
    <section className="side-sec">
      <h4>🏛 불가사의 경쟁</h4>
      {active.length === 0 && <small className="muted">진행 중인 불가사의가 없습니다.</small>}
      <ul className="plain">
        {active.map((w) => {
          const { bids, top, tied } = roundBids(game, w.id)
          const prog = game.wonderProgress[w.id] ?? {}
          return (
            <li key={w.id}>
              <b>{w.name}</b> <small className="muted">진척도 필요 {w.progressNeeded}</small>
              <div className="muted small">
                진척도: {game.order.filter((id) => (prog[id] ?? 0) > 0).map((id) => `${civName(game, id)} ${prog[id]}`).join(' · ') || '없음'}
              </div>
              {bids.length > 0 && (
                <div className="small">
                  이번 라운드 투자:{' '}
                  {bids.map((b, i) => (
                    <span key={i} className={b.hammers === top && !tied ? 'lead' : ''}>
                      {i > 0 ? ' · ' : ''}
                      {civName(game, b.playerId)}
                      {b.playerId === viewer ? '(나)' : ''} {ICON.hammer}{b.hammers}
                    </span>
                  ))}
                  {tied && <span className="muted"> (공동 1위 → 아무도 못 얻음)</span>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function RecentLog({ game, lines = 12 }: { game: GameState; lines?: number }) {
  return (
    <section className="side-sec">
      <h4>최근 기록</h4>
      <div className="log small">
        {game.log.slice(-lines).reverse().map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </section>
  )
}

export function SidePanel({ game, seats, actor, viewer }: { game: GameState; seats: { ai: boolean }[]; actor: number; viewer: number }) {
  return (
    <aside className="side">
      <TurnOrder game={game} seats={seats} actor={actor} />
      <Threats game={game} viewer={viewer} />
      <WonderRace game={game} viewer={viewer} />
      <RecentLog game={game} />
    </aside>
  )
}
