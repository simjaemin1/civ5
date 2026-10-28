import { useEffect } from 'react'
import { CityTag, Icon } from './icons'
import type { GameState } from '../engine'
import { TURN_PHASES, WONDER_CARDS, civById, culture, happiness, totalWorkers, tourism } from '../engine'
import type { ReactNode } from 'react'
import { ActorNotice, ActorWaiting } from './ActorNotice'
import { useActorNotice, waitingText } from './actorChange'
import { Board } from './Board'
import { ICON, policyName } from './format'

/** 한 문명의 공개 정보: 요약, 직전 차례 산출, 문명 카드·정책, 점령, 영토 (기술은 맨 위 플라스크 기술표에서 문명 표시를 눌러 본다) */
export function CivDetail({ game, id, actor, notice, head, foot }: { game: GameState; id: number; actor: number; notice?: ReactNode; head?: ReactNode; foot?: ReactNode }) {
  const p = game.players[id]
  const held = p.cities.flatMap((c) => c.tiles.filter((t) => t.occupiedBy !== undefined).map((t) => ({ t, by: game.players[t.occupiedBy!] })))
  const occupying = game.players.flatMap((o) =>
    o.cities.flatMap((c) => c.tiles.filter((t) => t.occupiedBy === id).map((t) => ({ t, owner: o }))),
  )
  const y = p.turn?.yields
  const now = id === actor && TURN_PHASES.includes(game.phase)
  return (
    <>
      {/* 내정 화면과 같은 틀: 위 상자(내정 화면의 단계 패널 자리) + 아래 영토. 상자 안 기본 정보는, 이 문명이 내정 중이면 같은 자리에 진행 문구가 대신 나온다 */}
      <div className="panel peek-box">
      {head}
      <div className={`peek-info${notice ? ' noticing' : ''}`}>
      <p className="summary">
        <span>{ICON.culture} 문화 <b>{culture(p)}</b></span>
        <span>관광 <b>{tourism(p)}</b></span>
        <span title="일꾼 / 행복"><Icon name="worker" size={16} /> <b>{totalWorkers(p)}/{p.cities.length ? happiness(p) : '-'}</b></span>
        <span>기술 <b>{p.techs.length}</b></span>
        <span>정책 <b>{policyName(p.policy)}</b></span>
        <span><Icon name="general" size={16} /> 장군 <b>{p.generals}</b></span>
        <span>군사 카드 <b>{p.military.length}장</b> <small className="muted">(방향은 비공개, 종류별 보유 수는 군사 카드 탭에 공개)</small></span>
      </p>
      <p className="summary">
        <span>🏛 불가사의 <b>{p.wonders.map((w) => WONDER_CARDS.find((x) => x.id === w)?.name).join(', ') || '없음'}</b></span>
      </p>
      <p className="last-yields">
        <b>{now ? '이번 차례 산출 (진행 중)' : '직전 차례 산출'}:</b>{' '}
        {y ? (
          <>
            {y.cities.map((c) => (
              <span key={c.cityId}>
                <CityTag id={c.cityId} /> {ICON.food}
                {c.food} {ICON.hammer}
                {c.hammer}{' '}
              </span>
            ))}
            {ICON.science}
            {y.science} {ICON.gold}
            {y.gold}
          </>
        ) : (
          <span className="muted">아직 없음</span>
        )}
      </p>
      {notice}
      </div>
      {(held.length > 0 || occupying.length > 0) && (
        <p className="muted">
          {held.map(({ t, by }) => `${t.card.terrains.join('·')} 타일이 ${civById(by.civId).name}에게 점령당함`).join(' · ')}
          {held.length > 0 && occupying.length > 0 ? ' · ' : ''}
          {occupying.map(({ t, owner }) => `${civById(owner.civId).name}의 ${t.card.terrains.join('·')} 타일을 점령 중`).join(' · ')}
        </p>
      )}
      {!now && p.cities.length > 0 && <p className="muted small">아래 영토: 직전 차례 일꾼 배치</p>}
      {foot}
      </div>
      {p.cities.length ? <Board game={game} player={p} /> : <p className="panel muted">아직 도시가 없거나 탈락했습니다.</p>}
    </>
  )
}

/**
 * 차례 순서에서 고른 문명의 시점: 내 메인 칸 대신 그 문명의 공개 정보를 보여 준다.
 * 다른 문명으로 바꾸면 내용만 부드럽게 바뀐다. 기술 상태는 맨 위 플라스크 기술표에서 문명 표시를 눌러 본다.
 * 맨 아래 한 줄에 지금 내정 중인 문명이 무엇을 하는지 보여 주고, 오른쪽 아래 버튼(HomeButton)으로 내 내정 화면에 돌아간다.
 */
export function CivPeek({ game, id, actor, me, onNext, follow }: { game: GameState; id: number; actor: number; me: number; onNext?: () => void; follow?: boolean }) {
  const p = game.players[id]
  const [msg, closeMsg] = useActorNotice(game, id, actor)
  // 이 문명의 차례에 이 문명을 보고 있으면: 결정을 기다리는 동안 "기술 선택 중…", 결정하면 잠깐 결과 (생산 결과는 닫을 때까지)
  const waiting = id === actor ? waitingText(game.phase) : undefined
  // 생산 결과의 닫기: 차례가 이미 다음 문명으로 넘어갔으면 그 문명(내 차례면 내정 화면)으로 따라간다
  const close = () => {
    closeMsg()
    if (id !== actor) onNext?.()
  }
  // 따라 보기(남의 차례에 자동으로 연 시점): 차례가 넘어가면 생산 결과를 닫을 때까지 기다렸다가 다음 문명(내 차례면 내정 화면)으로 넘어간다
  const done = follow && id !== actor && !msg
  useEffect(() => {
    if (done) onNext?.()
  }, [done, onNext])
  const notice = msg ? <ActorNotice msg={msg} onClose={close} /> : waiting ? <ActorWaiting text={waiting} /> : null
  return (
    <div key={id} className="peek peek-body">
      <CivDetail
        game={game}
        id={id}
        actor={actor}
        notice={notice}
        head={
          <h3>
            👁 {civById(p.civId).name} 시점 <small className="muted">(공개 정보)</small>
          </h3>
        }
        foot={id !== actor && <ActorStrip game={game} actor={actor} me={me} />}
      />
    </div>
  )
}

const DOING: Partial<Record<GameState['phase'], string>> = {
  setup: '첫 도시를 세우는 중',
  place: '① 일꾼을 배치하는 중',
  research: '② 기술을 연구하는 중',
  produce: '③ 생산·투자를 하는 중',
  declare: '④ 선전포고를 정하는 중',
  battle: '전투를 정산하는 중',
}

/** 시점 화면 아래 한 줄: 지금 내정 중인 문명이 무엇을 하는지 (가장 최근 행동까지) */
function ActorStrip({ game, actor, me }: { game: GameState; actor: number; me: number }) {
  const doing = DOING[game.phase]
  if (!doing) return null
  const name = civById(game.players[actor].civId).name
  const last = game.phase === 'battle' ? undefined : game.log.filter((l) => l.startsWith(`[R${game.round}] ${name}`)).at(-1)
  return (
    <p className="peek-now" aria-live="polite">
      <b>
        ▶ 지금 {name}
        {actor === me ? ' (나)' : ''}
      </b>{' '}
      {doing}
      {last && <span className="muted"> · 최근: {last.replace(/^\[R\d+\] /, '')}</span>}
    </p>
  )
}

/** 시점 화면을 보는 동안 오른쪽 아래에 떠 있는 버튼: 누르면 내 내정 화면으로 돌아간다 */
export function HomeButton({ onHome, myTurn }: { onHome: () => void; myTurn: boolean }) {
  return (
    <button className={`home-fab${myTurn ? ' urgent' : ''}`} onClick={onHome} title="내 내정 화면으로 돌아갑니다">
      🏠 내정하러 가기{myTurn ? ' (내 차례)' : ''}
    </button>
  )
}
