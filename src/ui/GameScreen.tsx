import { CityTag, Icon } from './icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Action, GameState } from '../engine'
import { RuleError, actorOf, aiStep, apply, civById, culture, happiness, totalWorkers, tourism } from '../engine'
import { Board } from './Board'
import { CivEmblem } from './CivEmblem'
import { TechTreeButton } from './TechTreeButton'
import { CivInspector, CivPeek } from './CivInspector'
import { InfoTabs, LogPanel } from './InfoTabs'
import { SidePanel } from './SidePanel'
import { usePrefs } from './prefsStore'
import { useGameSounds } from './sounds'
import { autoSkipAction } from './autoSkip'
import type { Seat } from './SetupScreen'
import { ICON } from './format'
import { BattleReportModal } from './BattleReportModal'
import { BattlePanel } from './panels/BattlePanel'
import { DeclarePanel } from './panels/DeclarePanel'
import { PendingPanel } from './panels/PendingPanel'
import { ChoicesPanel } from './panels/ChoicesPanel'
import { CardDiscardPanel } from './panels/CardDiscardPanel'
import { DiscardPanel } from './panels/DiscardPanel'
import { ConfirmButton } from './ConfirmButton'
import { AtomicBombPanel } from './panels/AtomicBombPanel'
import { PlacePanel } from './panels/PlacePanel'
import { ProducePanel } from './panels/ProducePanel'
import { ResearchPanel } from './panels/ResearchPanel'
import { SetupPanel } from './panels/SetupPanel'
import { ScoutBox } from './panels/ScoutBox'
import { TilePlacer } from './panels/TilePlacer'
import { TurnSteps } from './TurnSteps'
import { useEnterHotkey, useTurnTitle } from './hooks'
import { revealsInfo, turnKey } from './gameInfo'

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
  // 되돌릴 수 없는 지점: 무작위 결과를 보여 준 행동 직전 상태들 (이 상태와 그 이전으로는 차례 안 되돌리기 불가)
  // 차례 순서에서 고른 문명의 시점 (지금 사람이 바뀌면 풀린다)
  const [peek, setPeek] = useState<{ id: number; self: number } | null>(null)
  const [locked, setLocked] = useState<ReadonlySet<GameState>>(() => new Set())
  const [error, setError] = useState('')
  const [revealed, setRevealed] = useState('')
  const [autoNote, setAutoNote] = useState('')
  const { prefs, set: setPrefs } = usePrefs()
  const speed = prefs.aiSpeed
  const [saveFailed, setSaveFailed] = useState(false)
  // 전투 결과 장면: 아직 확인하지 않은 가장 최근 전투가 있으면 띄운다 (되돌리기·불러오기로 줄어들면 다시 띄우지 않는다)
  // 한 번에 전투가 여러 개 끝나도 하나씩 차례로 보여 준다 (가장 오래된 것부터)
  const reports = game.battleReports ?? []
  const [seenBattle, setSeenBattle] = useState(() => (reports.length ? reports[reports.length - 1].seq : 0))
  const pendingReport = seats.some((s) => !s.ai) ? (reports.find((r) => r.seq > seenBattle) ?? null) : null

  const actor = actorOf(game)
  const actorSeat = seats[actor]
  const humans = seats.filter((s) => !s.ai).length
  const over = game.phase === 'over'
  const player = game.players[actor]
  // 핫시트에서 "나"는 지금 입력하는 사람. AI 차례에는 마지막으로 입력한 사람 기준으로 위협을 강조한다.
  const [lastHuman, setLastHuman] = useState(() => seats.findIndex((x) => !x.ai))
  if (!actorSeat.ai && lastHuman !== actor) setLastHuman(actor)
  const viewer = !actorSeat.ai || lastHuman < 0 ? actor : lastHuman
  useGameSounds(game, viewer)

  // 비공개 정보(손에 든 타일, 군사 카드)가 있으므로 사람 자리가 바뀌면 가림막을 보여 준다
  const curtainKey = `${actor}:${game.round}:${game.battle ? `${game.battle.decl.attackerId}-${game.battle.decl.defenderId}-${game.battle.step}` : game.phase === 'battle' ? 'b' : 't'}`
  const curtain = humans > 1 && !actorSeat.ai && !over && revealed !== curtainKey

  // 되돌린 직후에는 자동 넘기기를 멈춘다 (되돌리자마자 다시 넘어가지 않게)
  const autoPaused = useRef(false)
  const dispatch = useCallback(
    (a: Action) => {
      autoPaused.current = false
      setError('')
      try {
        const next = apply(game, a)
        setAutoNote('')
        setHistory((h) => [...h.slice(-99), game])
        if (revealsInfo(game, next)) setLocked((l) => new Set(l).add(game))
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
        setSaveFailed(false)
      } catch {
        setSaveFailed(true) // 저장 공간이 없거나 막힌 환경: 이어하기가 안 된다고 알린다
      }
    }, 600)
    return () => clearTimeout(t)
  }, [game, seats])

  // 할 일 없는 단계 자동 넘기기 (설정)
  useEffect(() => {
    if (!prefs.autoSkip || autoPaused.current || over || actorSeat.ai || curtain || pendingReport) return
    const skip = autoSkipAction(game, player)
    if (!skip) return
    const t = setTimeout(() => {
      dispatch(skip.action)
      setAutoNote(skip.reason)
    }, 250)
    return () => clearTimeout(t)
  }, [game, prefs.autoSkip, over, actorSeat.ai, curtain, pendingReport, player, dispatch])

  useTurnTitle(over ? '게임 종료' : actorSeat.ai ? `${civById(player.civId).name} 진행 중…` : `▶ ${civById(player.civId).name} 차례`)
  useEnterHotkey()

  /** history[index] 상태로 돌아간다 (그 뒤 기록은 버린다) */
  const restore = (index: number, curtainAgain: boolean) => {
    autoPaused.current = true
    setGame(history[index])
    const kept = history.slice(0, index)
    setHistory(kept)
    setLocked((l) => new Set([...l].filter((g) => kept.includes(g))))
    setError('')
    setAutoNote('')
    if (curtainAgain) setRevealed('') // 되돌린 자리가 다른 사람 차례일 수 있으니 가림막을 다시 띄운다
  }
  // 이번 차례에 한 행동들: 같은 차례 열쇠를 가진 기록이 끝에서부터 이어진 만큼 (AI 행동은 기록에 없다)
  const key = actorSeat.ai || curtain ? null : turnKey(game)
  let turnStart = history.length
  let lockedInTurn = false
  while (key && turnStart > 0 && turnKey(history[turnStart - 1]) === key) {
    if (locked.has(history[turnStart - 1])) {
      lockedInTurn = true
      break
    }
    turnStart--
  }
  const turnHistory = history.slice(turnStart)
  const undoInTurn = () => turnHistory.length && restore(history.length - 1, false)
  const jumpInTurn = (i: number) => restore(turnStart + i, false)

  const yields = player.turn?.yields
  const peekId = peek && peek.self === player.id ? peek.id : null
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
      <div className="panel waiting">
        <h3>
          🤖 {civById(player.civId).name} (AI) — {PHASE[game.phase]} 진행 중…
        </h3>
        <div className="log small">
          {game.log.slice(-6).reverse().map((l, i) => (
            <div key={i}>{l.replace(/^\[R\d+\] /, '')}</div>
          ))}
        </div>
        <small className="muted">오른쪽에서 차례 순서·선전포고·불가사의 경쟁을 볼 수 있고, 내 차례가 오면 탭 제목에 ▶ 표시가 붙습니다.</small>
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
  } else if (player.pendingTiles?.length && ['place', 'research', 'produce', 'declare'].includes(game.phase)) {
    // 문화로 얻은 타일을 먼저 붙인다
    main = <TilePlacer game={game} player={player} dispatch={dispatch} />
  } else if (game.phase === 'setup') {
    main = <SetupPanel game={game} player={player} dispatch={dispatch} />
  } else if (game.phase === 'battle' && game.battle) {
    main = <BattlePanel key={`${game.round}:${game.battle.decl.attackerId}:${game.battle.decl.tileId}:${game.battle.step}:${actor}`} game={game} player={player} dispatch={dispatch} />
  } else if (game.phase === 'place') {
    main = <PlacePanel key={`${player.id}-${game.round}`} game={game} player={player} dispatch={dispatch} />
  } else if (game.phase === 'research') {
    main = (
      <>
        <PendingPanel game={game} player={player} dispatch={dispatch} />
        <ChoicesPanel game={game} player={player} dispatch={dispatch} />
        <ScoutBox game={game} player={player} dispatch={dispatch} />
        <ResearchPanel game={game} player={player} dispatch={dispatch} />
      </>
    )
  } else if (game.phase === 'produce') {
    main = (
      <>
        <PendingPanel game={game} player={player} dispatch={dispatch} />
        <ChoicesPanel game={game} player={player} dispatch={dispatch} />
        <ScoutBox game={game} player={player} dispatch={dispatch} />
        <ProducePanel game={game} player={player} dispatch={dispatch} />
      </>
    )
  } else if (game.phase === 'declare') {
    main = player.pendingDiscard ? <DiscardPanel game={game} player={player} dispatch={dispatch} /> : <DeclarePanel game={game} player={player} dispatch={dispatch} />
  }

  if (player.pendingCardDiscard?.length && game.phase !== 'battle' && game.phase !== 'over') main = <CardDiscardPanel game={game} player={player} dispatch={dispatch} />

  const placingTile = !!player.pendingTiles?.length && !actorSeat.ai
  const showBoard = !over && !curtain && !placingTile && game.phase !== 'setup' && game.phase !== 'place' && game.phase !== 'battle'

  return (
    <div className="game">
      {pendingReport && (
        <BattleReportModal
          key={pendingReport.seq}
          game={game}
          report={pendingReport}
          viewerId={
            viewer === pendingReport.attackerId || viewer === pendingReport.defenderId
              ? viewer
              : seats[pendingReport.attackerId].ai
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
          {yields && !actorSeat.ai && game.phase !== 'battle' && (
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
          <InfoTabs game={game} viewer={player.id} />
          <details className="settings">
            <summary>⚙ 설정</summary>
            <div className="settings-menu">
            <label title="패널의 안내문을 보이거나 숨깁니다">
              <input type="checkbox" checked={prefs.help} onChange={(e) => setPrefs({ help: e.target.checked })} /> 안내문
            </label>
            <label title="선전포고·문화로 새 타일·새 시대·새 정책·새 기술 효과음">
              <input type="checkbox" checked={prefs.sound} onChange={(e) => setPrefs({ sound: e.target.checked })} /> 효과음
            </label>
            <label title="연구·생산에서 고를 것이 전혀 없으면 자동으로 넘깁니다">
              <input type="checkbox" checked={prefs.autoSkip} onChange={(e) => setPrefs({ autoSkip: e.target.checked })} /> 할 일 없으면 넘기기
            </label>
            <label>
              AI 속도{' '}
              <select value={speed} onChange={(e) => setPrefs({ aiSpeed: Number(e.target.value) })}>
                <option value={30}>매우 빠름</option>
                <option value={150}>빠름</option>
                <option value={300}>보통</option>
                <option value={800}>느림</option>
              </select>
            </label>
              <button disabled={history.length === 0} onClick={() => restore(history.length - 1, true)} title="규칙 검증용: 다른 사람·AI 차례를 넘어 마지막 사람 행동 전으로 돌아갑니다. 상대에게 공개된 정보도 되돌아갑니다.">
                ↶ 차례를 넘어 되돌리기 (검증용)
              </button>
            </div>
          </details>
          <button onClick={onExit}>나가기</button>
          <TechTreeButton player={player} />
          <CivEmblem player={player} />
        </div>
      </header>
      {error && <div className="error banner-error">⚠ {error}</div>}
      {saveFailed && <div className="error banner-error">⚠ 자동 저장에 실패했습니다 (브라우저 저장 공간이 없거나 막힘). 창을 닫으면 이어하기를 할 수 없습니다.</div>}
      {autoNote && <div className="notice">⏭ {autoNote}</div>}
      {skipsFood && !actorSeat.ai && <div className="notice">📜 이번 차례는 식량 정산을 하지 않습니다 (전통/체제). 일꾼 수는 그대로입니다.</div>}
      <div className="game-body">
        <div className="main">
          {peekId !== null ? (
            <CivPeek game={game} id={peekId} actor={actor} onBack={() => setPeek(null)} />
          ) : (
            <>
          <div className="stats">
            {player.cities.length > 0 && (
              <span>
                {ICON.culture} 문화 {culture(player)} · 관광 {tourism(player)} · <Icon name="worker" size={16} /> {totalWorkers(player)}/{happiness(player)} · <Icon name="general" size={16} /> {player.generals}
                {!actorSeat.ai && !over && game.phase !== 'setup' && <span className="muted"> · Enter: 이 단계 확정</span>}
              </span>
            )}
          </div>
          {!over && !curtain && !actorSeat.ai && game.phase !== 'setup' && game.phase !== 'battle' && player.wonders.includes('great_wall') && !player.greatWallUsed && (
            <div className="panel row">
              <ConfirmButton className="" warn="만리장성은 게임 중 한 번만 쓸 수 있습니다." onClick={() => dispatch({ type: 'useGreatWall' })} title="내 영토 위의 상대 장군을 모두 돌려보냅니다 (게임 중 1회)">
                🧱 만리장성 사용 (상대 장군 모두 돌려보냄, 1회)
              </ConfirmButton>
            </div>
          )}
          {!over && !curtain && !actorSeat.ai && game.phase !== 'setup' && game.phase !== 'battle' && <AtomicBombPanel game={game} player={player} dispatch={dispatch} />}
          {key && !over && <TurnSteps game={game} phases={turnHistory.map((h) => h.phase)} locked={lockedInTurn} onJump={jumpInTurn} onUndo={undoInTurn} />}
          {main}
          {showBoard && <Board game={game} player={player} />}
          {actorSeat.ai && !over && <Board game={game} player={player} />}
            </>
          )}
        </div>
        <SidePanel game={game} seats={seats} actor={actor} viewer={viewer} onView={(id) => setPeek(id === player.id || id === peekId ? null : { id, self: player.id })} viewing={peekId} />
      </div>
      <CivInspector game={game} seats={seats} actor={actor} />
      <LogPanel game={game} />
    </div>
  )
}
