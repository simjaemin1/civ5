import { useEffect, useRef, useState } from 'react'
import type { Action, GameView } from '../engine'
import { actorOf, civById, culture, happiness, totalWorkers, tourism, turnKey } from '../engine'
import { Board } from '../ui/Board'
import { BattleReportModal } from '../ui/BattleReportModal'
import { CivEmblem } from '../ui/CivEmblem'
import { TechTreeButton } from '../ui/TechTreeButton'
import { CivInspector } from '../ui/CivInspector'
import { InfoTabs } from '../ui/InfoTabs'
import { SidePanel } from '../ui/SidePanel'
import { TurnSteps } from '../ui/TurnSteps'
import { autoSkipAction } from '../ui/autoSkip'
import { ICON } from '../ui/format'
import { useEnterHotkey, useTurnTitle } from '../ui/hooks'
import { CityTag, Icon } from '../ui/icons'
import { usePrefs } from '../ui/prefsStore'
import { useGameSounds } from '../ui/sounds'
import { BattlePanel } from '../ui/panels/BattlePanel'
import { ChoicesPanel } from '../ui/panels/ChoicesPanel'
import { DeclarePanel } from '../ui/panels/DeclarePanel'
import { CardDiscardPanel } from '../ui/panels/CardDiscardPanel'
import { DiscardPanel } from '../ui/panels/DiscardPanel'
import { ConfirmButton } from '../ui/ConfirmButton'
import { PendingPanel } from '../ui/panels/PendingPanel'
import { AtomicBombPanel } from '../ui/panels/AtomicBombPanel'
import { PlacePanel } from '../ui/panels/PlacePanel'
import { ProducePanel } from '../ui/panels/ProducePanel'
import { ResearchPanel } from '../ui/panels/ResearchPanel'
import { ScoutBox } from '../ui/panels/ScoutBox'
import { SetupPanel } from '../ui/panels/SetupPanel'
import { TilePlacer } from '../ui/panels/TilePlacer'
import { BattleWatch, TurnWatch } from './TurnWatch'
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
  const { view: game, room, you, send, error, undo, seq } = online
  // 접속한 시점까지의 전투는 이미 본 것으로 치고, 그 뒤에 끝난 전투부터 장면을 보여 준다 (렌더 때마다 새로 계산하면 영영 안 뜬다)
  const [seenBattle, setSeenBattle] = useState<number>(() => online.view?.battleReports?.at(-1)?.seq ?? 0)
  const [autoNote, setAutoNote] = useState('')
  const { prefs, set: setPrefs } = usePrefs()
  useGameSounds(game, game?.viewer)
  // 되돌린 직후에는 자동 넘기기를 멈춘다 (되돌리자마자 다시 넘어가지 않게). 같은 상태에 두 번 보내지 않게 보낸 seq를 기억한다
  const autoPaused = useRef(false)
  const autoSentSeq = useRef(-1)

  const mine = !!game && isMyTurn(game)
  const over = game?.phase === 'over'
  const me = game ? game.players[game.viewer] : null
  const actorName = game ? civById(game.players[actorOf(game)].civId).name : ''
  useTurnTitle(!game ? '접속 중' : over ? '게임 종료' : mine ? '▶ 내 차례' : `${actorName} 차례 기다리는 중`)
  useEnterHotkey()

  const dispatch = (a: Action, auto = false) => {
    if (!auto) autoPaused.current = false
    if (!auto) setAutoNote('')
    send({ type: 'action', action: a })
  }
  const undoTurn = (steps: number) => {
    autoPaused.current = true
    setAutoNote('')
    send({ type: 'undoTurn', steps })
  }

  // 할 일 없는 단계 자동 넘기기 (설정)
  useEffect(() => {
    if (!game || !me || !prefs.autoSkip || autoPaused.current || !mine || over || autoSentSeq.current === seq) return
    const skip = autoSkipAction(game, me)
    if (!skip) return
    const t = setTimeout(() => {
      autoSentSeq.current = seq
      send({ type: 'action', action: skip.action })
      setAutoNote(skip.reason)
    }, 250)
    return () => clearTimeout(t)
  }, [game, me, prefs.autoSkip, mine, over, seq, send])

  if (!game || !room || !you || !me) return <p className="muted">게임 정보를 받는 중…</p>

  // 전투 결과: 한 번에 여러 개 끝나도 오래된 것부터 하나씩. 접속한 시점까지의 전투는 이미 본 것으로 친다
  const reports = game.battleReports ?? []
  const pendingReport = reports.find((r) => r.seq > seenBattle) ?? null

  const actor = actorOf(game)
  const actorPlayer = game.players[actor]
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
      <>
        <div className="panel waiting" data-testid="waiting">
          <h3>
            ⏳ {civById(actorPlayer.civId).name}({seats[actor]?.name}){seats[actor]?.ai ? ' 🤖' : ''} — {PHASE[game.phase]} 기다리는 중…
          </h3>
          {seats[actor] && !seats[actor].ai && !seats[actor].connected && <p className="error">접속이 끊겨 있습니다. 돌아올 때까지 기다립니다.</p>}
          <small className="muted">내 차례가 오면 탭 제목에 ▶ 표시가 붙습니다. 아래에서 상대가 하는 일을 볼 수 있습니다.</small>
        </div>
        {game.phase === 'battle' && b ? <BattleWatch game={game} viewer={me.id} /> : <TurnWatch game={game} actor={actor} name={seats[actor]?.name ?? ''} />}
      </>
    )
  } else if (me.pendingTiles?.length && ['place', 'research', 'produce', 'declare'].includes(game.phase)) {
    main = <TilePlacer game={game} player={me} dispatch={dispatch} />
  } else if (game.phase === 'setup') {
    main = <SetupPanel game={game} player={me} dispatch={dispatch} />
  } else if (game.phase === 'battle' && game.battle) {
    main = <BattlePanel key={`${game.round}:${game.battle.decl.attackerId}:${game.battle.decl.tileId}:${game.battle.step}`} game={game} player={me} dispatch={dispatch} />
  } else if (game.phase === 'place') {
    main = <PlacePanel key={`${me.id}-${game.round}`} game={game} player={me} dispatch={dispatch} />
  } else if (game.phase === 'research') {
    main = (
      <>
        <PendingPanel game={game} player={me} dispatch={dispatch} />
        <ChoicesPanel game={game} player={me} dispatch={dispatch} />
        <ScoutBox game={game} player={me} dispatch={dispatch} />
        <ResearchPanel game={game} player={me} dispatch={dispatch} />
      </>
    )
  } else if (game.phase === 'produce') {
    main = (
      <>
        <PendingPanel game={game} player={me} dispatch={dispatch} />
        <ChoicesPanel game={game} player={me} dispatch={dispatch} />
        <ScoutBox game={game} player={me} dispatch={dispatch} />
        <ProducePanel game={game} player={me} dispatch={dispatch} />
      </>
    )
  } else if (game.phase === 'declare') {
    main = me.pendingDiscard ? <DiscardPanel game={game} player={me} dispatch={dispatch} /> : <DeclarePanel game={game} player={me} dispatch={dispatch} />
  }

  const yields = me.turn?.yields
  if (me.pendingCardDiscard?.length && game.phase !== 'battle' && game.phase !== 'over') main = <CardDiscardPanel game={game} player={me} dispatch={dispatch} />

  const placingTile = !!me.pendingTiles?.length
  const showBoard = !over && mine && !placingTile && game.phase !== 'setup' && game.phase !== 'place' && game.phase !== 'battle'
  const inTurn = mine && !over && turnKey(game) !== null

  return (
    <div className="game">
      {pendingReport && <BattleReportModal key={pendingReport.seq} game={game} report={pendingReport} viewerId={pendingReport.attackerId === game.viewer || pendingReport.defenderId === game.viewer ? game.viewer : pendingReport.attackerId} onClose={() => setSeenBattle(pendingReport.seq)} />}
      <header className="top">
        <div>
          <b>라운드 {game.round}</b> · {PHASE[game.phase]} · <span className="who">{civById(actorPlayer.civId).name}</span>
          {mine && !over ? ' 👈 내 차례' : ''}
        </div>
        <div className="row">
          <span data-testid="conn" style={{ opacity: 0.85 }}>
            방 {room.id} · {online.status === 'open' ? '🟢 연결됨' : '🔴 다시 연결 중…'}
          </span>
          {yields && mine && game.phase !== 'battle' && (
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
          <InfoTabs game={game} viewer={me.id} />
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
              {you.host && (
                <>
                  <button
                    onClick={() => {
                      autoPaused.current = true
                      send({ type: 'undo' })
                    }}
                    title="방장 전용: 차례를 넘어 마지막 사람 행동 하나를 되돌립니다 (상대에게 공개된 정보도 되돌아갑니다)"
                  >
                    ↶ 차례를 넘어 되돌리기 (방장)
                  </button>
                  <button onClick={() => confirm('방을 폭파할까요? 모두 쫓겨나고 기록이 지워집니다.') && send({ type: 'closeRoom' })}>💣 방 폭파</button>
                </>
              )}
            </div>
          </details>
          <button onClick={onExit}>나가기</button>
          <TechTreeButton player={me} />
          <CivEmblem player={me} />
        </div>
      </header>
      {error && (
        <div className="error banner-error" data-testid="error">
          ⚠ {error}
        </div>
      )}
      {autoNote && <div className="notice">⏭ {autoNote}</div>}
      {me.turn?.skipFoodSettle && mine && <div className="notice">📜 이번 차례는 식량 정산을 하지 않습니다 (전통/체제). 일꾼 수는 그대로입니다.</div>}
      <div className="game-body">
        <div className="main">
          <div className="stats">
            {me.cities.length > 0 && (
              <span>
                나: {civById(me.civId).name} · {ICON.culture} 문화 {culture(me)} · 관광 {tourism(me)} · <Icon name="worker" size={16} /> {totalWorkers(me)}/{happiness(me)} ·{' '}
                <Icon name="general" size={16} /> {me.generals}
                {inTurn && <span className="muted"> · Enter: 이 단계 확정</span>}
              </span>
            )}
          </div>
          {mine && !over && game.phase !== 'setup' && game.phase !== 'battle' && me.wonders.includes('great_wall') && !me.greatWallUsed && (
            <div className="panel row">
              <ConfirmButton className="" warn="만리장성은 게임 중 한 번만 쓸 수 있습니다." onClick={() => dispatch({ type: 'useGreatWall' })} title="내 영토 위의 상대 장군을 모두 돌려보냅니다 (게임 중 1회)">
                🧱 만리장성 사용 (상대 장군 모두 돌려보냄, 1회)
              </ConfirmButton>
            </div>
          )}
          {mine && !over && game.phase !== 'setup' && game.phase !== 'battle' && <AtomicBombPanel game={game} player={me} dispatch={dispatch} />}
          {inTurn && <TurnSteps game={game} phases={undo.phases} locked={undo.locked} onUndo={() => undoTurn(1)} onJump={(i) => undoTurn(undo.phases.length - i)} />}
          {main}
          {showBoard && <Board game={game} player={me} />}
          {!mine && !over && me.cities.length > 0 && <Board game={game} player={me} />}
        </div>
        <SidePanel game={game} seats={seats} actor={actor} viewer={me.id} />
      </div>
      <CivInspector game={game} seats={seats} actor={actor} />
    </div>
  )
}
