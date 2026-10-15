import tilesJson from './data/tiles.json'
import type { PartialYield, Terrain, TileCard } from './types'
import { makePlaceholderDeck } from './placeholderDeck'

export interface RealTile {
  terrains: Terrain[]
  resource?: string
  wonder?: string
  historic?: boolean
  /** 카드 하단에 인쇄된 산출 (검증용) */
  printed: PartialYield
}

/** 지금까지 옮겨 적은 실제 타일 카드 (이미지를 받는 대로 늘어난다) */
export const REAL_TILES = tilesJson.cards as RealTile[]
export const TILE_DECK_SIZE = tilesJson.total

/** 실제 카드 160장이 모두 모이면 그 덱을, 아직이면 임시 덱을 만든다. */
export function makeTileDeck(seed = 1): TileCard[] {
  if (REAL_TILES.length !== TILE_DECK_SIZE) return makePlaceholderDeck(seed)
  return REAL_TILES.map((t, id) => {
    const card: TileCard = { id, terrains: [...t.terrains] }
    if (t.resource) card.resource = t.resource
    if (t.wonder) card.wonder = t.wonder
    if (t.historic) card.historic = true
    return card
  })
}
