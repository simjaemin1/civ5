import { MAX_HOLD, cardById } from '../../engine'
import { UnitCard } from '../cards/UnitCard'
import type { PanelProps } from './types'

/** 보유 한도(한 종류 5장)를 넘은 군사 카드: 버릴 카드를 눌러 고른다. */
export function CardDiscardPanel({ player, dispatch }: PanelProps) {
  const kind = player.pendingCardDiscard?.[0]
  if (!kind) return null
  const cards = player.military.filter((c) => c.defId === kind && !c.unique)
  const left = player.pendingCardDiscard!.length
  return (
    <div className="panel">
      <h3>
        {cardById(kind).name} {cards.length}장 중 {left}장을 버려야 합니다
      </h3>
      <p className="muted">일반 카드는 한 종류당 {MAX_HOLD}장까지 가질 수 있습니다 (고유 유닛은 따로 3장). 버릴 카드를 눌러 고르세요.</p>
      <div className="unit-row">
        {cards.map((c) => (
          <div key={c.uid} className="policy-pick prod-card">
            <UnitCard card={c} width={120} />
            <button onClick={() => dispatch({ type: 'discardCard', uid: c.uid })}>이 카드 버리기</button>
          </div>
        ))}
      </div>
    </div>
  )
}
