import type { City, GameState, GameView, MilitaryCardDef, Player } from '../engine'
import { MAX_HOLD, RESOURCES, TECHS, cardById, civById, cardCost, cardStats, findTile, isCoastalCity, isObsolete, producible, uniqueOf } from '../engine'

/** 선전포고 목표 타일의 지형 이름 (탈환은 공격 측의 원래 타일) */
export function declTileName(game: GameState, d: GameState['declarations'][number]): string {
  const owner = game.players[d.kind === 'retake' ? d.attackerId : d.defenderId]
  const t = findTile(owner, d.cityId, d.tileId)?.tile
  if (!t) return '?'
  const res = t.card.resource ? ` ${RESOURCES[t.card.resource]?.name ?? ''}` : ''
  // 탈환은 공격 측이 원래 가진 타일이므로 주인 이름을 붙인다
  return `${d.kind === 'retake' ? `${civById(owner.civId).name} ` : ''}도시${d.cityId + 1} ${t.card.terrains.join('·') || '자연경관'}${res}${t.role === 'city' ? ' (도시 타일)' : ''}`
}

/** 이번 라운드 불가사의 투자액 (공개 정보)과 진척도 */
export function roundBids(game: GameState, wonderId: string) {
  const bids = game.investments.filter((x) => x.wonderId === wonderId).sort((a, b) => b.hammers - a.hammers)
  const top = bids[0]?.hammers ?? 0
  const tied = bids.filter((b) => b.hammers === top).length > 1
  return { bids, top, tied }
}

/**
 * 이 도시에서 이 카드를 지금 만들 수 없는 이유 (만들 수 있으면 null).
 * 엔진 producible에 없는 해안 도시 조건과 망치까지 함께 본다 (버튼이 눌리는데 오류가 나지 않게).
 */
export function produceBlock(game: GameState, p: Player, def: MilitaryCardDef, unique: string | undefined, city: City, hammers: number): string | null {
  const uq = unique ? uniqueOf(p, unique) : undefined
  const tech = uq?.tech ?? def.tech
  if (p.pendingPolicies > 0) return '정책을 먼저 고르세요'
  if (!p.techs.includes(tech)) return `기술 필요: ${TECHS.find((x) => x.id === tech)?.name ?? tech}`
  if (isObsolete(p, def)) return '상위 카드를 만들 수 있게 되어 더는 생산불가'
  if (def.requires && !city.tiles.some((t) => t.card.resource === def.requires)) return `이 도시에 ${RESOURCES[def.requires]?.name ?? def.requires} 타일이 없음`
  if (p.military.filter((c) => c.defId === def.id).length >= MAX_HOLD) return `한 종류 ${MAX_HOLD}장 보유 한도`
  if (uq && (game.uniqueSupply[uq.name]?.length ?? 0) === 0) return '고유 유닛 3장이 모두 나가 있음'
  if ((uq?.coastalOnly || def.special === 'coastalOnly') && !isCoastalCity(city)) return '첫 5타일에 해안이 있는 도시에서만'
  if (!producible(game, p, def.id, unique, city)) return '지금 만들 수 없음'
  const cost = cardCost(p, def, uq)
  if (cost > hammers) return `망치 부족 (${hammers}/${cost})`
  return null
}

/** 전투에 낼 수 있는 카드 수 (원자폭탄 제외, 해안 전용 카드는 해안 타일 전투에서만) */
export function battleCards(p: Player, coastal: boolean): number {
  return p.military.filter((c) => {
    const st = cardStats(c)
    if (st.hp === undefined || cardById(c.defId).notBattle) return false
    return coastal || !st.coastalOnly
  }).length
}

/** 해안 타일 전투의 공격 전투력 보너스: 영국 +1, 알렉산드리아 등대 +1 */
export const coastalBonus = (p: Player): number => (p.civId === 'england' ? 1 : 0) + (p.wonders.includes('great_lighthouse') ? 1 : 0)

/** 도시 주변 4칸(위·아래·왼쪽·오른쪽) 중 이 문명이 점령한 칸 수 */
export function sidesHeld(city: City, by: number): { held: number; total: number; open: number } {
  const sides = city.tiles.filter((t) => t.role === 'side')
  return { held: sides.filter((t) => t.occupiedBy === by).length, total: 4, open: city.openSides.length }
}

/** 선전포고 목표가 해안 타일인지 (해안 타일 전투) */
export function declCoastal(game: GameState, d: GameState['declarations'][number]): boolean {
  const owner = game.players[d.kind === 'retake' ? d.attackerId : d.defenderId]
  return !!findTile(owner, d.cityId, d.tileId)?.tile.card.terrains.includes('해안')
}

// 차례 안 되돌리기 범위와 잠금 기준은 엔진에 있다 (서버도 같은 기준을 쓴다)
export { TURN_PHASES, revealsInfo, turnKey } from '../engine'

/** 타일 덱에 남은 장수. 온라인 뷰는 덱 순서를 비우고 장수만 보낸다 */
export const deckSize = (g: GameState): number => ('deckCount' in g ? (g as GameView).deckCount : g.deck.length)
