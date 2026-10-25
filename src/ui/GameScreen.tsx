import { Icon } from './icons'
import { useCallback, useEffect, useState } from 'react'
import type { Action, GameState } from '../engine'
import { RuleError, actorOf, aiStep, apply, civById, culture, happiness, totalWorkers, tourism } from '../engine'
import { Board } from './Board'
import { CivInspector } from './CivInspector'
import { InfoTabs, PlayersTable } from './InfoTabs'
import type { Seat } from './SetupScreen'
import { ICON } from './format'
import { BattleReportModal } from './BattleReportModal'
import { BattlePanel } from './panels/BattlePanel'
import { DeclarePanel } from './panels/DeclarePanel'
import { PendingPanel } from './panels/PendingPanel'
import { ChoicesPanel } from './panels/ChoicesPanel'
import { PlacePanel } from './panels/PlacePanel'
import { ProducePanel } from './panels/ProducePanel'
import { ResearchPanel } from './panels/ResearchPanel'
import { SetupPanel } from './panels/SetupPanel'

const PHASE: Record<GameState['phase'], string> = {
  setup: '게임 준비',
  place: '① 일꾼 배치 · ② 산출',
  research: '③ 기술 연구',
  produce: '④ 생산',
  declare: '⑤ 선전포고 → ⑥ 식량 정산',
  battle: '정산: 전투',
  over: '게임 종료',
}
const WIN = { science: '과학 승리', culture: '문화 승리', conquest: '정복 승리' } as const

interface Props {
  initial: GameState
  seats: Seat[]
  onExit: () => void
}

export function GameScreen({ initial, seats, onExit }: Props) {
  const [game, setGame] = useState(initial)
  const [history, setHistory] = useState<GameState[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<string[]>([])
  const [speed, setSpeed] = useState(300)
  const [revealed, setRevealed] = useState('')
  // 전투 결과 장면: 아직 확인하지 않은 가장 최근 전투가 있으면 띄운다 (되돌리기·불러오기로 줄어들면 다시 띄우지 않는다)
  const reports = game.battleReports ?? []
  const latest = reports.length ? reports[reports.length - 1] : null
  const [seenBattle, setSeenBattle] = useState(latest?.seq ?? 0)
  const pendingReport = latest && latest.seq > seenBattle && seats.some((s) => !s.ai) ? latest : null

  const actor = actorOf(game)
  const actorSeat = seats[actor]
  const humans = seats.filter((s) => !s.ai).length
  const over = game.phase === 'over'
  const player = game.players[actor]

  // 비공개 정보(손에 든 타일, 군사 카드)가 있으므로 사람 자리가 바뀌면 가림막을 보여 준다
  const curtainKey = `${actor}:${game.round}:${game.battle ? `${game.battle.decl.attackerId}-${game.battle.decl.defenderId}-${game.battle.step}` : game.phase === 'battle' ? 'b' : 't'}`
  const curtain = humans > 1 && !actorSeat.ai && !over && revealed !== curtainKey

  const dispatch = useCallback(
    (a: Action) => {
      setError('')
      try {
        const next = apply(game, a)
        const added = Math.min(next.logSeq - game.logSeq, next.log.length)
        setNotice(added > 0 ? next.log.slice(-added) : [])
        setHistory((h) => [...h.slice(-99), game])
        setGame(next)
      } catch (e) {
        setError(e instanceof RuleError ? e.message : String(e))
      }
    },
    [game],
  )

  // AI 자리는 자동으로 진행한다
  useEffect(() => {
    if (over || !actorSeat.ai || pendingReport) return
    const t = setTimeout(() => {
      try {
        setGame((g) => aiStep(g).state)
      } catch (e) {
        setError(String(e))
      }
    }, speed)
    return () => clearTimeout(t)
  }, [game, over, actorSeat.ai, speed, pendingReport])

  // 자동 저장
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem('civ5-save-v1', JSON.stringify({ game, seats }))
      } catch {
        /* 저장 불가 환경이면 무시 */
      }
    }, 600)
    return () => clearTimeout(t)
  }, [game, seats])

  const yields = player.turn?.yields
  const skipsFood = !!player.turn?.skipFoodSettle

  let main: React.ReactNode
  if (over) {
    main = (
      <div className="panel banner">
        <h2>
          {game.winner ? `🏆 ${civById(game.players[game.winner.playerId].civId).name} — ${WIN[game.winner.type]}` : '🤝 승부 없음 (무승부)'}
        </h2>
        <p>라운드 {game.round}에서 게임이 끝났습니다.</p>
      </div>
    )
  } else if (actorSeat.ai) {
    main = (
      <div className="panel">
        <h3>🤖 {civById(player.civId).name} (AI) 진행 중…</h3>
        <p className="muted">AI가 자동으로 행동합니다. 아래에서 판 상황을 볼 수 있습니다.</p>
      </div>
    )
  } else if (curtain) {
    main = (
      <div className="panel curtain">
        <h2>{civById(player.civId).name} 차례</h2>
        <p>다른 사람이 보지 않게 하고 준비되면 누르세요. (손에 든 타일·군사 카드는 비공개 정보입니다.)</p>
        <button className="primary" onClick={() => setRevealed(curtainKey)}>
          화면 보기
        </button>
      </div>
    )
  } else if (game.phase === 'setup') {
    main = <SetupPanel game={game} player={player} dispatch={dispatch} />
  } else if (game.phase === 'battle' && game.battle) {
    main = <BattlePanel game={game} player={player} dispatch={dispatch} />
  } else if (game.phase === 'place') {
    main = <PlacePanel key={`${player.id}-${game.round}`} game={game} player={player} dispatch={dispatch} />
  } else if (game.phase === 'research') {
    main = (
      <>
        <PendingPanel game={game} player={player} dispatch={dispatch} />
        <ChoicesPanel game={game} player={player} dispatch={dispatch} />
        <ResearchPanel game={game} player={player} dispatch={dispatch} />
      </>
    )
  } else if (game.phase === 'produce') {
    main = (
      <>
        <PendingPanel game={game} player={player} dispatch={dispatch} />
        <ChoicesPanel game={game} player={player} dispatch={dispatch} />
        <ProducePanel game={game} player={player} dispatch={dispatch} />
      </>
    )
  } else if (game.phase === 'declare') {
    main = <DeclarePanel game={game} player={player} dispatch={dispatch} />
  }

  const showBoard = !over && !curtain && game.phase !== 'setup' && game.phase !== 'place' && game.phase !== 'battle'

  return (
    <div className="game">
      {pendingReport && (
        <BattleReportModal
          game={game}
          report={pendingReport}
          viewerId={
            seats[pendingReport.attackerId].ai
              ? pendingReport.defenderId
              : seats[pendingReport.defenderId].ai
                ? pendingReport.attackerId
                : actor === pendingReport.defenderId
                  ? pendingReport.defenderId
                  : pendingReport.attackerId
          }
          onClose={() => setSeenBattle(pendingReport.seq)}
        />
      )}
      <header className="top">
        <div>
          <b>라운드 {game.round}</b> · {PHASE[game.phase]} ·{' '}
          <span className="who">{civById(player.civId).name}</span>
          {actorSeat.ai ? ' 🤖' : ' 👤'}
        </div>
        <div className="row">
          {yields && !actorSeat.ai && (
            <span className="yields">
              {yields.cities.map((c) => (
                <span key={c.cityId}>
                  도시{c.cityId + 1} {ICON.food}
                  {c.food} {ICON.hammer}
                  {c.hammer}{' '}
                </span>
              ))}
              {ICON.science}
              {yields.science} {ICON.gold}
              {yields.gold}
            </span>
          )}
          <label>
            AI 속도{' '}
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={30}>매우 빠름</option>
              <option value={150}>빠름</option>
              <option value={300}>보통</option>
              <option value={800}>느림</option>
            </select>
          </label>
          <button disabled={history.length === 0} onClick={() => { setGame(history[history.length - 1]); setHistory(history.slice(0, -1)); setError('') }}>
            ↶ 되돌리기
          </button>
          <button onClick={onExit}>나가기</button>
        </div>
      </header>
      {error && <div className="error banner-error">⚠ {error}</div>}
      {!error && notice.length > 0 && !actorSeat.ai && (
        <div className="notice">
          <b>방금 일어난 일</b>
          {notice.map((l, i) => (
            <div key={i}>{l.replace(/^\[R\d+\] /, '')}</div>
          ))}
        </div>
      )}
      {skipsFood && !actorSeat.ai && <div className="notice">📜 이번 차례는 식량 정산을 하지 않습니다 (전통/체제). 일꾼 수는 그대로입니다.</div>}
      <div className="stats">
        {player.cities.length > 0 && (
          <span>
            문화 {culture(player)} · 관광 {tourism(player)} · <Icon name="worker" size={16} /> {totalWorkers(player)}/{happiness(player)} · <Icon name="general" size={16} /> {player.generals}
          </span>
        )}
      </div>
      {!over && !curtain && !actorSeat.ai && game.phase !== 'setup' && game.phase !== 'battle' && player.wonders.includes('great_wall') && !player.greatWallUsed && (
        <div className="panel row">
          <button onClick={() => dispatch({ type: 'useGreatWall' })} title="내 영토 위의 상대 장군을 모두 돌려보냅니다 (게임 중 1회)">
            🧱 만리장성 사용 (상대 장군 모두 돌려보냄, 1회)
          </button>
        </div>
      )}
      {main}
      {showBoard && <Board game={game} player={player} />}
      {actorSeat.ai && !over && <Board game={game} player={player} />}
      <PlayersTable game={game} seats={seats} actor={actor} />
      <CivInspector game={game} seats={seats} actor={actor} />
      <InfoTabs game={game} viewer={player.id} />
    </div>
  )
}
