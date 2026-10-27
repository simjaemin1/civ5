import type { CardInst, City, GameState, Player } from './types'
import { RuleError } from './types'
import { MILITARY_CARDS, cardById, civById, wonderCardById } from './data'
import type { Dir, MilitaryCardDef, UniqueUnitDef } from './data'
import { say } from './core'
import { nextRandom } from './rng'
import { dirsKey } from './cardstats'

/**
 * 한 종류의 군사 카드는 5장까지 보유한다. 더 만들 수는 있지만, 넘친 만큼은 직접 골라 버려야 한다 (discardCard).
 * 공용 덱의 카드는 사실상 무제한이라 재고는 세지 않는다.
 */
export const MAX_HOLD = 5

/**
 * 고유 유닛은 3장만 만들어져 있다: 방향 카드는 왼쪽·가운데·오른쪽 한 장씩, 방향이 없는 카드는 같은 카드 3장.
 * 파괴되면 다시 만들 수 있지만, 오스만에게 빼앗긴 카드(제고이센)는 파괴될 때까지 다시 만들 수 없다.
 */
export function initUniqueSupply(civIds: string[]): Record<string, string[]> {
  const supply: Record<string, string[]> = {}
  for (const id of civIds) {
    for (const u of civById(id).uniques) {
      // 전투력 마크가 있는 카드는 방향 조합마다 1장, 그 외(대상을 고르는 카드, 공성추)는 같은 카드 3장
      supply[u.name] = u.power !== undefined ? (u.variants ?? [['L'], ['C'], ['R']]).map((v) => v.join('')) : ['x', 'x', 'x']
    }
  }
  return supply
}

/** 판에서 사라지는 고유 유닛은 3장 재고로 돌아간다 (빼앗긴 경우는 호출하지 않는다). */
export function releaseUnique(s: GameState, c: CardInst): void {
  if (c.unique && s.uniqueSupply[c.unique]) s.uniqueSupply[c.unique].push(dirsKey(c.dirs))
}

/** 일반 카드(고유 유닛 제외)로 가진 장수: 한도(MAX_HOLD)는 이 수로 센다 */
export const heldCount = (p: Player, defId: string): number => p.military.filter((c) => c.defId === defId && !c.unique).length

export const hasAny = (p: Player, wonder: string): boolean => p.wonders.includes(wonder)

/** 아르테미스 사원: 전사·궁수·창병·전차(와 이 카드를 바탕으로 하는 고유 유닛) 생산 비용 -1. 고유 유닛은 카드에 적힌 비용에서 뺀다. */
export function cardCost(p: Player, def: MilitaryCardDef, unique?: UniqueUnitDef): number {
  const base = unique?.cost ?? def.cost
  let minus = 0
  if (hasAny(p, 'temple_of_artemis')) {
    for (const e of wonderCardById('temple_of_artemis').effects) {
      if (e.kind === 'militaryCostMinus' && e.bases.includes(def.id)) minus += e.amount
    }
  }
  return Math.max(1, base - minus)
}

export function uniqueOf(p: Player, name: string): UniqueUnitDef | undefined {
  return civById(p.civId).uniques.find((u) => u.name === name)
}

/** 도시를 세울 때의 첫 5타일 (나중에 붙은 타일은 제외) */
const first5 = (city: City) => city.tiles.filter((t) => (t.role === 'city' || t.role === 'side') && !t.late)
export const isCoastalCity = (city: City): boolean => first5(city).some((t) => t.card.terrains.includes('해안'))

/** 같은 계열의 더 높은 단계 기술을 얻으면 낮은 단계 카드는 더 만들 수 없다 ("앞으로 ○○ 생산불가") */
export function isObsolete(p: Player, def: MilitaryCardDef): boolean {
  if (!def.line || !def.tier) return false
  return MILITARY_CARDS.some((c) => c.line === def.line && c.tier! > def.tier! && p.techs.includes(c.tech))
}

/** 이 문명이 지금 만들 수 있는 카드 (기술 보유. 한 종류 5장 보유 한도는 넘겨도 만들 수 있고, 넘친 만큼 골라 버린다). */
export function producible(s: GameState, p: Player, defId: string, unique?: string, city?: City): { def: MilitaryCardDef; uq?: UniqueUnitDef } | null {
  const uq = unique ? uniqueOf(p, unique) : undefined
  if (unique && !uq) return null
  const id = uq ? uq.base : defId
  if (uq && uq.base !== defId) return null
  const def = cardById(id)
  if (def.uniqueOnly && !uq) return null // 화차·제고이센은 고유 유닛으로만 만든다
  const tech = uq?.tech ?? def.tech
  if (!p.techs.includes(tech)) return null
  if (isObsolete(p, def)) return null
  if (city && def.requires && !city.tiles.some((t) => t.card.resource === def.requires)) return null
  if (uq && (s.uniqueSupply[uq.name]?.length ?? 0) === 0) return null // 고유 유닛 3장이 모두 존재함
  return { def, uq }
}

/**
 * 새 카드: 방향이 있는 카드는 방향이 무작위로 정해진다 (같은 확률).
 * 고유 유닛은 남은 3장 중 하나가 무작위로 나온다 (카드마다 마크 방향이 정해져 있다).
 */
function newCard(s: GameState, defId: string, unique?: string): CardInst {
  const def = cardById(defId)
  if (unique) {
    const supply = s.uniqueSupply[unique]
    const key = supply.splice(Math.floor(nextRandom(s) * supply.length), 1)[0]
    return { uid: s.nextUid++, defId, dirs: key === 'x' ? undefined : (key.split('') as Dir[]), unique }
  }
  const dir: Dir | undefined = def.variantDirs ? def.variantDirs[Math.floor(nextRandom(s) * def.variantDirs.length)] : undefined
  return { uid: s.nextUid++, defId, dirs: dir ? [dir] : undefined }
}

/** 기술 효과 등으로 카드를 바로 받는다 (핵융합의 원자폭탄) */
/** 보유 한도(MAX_HOLD)를 넘으면 버릴 카드를 골라야 한다: 넘친 종류를 기록한다 */
function noteOverflow(p: Player, defId: string, unique?: string): void {
  if (unique) return // 고유 유닛은 3장만 존재하고 일반 카드의 한도에 세지 않는다
  if (heldCount(p, defId) > MAX_HOLD) (p.pendingCardDiscard ??= []).push(defId)
}

/** 넘친 군사 카드 1장을 골라 버린다 (고유 유닛이면 재고로 돌아간다) */
export function discardCard(s: GameState, p: Player, uid: number): void {
  const inst = p.military.find((c) => c.uid === uid)
  if (!inst) throw new RuleError('내 카드가 아닙니다')
  const at = inst.unique ? -1 : (p.pendingCardDiscard?.indexOf(inst.defId) ?? -1)
  if (at < 0) throw new RuleError('버려야 하는 종류의 일반 카드를 고르세요')
  p.military = p.military.filter((c) => c.uid !== uid)
  releaseUnique(s, inst)
  p.pendingCardDiscard!.splice(at, 1)
  if (!p.pendingCardDiscard!.length) p.pendingCardDiscard = undefined
  say(s, `${civById(p.civId).name} 넘친 ${cardById(inst.defId).name} 1장을 버림`)
}

export function grantCard(s: GameState, p: Player, defId: string): void {
  p.military.push(newCard(s, defId))
  noteOverflow(p, defId)
  say(s, `${civById(p.civId).name} ${cardById(defId).name} 획득`)
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
  const ok = producible(s, p, a.defId, a.unique, city)
  if (!ok) throw new RuleError('지금 만들 수 없는 카드입니다 (기술·자원·더 높은 단계 보유 확인)')
  const { def, uq } = ok
  if ((uq?.coastalOnly || def.special === 'coastalOnly') && !isCoastalCity(city)) {
    throw new RuleError('첫 5타일에 해안이 있는 도시에서만 만들 수 있습니다')
  }
  const cost = cardCost(p, def, uq)
  const available = turn.yields.cities.find((c) => c.cityId === a.cityId)!.hammer
  if (available < cost) throw new RuleError('도시의 망치가 모자랍니다')
  p.military.push(newCard(s, def.id, a.unique))
  noteOverflow(p, def.id, a.unique)
  turn.produced.push(a.cityId)
  say(s, `${civById(p.civId).name} ${a.unique ?? def.name} 생산 (망치 ${cost})`)
}

/** 지금 이 카드를 승급할 수 있는 상위 카드들 (중간 등급을 건너뛸 수 있다. 비싼 순) */
export function upgradeTargets(p: Player, inst: CardInst): MilitaryCardDef[] {
  const lower = cardById(inst.defId)
  if (!lower.line || !lower.tier) return []
  return MILITARY_CARDS.filter((c) => c.line === lower.line && c.tier! > lower.tier! && p.techs.includes(c.tech)).sort((a, b) => b.tier! - a.tier!)
}

/** 금으로 승급: 가진 하위 카드를 지금 만들 수 있는 상위 카드(중간 등급 건너뛰기 가능)로 바꾸고 상위 카드의 생산 비용만큼 금을 낸다. 한 차례에 한 장. 새 카드의 방향은 무작위. */
export function upgradeCard(s: GameState, p: Player, a: { uid: number; unique?: string; toDefId?: string }): void {
  const turn = p.turn!
  if (turn.upgraded) throw new RuleError('승급은 한 차례에 한 장만 할 수 있습니다')
  const inst = p.military.find((c) => c.uid === a.uid)
  if (!inst) throw new RuleError('내 카드가 아닙니다')
  const lower = cardById(inst.defId)
  if (!lower.line || !lower.tier) throw new RuleError('승급할 수 없는 카드입니다')
  const options = upgradeTargets(p, inst)
  const upper = a.toDefId ? options.find((c) => c.id === a.toDefId) : a.unique ? options.find((c) => c.id === uniqueOf(p, a.unique!)?.base) : options[options.length - 1]
  if (!upper) throw new RuleError(options.length ? '그 카드로는 승급할 수 없습니다' : '지금 승급할 수 있는 윗 단계가 없습니다 (기술 확인)')
  const uq = a.unique ? uniqueOf(p, a.unique) : undefined
  if (a.unique && (!uq || uq.base !== upper.id)) throw new RuleError('그 고유 유닛으로 승급할 수 없습니다')
  if (!p.techs.includes(uq?.tech ?? upper.tech)) throw new RuleError('필요한 기술이 없습니다')
  if (uq && (s.uniqueSupply[uq.name]?.length ?? 0) === 0) throw new RuleError('그 고유 유닛 3장이 모두 존재합니다')
  const cost = cardCost(p, upper, uq)
  if (turn.yields.gold < cost) throw new RuleError('금이 모자랍니다')
  p.military = p.military.filter((c) => c.uid !== a.uid)
  releaseUnique(s, inst) // 승급으로 바뀐 하위 고유 유닛은 재고로 돌아간다
  p.military.push(newCard(s, upper.id, a.unique))
  noteOverflow(p, upper.id, a.unique)
  turn.upgraded = true
  turn.yields.gold -= cost
  say(s, `${civById(p.civId).name} ${lower.name} → ${upper.name} 승급 (금 ${cost})`)
}

/** 인도: 군사 카드 1장을 공용 덱에 돌려 파괴하면 그 차례 식량 +2 */
export function sacrificeCard(s: GameState, p: Player, uid: number): void {
  if (p.civId !== 'india') throw new RuleError('인도만 쓸 수 있는 능력입니다')
  const inst = p.military.find((c) => c.uid === uid)
  if (!inst) throw new RuleError('내 카드가 아닙니다')
  p.military = p.military.filter((c) => c.uid !== uid)
  releaseUnique(s, inst)
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
  noteOverflow(p, ok.def.id, a.unique)
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
