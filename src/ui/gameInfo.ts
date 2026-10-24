import type { GameState } from '../engine'
import { findTile } from '../engine'

/** 선전포고 목표 타일의 지형 이름 (탈환은 공격 측의 원래 타일) */
export function declTileName(game: GameState, d: GameState['declarations'][number]): string {
  const owner = game.players[d.kind === 'retake' ? d.attackerId : d.defenderId]
  const t = findTile(owner, d.cityId, d.tileId)?.tile
  return t ? `도시${d.cityId + 1} ${t.card.terrains.join('·') || '자연경관'}${t.role === 'city' ? ' (도시 타일)' : ''}` : '?'
}

/** 이번 라운드 불가사의 투자액 (공개 정보)과 진척도 */
export function roundBids(game: GameState, wonderId: string) {
  const bids = game.investments.filter((x) => x.wonderId === wonderId).sort((a, b) => b.hammers - a.hammers)
  const top = bids[0]?.hammers ?? 0
  const tied = bids.filter((b) => b.hammers === top).length > 1
  return { bids, top, tied }
}
