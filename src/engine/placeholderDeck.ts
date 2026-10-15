import type { TileCard, Terrain } from './types'
import { nextRandom } from './rng'
import { RESOURCES } from './data'
import { primaryTerrain } from './yields'

/**
 * 임시 타일 덱 160장. 실제 카드 목록이 없어서 규칙 검증용으로 만든 것이며
 * 분포는 실제와 다르다. 실제 데이터가 생기면 이 파일을 교체한다.
 * 자원은 지형에 맞는 것만 붙인다 (예: 습지의 사치자원은 설탕뿐). 자원-지형 표는 resources.json의 terrains.
 */
const WEIGHTS: [Terrain[], number][] = [
  [['평지'], 22], [['정글'], 10], [['호수'], 6], [['오아시스'], 3],
  [['숲'], 14], [['언덕'], 14], [['사막'], 10], [['툰드라'], 8],
  [['습지'], 6], [['해안'], 14], [['설원'], 6], [['산'], 6],
  [['숲', '언덕'], 4], [['평지', '해안'], 4],
]

export function makePlaceholderDeck(seed = 1): TileCard[] {
  const s = { rng: seed }
  const total = WEIGHTS.reduce((a, [, w]) => a + w, 0)
  const deck: TileCard[] = []
  for (let id = 0; id < 160; id++) {
    let r = nextRandom(s) * total
    let terrains = WEIGHTS[0][0]
    for (const [t, w] of WEIGHTS) {
      if ((r -= w) < 0) { terrains = t; break }
    }
    const card: TileCard = { id, terrains }
    if (nextRandom(s) < 0.3) {
      const terrain = primaryTerrain(terrains)
      const fits = Object.keys(RESOURCES).filter((k) => RESOURCES[k].terrains.includes(terrain))
      if (fits.length) card.resource = fits[Math.floor(nextRandom(s) * fits.length)]
    }
    deck.push(card)
  }
  return deck
}
