import type { City, GameState, Player, TileCard } from './types'
import { RuleError } from './types'
import { WONDERS, civById } from './data'
import { nextRandom, shuffle } from './rng'

export const currentPlayer = (s: GameState): Player => s.players[s.order[s.turnIdx]]

const MAX_LOG = 400

export function say(s: GameState, msg: string): void {
  s.log.push(`[R${s.round}] ${msg}`)
  s.logSeq++
  // 상태를 매번 복사하므로 로그는 최근 줄만 남긴다
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG)
}

/**
 * 카드를 덱에 돌려넣고 섞는다. 방금 넣은 카드가 맨 위에 오면 다른 자리와 바꿔서,
 * 곧바로 다시 정찰하거나 뽑아도 같은 타일이 나오지 않게 한다.
 */
export function returnToDeck(s: GameState, card: TileCard): void {
  s.deck.push(card)
  shuffle(s, s.deck)
  if (s.deck.length > 1 && s.deck[0].id === card.id) {
    const j = 1 + Math.floor(nextRandom(s) * (s.deck.length - 1))
    ;[s.deck[0], s.deck[j]] = [s.deck[j], s.deck[0]]
  }
}

/** 덱에서 n장 뽑고, 뽑을 때마다(한 번의 뽑기마다) 덱을 섞는다. */
export function drawTiles(s: GameState, n: number): TileCard[] {
  if (s.deck.length < n) throw new RuleError('타일 덱이 부족합니다')
  const cards = s.deck.splice(0, n)
  shuffle(s, s.deck)
  return cards
}

/**
 * 문화를 n 얻어 새 타일을 붙인다. 첫 5타일의 남은 면이 있으면 거기에 먼저 붙인다.
 * 나침반으로 맡아둔 타일이 있으면 덱 대신 그 타일을 가져온다.
 */
export function gainCulture(s: GameState, p: Player, n: number): void {
  for (let i = 0; i < n; i++) {
    let card: TileCard
    if (p.held && p.choices?.useHeld !== false) {
      card = p.held
      p.held = null
    } else {
      card = drawTiles(s, 1)[0]
    }
    // 도시가 둘 이상이면 어느 도시에 붙일지 플레이어가 타일을 보고 고른다 (placeGainedTile)
    if (p.cities.length >= 2) (p.pendingTiles ??= []).push(card)
    else attachTile(s, p, defaultTileCity(p), card)
  }
  say(s, `${civById(p.civId).name} 문화 +${n}`)
}

/** 고르지 않았을 때 붙일 도시: 설정한 도시 → 빈 면이 있는 도시 → 첫 도시 */
export function defaultTileCity(p: Player): City {
  const preferred = p.choices?.cultureCity !== undefined ? p.cities.find((c) => c.id === p.choices!.cultureCity) : undefined
  return preferred ?? p.cities.find((c) => c.openSides.length > 0) ?? p.cities[0]
}

/** 타일을 도시에 붙인다: 첫 5타일의 빈 면이 있으면 반드시 그 면에, 아니면 추가 타일로 */
export function attachTile(s: GameState, p: Player, city: City, card: TileCard): void {
  const side = city.openSides.shift()
  city.tiles.push(side ? { card, role: 'side', side, late: true } : { card, role: 'extra', late: true })
  onTileGained(s, p, card)
}

/** 기다리는 타일 맨 앞 1장을 고른 도시에 붙인다 */
export function placeGainedTile(s: GameState, p: Player, cityId: number): void {
  const card = p.pendingTiles?.[0]
  if (!card) throw new RuleError('붙일 타일이 없습니다')
  const city = p.cities.find((c) => c.id === cityId)
  if (!city) throw new RuleError('내 도시가 아닙니다')
  p.pendingTiles!.shift()
  attachTile(s, p, city, card)
  say(s, `${civById(p.civId).name} 새 타일을 도시${city.id + 1}에 붙임`)
}

/** 차례가 끝날 때까지 붙이지 않은 타일은 기본 도시에 붙인다 */
export function flushPendingTiles(s: GameState, p: Player): void {
  while (p.pendingTiles?.length && p.cities.length) placeGainedTile(s, p, defaultTileCity(p).id)
  if (p.pendingTiles && !p.cities.length) p.pendingTiles = []
}

/** 타일을 영토로 얻을 때 붙는 효과: 자연경관, 스페인, 일본 */
export function onTileGained(s: GameState, p: Player, card: TileCard): void {
  if (card.wonder) {
    const w = WONDERS[card.wonder]
    if (w.cultureOnClaim) gainCulture(s, p, w.cultureOnClaim)
    if (p.civId === 'spain') gainCulture(s, p, 1)
  }
  if (p.civId === 'japan' && card.resource === 'fish') gainCulture(s, p, 1)
}
