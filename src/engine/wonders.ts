import type { City, GameState, Player } from './types'
import { RuleError } from './types'
import { WONDER_CARDS, civById, wonderCardById } from './data'
import type { WonderCardDef } from './data'
import { gainCulture, say } from './core'
import { gainGeneral } from './military'

const first5 = (city: City) => city.tiles.filter((t) => t.role === 'city' || t.role === 'side')

export function conditionMet(p: Player, city: City, w: WonderCardDef): boolean {
  const c = w.condition
  if (!c) return true
  switch (c.kind) {
    case 'stoneInCity':
      return city.tiles.some((t) => t.card.resource === 'stone')
    case 'coastFirst5':
      return first5(city).some((t) => t.card.terrains.includes('해안'))
    case 'desertFirst5':
      return first5(city).some((t) => t.card.terrains.includes('사막'))
    case 'mountainInTerritory':
      return p.cities.some((ci) => ci.tiles.some((t) => t.card.terrains.includes('산')))
    case 'policy':
      return p.policy === c.policy
  }
}

/** 이집트는 불가사의 최소 망치 조건 -1 */
export function minHammers(p: Player, w: WonderCardDef): number {
  return Math.max(1, w.minHammers - (p.civId === 'egypt' ? 1 : 0))
}

export function investableWonders(s: GameState, p: Player, city: City): WonderCardDef[] {
  return WONDER_CARDS.filter(
    (w) =>
      p.techs.includes(w.tech) &&
      s.wonderOwners[w.id] === undefined &&
      conditionMet(p, city, w) &&
      !s.investments.some((i) => i.wonderId === w.id && i.playerId === p.id),
  )
}

export function invest(s: GameState, p: Player, cityId: number, wonderId: string, hammers: number): void {
  const w = wonderCardById(wonderId)
  const city = p.cities.find((c) => c.id === cityId)
  if (!city) throw new RuleError('내 도시가 아닙니다')
  const turn = p.turn!
  if (turn.produced.includes(cityId)) throw new RuleError('도시마다 한 차례에 생산은 1개만 할 수 있습니다')
  if (!p.techs.includes(w.tech)) throw new RuleError('필요한 기술이 없습니다')
  if (s.wonderOwners[w.id] !== undefined) throw new RuleError('이미 완성된 불가사의입니다')
  if (!conditionMet(p, city, w)) throw new RuleError('건설 조건을 만족하지 못합니다')
  if (s.investments.some((i) => i.wonderId === w.id && i.playerId === p.id)) {
    throw new RuleError('한 문명이 두 도시에서 같은 불가사의를 건설할 수 없습니다')
  }
  if (hammers < minHammers(p, w)) throw new RuleError(`최소 망치 ${minHammers(p, w)} 이상이어야 합니다`)
  const available = turn.yields.cities.find((c) => c.cityId === cityId)!.hammer
  if (hammers > available) throw new RuleError('도시의 망치가 모자랍니다')
  s.investments.push({ wonderId, playerId: p.id, cityId, hammers })
  turn.produced.push(cityId)
  say(s, `${civById(p.civId).name} ${w.name}에 망치 ${hammers} 투자`)
}

export function applyWonderEffects(s: GameState, p: Player, w: WonderCardDef): void {
  for (const e of w.effects) {
    if (e.kind === 'general') gainGeneral(s, p, e.amount)
    else if (e.kind === 'setPolicy') p.policy = e.policy
    else if (e.kind === 'culture') gainCulture(s, p, e.amount)
    else if (e.kind === 'choosePolicy') p.pendingPolicies++
    // happiness, goldPerTurn, tourism, desertBonus 등은 완성한 불가사의 목록에서 계산한다
  }
}

/** 정산: 가장 많이 투자한 한 명만 진척도 1 (동률이면 아무도 못 얻음). 올린 망치는 모두 사라진다. */
export function settleWonders(s: GameState): void {
  const byWonder = new Map<string, { playerId: number; hammers: number }[]>()
  for (const inv of s.investments) {
    const list = byWonder.get(inv.wonderId) ?? []
    list.push({ playerId: inv.playerId, hammers: inv.hammers })
    byWonder.set(inv.wonderId, list)
  }
  for (const [wonderId, list] of byWonder) {
    const top = Math.max(...list.map((x) => x.hammers))
    const leaders = list.filter((x) => x.hammers === top)
    const name = wonderCardById(wonderId).name
    if (leaders.length !== 1) {
      say(s, `${name}: 최다 투자 동률 → 진척도 없음`)
      continue
    }
    const pid = leaders[0].playerId
    const prog = (s.wonderProgress[wonderId] ??= {})
    prog[pid] = (prog[pid] ?? 0) + 1
    say(s, `${name}: ${civById(s.players[pid].civId).name} 진척도 ${prog[pid]}/${wonderCardById(wonderId).progressNeeded}`)
    if (prog[pid] >= wonderCardById(wonderId).progressNeeded && s.wonderOwners[wonderId] === undefined) {
      const owner = s.players[pid]
      s.wonderOwners[wonderId] = pid
      owner.wonders.push(wonderId)
      say(s, `${civById(owner.civId).name} ${name} 완성`)
      applyWonderEffects(s, owner, wonderCardById(wonderId))
    }
  }
  s.investments = []
}
