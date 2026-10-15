import type { GameState, Player, TileCard } from './types'
import { RuleError } from './types'
import { WONDERS, civById } from './data'
import { shuffle } from './rng'

export const currentPlayer = (s: GameState): Player => s.players[s.order[s.turnIdx]]

const MAX_LOG = 400

export function say(s: GameState, msg: string): void {
  s.log.push(`[R${s.round}] ${msg}`)
  // 상태를 매번 복사하므로 로그는 최근 줄만 남긴다
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG)
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
    if (p.held) {
      card = p.held
      p.held = null
    } else {
      card = drawTiles(s, 1)[0]
    }
    const city = p.cities.find((c) => c.openSides.length > 0) ?? p.cities[0]
    const side = city.openSides.shift()
    city.tiles.push(side ? { card, role: 'side', side } : { card, role: 'extra' })
    onTileGained(s, p, card)
  }
  say(s, `${civById(p.civId).name} 문화 +${n}`)
}

/** 타일을 영토로 얻을 때 붙는 효과: 자연경관, 스페인, 일본 */
function onTileGained(s: GameState, p: Player, card: TileCard): void {
  if (card.wonder) {
    const w = WONDERS[card.wonder]
    if (w.cultureOnClaim) gainCulture(s, p, w.cultureOnClaim)
    if (p.civId === 'spain') gainCulture(s, p, 1)
  }
  if (p.civId === 'japan' && card.resource === 'fish') gainCulture(s, p, 1)
}
