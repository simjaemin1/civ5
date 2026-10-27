import { CityTag } from '../icons'
import { useState } from 'react'
import { TECHS, canHammerScience, happiness, researchableTechs, totalWorkers } from '../../engine'
import { TechCard } from '../cards/TechCard'
import { ICON, josa } from '../format'
import type { PanelProps } from './types'
import { ConfirmButton } from '../ConfirmButton'
import { Help } from '../prefs'
import { maxSciencePool, sciencePlan } from '../autoSkip'

export function ResearchPanel({ game, player, dispatch }: PanelProps) {
  const turn = player.turn!
  const canFood = player.techs.includes('writing')
  const canHammer = canHammerScience(player)
  const cities = turn.yields.cities
  // 도시별로 과학에 쓸 식량·망치 (도시 id → 개수)
  const [foodBy, setFoodBy] = useState<Record<number, number>>({})
  const [hammerBy, setHammerBy] = useState<Record<number, number>>({})
  const foodConv = cities.reduce((n, c) => n + (foodBy[c.cityId] ?? 0), 0)
  const hammerConv = cities.reduce((n, c) => n + (hammerBy[c.cityId] ?? 0), 0)
  const setFood = (cityId: number, v: number) => setFoodBy((m) => ({ ...m, [cityId]: v }))
  const setHammer = (cityId: number, v: number) => {
    // 망치는 모두 합쳐 2개까지
    const others = hammerConv - (hammerBy[cityId] ?? 0)
    setHammerBy((m) => ({ ...m, [cityId]: Math.max(0, Math.min(v, 2 - others)) }))
  }
  const cap = happiness(player)
  const total = totalWorkers(player)
  /** 변환하고 남은 식량으로 이 도시 일꾼이 어떻게 되는지 */
  const outlook = (cityId: number, workers: number, food: number): string => {
    if (turn.skipFoodSettle) return '정산 생략'
    const left = food - (foodBy[cityId] ?? 0)
    if (left < workers) return player.policy === 'liberty' ? '유지 (자유)' : workers > 0 ? '일꾼 −1' : '유지'
    if (left >= workers * 2 && total < cap) return '일꾼 +1'
    return '유지'
  }
  const techs = researchableTechs(game).sort((a, b) => a.cost - b.cost || a.column - b.column)
  const pool = turn.yields.science + foodConv + hammerConv
  const maxPool = maxSciencePool(player)
  const [pending, setPending] = useState<{ techId: string; food: Record<number, number>; hammer: Record<number, number>; text: string; okLabel: string; alt?: string } | null>(null)
  const taken = game.roundTechPicks.filter((id) => !player.techs.includes(id) && !player.techs.includes('education')).map((id) => TECHS.find((t) => t.id === id)?.name ?? id)
  const run = (techId: string, food: Record<number, number>, hammer: Record<number, number>) => {
    setPending(null)
    dispatch({ type: 'research', techId, foodByCity: canFood ? food : undefined, hammerByCity: canHammer ? hammer : undefined })
  }
  const fill = (need: number) => sciencePlan(player, need) ?? { food: {}, hammer: {} }
  const sum = (m: Record<number, number>) => Object.values(m).reduce((a, b) => a + b, 0)
  const pick = (techId: string, cost: number) => {
    const name = TECHS.find((t) => t.id === techId)?.name ?? techId
    const need = Math.max(0, cost - turn.yields.science)
    if (pool < cost) {
      // 모자라면 필요한 만큼 바꾸는 안을 보여 준다
      const plan = fill(need)
      setPending({ techId, ...plan, text: `${name}: 식량 ${sum(plan.food)}${canHammer ? ` · 망치 ${sum(plan.hammer)}` : ''}만큼 과학으로 바꿔 연구합니다.`, okLabel: '이대로 바꿔서 연구' })
      return
    }
    if (foodConv + hammerConv > need) {
      // 필요 이상 바꾸면 남은 과학과 함께 그 식량·망치도 사라진다
      const plan = fill(need)
      setPending({
        techId,
        ...plan,
        text: `${name}에는 식량·망치를 ${need}만 바꾸면 됩니다 (지금 ${foodConv + hammerConv}). 더 바꾼 만큼은 과학으로 남았다가 사라집니다.`,
        okLabel: `필요한 만큼만 바꿔 연구 (식량 ${sum(plan.food)}${canHammer ? `·망치 ${sum(plan.hammer)}` : ''})`,
        alt: '그대로 연구',
      })
      return
    }
    run(techId, foodBy, hammerBy)
  }
  const best = techs.filter((t) => t.cost <= maxPool).sort((a, b) => b.cost - a.cost)[0]
  const skipWarn = best
    ? `${best.cost > pool ? '식량·망치를 과학으로 바꾸면 ' : ''}${josa(best.name, '을', '를')} 연구할 수 있습니다 (과학 ${best.cost}). 쓰지 않은 과학은 사라집니다.`
    : null

  return (
    <div className="panel">
      <h3>기술 연구 (한 차례에 1개)</h3>
      <p>
        {ICON.science} 과학 {turn.yields.science}
        {canFood && ` (+식량 변환 ${foodConv})`}
        {canHammer && ` (+망치 변환 ${hammerConv})`} = <b>{pool}</b> · 남은 과학은 사라집니다.
      </p>
      {(canFood || canHammer) && (
        <table className="conv">
          <thead>
            <tr>
              <th>도시</th>
              {canFood && <th>식량→과학 (식량 / 일꾼)</th>}
              {canFood && <th>정산 뒤 일꾼</th>}
              {canHammer && <th>망치→과학 (합쳐 최대 2)</th>}
            </tr>
          </thead>
          <tbody>
            {cities.map((c) => {
              const workers = player.cities.find((x) => x.id === c.cityId)?.workers ?? 0
              return (
                <tr key={c.cityId}>
                  <td><CityTag id={c.cityId} /></td>
                  {canFood && (
                    <td>
                      <input type="range" min={0} max={c.food} value={foodBy[c.cityId] ?? 0} onChange={(e) => setFood(c.cityId, Number(e.target.value))} />{' '}
                      <b>{foodBy[c.cityId] ?? 0}</b>
                      <small className="muted"> ({c.food} / {workers})</small>
                    </td>
                  )}
                  {canFood && <td>{outlook(c.cityId, workers, c.food)}</td>}
                  {canHammer && (
                    <td>
                      <input type="range" min={0} max={Math.min(2, c.hammer)} value={hammerBy[c.cityId] ?? 0} onChange={(e) => setHammer(c.cityId, Number(e.target.value))} />{' '}
                      <b>{hammerBy[c.cityId] ?? 0}</b>
                      <small className="muted"> (망치 {c.hammer})</small>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {pending && (
        <div className="confirm-bar">
          <span>{pending.text}</span>
          <button className="primary" data-hotkey="" autoFocus onClick={() => run(pending.techId, pending.food, pending.hammer)}>
            {pending.okLabel}
          </button>
          {pending.alt && (
            <button onClick={() => run(pending.techId, foodBy, hammerBy)}>{pending.alt}</button>
          )}
          <button onClick={() => setPending(null)}>취소</button>
        </div>
      )}
      <div className="cardgrid">
        {techs.map((t) => {
          const reach = maxPool >= t.cost
          return (
            <TechCard
              key={t.id}
              tech={t}
              width={150}
              state={pool >= t.cost ? 'available' : 'idle'}
              disabled={!reach}
              note={
                pool >= t.cost
                  ? `${t.name} — 눌러서 연구`
                  : reach
                    ? `${t.name} — 식량·망치를 과학으로 바꾸면 연구할 수 있습니다 (${pool}/${t.cost})`
                    : `${t.name} — 과학이 모자랍니다 (${pool}/${t.cost})`
              }
              onClick={() => pick(t.id, t.cost)}
            />
          )
        })}
        {techs.length === 0 && <p className="muted">연구할 수 있는 기술이 없습니다.</p>}
      </div>
      {taken.length > 0 && (
        <p className="muted">
          이번 라운드에 앞사람이 이미 연구해서 고를 수 없는 기술: {taken.join(', ')}
          {' '}(교육학을 연구하면 이 제한이 사라집니다)
        </p>
      )}
      <Help>카드를 누르면 바로 연구합니다. 흐린 카드는 식량·망치를 모두 바꿔도 과학이 모자랍니다. 바꿔야 하는 카드를 누르면 필요한 만큼 바꾸는 안을 보여 줍니다.</Help>
      <ConfirmButton className="" hotkey warn={skipWarn} onClick={() => dispatch({ type: 'skipResearch' })}>
        이번 차례는 연구하지 않음
      </ConfirmButton>
    </div>
  )
}
