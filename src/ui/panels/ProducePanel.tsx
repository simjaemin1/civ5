import { useState } from 'react'
import { MILITARY_CARDS, cardById, cardCost, civById, investableWonders, minHammers, producible, uniqueOf, upgradeTargets, wonderCardById, TECHS, occupiedTiles } from '../../engine'
import { UnitCard } from '../cards/UnitCard'
import { WonderCard } from '../cards/WonderCard'
import { cardText, conditionText, ICON, wonderEffectText } from '../format'
import type { PanelProps } from './types'
import { ConfirmButton } from '../ConfirmButton'
import { Help } from '../prefs'
import { cityCanProduce } from '../autoSkip'
import { declTileName, roundBids } from '../gameInfo'

export function ProducePanel({ game, player, dispatch }: PanelProps) {
  const turn = player.turn!
  const civ = civById(player.civId)
  const [amounts, setAmounts] = useState<Record<string, number>>({})

  const upgrades = player.military
    .map((c) => ({ inst: c, lower: cardById(c.defId), options: upgradeTargets(player, c) }))
    .filter((x) => x.options.length > 0)

  const threats = game.declarations.filter((d) => d.defenderId === player.id)
  const bidsOf = (wonderId: string) => roundBids(game, wonderId)
  /** 이 금액으로 투자하면 이번 라운드에 몇 위인지 (앞사람 투자액은 공개) */
  const rankOf = (wonderId: string, amt: number): { text: string; cls: string } => {
    const { top } = bidsOf(wonderId)
    if (amt > top) return { text: `🔨${amt}이면 지금 단독 1위 (뒷사람이 더 내면 바뀜)`, cls: 'ok' }
    if (amt === top) return { text: `🔨${amt}이면 공동 1위 → 아무도 진척도를 못 얻음. 🔨${top + 1} 이상 필요`, cls: 'error' }
    return { text: `🔨${amt}이면 1위가 아님. 🔨${top + 1} 이상 필요`, cls: 'error' }
  }
  const leftovers = player.cities
    .filter((c) => !turn.produced.includes(c.id) && cityCanProduce(game, player, c.id))
    .map((c) => `도시${c.id + 1} 망치 ${turn.yields.cities.find((y) => y.cityId === c.id)?.hammer ?? 0}`)
  const canUpgrade = !turn.upgraded && upgrades.some((u) => u.options.some((o) => cardCost(player, o) <= turn.yields.gold))
  const endWarn =
    leftovers.length || canUpgrade
      ? [leftovers.length ? `${leftovers.join(', ')}로 아직 생산할 수 있습니다` : '', canUpgrade ? `금 ${turn.yields.gold}로 승급할 수 있습니다` : '']
          .filter(Boolean)
          .join(' · ') + ' — 끝내면 사라집니다.'
      : null

  const enemyExtra = game.players.flatMap((o) =>
    o.cities.flatMap((c) => c.tiles.filter((t) => t.occupiedBy === player.id && t.role === 'extra').map((t) => ({ o, c, t }))),
  )

  return (
    <div className="panel">
      <h3>생산 (도시마다 1개: 군사 카드 또는 불가사의 투자)</h3>
      {threats.length > 0 && (
        <div className="threat-banner">
          <b>⚔ 이번 라운드에 선전포고를 받았습니다</b> — 정산 때 전투합니다. 지금 군사 카드를 만들어 대비할 수 있습니다.
          <ul className="plain">
            {threats.map((d, i) => (
              <li key={i}>
                {civById(game.players[d.attackerId].civId).name} → {declTileName(game, d)} (상대 군사 카드 {game.players[d.attackerId].military.length}장, 내 카드 {player.military.length}장)
              </li>
            ))}
          </ul>
        </div>
      )}
      <p>
        {ICON.gold} 금 {turn.yields.gold} <span className="muted">(승급에만 사용)</span>
      </p>
      <Help>쓰지 않은 망치와 금은 이 차례가 끝나면 사라집니다. 불가사의는 이번 라운드 투자액이 공개되므로, 앞사람보다 많이 내야 진척도를 얻습니다.</Help>
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
                            <small>
                              이번 라운드 투자:{' '}
                              {bidsOf(w.id).bids.length
                                ? bidsOf(w.id).bids.map((b) => `${civById(game.players[b.playerId].civId).name} 🔨${b.hammers}`).join(' · ')
                                : '아직 없음'}
                            </small>
                            <small className={rankOf(w.id, amt).cls}>{rankOf(w.id, amt).text}</small>
                            <div className="row">
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
                          </div>
                        </div>
                      )
                    })}
                    {wonders.length === 0 && <small className="muted">투자할 수 있는 불가사의가 없습니다 (기술·건설 조건 확인).</small>}
                  </div>
                </details>
                <details open>
                  <summary>군사 카드 생산</summary>
                  <Help>방향이 있는 카드는 생산할 때 무작위로 정해지고, 고유 유닛은 3장만 존재합니다.</Help>
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
          {upgrades.map(({ inst, lower, options }) => (
            <div key={inst.uid} className="col">
              <b>{lower.name}</b>
              {options.map((upper) => {
                const cost = cardCost(player, upper)
                return (
                  <div key={upper.id} className="row">
                    <span>→ {cardText({ defId: upper.id })} (방향은 무작위, 중간 등급 건너뛰기 가능)</span>
                    <b>
                      {ICON.gold}
                      {cost}
                    </b>
                    <button disabled={turn.upgraded || turn.yields.gold < cost} onClick={() => dispatch({ type: 'upgrade', uid: inst.uid, toDefId: upper.id })}>
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
        {player.wonders.includes('great_wall') && !player.greatWallUsed && (
          <button onClick={() => dispatch({ type: 'useGreatWall' })} title={wonderCardById('great_wall').name}>
            🧱 만리장성 사용 (상대 장군 모두 돌려보냄, 1회)
          </button>
        )}
        <ConfirmButton hotkey warn={endWarn} onClick={() => dispatch({ type: 'endProduction' })}>
          생산 끝내기
        </ConfirmButton>
      </div>
    </div>
  )
}
