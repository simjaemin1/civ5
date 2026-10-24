import { useState } from 'react'
import type { GameState } from '../engine'
import { WONDER_CARDS, civById, culture, happiness, totalWorkers, tourism } from '../engine'
import { Board } from './Board'
import { TechTree } from './InfoTabs'
import { CivCard } from './cards/CivCard'
import { PolicyCard } from './cards/PolicyCard'
import { policyName } from './format'

interface Props {
  game: GameState
  seats: { ai: boolean }[]
  actor: number
}

/** 문명별 현황: 다른 문명의 타일·기술·정책·불가사의를 언제든 확인한다 (공개 정보). 군사 카드는 장수만 보이고 공격 방향은 비공개다. */
export function CivInspector({ game, seats, actor }: Props) {
  const defaultId = game.order.find((id) => id !== actor && !game.players[id].eliminated) ?? actor
  const [sel, setSel] = useState<number | null>(null)
  const [tab, setTab] = useState<'land' | 'tech'>('land')
  const id = sel ?? defaultId
  const p = game.players[id]
  const held = p.cities.flatMap((c) => c.tiles.filter((t) => t.occupiedBy !== undefined).map((t) => ({ t, by: game.players[t.occupiedBy!] })))
  const occupying = game.players.flatMap((o) =>
    o.cities.flatMap((c) => c.tiles.filter((t) => t.occupiedBy === id).map((t) => ({ t, owner: o }))),
  )

  return (
    <div className="panel">
      <h3>문명별 현황 <small className="muted">(공개 정보)</small></h3>
      <div className="tabs">
        {game.order.map((pid) => {
          const o = game.players[pid]
          return (
            <button key={pid} className={pid === id ? 'active' : ''} onClick={() => setSel(pid)}>
              {civById(o.civId).name} {seats[pid]?.ai ? '🤖' : '👤'}
              {pid === actor ? ' ◀' : ''}
              {o.eliminated ? ' ✕' : ''}
            </button>
          )
        })}
      </div>
      <p className="summary">
        <span>문화 <b>{culture(p)}</b></span>
        <span>관광 <b>{tourism(p)}</b></span>
        <span>일꾼/행복 <b>{totalWorkers(p)}/{p.cities.length ? happiness(p) : '-'}</b></span>
        <span>기술 <b>{p.techs.length}</b></span>
        <span>정책 <b>{policyName(p.policy)}</b></span>
        <span>장군 <b>{p.generals}</b></span>
        <span>군사 카드 <b>{p.military.length}장</b> <small className="muted">(방향은 비공개, 생산 내역은 로그)</small></span>
        <span>불가사의 <b>{p.wonders.map((w) => WONDER_CARDS.find((x) => x.id === w)?.name).join(', ') || '없음'}</b></span>
      </p>
      <div className="row">
        <CivCard civId={p.civId} width={260} />
        {p.policy && <PolicyCard policy={p.policy} width={110} active />}
        {p.policy && <small className="muted">시행 중인 정책</small>}
      </div>
      {(held.length > 0 || occupying.length > 0) && (
        <p className="muted">
          {held.map(({ t, by }) => `${t.card.terrains.join('·')} 타일이 ${civById(by.civId).name}에게 점령당함`).join(' · ')}
          {held.length > 0 && occupying.length > 0 ? ' · ' : ''}
          {occupying.map(({ t, owner }) => `${civById(owner.civId).name}의 ${t.card.terrains.join('·')} 타일을 점령 중`).join(' · ')}
        </p>
      )}
      <div className="tabs">
        <button className={tab === 'land' ? 'active' : ''} onClick={() => setTab('land')}>영토 ({culture(p)}장)</button>
        <button className={tab === 'tech' ? 'active' : ''} onClick={() => setTab('tech')}>기술 ({p.techs.length}개)</button>
      </div>
      {tab === 'land' ? (p.cities.length ? <Board game={game} player={p} /> : <p className="muted">아직 도시가 없거나 탈락했습니다.</p>) : <TechTree player={p} />}
    </div>
  )
}
