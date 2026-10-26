import { CityTag } from '../icons'
import { useState } from 'react'
import type { PolicyId } from '../../engine'
import { MILITARY_CARDS, civById, happiness, producible, totalWorkers } from '../../engine'
import { PolicyCard } from '../cards/PolicyCard'
import { CityBuilder } from './CityBuilder'
import type { PanelProps } from './types'
import { policyName } from '../format'
import { Help } from '../prefs'
import { UnitCard } from '../cards/UnitCard'
import { catalogCard } from '../cards/unitImage'

const ORDER: PolicyId[] = ['tradition', 'aesthetics', 'despotism', 'regime', 'liberty', 'rationalism', 'equality', 'diplomacy']

/** 연구나 불가사의로 생긴 선택(정책, 두 번째 도시, 독일의 무료 카드)을 먼저 처리한다 */
export function PendingPanel({ game, player, dispatch }: PanelProps) {
  // 외교로 파괴할 상대 장군: 있으면 첫 번째를 기본으로 골라 둔다 (고르지 않고 외교를 골라 효과를 날리지 않게)
  const [dismiss, setDismiss] = useState(() => {
    for (const c of player.cities) for (const t of c.tiles) if (t.occupiedBy !== undefined && t.occupiedBy !== player.id) return `${c.id}:${t.card.id}`
    return ''
  })
  const enemyTiles = player.cities.flatMap((c) =>
    c.tiles.filter((t) => t.occupiedBy !== undefined && t.occupiedBy !== player.id).map((t) => ({ cityId: c.id, tile: t })),
  )
  const workers = totalWorkers(player)
  const cap = player.cities.length ? happiness(player) : 0
  // 전통: 일꾼이 3개 이상이면 자동으로 "일꾼 3개 버리고 문화 2"로 처리한다. 버릴 도시는 도시를 눌러 한 명씩 고른다.
  const [trad, setTrad] = useState<Record<number, number> | null>(null)
  const taken = trad ? Object.values(trad).reduce((n, v) => n + v, 0) : 0
  const choose = (id: PolicyId, discard?: { cityId: number; count: number }[]) => {
    const [cityId, tileId] = dismiss ? dismiss.split(':').map(Number) : []
    dispatch({ type: 'choosePolicy', policy: id, discard, dismiss: id === 'diplomacy' && dismiss ? { cityId, tileId } : undefined })
  }
  const pick = (id: PolicyId) => {
    if (id === 'tradition' && workers >= 3) setTrad({})
    else choose(id)
  }
  const discardOne = (cityId: number) => {
    const next = { ...(trad ?? {}), [cityId]: ((trad ?? {})[cityId] ?? 0) + 1 }
    setTrad(next)
    if (Object.values(next).reduce((n, v) => n + v, 0) === 3) {
      setTrad(null)
      choose('tradition', Object.entries(next).map(([id, count]) => ({ cityId: Number(id), count })))
    }
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
          <div className="cardgrid">
            {ORDER.map((id) => (
              <div key={id} className="policy-pick">
                <PolicyCard policy={id} width={150} active={player.policy === id} onClick={() => pick(id)} />
                {id === 'tradition' && <small className="muted">{workers >= 3 ? '고르면 일꾼 3개를 버리고 문화 2' : `일꾼 ${workers}개라 문화 2는 못 받음`}</small>}
              </div>
            ))}
          </div>
          {trad && (
            <div className="panel">
              <h4>전통: 일꾼 3개를 버리고 문화 2를 얻습니다 — 버릴 도시를 {3 - taken}번 더 누르세요</h4>
              <div className="row">
                {player.cities.map((c) => (
                  <button key={c.id} disabled={(trad[c.id] ?? 0) >= c.workers} onClick={() => discardOne(c.id)}>
                    <CityTag id={c.id} /> 일꾼 {c.workers - (trad[c.id] ?? 0)}명 <small>(누르면 1명 버림)</small>
                  </button>
                ))}
                <button onClick={() => setTrad(null)}>취소</button>
              </div>
            </div>
          )}
          <Help>카드를 누르면 그 정책을 고릅니다.</Help>
        </div>
      )}
      {player.pendingFreeCards > 0 && (
        <div className="panel">
          <h3>무료 군사 카드 ({player.pendingFreeCards}장, 독일)</h3>
          <div className="unit-row">
            {MILITARY_CARDS.flatMap((def) => {
              const entries: { def: typeof def; unique?: string }[] = [{ def }]
              for (const u of civById(player.civId).uniques) if (u.base === def.id) entries.push({ def, unique: u.name })
              return entries
                .filter((e) => producible(game, player, e.def.id, e.unique))
                .map((e) => (
                  <UnitCard key={`${e.def.id}-${e.unique}`} card={catalogCard(e.def.id, e.unique)} width={120} onClick={() => dispatch({ type: 'claimFreeCard', defId: e.def.id, unique: e.unique })} title="누르면 이 카드를 받습니다" />
                ))
            })}
          </div>
        </div>
      )}
    </>
  )
}
