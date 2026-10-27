import type { CardInst, Dir } from '../engine'
import { cardStats, targetSlot } from '../engine'

export interface PlannedAttack {
  dir: Dir | 'choose'
  power: number
  /** 상대 자리 1~4, 범위 밖이면 null (빈 공간을 공격) */
  enemySlot: number | null
}

/** 내 slot(1~4)에 놓인 카드가 상대 어느 자리를 공격하는지. 대상을 고르는 카드는 공개 후에 정한다. */
export function plannedAttacks(card: CardInst, slot: number): PlannedAttack[] {
  const st = cardStats(card)
  if (st.choose !== undefined) return [{ dir: 'choose', power: st.choose, enemySlot: null }]
  return st.marks.map((m) => {
    const j = targetSlot(m.dir, slot)
    return { dir: m.dir, power: m.power, enemySlot: j >= 1 && j <= 4 ? j : null }
  })
}

