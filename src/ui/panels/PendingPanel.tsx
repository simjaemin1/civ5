import { CityTag } from '../icons'
import { useState } from 'react'
import type { PolicyId } from '../../engine'
import { MILITARY_CARDS, REGIME_WORKERS, civById, happiness, producible, totalWorkers } from '../../engine'
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
  // 체제: 행복 한도 안에서 일꾼을 최대 4개 얻는다. 일꾼 1개마다 붙일 도시를 눌러 고른다 (도시가 하나면 바로 처리).
  const [alloc, setAlloc] = useState<{ policy: 'tradition' | 'regime'; need: number; counts: Record<number, number> } | null>(null)
  const taken = alloc ? Object.values(alloc.counts).reduce((n, v) => n + v, 0) : 0
  const choose = (id: PolicyId, extra?: { discard?: { cityId: number; count: number }[]; addWorkers?: { cityId: number; count: number }[] }) => {
    const [cityId, tileId] = dismiss ? dismiss.split(':').map(Number) : []
    dispatch({ type: 'choosePolicy', policy: id, ...extra, dismiss: id === 'diplomacy' && dismiss ? { cityId, tileId } : undefined })
  }
  const regimeGain = Math.min(REGIME_WORKERS, Math.max(0, cap - workers))
  const pick = (id: PolicyId) => {
    if (id === 'tradition' && workers >= 3) setAlloc({ policy: 'tradition', need: 3, counts: {} })
    else if (id === 'regime' && regimeGain > 0 && player.cities.length > 1) setAlloc({ policy: 'regime', need: regimeGain, counts: {} })
    else choose(id)
  }
  const allocOne = (cityId: number) => {
    if (!alloc) return
    const counts = { ...alloc.counts, [cityId]: (alloc.counts[cityId] ?? 0) + 1 }
    setAlloc({ ...alloc, counts })
    if (Object.values(counts).reduce((n, v) => n + v, 0) === alloc.need) {
      setAlloc(null)
      const list = Object.entries(counts).map(([id, count]) => ({ cityId: Number(id), count }))
      choose(alloc.policy, alloc.policy === 'tradition' ? { discard: list } : { addWorkers: list })
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
      {player.policyOffer && (
        <div className="panel">
          <h3>과학이론: 정책을 {policyName(player.policyOffer)}(으)로 바꾸시겠습니까?</h3>
          <p className="muted">
            얻은 시점에 한 번만 정할 수 있습니다. 바꾸지 않으면 지금 정책({policyName(player.policy)})이 그대로 이어지고 아무 효과도 다시 발동하지 않습니다.
          </p>
          <div className="row">
            <PolicyCard policy={player.policyOffer} width={150} onClick={() => dispatch({ type: 'policyOffer', accept: true })} />
            <button className="primary" onClick={() => dispatch({ type: 'policyOffer', accept: true })}>
              {policyName(player.policyOffer)}(으)로 바꾸기
            </button>
            <button onClick={() => dispatch({ type: 'policyOffer', accept: false })}>바꾸지 않기 (지금 정책 유지)</button>
          </div>
        </div>
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
                {id === 'regime' && <small className="muted">{regimeGain > 0 ? `고르면 일꾼 ${regimeGain}개를 얻고, 붙일 도시를 1개씩 고릅니다` : '행복 한도가 차서 일꾼은 못 얻음'}</small>}
              </div>
            ))}
          </div>
          {alloc && (
            <div className="panel">
              <h4>
                {alloc.policy === 'tradition'
                  ? `전통: 일꾼 3개를 버리고 문화 2를 얻습니다 — 버릴 도시를 ${alloc.need - taken}번 더 누르세요`
                  : `체제: 일꾼 ${alloc.need}개를 얻습니다 — 일꾼을 붙일 도시를 ${alloc.need - taken}번 더 누르세요 (한 번에 1개)`}
              </h4>
              <div className="row">
                {player.cities.map((c) => {
                  const n = alloc.counts[c.id] ?? 0
                  return alloc.policy === 'tradition' ? (
                    <button key={c.id} disabled={n >= c.workers} onClick={() => allocOne(c.id)}>
                      <CityTag id={c.id} /> 일꾼 {c.workers - n}명 <small>(누르면 1명 버림)</small>
                    </button>
                  ) : (
                    <button key={c.id} onClick={() => allocOne(c.id)}>
                      <CityTag id={c.id} /> 일꾼 {c.workers + n}명 {n > 0 && <small>(+{n})</small>} <small>(누르면 1명 추가)</small>
                    </button>
                  )
                })}
                <button onClick={() => setAlloc(null)}>취소</button>
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
