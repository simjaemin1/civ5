import { CityTag, Icon } from './icons'
import { useState } from 'react'
import type { GameState } from '../engine'
import { TURN_PHASES, WONDER_CARDS, civById, culture, happiness, totalWorkers, tourism } from '../engine'
import { Board } from './Board'
import { TechTree } from './InfoTabs'
import { ICON, policyName } from './format'

/** 한 문명의 공개 정보: 요약, 직전 차례 산출, 문명 카드·정책, 점령, 영토·기술 */
export function CivDetail({ game, id, actor }: { game: GameState; id: number; actor: number }) {
  const [tab, setTab] = useState<'land' | 'tech'>('land')
  const p = game.players[id]
  const held = p.cities.flatMap((c) => c.tiles.filter((t) => t.occupiedBy !== undefined).map((t) => ({ t, by: game.players[t.occupiedBy!] })))
  const occupying = game.players.flatMap((o) =>
    o.cities.flatMap((c) => c.tiles.filter((t) => t.occupiedBy === id).map((t) => ({ t, owner: o }))),
  )
  const y = p.turn?.yields
  const now = id === actor && TURN_PHASES.includes(game.phase)
  return (
    <>
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
      {(held.length > 0 || occupying.length > 0) && (
        <p className="muted">
          {held.map(({ t, by }) => `${t.card.terrains.join('·')} 타일이 ${civById(by.civId).name}에게 점령당함`).join(' · ')}
          {held.length > 0 && occupying.length > 0 ? ' · ' : ''}
          {occupying.map(({ t, owner }) => `${civById(owner.civId).name}의 ${t.card.terrains.join('·')} 타일을 점령 중`).join(' · ')}
        </p>
      )}
      <div className="tabs">
        <button className={tab === 'land' ? 'active' : ''} onClick={() => setTab('land')}>영토 ({culture(p)}장){now ? '' : ' · 직전 차례 일꾼 배치'}</button>
        <button className={tab === 'tech' ? 'active' : ''} onClick={() => setTab('tech')}>기술 ({p.techs.length}개)</button>
      </div>
      {tab === 'land' ? (p.cities.length ? <Board game={game} player={p} /> : <p className="muted">아직 도시가 없거나 탈락했습니다.</p>) : <TechTree player={p} />}
    </>
  )
}

/** 차례 순서에서 고른 문명의 시점: 내 메인 칸 대신 그 문명의 공개 정보를 보여 준다 */
export function CivPeek({ game, id, actor, onBack }: { game: GameState; id: number; actor: number; onBack: () => void }) {
  const p = game.players[id]
  return (
    <div className="panel peek">
      <div className="peek-bar">
        <h3>👁 {civById(p.civId).name} 시점 <small className="muted">(공개 정보)</small></h3>
        <button className="primary" onClick={onBack}>← 내 화면으로</button>
      </div>
      <CivDetail key={id} game={game} id={id} actor={actor} />
    </div>
  )
}
