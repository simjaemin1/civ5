import { useState } from 'react'
import { MILITARY_CARDS, cardById, cardCost, civById, investableWonders, minHammers, producible, uniqueOf, upgradeTargets, TECHS, occupiedTiles } from '../../engine'
import { UnitCard } from '../cards/UnitCard'
import { catalogCard } from '../cards/unitImage'
import { WonderCard } from '../cards/WonderCard'
import { conditionText, ICON, wonderEffectText } from '../format'
import type { PanelProps } from './types'

export function ProducePanel({ game, player, dispatch }: PanelProps) {
  const turn = player.turn!
  const civ = civById(player.civId)
  // 정책을 고를 차례가 남아 있으면 정책부터 (정책 조건이 붙은 불가사의가 틀어지지 않게)
  const mustPolicy = player.pendingPolicies > 0
  const [amounts, setAmounts] = useState<Record<string, number>>({})

  const upgrades = player.military
    .map((c) => ({ inst: c, lower: cardById(c.defId), options: upgradeTargets(player, c) }))
    .filter((x) => x.options.length > 0)

  const enemyExtra = game.players.flatMap((o) =>
    o.cities.flatMap((c) => c.tiles.filter((t) => t.occupiedBy === player.id && t.role === 'extra').map((t) => ({ o, c, t }))),
  )

  return (
    <div className="panel">
      <h3>생산 (도시마다 1개: 군사 카드 또는 불가사의 투자)</h3>
      {mustPolicy && <p className="enemy-pick">정책을 먼저 고르세요. 정책을 고른 뒤에 생산·투자·승급할 수 있습니다.</p>}
      <p className="muted">
        {ICON.gold} 금 {turn.yields.gold} (승급에만 사용) · 쓰지 않은 망치와 금은 사라집니다.
      </p>
      {player.cities.map((city) => {
        const h = turn.yields.cities.find((c) => c.cityId === city.id)!.hammer
        const done = turn.produced.includes(city.id)
        const wonders = investableWonders(game, player, city)
        return (
          <section key={city.id} className="city-prod">
            <h4>
              도시 {city.id + 1} · {ICON.hammer} 망치 {h} {done && <span className="ok">(생산 완료)</span>}
            </h4>
            {!done && (
              <>
                <details open>
                  <summary>불가사의 투자 ({wonders.length}개 가능)</summary>
                  <div className="list">
                    {wonders.map((w) => {
                      const amt = amounts[`${city.id}:${w.id}`] ?? h
                      const prog = game.wonderProgress[w.id] ?? {}
                      return (
                        <div key={w.id} className="wonder-row">
                          <WonderCard wonder={w} width={240} />
                          <div className="controls">
                            <b>{w.name}</b>
                            <small>
                              최소 {minHammers(player, w)} · 조건: {conditionText(w.condition)} · {w.effects.map(wonderEffectText).join(', ')}
                            </small>
                            <small>
                              진척도 (필요 {w.progressNeeded}): {game.players.map((p) => `${civById(p.civId).name} ${prog[p.id] ?? 0}`).join(' / ')}
                            </small>
                            <div className="row">
                              <input
                                type="number"
                                min={0}
                                max={h}
                                value={amt}
                                style={{ width: 56 }}
                                onChange={(e) => setAmounts({ ...amounts, [`${city.id}:${w.id}`]: Number(e.target.value) })}
                              />
                              <button disabled={mustPolicy || amt < minHammers(player, w) || amt > h} onClick={() => dispatch({ type: 'invest', cityId: city.id, wonderId: w.id, hammers: amt })}>
                                투자
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {wonders.length === 0 && <small className="muted">투자할 수 있는 불가사의가 없습니다 (기술·건설 조건 확인).</small>}
                  </div>
                </details>
                <details open>
                  <summary>군사 카드 생산 (방향이 있는 카드는 생산할 때 무작위로 정해지고, 고유 유닛은 3장만 존재합니다)</summary>
                  <div className="unit-row">
                    {MILITARY_CARDS.flatMap((def) => {
                      const entries: { unique?: string }[] = [{}, ...civ.uniques.filter((u) => u.base === def.id).map((u) => ({ unique: u.name }))]
                      return entries
                        .filter((e) => (e.unique || !def.uniqueOnly) && player.techs.includes((e.unique ? uniqueOf(player, e.unique)?.tech : undefined) ?? def.tech))
                        .map((e) => {
                          const key = `${city.id}:${def.id}:${e.unique ?? ''}`
                          const uq = e.unique ? uniqueOf(player, e.unique) : undefined
                          const cost = cardCost(player, def, uq)
                          const tech = uq?.tech ?? def.tech
                          const ok = !!producible(game, player, def.id, e.unique, city)
                          const reason = !player.techs.includes(tech)
                            ? `기술 필요: ${TECHS.find((x) => x.id === tech)?.name}`
                            : !ok
                              ? '지금 만들 수 없음 (6장 보유 한도 또는 고유 유닛 3장 모두 존재)'
                              : cost > h
                                ? `망치 부족 (${h}/${cost})`
                                : ''
                          return (
                            <div key={key} className="policy-pick" style={ok ? undefined : { opacity: 0.55 }}>
                              <UnitCard card={catalogCard(def.id, e.unique)} width={120} />
                              {e.unique && <small className="muted">고유 유닛 — 남은 {game.uniqueSupply[e.unique].length}/3장</small>}
                              <b>
                                {ICON.hammer}
                                {cost}
                              </b>
                              <button
                                disabled={mustPolicy || !ok || cost > h}
                                title={reason}
                                onClick={() => dispatch({ type: 'produce', cityId: city.id, defId: def.id, unique: e.unique })}
                              >
                                생산
                              </button>
                              {reason && <small className="muted">{reason}</small>}
                            </div>
                          )
                        })
                    })}
                    {!MILITARY_CARDS.some((d) => player.techs.includes(d.tech) && !d.uniqueOnly) && (
                      <small className="muted">아직 만들 수 있는 군사 카드가 없습니다. 농업(전사)·궁술(궁수)·청동기(창병)·동물 길들이기(전차) 같은 기술을 먼저 연구하세요.</small>
                    )}
                  </div>
                </details>
              </>
            )}
          </section>
        )
      })}

      <details>
        <summary>금으로 승급 ({upgrades.length}장 가능, 한 차례에 한 장{turn.upgraded ? ' — 이번 차례 사용함' : ''})</summary>
        <div className="list">
          {upgrades.map(({ inst, lower, options }) => (
            <div key={inst.uid} className="col">
              <b>{lower.name}</b>
              {options.map((upper) => {
                const cost = cardCost(player, upper)
                return (
                  <div key={upper.id} className="row">
                    <span>→</span>
                    <UnitCard card={catalogCard(upper.id)} width={100} />
                    <small className="muted">방향은 무작위, 중간 등급 건너뛰기 가능</small>
                    <b>
                      {ICON.gold}
                      {cost}
                    </b>
                    <button disabled={mustPolicy || turn.upgraded || turn.yields.gold < cost} onClick={() => dispatch({ type: 'upgrade', uid: inst.uid, toDefId: upper.id })}>
                      승급
                    </button>
                    {civ.uniques
                      .filter((u) => u.base === upper.id && (game.uniqueSupply[u.name]?.length ?? 0) > 0)
                      .map((u) => (
                        <button key={u.name} disabled={mustPolicy || turn.upgraded || turn.yields.gold < cost || !player.techs.includes(u.tech ?? upper.tech)} onClick={() => dispatch({ type: 'upgrade', uid: inst.uid, unique: u.name })}>
                          {u.name}(으)로 승급 (남은 {game.uniqueSupply[u.name].length}/3장)
                        </button>
                      ))}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </details>

      {player.military.length > 0 && (
        <details open>
          <summary>내 군사 카드 ({player.military.length}장) — 방향은 나만 볼 수 있습니다</summary>
          <div className="unit-row">
            {player.military.map((c) => (
              <div key={c.uid} className="policy-pick">
                <UnitCard card={c} width={130} />
                {player.civId === 'india' && <button onClick={() => dispatch({ type: 'sacrificeCard', uid: c.uid })}>파괴 (식량 +2)</button>}
              </div>
            ))}
          </div>
        </details>
      )}

      {occupiedTiles(game, player).length > 0 && (
        <details>
          <summary>점령 중인 장군 불러들이기 (차례에 1개{turn.recalled ? ' — 이번 차례 사용함' : ''})</summary>
          <div className="list">
            {occupiedTiles(game, player).map((o) => (
              <div key={`${o.defenderId}:${o.cityId}:${o.tileId}`} className="row">
                <span>
                  {civById(game.players[o.defenderId].civId).name} 도시 {o.cityId + 1} 타일 #{o.tileId}
                </span>
                <button disabled={turn.recalled} onClick={() => dispatch({ type: 'recallGeneral', ...o })}>
                  불러들이기 (점령 해제, 장군은 다음 차례에 돌아옴)
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="row">
        {player.military.some((c) => c.defId === 'atomic_bomb') &&
          enemyExtra.map(({ o, c, t }) => (
            <button key={t.card.id} onClick={() => dispatch({ type: 'useAtomicBomb', defenderId: o.id, cityId: c.id, tileId: t.card.id })}>
              ☢ 원자폭탄: {civById(o.civId).name} {t.card.terrains.join('·')} 파괴
            </button>
          ))}
        <button className="primary" onClick={() => dispatch({ type: 'endProduction' })}>
          생산 끝내기
        </button>
      </div>
    </div>
  )
}
