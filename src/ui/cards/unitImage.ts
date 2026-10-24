import type { Dir } from '../../engine'
import { UNIQUES, dirsKey } from '../../engine'
import { cardImage } from './cardImages'

export interface UnitCardData {
  defId: string
  unique?: string
  dirs?: Dir[]
}

/** 카드 그림 id: 고유 유닛은 unique/<id>.<방향>, 일반 카드는 unit/<카드 id>.<방향> */
export function unitImage(card: UnitCardData): string | undefined {
  const key = dirsKey(card.dirs)
  if (card.unique) {
    const id = UNIQUES[card.unique]?.def.id
    return id ? cardImage('unique', `${id}.${key}`) : undefined
  }
  return cardImage('unit', `${card.defId}.${key}`)
}
