import { CityTag, Icon } from './icons'
import type { GameState } from '../engine'
import { TURN_PHASES, WONDER_CARDS, civById, culture, happiness, totalWorkers, tourism } from '../engine'
import type { ReactNode } from 'react'
import { ActorNotice } from './ActorNotice'
import { useActorNotice } from './actorChange'
import { Board } from './Board'
import { ICON, policyName } from './format'

/** 한 문명의 공개 정보: 요약, 직전 차례 산출, 문명 카드·정책, 점령, 영토 (기술은 맨 위 플라스크 기술표에서 문명 표시를 눌러 본다) */
export function CivDetail({ game, id, actor, notice }: { game: GameState; id: number; actor: number; notice?: ReactNode }) {
  const p = game.players[id]
  const held = p.cities.flatMap((c) => c.tiles.filter((t) => t.occupiedBy !== undefined).map((t) => ({ t, by: game.players[t.occupiedBy!] })))
  const occupying = game.players.flatMap((o) =>
    o.cities.flatMap((c) => c.tiles.filter((t) => t.occupiedBy === id).map((t) => ({ t, owner: o }))),
  )
  const y = p.turn?.yields
  const now = id === actor && TURN_PHASES.includes(game.phase)
  return (
    <>
      {/* 기본 정보 상자: 이 문명이 내정에서 행동을 확정하면 같은 자리·같은 크기로 잠깐 안내가 대신 나온다 */}
      <div className={`peek-info${notice ? ' noticing' : ''}`}>
      <p className="summary">
        <span>{ICON.culture} 문화 <b>{culture(p)}</b></span>
        <span>관광 <b>{tourism(p)}</b></span>
        <span title="일꾼 / 행복"><Icon name="worker" size={16} /> <b>{totalWorkers(p)}/{p.cities.length ? happiness(p) : '-'}</b></span>
        <span>기술 <b>{p.techs.length}</b></span>
        <span>정책 <b>{policyName(p.policy)}</b></span>
        <span><Icon name="general" size={16} /> 장군 <b>{p.generals}</b></span>
        <span>군사 카드 <b>{p.military.length}장</b> <small className="muted">(방향은 비공개, 종류별 보유 수는 군사 카드 탭에 공개)</small></span>
        <span>불가사의 <b>{p.wonders.map((w) => WONDER_CARDS.find((x) => x.id === w)?.name).join(', ') || '없음'}</b></span>
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
      {!now && p.cities.length > 0 && <p className="muted small">영토: 직전 차례 일꾼 배치</p>}
      {p.cities.length ? <Board game={game} player={p} /> : <p className="muted">아직 도시가 없거나 탈락했습니다.</p>}
    </>
  )
}

/**
 * 차례 순서에서 고른 문명의 시점: 내 메인 칸 대신 그 문명의 공개 정보를 보여 준다.
 * 다른 문명으로 바꾸면 내용만 부드럽게 바뀐다. 기술 상태는 맨 위 플라스크 기술표에서 문명 표시를 눌러 본다.
 * 맨 아래 한 줄에 지금 내정 중인 문명이 무엇을 하는지 보여 주고, 오른쪽 아래 버튼(HomeButton)으로 내 내정 화면에 돌아간다.
 */
export function CivPeek({ game, id, actor, me }: { game: GameState; id: number; actor: number; me: number }) {
  const p = game.players[id]
  const msg = useActorNotice(game, id, actor)
  return (
    <div className="panel peek">
      <div className="peek-bar">
        <h3>👁 {civById(p.civId).name} 시점 <small className="muted">(공개 정보)</small></h3>
      </div>
      <div key={id} className="peek-body">
        <CivDetail game={game} id={id} actor={actor} notice={msg && <ActorNotice msg={msg} />} />
      </div>
      <ActorStrip game={game} actor={actor} me={me} />
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
