import { useState } from 'react'
import type { PolicyId } from '../../engine'
import { MILITARY_CARDS, civById, happiness, producible, totalWorkers } from '../../engine'
import { PolicyCard } from '../cards/PolicyCard'
import { CityBuilder } from './CityBuilder'
import type { PanelProps } from './types'
import { cardText, policyName } from '../format'
import { Help } from '../prefs'

const ORDER: PolicyId[] = ['tradition', 'aesthetics', 'despotism', 'regime', 'liberty', 'rationalism', 'equality', 'diplomacy']

/** 연구나 불가사의로 생긴 선택(정책, 두 번째 도시, 독일의 무료 카드)을 먼저 처리한다 */
export function PendingPanel({ game, player, dispatch }: PanelProps) {
  // 외교로 파괴할 상대 장군: 있으면 첫 번째를 기본으로 골라 둔다 (고르지 않고 외교를 골라 효과를 날리지 않게)
  const [dismiss, setDismiss] = useState(() => {
    for (const c of player.cities) for (const t of c.tiles) if (t.occupiedBy !== undefined && t.occupiedBy !== player.id) return `${c.id}:${t.card.id}`
    return ''
  })
  // 전통으로 버릴 일꾼 3개 중 첫 도시에서 버릴 개수 (도시가 둘일 때)
  const [c1, c2] = player.cities
  const minFirst = c2 ? Math.max(0, 3 - c2.workers) : 3
  const maxFirst = c1 ? Math.min(3, c1.workers) : 0
  const [firstCount, setFirstCount] = useState(() => Math.min(maxFirst, Math.max(minFirst, 3)))
  const enemyTiles = player.cities.flatMap((c) =>
    c.tiles.filter((t) => t.occupiedBy !== undefined && t.occupiedBy !== player.id).map((t) => ({ cityId: c.id, tile: t })),
  )
  const workers = totalWorkers(player)
  const cap = player.cities.length ? happiness(player) : 0
  const choose = (id: PolicyId, discard: boolean) => {
    const [cityId, tileId] = dismiss ? dismiss.split(':').map(Number) : []
    let take: { cityId: number; count: number }[] | undefined
    if (id === 'tradition' && discard) {
      // 도시가 둘이면 첫 도시에서 버릴 개수를 고른다 (규칙: 버릴 일꾼은 플레이어가 고른다)
      const [c1, c2] = player.cities
      const n1 = c2 ? Math.min(c1.workers, Math.max(firstCount, 3 - c2.workers)) : 3
      take = [{ cityId: c1.id, count: n1 }, ...(c2 && 3 - n1 > 0 ? [{ cityId: c2.id, count: 3 - n1 }] : [])].filter((x) => x.count > 0)
    }
    dispatch({ type: 'choosePolicy', policy: id, discard: take, dismiss: id === 'diplomacy' && dismiss ? { cityId, tileId } : undefined })
  }
  return (
    <>
      {player.pendingCity && (
        <CityBuilder
          key={player.pendingCity.map((c) => c.id).join(',')}
          hand={player.pendingCity}
          player={player}
          label="인쇄기술: 두 번째 도시 세우기 (문화 4)"
          onBuild={(cityTileId, sideTiles) => dispatch({ type: 'buildSecondCity', cityTileId, sideTiles })}
        />
      )}
      {player.pendingPolicies > 0 && (
        <div className="panel">
          <h3>정책 선택 ({player.pendingPolicies}회) <small className="muted">현재 정책: {policyName(player.policy)}</small></h3>
          <Help>정책은 하나만 시행합니다. 새로 고르면 기존 정책은 끝나고, 지금 정책을 다시 골라도 "고를 때마다" 효과가 다시 발동합니다.</Help>
          <p className="muted">
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
          <div className="cardgrid">
            {ORDER.map((id) => (
              <div key={id} className="policy-pick">
                <PolicyCard
                  policy={id}
                  width={150}
                  active={player.policy === id}
                  onClick={() => choose(id, false)}
                />
                {id === 'tradition' && (
                  <button disabled={workers < 3} onClick={() => choose(id, true)} title={workers < 3 ? '일꾼이 3개 이상일 때만 버릴 수 있습니다' : ''}>
                    <b>전통 + 일꾼 3개 버리고 문화 2</b>
                    <small>{workers < 3 ? `지금 일꾼 ${workers}개라 불가능` : ` 일꾼 ${workers}개 → ${workers - 3}개, 타일 2장 추가`}</small>
                  </button>
                )}
                {id === 'tradition' && c2 && workers >= 3 && minFirst < maxFirst && (
                  <label className="small">
                    버릴 일꾼: 도시1에서{' '}
                    <select value={Math.min(maxFirst, Math.max(minFirst, firstCount))} onChange={(e) => setFirstCount(Number(e.target.value))}>
                      {Array.from({ length: maxFirst - minFirst + 1 }, (_, i) => minFirst + i).map((n) => (
                        <option key={n} value={n}>
                          {n}개 · 도시2에서 {3 - n}개
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            ))}
          </div>
          <Help>카드를 누르면 그 정책을 고릅니다.</Help>
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
