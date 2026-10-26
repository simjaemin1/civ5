import { useEffect, useRef, useState } from 'react'
import type { Action, GameView } from '../engine'
import { actorOf, civById, culture, happiness, totalWorkers, tourism } from '../engine'
import { Board } from '../ui/Board'
import { BattleReportModal } from '../ui/BattleReportModal'
import { CivInspector } from '../ui/CivInspector'
import { InfoTabs, PlayersTable } from '../ui/InfoTabs'
import { ICON } from '../ui/format'
import { CityTag, Icon } from '../ui/icons'
import { BattlePanel } from '../ui/panels/BattlePanel'
import { DeclarePanel } from '../ui/panels/DeclarePanel'
import { DiscardPanel } from '../ui/panels/DiscardPanel'
import { ChoicesPanel } from '../ui/panels/ChoicesPanel'
import { PendingPanel } from '../ui/panels/PendingPanel'
import { PlacePanel } from '../ui/panels/PlacePanel'
import { ProducePanel } from '../ui/panels/ProducePanel'
import { ResearchPanel } from '../ui/panels/ResearchPanel'
import { SetupPanel } from '../ui/panels/SetupPanel'
import type { OnlineRoom } from './useOnlineRoom'

const PHASE: Record<GameView['phase'], string> = {
  setup: '게임 준비',
  place: '① 일꾼 배치 · ② 산출',
  research: '③ 기술 연구',
  produce: '④ 생산',
  declare: '⑤ 선전포고 → ⑥ 식량 정산',
  battle: '정산: 전투',
  over: '게임 종료',
}
const WIN = { science: '과학 승리', culture: '문화 승리', conquest: '정복 승리' } as const

/** 지금 내가 입력해야 하는가. 전투 배치는 양쪽이 동시에 내므로 actorOf만으로는 모른다 */
function isMyTurn(game: GameView): boolean {
  const me = game.viewer
  const b = game.battle
  if (game.phase === 'battle' && b) {
    if (b.step === 'arrange') return (me === b.decl.attackerId || me === b.decl.defenderId) && !b.slots[me]
    return b.chooseQueue[0]?.playerId === me
  }
  return actorOf(game) === me
}

interface Props {
  online: OnlineRoom
  onExit: () => void
}

export function OnlineGameScreen({ online, onExit }: Props) {
  const { view: game, room, you, send, error } = online
  const prev = useRef<GameView | null>(null)
  const [notice, setNotice] = useState<string[]>([])
  const [seenBattle, setSeenBattle] = useState<number | null>(null)

  // 방금 일어난 일: 직전 뷰와 로그 줄 수를 비교한다
  useEffect(() => {
    if (!game) return
    const p = prev.current
    prev.current = game
    if (p && game.logSeq > p.logSeq) setNotice(game.log.slice(-Math.min(game.logSeq - p.logSeq, game.log.length)))
    else if (!p) setNotice([])
  }, [game])

  if (!game || !room || !you) return <p className="muted">게임 정보를 받는 중…</p>

  const reports = game.battleReports ?? []
  const latest = reports.length ? reports[reports.length - 1] : null
  // 접속한 시점까지의 전투는 이미 본 것으로 친다
  const seen = seenBattle ?? latest?.seq ?? 0
  const pendingReport = latest && latest.seq > seen ? latest : null

  const me = game.players[game.viewer]
  const actor = actorOf(game)
  const actorPlayer = game.players[actor]
  const mine = isMyTurn(game)
  const over = game.phase === 'over'
  const dispatch = (a: Action) => send({ type: 'action', action: a })
  const seats = room.seats

  let main: React.ReactNode
  if (over) {
    main = (
      <div className="panel banner">
        <h2>{game.winner ? `🏆 ${civById(game.players[game.winner.playerId].civId).name} — ${WIN[game.winner.type]}` : '🤝 승부 없음 (무승부)'}</h2>
        <p>라운드 {game.round}에서 게임이 끝났습니다.</p>
      </div>
    )
  } else if (!mine) {
    const b = game.battle
    main = (
      <div className="panel" data-testid="waiting">
        <h3>
          ⏳ {civById(actorPlayer.civId).name}({seats[actor]?.name}){seats[actor]?.ai ? ' 🤖' : ''} 차례를 기다리는 중…
        </h3>
        {seats[actor] && !seats[actor].ai && !seats[actor].connected && <p className="error">접속이 끊겨 있습니다. 돌아올 때까지 기다립니다.</p>}
        {game.phase === 'battle' && b && (
          <p className="muted">
            {civById(game.players[b.decl.attackerId].civId).name} vs {civById(game.players[b.decl.defenderId].civId).name}{' '}
            {b.step === 'arrange'
              ? [b.decl.attackerId, b.decl.defenderId].map((id) => `${civById(game.players[id].civId).name} ${b.slots[id] ? '배치 완료' : '배치 중'}`).join(' · ')
              : '— 대상 선택 중'}
          </p>
        )}
      </div>
    )
  } else if (game.phase === 'setup') {
    main = <SetupPanel game={game} player={me} dispatch={dispatch} />
  } else if (game.phase === 'battle' && game.battle) {
    main = <BattlePanel game={game} player={me} dispatch={dispatch} />
  } else if (game.phase === 'place') {
    main = <PlacePanel key={`${me.id}-${game.round}`} game={game} player={me} dispatch={dispatch} />
  } else if (game.phase === 'research') {
    main = (
      <>
        <PendingPanel game={game} player={me} dispatch={dispatch} />
        <ChoicesPanel game={game} player={me} dispatch={dispatch} />
        <ResearchPanel game={game} player={me} dispatch={dispatch} />
      </>
    )
  } else if (game.phase === 'produce') {
    main = (
      <>
        <PendingPanel game={game} player={me} dispatch={dispatch} />
        <ChoicesPanel game={game} player={me} dispatch={dispatch} />
        <ProducePanel game={game} player={me} dispatch={dispatch} />
      </>
    )
  } else if (game.phase === 'declare') {
    main = me.pendingDiscard ? <DiscardPanel game={game} player={me} dispatch={dispatch} /> : <DeclarePanel game={game} player={me} dispatch={dispatch} />
  }

  const yields = me.turn?.yields
  const showBoard = !over && mine && game.phase !== 'setup' && game.phase !== 'place' && game.phase !== 'battle'

  return (
    <div className="game">
      {pendingReport && <BattleReportModal game={game} report={pendingReport} viewerId={pendingReport.attackerId === game.viewer || pendingReport.defenderId === game.viewer ? game.viewer : pendingReport.attackerId} onClose={() => setSeenBattle(pendingReport.seq)} />}
      <header className="top">
        <div>
          <b>라운드 {game.round}</b> · {PHASE[game.phase]} · <span className="who">{civById(actorPlayer.civId).name}</span>
          {mine && !over ? ' 👈 내 차례' : ''}
        </div>
        <div className="row">
          <span data-testid="conn" style={{ opacity: 0.85 }}>
            방 {room.id} · {online.status === 'open' ? '🟢 연결됨' : '🔴 다시 연결 중…'}
          </span>
          {yields && mine && (
            <span className="yields">
              {yields.cities.map((c) => (
                <span key={c.cityId}>
                  <CityTag id={c.cityId} /> {ICON.food}
                  {c.food} {ICON.hammer}
                  {c.hammer}{' '}
                </span>
              ))}
              {ICON.science}
              {yields.science} {ICON.gold}
              {yields.gold}
            </span>
          )}
          {you.host && (
            <>
              <button onClick={() => send({ type: 'undo' })} title="마지막 사람 행동 하나를 되돌립니다 (방장 전용)">
                ↶ 되돌리기
              </button>
              <button onClick={() => confirm('방을 폭파할까요? 모두 쫓겨나고 기록이 지워집니다.') && send({ type: 'closeRoom' })}>💣 방 폭파</button>
            </>
          )}
          <button onClick={onExit}>나가기</button>
        </div>
      </header>
      {error && <div className="error banner-error" data-testid="error">⚠ {error}</div>}
      {!error && notice.length > 0 && (
        <div className="notice">
          <b>방금 일어난 일</b>
          {notice.map((l, i) => (
            <div key={i}>{l.replace(/^\[R\d+\] /, '')}</div>
          ))}
        </div>
      )}
      {me.turn?.skipFoodSettle && mine && <div className="notice">📜 이번 차례는 식량 정산을 하지 않습니다 (전통/체제). 일꾼 수는 그대로입니다.</div>}
      <div className="stats">
        {me.cities.length > 0 && (
          <span>
            나: {civById(me.civId).name} · 문화 {culture(me)} · 관광 {tourism(me)} · <Icon name="worker" size={16} /> {totalWorkers(me)}/{happiness(me)} · <Icon name="general" size={16} /> {me.generals}
          </span>
        )}
      </div>
      {mine && !over && game.phase !== 'setup' && game.phase !== 'battle' && me.wonders.includes('great_wall') && !me.greatWallUsed && (
        <div className="panel row">
          <button onClick={() => dispatch({ type: 'useGreatWall' })} title="내 영토 위의 상대 장군을 모두 돌려보냅니다 (게임 중 1회)">
            🧱 만리장성 사용 (상대 장군 모두 돌려보냄, 1회)
          </button>
        </div>
      )}
      {main}
      {showBoard && <Board game={game} player={me} />}
      {!mine && !over && me.cities.length > 0 && <Board game={game} player={me} />}
      <PlayersTable game={game} seats={seats} actor={actor} />
      <CivInspector game={game} seats={seats} actor={actor} />
      <InfoTabs game={game} viewer={me.id} />
    </div>
  )
}
