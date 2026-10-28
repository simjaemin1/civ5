import { cardById, holdLimit } from '../../engine'
import { UnitCard } from '../cards/UnitCard'
import { josa } from '../format'
import type { PanelProps } from './types'

/** 보유 한도(한 종류 5장, 고유 유닛의 기초 카드는 2장)를 넘은 군사 카드: 버릴 카드를 눌러 고른다. */
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
      <p className="muted">일반 카드는 한 종류당 5장까지 가질 수 있습니다 (고유 유닛은 따로 3장, 고유 유닛이 있는 문명은 그 기초 카드를 2장까지). {josa(cardById(kind).name, '은', '는')} {holdLimit(player, kind)}장까지입니다. 버릴 카드를 눌러 고르세요.</p>
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
