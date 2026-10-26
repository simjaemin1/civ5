import { CityTag } from '../icons'
import { useState } from 'react'
import { MILITARY_CARDS, cardById, cardCost, civById, declarationTargets, investableWonders, minHammers, uniqueOf, upgradeTargets, occupiedTiles } from '../../engine'
import { UnitCard } from '../cards/UnitCard'
import { catalogCard } from '../cards/unitImage'
import { WonderCard } from '../cards/WonderCard'
import { cardText, conditionText, ICON, wonderEffectText } from '../format'
import type { PanelProps } from './types'
import { ConfirmButton } from '../ConfirmButton'
import { Help } from '../prefs'
import { cityCanProduce } from '../autoSkip'
import { battleCards, declCoastal, declTileName, produceBlock, roundBids } from '../gameInfo'

export function ProducePanel({ game, player, dispatch }: PanelProps) {
  const turn = player.turn!
  const civ = civById(player.civId)
  // 정책을 고를 차례가 남아 있으면 정책부터 (정책 조건이 붙은 불가사의가 틀어지지 않게)
  const mustPolicy = player.pendingPolicies > 0
  // 카드 묶기(만들 수 있음/없음)는 정책 조건을 빼고 본다: 정책을 고르기 전에는 버튼만 잠근다
  const policyDone = mustPolicy ? { ...player, pendingPolicies: 0 } : player
  const [amounts, setAmounts] = useState<Record<string, number>>({})

  const upgrades = player.military
    .map((c) => ({ inst: c, lower: cardById(c.defId), options: upgradeTargets(player, c) }))
    .filter((x) => x.options.length > 0)

  const threats = game.declarations.filter((d) => d.defenderId === player.id)
  const bidsOf = (wonderId: string) => roundBids(game, wonderId)
  // 이번 라운드에 나보다 뒤에 차례가 남은 문명 수
  const later = game.order.slice(game.turnIdx + 1).filter((id) => !game.players[id].eliminated).length
  /** 이 금액으로 투자하면 이번 라운드에 몇 위인지 (앞사람 투자액은 공개) */
  const rankOf = (wonderId: string, amt: number): { text: string; cls: string } => {
    const { top } = bidsOf(wonderId)
    if (amt > top) return { text: later ? `🔨${amt}이면 지금 단독 1위 (뒤에 ${later}명이 더 낼 수 있음)` : `🔨${amt}이면 단독 1위 확정 (뒤에 투자할 사람이 없음)`, cls: 'ok' }
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
      {mustPolicy && <p className="enemy-pick">정책을 먼저 고르세요. 정책을 고른 뒤에 생산·투자·승급할 수 있습니다.</p>}
      {threats.length > 0 && (
        <div className="threat-banner">
          <b>⚔ 이번 라운드에 선전포고를 받았습니다</b> — 정산 때 전투합니다. 지금 군사 카드를 만들어 대비할 수 있습니다.
          <ul className="plain">
            {threats.map((d, i) => (
              <li key={i}>
                {civById(game.players[d.attackerId].civId).name} → {declTileName(game, d)} (전투 카드: 상대 {battleCards(game.players[d.attackerId], declCoastal(game, d))}장, 나{' '}
                {battleCards(player, declCoastal(game, d))}장 · 동점이면 내가 이김)
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
              <CityTag id={city.id} /> {ICON.hammer} 망치 {h} {done && <span className="ok">(생산 완료)</span>}
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
                                step={1}
                                onChange={(e) => setAmounts({ ...amounts, [`${city.id}:${w.id}`]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                              />
                              <button disabled={mustPolicy || amt < minHammers(player, w) || amt > h} onClick={() => dispatch({ type: 'invest', cityId: city.id, wonderId: w.id, hammers: amt })}>
                                투자
                              </button>
                              {h < minHammers(player, w) ? (
                                <small className="error">망치가 최소 {minHammers(player, w)}보다 적습니다</small>
                              ) : amt < minHammers(player, w) ? (
                                <small className="error">최소 {minHammers(player, w)} 이상</small>
                              ) : amt > h ? (
                                <small className="error">이 도시 망치는 {h}입니다</small>
                              ) : null}
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
                  <Help>방향이 있는 카드는 생산할 때 무작위로 정해지고, 고유 유닛은 3장만 존재합니다. 방향이 정해지면 그 전으로 되돌릴 수 없습니다.</Help>
                  {(() => {
                    const rows = MILITARY_CARDS.flatMap((def) =>
                      [...(def.uniqueOnly ? [] : [undefined]), ...civ.uniques.filter((u) => u.base === def.id).map((u) => u.name)]
                        .filter((u) => player.techs.includes((u ? uniqueOf(player, u)?.tech : undefined) ?? def.tech))
                        .map((u) => ({ def, unique: u, block: produceBlock(game, policyDone, def, u, city, h), cost: cardCost(player, def, u ? uniqueOf(player, u) : undefined) })),
                    )
                    const ok = rows.filter((r) => !r.block)
                    const no = rows.filter((r) => r.block)
                    // 카드 그림으로 보여 준다: 만들 수 있는 카드는 앞에, 만들 수 없는 카드는 이유와 함께 접어 둔다
                    const card = (r: (typeof rows)[number]) => (
                      <div key={`${r.def.id}:${r.unique ?? ''}`} className={`policy-pick prod-card${r.block ? ' blocked' : ''}`}>
                        <UnitCard card={catalogCard(r.def.id, r.unique)} width={120} />
                        {r.unique && <small className="muted">고유 유닛 — 남은 {game.uniqueSupply[r.unique]?.length ?? 0}/3장</small>}
                        <button
                          disabled={mustPolicy || !!r.block}
                          title={r.block ?? cardText({ defId: r.def.id, unique: r.unique })}
                          onClick={() => dispatch({ type: 'produce', cityId: city.id, defId: r.def.id, unique: r.unique })}
                        >
                          생산 {ICON.hammer}
                          {r.cost}
                        </button>
                        {r.block && <small className="muted">{r.block}</small>}
                      </div>
                    )
                    return (
                      <>
                        <div className="unit-row">{ok.map(card)}</div>
                        {ok.length === 0 && rows.length > 0 && <small className="muted">지금 이 도시에서 만들 수 있는 군사 카드가 없습니다.</small>}
                        {no.length > 0 && (
                          <details>
                            <summary className="muted">만들 수 없는 카드 {no.length}종 (이유 보기)</summary>
                            <div className="unit-row">{no.map(card)}</div>
                          </details>
                        )}
                        {rows.length === 0 && (
                          <small className="muted">아직 군사 카드를 해금하지 않았습니다. 농업(전사)·궁술(궁수)·청동기술(창병)·목축업(전차)을 연구하세요.</small>
                        )}
                      </>
                    )
                  })()}
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
            <div key={inst.uid} className="upgrade-row">
              <div className="policy-pick">
                <UnitCard card={inst} width={110} title={`승급 전: ${lower.name} — 승급하면 새 카드의 방향은 무작위로 정해집니다`} />
                <small className="muted">승급 전 {lower.name}</small>
              </div>
              <div className="upgrade-opts">
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
                {player.civId === 'india' && (
                  <ConfirmButton className="" warn="이 카드를 공용 덱에 돌려 파괴합니다 (식량 +2)." onClick={() => dispatch({ type: 'sacrificeCard', uid: c.uid })}>
                    파괴 (식량 +2)
                  </ConfirmButton>
                )}
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
            <ConfirmButton
              key={t.card.id}
              className=""
              warn={`${civById(o.civId).name}의 ${t.card.terrains.join('·') || '자연경관'} 타일을 파괴합니다. 되돌릴 수 없습니다.`}
              onClick={() => dispatch({ type: 'useAtomicBomb', defenderId: o.id, cityId: c.id, tileId: t.card.id })}
            >
              ☢ 원자폭탄: {civById(o.civId).name} 도시{c.id + 1} {t.card.terrains.join('·') || '자연경관'} 파괴
            </ConfirmButton>
          ))}
        <ConfirmButton hotkey warn={endWarn} onClick={() => dispatch({ type: 'endProduction' })}>
          {declarationTargets(game, player).length > 0 ? '생산 끝내기 → ⑤ 선전포고' : '생산 끝내기 → 식량 정산·차례 끝'}
        </ConfirmButton>
      </div>
    </div>
  )
}
