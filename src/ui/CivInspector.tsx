import { CityTag, Icon } from './icons'
import { useState } from 'react'
import type { GameState } from '../engine'
import { TURN_PHASES, WONDER_CARDS, civById, culture, happiness, totalWorkers, tourism } from '../engine'
import { Board } from './Board'
import { TechTree } from './InfoTabs'
import { ICON, policyName } from './format'

/** 한 문명의 공개 정보: 요약, 직전 차례 산출, 문명 카드·정책, 점령, 영토·기술 */
export type PeekTab = 'land' | 'tech'

/** 영토·기술 고르기 (시점 화면 맨 위 줄) */
export function PeekTabs({ game, id, actor, tab, onTab }: { game: GameState; id: number; actor: number; tab: PeekTab; onTab: (t: PeekTab) => void }) {
  const p = game.players[id]
  const now = id === actor && TURN_PHASES.includes(game.phase)
  return (
    <div className="tabs peek-tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'land'} className={tab === 'land' ? 'active' : ''} onClick={() => onTab('land')}>
        영토 ({culture(p)}장){now ? '' : ' · 직전 차례 일꾼 배치'}
      </button>
      <button role="tab" aria-selected={tab === 'tech'} className={tab === 'tech' ? 'active' : ''} onClick={() => onTab('tech')}>
        기술 ({p.techs.length}개)
      </button>
    </div>
  )
}

export function CivDetail({ game, id, actor, tab }: { game: GameState; id: number; actor: number; tab: PeekTab }) {
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
      {tab === 'land' ? (p.cities.length ? <Board game={game} player={p} /> : <p className="muted">아직 도시가 없거나 탈락했습니다.</p>) : <TechTree player={p} />}
    </>
  )
}

/**
 * 차례 순서에서 고른 문명의 시점: 내 메인 칸 대신 그 문명의 공개 정보를 보여 준다.
 * 영토·기술 중 고른 쪽은 다른 문명으로 바꿔도 그대로 유지하고, 내용만 부드럽게 바뀐다.
 * 내 화면으로는 차례 순서에서 내 문명(또는 보고 있는 문명)을 다시 누르면 돌아간다.
 */
export function CivPeek({ game, id, actor }: { game: GameState; id: number; actor: number }) {
  const p = game.players[id]
  const [tab, setTab] = useState<PeekTab>('land')
  return (
    <div className="panel peek">
      <div className="peek-bar">
        <h3>👁 {civById(p.civId).name} 시점 <small className="muted">(공개 정보)</small></h3>
        <PeekTabs game={game} id={id} actor={actor} tab={tab} onTab={setTab} />
      </div>
      <div key={id} className="peek-body">
        <CivDetail game={game} id={id} actor={actor} tab={tab} />
      </div>
    </div>
  )
}
