import { useState } from 'react'
import type { PolicyId } from '../../engine'
import { MILITARY_CARDS, POLICIES, civById, happiness, producible, totalWorkers } from '../../engine'
import { CityBuilder } from './CityBuilder'
import type { PanelProps } from './types'
import { cardText, policyName } from '../format'

const ORDER: PolicyId[] = ['tradition', 'aesthetics', 'despotism', 'regime', 'liberty', 'rationalism', 'equality', 'diplomacy']

/** 연구나 불가사의로 생긴 선택(정책, 두 번째 도시, 독일의 무료 카드)을 먼저 처리한다 */
export function PendingPanel({ game, player, dispatch }: PanelProps) {
  const [dismiss, setDismiss] = useState('')
  const enemyTiles = player.cities.flatMap((c) =>
    c.tiles.filter((t) => t.occupiedBy !== undefined && t.occupiedBy !== player.id).map((t) => ({ cityId: c.id, tile: t })),
  )
  const workers = totalWorkers(player)
  const cap = player.cities.length ? happiness(player) : 0
  const choose = (id: PolicyId, discard: boolean) => {
    const [cityId, tileId] = dismiss ? dismiss.split(':').map(Number) : []
    let take: { cityId: number; count: number }[] | undefined
    if (id === 'tradition' && discard) {
      let left = 3
      take = []
      for (const c of player.cities) {
        const n = Math.min(left, c.workers)
        if (n > 0) take.push({ cityId: c.id, count: n })
        left -= n
      }
    }
    dispatch({ type: 'choosePolicy', policy: id, discard: take, dismiss: id === 'diplomacy' && dismiss ? { cityId, tileId } : undefined })
  }
  return (
    <>
      {player.pendingCity && (
        <CityBuilder
          hand={player.pendingCity}
          player={player}
          label="인쇄기술: 두 번째 도시 세우기 (문화 4)"
          onBuild={(cityTileId, sideTiles) => dispatch({ type: 'buildSecondCity', cityTileId, sideTiles })}
        />
      )}
      {player.pendingPolicies > 0 && (
        <div className="panel">
          <h3>정책 선택 ({player.pendingPolicies}회) <small className="muted">현재 정책: {policyName(player.policy)}</small></h3>
          <p className="muted">
            정책은 하나만 시행합니다. 새로 고르면 기존 정책은 끝나고, 지금 정책을 다시 골라도 "고를 때마다" 효과가 다시 발동합니다.
            일꾼 {workers}개 · 행복 한도 {cap}.
          </p>
          {enemyTiles.length > 0 && (
            <label className="muted">
              외교로 파괴할 상대 장군{' '}
              <select value={dismiss} onChange={(e) => setDismiss(e.target.value)}>
                <option value="">(고르지 않음)</option>
                {enemyTiles.map((e) => (
                  <option key={e.tile.card.id} value={`${e.cityId}:${e.tile.card.id}`}>
                    {civById(game.players[e.tile.occupiedBy!].civId).name} · {e.tile.card.terrains.join('·')}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid">
            {ORDER.map((id) => (
              <div key={id} className="policy">
                <button className={player.policy === id ? 'active' : ''} onClick={() => choose(id, false)}>
                  <b>{POLICIES[id].name}{id === 'tradition' ? ' (식량 정산만 생략)' : ''}</b>
                  <small>{POLICIES[id].desc}</small>
                </button>
                {id === 'tradition' && (
                  <button disabled={workers < 3} onClick={() => choose(id, true)} title={workers < 3 ? '일꾼이 3개 이상일 때만 버릴 수 있습니다' : ''}>
                    <b>전통 + 일꾼 3개 버리고 문화 2</b>
                    <small>{workers < 3 ? `지금 일꾼 ${workers}개라 불가능` : `일꾼 ${workers}개 → ${workers - 3}개, 타일 2장 추가`}</small>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {player.pendingFreeCards > 0 && (
        <div className="panel">
          <h3>무료 군사 카드 ({player.pendingFreeCards}장, 독일)</h3>
          <div className="list">
            {MILITARY_CARDS.flatMap((def) => {
              const entries: { def: typeof def; unique?: string }[] = [{ def }]
              for (const u of civById(player.civId).uniques) if (u.base === def.id) entries.push({ def, unique: u.name })
              return entries
                .filter((e) => producible(game, player, e.def.id, e.unique))
                .map((e) => (
                  <button key={`${e.def.id}-${e.unique}`} onClick={() => dispatch({ type: 'claimFreeCard', defId: e.def.id, unique: e.unique })}>
                    {cardText({ defId: e.def.id, unique: e.unique })}
                  </button>
                ))
            })}
          </div>
        </div>
      )}
    </>
  )
}
