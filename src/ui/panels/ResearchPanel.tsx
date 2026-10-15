import { useState } from 'react'
import { researchableTechs } from '../../engine'
import { ICON } from '../format'
import type { PanelProps } from './types'

export function ResearchPanel({ game, player, dispatch }: PanelProps) {
  const turn = player.turn!
  const food = turn.yields.cities.reduce((n, c) => n + c.food, 0)
  const hammers = turn.yields.cities.reduce((n, c) => n + c.hammer, 0)
  const canFood = player.techs.includes('writing')
  const canHammer = player.techs.includes('scientific_theory')
  const [foodConv, setFoodConv] = useState(0)
  const [hammerConv, setHammerConv] = useState(0)
  const techs = researchableTechs(game).sort((a, b) => a.cost - b.cost || a.column - b.column)
  const pool = turn.yields.science + foodConv + hammerConv

  return (
    <div className="panel">
      <h3>기술 연구 (한 차례에 1개)</h3>
      <p>
        {ICON.science} 과학 {turn.yields.science}
        {canFood && ` (+식량 변환 ${foodConv})`}
        {canHammer && ` (+망치 변환 ${hammerConv})`} = <b>{pool}</b> · 남은 과학은 사라집니다.
      </p>
      <div className="row">
        {canFood && (
          <label>
            문자: 식량→과학 {foodConv}
            <input type="range" min={0} max={food} value={foodConv} onChange={(e) => setFoodConv(Number(e.target.value))} />
            <small className="muted"> (식량 {food}, 남은 식량으로 일꾼 정산)</small>
          </label>
        )}
        {canHammer && (
          <label>
            과학이론: 망치→과학 {hammerConv}
            <input type="range" min={0} max={Math.min(2, hammers)} value={hammerConv} onChange={(e) => setHammerConv(Number(e.target.value))} />
          </label>
        )}
      </div>
      <div className="grid">
        {techs.map((t) => (
          <button
            key={t.id}
            disabled={pool < t.cost}
            onClick={() => dispatch({ type: 'research', techId: t.id, foodToScience: foodConv, hammerToScience: hammerConv })}
            title={t.effects.map((e) => e.kind).join(', ')}
          >
            <b>{t.name}</b>
            <small>
              {ICON.science}
              {t.cost} · {t.column}열{t.effects.length ? ' · 효과 있음' : ''}
            </small>
          </button>
        ))}
        {techs.length === 0 && <p className="muted">연구할 수 있는 기술이 없습니다.</p>}
      </div>
      <button onClick={() => dispatch({ type: 'skipResearch' })}>이번 차례는 연구하지 않음</button>
    </div>
  )
}
