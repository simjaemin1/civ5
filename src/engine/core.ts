import type { GameState, Player, TileCard } from './types'
import { RuleError } from './types'
import { civById } from './data'
import { shuffle } from './rng'

export const currentPlayer = (s: GameState): Player => s.players[s.order[s.turnIdx]]

export function say(s: GameState, msg: string): void {
  s.log.push(`[R${s.round}] ${msg}`)
}

/** 덱에서 n장 뽑고, 뽑을 때마다(한 번의 뽑기마다) 덱을 섞는다. */
export function drawTiles(s: GameState, n: number): TileCard[] {
  if (s.deck.length < n) throw new RuleError('타일 덱이 부족합니다')
  const cards = s.deck.splice(0, n)
  shuffle(s, s.deck)
  return cards
}

/** 문화를 n 얻어 새 타일을 붙인다. 첫 5타일의 남은 면이 있으면 거기에 먼저 붙인다. */
export function gainCulture(s: GameState, p: Player, n: number): void {
  for (let i = 0; i < n; i++) {
    const [card] = drawTiles(s, 1)
    const city = p.cities.find((c) => c.openSides.length > 0) ?? p.cities[0]
    const side = city.openSides.shift()
    city.tiles.push(side ? { card, role: 'side', side } : { card, role: 'extra' })
  }
  say(s, `${civById(p.civId).name} 문화 +${n}`)
}
