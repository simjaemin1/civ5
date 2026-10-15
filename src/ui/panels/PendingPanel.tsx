import { useState } from 'react'
import type { PolicyId } from '../../engine'
import { MILITARY_CARDS, POLICIES, civById, producible } from '../../engine'
import { CityBuilder } from './CityBuilder'
import type { PanelProps } from './types'
import { cardLine, DIR_LABEL } from '../format'

const ORDER: PolicyId[] = ['tradition', 'aesthetics', 'despotism', 'regime', 'liberty', 'rationalism', 'equality', 'diplomacy']

/** 연구나 불가사의로 생긴 선택(정책, 두 번째 도시, 독일의 무료 카드)을 먼저 처리한다 */
export function PendingPanel({ game, player, dispatch }: PanelProps) {
  const [discard, setDiscard] = useState(false)
  const [dismiss, setDismiss] = useState('')
  const enemyTiles = player.cities.flatMap((c) =>
    c.tiles.filter((t) => t.occupiedBy !== undefined && t.occupiedBy !== player.id).map((t) => ({ cityId: c.id, tile: t })),
  )
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
          <h3>정책 선택 ({player.pendingPolicies}회)</h3>
          <label className="muted">
            <input type="checkbox" checked={discard} onChange={(e) => setDiscard(e.target.checked)} /> 전통: 일꾼 3개를 버리고 문화 2 얻기
          </label>
          {enemyTiles.length > 0 && (
            <label className="muted">
              {' '}
              외교: 파괴할 상대 장군{' '}
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
              <button
                key={id}
                className={player.policy === id ? 'active' : ''}
                title={POLICIES[id].desc}
                onClick={() => {
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
                }}
              >
                <b>{POLICIES[id].name}</b>
                <small>{POLICIES[id].desc}</small>
              </button>
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
                .flatMap((e) =>
                  (e.def.variantDirs ?? [undefined]).filter((d) => !d || game.cardPool[e.def.id].includes(d)).map((dir) => (
                    <button key={`${e.def.id}-${e.unique}-${dir}`} onClick={() => dispatch({ type: 'claimFreeCard', defId: e.def.id, dir, unique: e.unique })}>
                      {cardLine(e.def, dir, e.unique)} {dir ? `[${DIR_LABEL[dir]}]` : ''}
                    </button>
                  )),
                )
            })}
          </div>
        </div>
      )}
    </>
  )
}
