import type { Dir } from '../../engine'
import { MILITARY_CARDS, UNIQUES, dirsKey } from '../../engine'
import { cardImage } from './cardImages'

export interface UnitCardData {
  defId: string
  unique?: string
  dirs?: Dir[]
}

/** 목록·도감에 보여 줄 카드: 방향 카드는 가운데(없으면 첫 방향) 그림, 고유 유닛은 첫 방향 */
export function catalogCard(defId: string, unique?: string): UnitCardData {
  if (unique) return { defId, unique, dirs: UNIQUES[unique]?.def.variants?.[0] }
  const dirs = MILITARY_CARDS.find((c) => c.id === defId)?.variantDirs
  return { defId, dirs: dirs ? [dirs.includes('C') ? 'C' : dirs[0]] : undefined }
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
