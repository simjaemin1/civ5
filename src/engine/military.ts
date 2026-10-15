import type { CardInst, City, GameState, Player } from './types'
import { RuleError } from './types'
import { MILITARY_CARDS, cardById, civById } from './data'
import type { Dir, MilitaryCardDef, UniqueUnitDef } from './data'
import { say } from './core'
import { nextRandom } from './rng'

/** 한 종류의 군사 카드는 최대 6장까지 보유할 수 있다. 공용 덱의 카드는 사실상 무제한이라 재고는 세지 않는다. */
export const MAX_HOLD = 6

export const hasAny = (p: Player, wonder: string): boolean => p.wonders.includes(wonder)

/** 아르테미스 사원: 군사 카드 생산 비용 -1 */
export function cardCost(p: Player, def: MilitaryCardDef, unique?: UniqueUnitDef): number {
  const base = def.cost + (unique?.extraCost ?? 0)
  return Math.max(1, base - (hasAny(p, 'temple_of_artemis') ? 1 : 0))
}

export function uniqueOf(p: Player, name: string): UniqueUnitDef | undefined {
  return civById(p.civId).uniques.find((u) => u.name === name)
}

const first5 = (city: City) => city.tiles.filter((t) => t.role === 'city' || t.role === 'side')
export const isCoastalCity = (city: City): boolean => first5(city).some((t) => t.card.terrains.includes('해안'))

/** 해안 전용 카드: 전함, 제고이센 */
export const isCoastalOnly = (c: CardInst): boolean => c.defId === 'battleship'

/** 이 문명이 지금 만들 수 있는 카드 (기술 보유, 한 종류 6장 보유 한도). */
export function producible(_s: GameState, p: Player, defId: string, unique?: string): { def: MilitaryCardDef; uq?: UniqueUnitDef } | null {
  const uq = unique ? uniqueOf(p, unique) : undefined
  if (unique && !uq) return null
  const id = uq ? uq.base : defId
  if (uq && uq.base !== defId) return null
  const def = cardById(id)
  const tech = uq?.tech ?? def.tech
  if (!p.techs.includes(tech)) return null
  if (p.military.filter((c) => c.defId === id).length >= MAX_HOLD) return null
  return { def, uq }
}

/** 방향이 있는 카드는 만들 때 공격 방향이 무작위로 정해진다 (왼쪽·가운데·오른쪽 같은 확률). */
function newCard(s: GameState, defId: string, unique?: string): CardInst {
  const def = cardById(defId)
  const dir: Dir | undefined = def.variantDirs ? def.variantDirs[Math.floor(nextRandom(s) * def.variantDirs.length)] : undefined
  return { uid: s.nextUid++, defId, dir, unique }
}

export function produceCard(
  s: GameState,
  p: Player,
  a: { cityId: number; defId: string; unique?: string },
): void {
  const city = p.cities.find((c) => c.id === a.cityId)
  if (!city) throw new RuleError('내 도시가 아닙니다')
  const turn = p.turn!
  if (turn.produced.includes(a.cityId)) throw new RuleError('도시마다 한 차례에 생산은 1개만 할 수 있습니다')
  const ok = producible(s, p, a.defId, a.unique)
  if (!ok) throw new RuleError('지금 만들 수 없는 카드입니다')
  const { def, uq } = ok
  if (isCoastalOnly({ uid: 0, defId: def.id }) && !isCoastalCity(city)) {
    throw new RuleError('첫 5타일에 해안이 있는 도시에서만 만들 수 있습니다')
  }
  const cost = cardCost(p, def, uq)
  const available = turn.yields.cities.find((c) => c.cityId === a.cityId)!.hammer
  if (available < cost) throw new RuleError('도시의 망치가 모자랍니다')
  p.military.push(newCard(s, def.id, a.unique))
  turn.produced.push(a.cityId)
  say(s, `${civById(p.civId).name} ${a.unique ?? def.name} 생산 (망치 ${cost})`)
}

/** 금으로 승급: 가진 하위 카드를 바로 윗 단계로 바꾸고 상위 카드의 생산 비용만큼 금을 낸다. 한 차례에 한 장. 새 카드의 방향은 무작위. */
export function upgradeCard(s: GameState, p: Player, a: { uid: number; unique?: string }): void {
  const turn = p.turn!
  if (turn.upgraded) throw new RuleError('승급은 한 차례에 한 장만 할 수 있습니다')
  const inst = p.military.find((c) => c.uid === a.uid)
  if (!inst) throw new RuleError('내 카드가 아닙니다')
  const lower = cardById(inst.defId)
  if (!lower.line || !lower.tier) throw new RuleError('승급할 수 없는 카드입니다')
  const upper = MILITARY_CARDS.find((c) => c.line === lower.line && c.tier === lower.tier! + 1)
  if (!upper) throw new RuleError('더 윗 단계가 없습니다')
  const uq = a.unique ? uniqueOf(p, a.unique) : undefined
  if (a.unique && (!uq || uq.base !== upper.id)) throw new RuleError('그 고유 유닛으로 승급할 수 없습니다')
  if (!p.techs.includes(uq?.tech ?? upper.tech)) throw new RuleError('필요한 기술이 없습니다')
  if (p.military.filter((c) => c.defId === upper.id).length >= MAX_HOLD) throw new RuleError('한 종류는 6장까지만 가질 수 있습니다')
  const cost = cardCost(p, upper, uq)
  if (turn.yields.gold < cost) throw new RuleError('금이 모자랍니다')
  p.military = p.military.filter((c) => c.uid !== a.uid)
  p.military.push(newCard(s, upper.id, a.unique))
  turn.upgraded = true
  turn.yields.gold -= cost
  say(s, `${civById(p.civId).name} ${lower.name} → ${upper.name} 승급 (금 ${cost})`)
}

/** 인도: 군사 카드 1장을 공용 덱에 돌려 파괴하면 그 차례 식량 +2 */
export function sacrificeCard(s: GameState, p: Player, uid: number): void {
  if (p.civId !== 'india') throw new RuleError('인도만 쓸 수 있는 능력입니다')
  if (!p.military.some((c) => c.uid === uid)) throw new RuleError('내 카드가 아닙니다')
  p.military = p.military.filter((c) => c.uid !== uid)
  p.turn!.extraFood += 2
  p.turn!.yields.cities[0].food += 2
  say(s, `인도 군사 카드 파괴 → 식량 +2`)
}

/** 독일: 장군을 얻을 때마다 생산 가능한 군사 카드 1장을 망치 없이 얻는다. */
export function claimFreeCard(s: GameState, p: Player, a: { defId: string; unique?: string }): void {
  if (p.pendingFreeCards <= 0) throw new RuleError('받을 수 있는 무료 카드가 없습니다')
  const ok = producible(s, p, a.defId, a.unique)
  if (!ok) throw new RuleError('지금 받을 수 없는 카드입니다')
  p.military.push(newCard(s, ok.def.id, a.unique))
  p.pendingFreeCards--
  say(s, `${civById(p.civId).name} 무료 군사 카드: ${a.unique ?? ok.def.name}`)
}

/** 위대한 장군 토큰을 얻는다 (독일은 무료 군사 카드 선택권도 얻는다). */
export function gainGeneral(p: Player, n: number): void {
  p.generals += n
  if (p.civId === 'germany') p.pendingFreeCards += n
}

/** 무료 카드를 받을 수 있는데 만들 수 있는 카드가 하나도 없으면 선택권을 버린다. */
export function anyProducible(s: GameState, p: Player): boolean {
  return MILITARY_CARDS.some((c) => {
    if (producible(s, p, c.id)) return true
    return civById(p.civId).uniques.some((u) => u.base === c.id && producible(s, p, c.id, u.name))
  })
}
