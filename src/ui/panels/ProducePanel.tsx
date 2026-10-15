import { useState } from 'react'
import { MILITARY_CARDS, cardById, cardCost, civById, investableWonders, minHammers, producible, uniqueOf, wonderCardById, TECHS } from '../../engine'
import { cardText, conditionText, ICON, wonderEffectText } from '../format'
import type { PanelProps } from './types'

export function ProducePanel({ game, player, dispatch }: PanelProps) {
  const turn = player.turn!
  const civ = civById(player.civId)
  const [amounts, setAmounts] = useState<Record<string, number>>({})

  const upgrades = player.military
    .map((c) => {
      const lower = cardById(c.defId)
      const upper = lower.line && lower.tier ? MILITARY_CARDS.find((u) => u.line === lower.line && u.tier === lower.tier! + 1) : undefined
      return upper ? { inst: c, lower, upper } : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const enemyExtra = game.players.flatMap((o) =>
    o.cities.flatMap((c) => c.tiles.filter((t) => t.occupiedBy === player.id && t.role === 'extra').map((t) => ({ o, c, t }))),
  )

  return (
    <div className="panel">
      <h3>생산 (도시마다 1개: 군사 카드 또는 불가사의 투자)</h3>
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
                        <div key={w.id} className="row">
                          <b>{w.name}</b>
                          <small>
                            최소 {minHammers(player, w)} · 조건: {conditionText(w.condition)} · {w.effects.map(wonderEffectText).join(', ')} · 진척도{' '}
                            {game.players.map((p) => `${civById(p.civId).name} ${prog[p.id] ?? 0}`).join(' / ')} (필요 {w.progressNeeded})
                          </small>
                          <input
                            type="number"
                            min={0}
                            max={h}
                            value={amt}
                            style={{ width: 56 }}
                            onChange={(e) => setAmounts({ ...amounts, [`${city.id}:${w.id}`]: Number(e.target.value) })}
                          />
                          <button disabled={amt < minHammers(player, w) || amt > h} onClick={() => dispatch({ type: 'invest', cityId: city.id, wonderId: w.id, hammers: amt })}>
                            투자
                          </button>
                        </div>
                      )
                    })}
                    {wonders.length === 0 && <small className="muted">투자할 수 있는 불가사의가 없습니다 (기술·건설 조건 확인).</small>}
                  </div>
                </details>
                <details open>
                  <summary>군사 카드 생산 (방향이 있는 카드는 생산할 때 무작위로 정해지고, 고유 유닛은 3장만 존재합니다)</summary>
                  <div className="list">
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
                            <div key={key} className="row" style={ok ? undefined : { opacity: 0.55 }}>
                              <span>{cardText({ defId: def.id, unique: e.unique })}{e.unique ? ` — 고유 유닛, 남은 ${game.uniqueSupply[e.unique].length}/3장` : ''}</span>
                              <b>
                                {ICON.hammer}
                                {cost}
                              </b>
                              <button
                                disabled={!ok || cost > h}
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
          {upgrades.map(({ inst, lower, upper }) => {
            const cost = cardCost(player, upper)
            return (
              <div key={inst.uid} className="row">
                <span>
                  {lower.name} → {cardText({ defId: upper.id })} (방향은 무작위)
                </span>
                <b>
                  {ICON.gold}
                  {cost}
                </b>
                <button disabled={turn.upgraded || turn.yields.gold < cost || !player.techs.includes(upper.tech)} onClick={() => dispatch({ type: 'upgrade', uid: inst.uid })}>
                  승급
                </button>
                {civ.uniques
                  .filter((u) => u.base === upper.id && (game.uniqueSupply[u.name]?.length ?? 0) > 0)
                  .map((u) => (
                    <button key={u.name} disabled={turn.upgraded || turn.yields.gold < cost || !player.techs.includes(u.tech ?? upper.tech)} onClick={() => dispatch({ type: 'upgrade', uid: inst.uid, unique: u.name })}>
                      {u.name}(으)로 승급 (남은 {game.uniqueSupply[u.name].length}/3장)
                    </button>
                  ))}
              </div>
            )
          })}
        </div>
      </details>

      {player.military.length > 0 && (
        <details>
          <summary>내 군사 카드 ({player.military.length}장)</summary>
          <div className="list">
            {player.military.map((c) => (
              <div key={c.uid} className="row">
                <span>{cardText(c)}</span>
                {player.civId === 'india' && <button onClick={() => dispatch({ type: 'sacrificeCard', uid: c.uid })}>공용 덱에 돌려 파괴 (식량 +2)</button>}
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
        {player.wonders.includes('great_wall') && !player.greatWallUsed && (
          <button onClick={() => dispatch({ type: 'useGreatWall' })} title={wonderCardById('great_wall').name}>
            🧱 만리장성 사용 (상대 장군 모두 돌려보냄, 1회)
          </button>
        )}
        <button className="primary" onClick={() => dispatch({ type: 'endProduction' })}>
          생산 끝내기
        </button>
      </div>
    </div>
  )
}
