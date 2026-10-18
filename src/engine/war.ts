import type { BattleHit, BattleState, CardInst, City, Declaration, GameState, Player, PlacedTile } from './types'
import { RuleError, SIDES } from './types'
import { cardById, civById } from './data'
import { gainCulture, say } from './core'
import { freeWorkers } from './scouting'
import { releaseUnique } from './military'
import { cardStats, isCoastalOnly } from './cardstats'
import type { CardStats } from './cardstats'
import { culture, tourism } from './yields'

export interface DeclTarget {
  defenderId: number
  cityId: number
  tileId: number
  kind: Declaration['kind']
}

const alive = (s: GameState) => s.players.filter((p) => !p.eliminated)
const prio = (s: GameState, pid: number) => s.order.indexOf(pid) // 작을수록 우선도가 높다

export function findTile(p: Player, cityId: number, tileId: number): { city: City; tile: PlacedTile } | null {
  const city = p.cities.find((c) => c.id === cityId)
  const tile = city?.tiles.find((t) => t.card.id === tileId)
  return city && tile ? { city, tile } : null
}

/** 도시 타일을 공격하려면 위·아래·왼쪽·오른쪽 4칸을 모두 내 장군으로 점령해야 한다. */
function cityAttackable(attacker: Player, defender: Player, city: City): boolean {
  if (city.openSides.length > 0) return false
  const sides = city.tiles.filter((t) => t.role === 'side')
  if (sides.length !== SIDES.length || !sides.every((t) => t.occupiedBy === attacker.id)) return false
  // 두 번째 도시가 있으면 첫 도시의 도시 타일은 공격할 수 없다
  if (city.id === 0 && defender.cities.length > 1) return false
  return true
}

export function declarationTargets(s: GameState, p: Player): DeclTarget[] {
  const out: DeclTarget[] = []
  if (p.eliminated || s.declarations.some((d) => d.attackerId === p.id)) return out
  if (freeWorkers(p) < 1) return out
  for (const city of p.cities) {
    for (const t of city.tiles) {
      if (t.occupiedBy !== undefined && t.occupiedBy !== p.id && !s.players[t.occupiedBy].eliminated) {
        out.push({ defenderId: t.occupiedBy, cityId: city.id, tileId: t.card.id, kind: 'retake' })
      }
    }
  }
  if (p.generals < 1) return out
  for (const opp of alive(s)) {
    if (opp.id === p.id) continue
    for (const city of opp.cities) {
      for (const t of city.tiles) {
        if (t.role === 'city') {
          if (cityAttackable(p, opp, city)) out.push({ defenderId: opp.id, cityId: city.id, tileId: t.card.id, kind: 'city' })
        } else if (t.occupiedBy === undefined) {
          out.push({ defenderId: opp.id, cityId: city.id, tileId: t.card.id, kind: 'normal' })
        }
      }
    }
  }
  return out
}

/** 점령 중인 상대 타일 (내 장군이 올라가 있는 타일) */
export function occupiedTiles(s: GameState, p: Player): { defenderId: number; cityId: number; tileId: number }[] {
  const out: { defenderId: number; cityId: number; tileId: number }[] = []
  for (const o of s.players) {
    if (o.id === p.id) continue
    for (const c of o.cities) for (const t of c.tiles) if (t.occupiedBy === p.id) out.push({ defenderId: o.id, cityId: c.id, tileId: t.card.id })
  }
  return out
}

/** 장군 불러들이기: 점령 중인 타일 하나를 풀고 장군을 돌려받는다 (차례에 1개까지). */
export function recallGeneral(s: GameState, p: Player, a: { defenderId: number; cityId: number; tileId: number }): void {
  if (p.turn!.recalled) throw new RuleError('장군은 한 차례에 1개까지만 불러들일 수 있습니다')
  const found = findTile(s.players[a.defenderId], a.cityId, a.tileId)
  if (!found || found.tile.occupiedBy !== p.id) throw new RuleError('내 장군이 점령 중인 타일이 아닙니다')
  found.tile.occupiedBy = undefined
  p.returningGenerals += 1 // 다음 차례부터 쓸 수 있다
  p.turn!.recalled = true
  say(s, `${civById(p.civId).name} 장군을 불러들임 (점령 해제, 다음 차례부터 사용)`)
}

export function declareWar(
  s: GameState,
  p: Player,
  a: { defenderId: number; cityId: number; tileId: number },
): void {
  const target = declarationTargets(s, p).find(
    (t) => t.defenderId === a.defenderId && t.cityId === a.cityId && t.tileId === a.tileId,
  )
  if (!target) throw new RuleError('그 타일에는 선전포고할 수 없습니다')
  if (target.kind !== 'retake') p.generals -= 1
  p.busyWorkers += 1
  s.declarations.push({ attackerId: p.id, defenderId: target.defenderId, cityId: target.cityId, tileId: target.tileId, kind: target.kind })
  const label = { normal: '선전포고', retake: '탈환 선전포고', city: '도시 공격 선전포고' }[target.kind]
  say(s, `${civById(p.civId).name} → ${civById(s.players[target.defenderId].civId).name} ${label}`)
}

// ───────────────────────── 전투 ─────────────────────────

const instOf = (p: Player, uid: number): CardInst | undefined => p.military.find((c) => c.uid === uid)

/** 전투에 낼 수 있는 카드인지: 원자폭탄 제외, 해안 전용 카드는 해안 타일 전투에서만, 줄루는 자기 원래 영토 전투에서 임피 불가. */
export function usableInBattle(s: GameState, b: BattleState, p: Player, c: CardInst): boolean {
  if (cardById(c.defId).notBattle || cardStats(c).hp === undefined) return false
  if (isCoastalOnly(c) && !b.coastal) return false
  const tileOwner = b.decl.kind === 'retake' ? b.decl.attackerId : b.decl.defenderId
  if (c.unique === '임피' && s.players[tileOwner].civId === 'zulu' && p.civId === 'zulu') return false
  return true
}

/** 선전포고를 하나 꺼내 전투를 시작한다. 처리할 선전포고가 없으면 false. */
export function startNextBattle(s: GameState): boolean {
  while (s.declarations.length > 0) {
    const decl = s.declarations.shift()!
    const att = s.players[decl.attackerId]
    const def = s.players[decl.defenderId]
    att.busyWorkers = Math.max(0, att.busyWorkers - 1)
    const owner = decl.kind === 'retake' ? att : def
    const target = findTile(owner, decl.cityId, decl.tileId)
    if (att.eliminated || def.eliminated || !target) {
      // 대상이 사라졌으면 장군을 돌려받는다
      if (decl.kind !== 'retake' && !att.eliminated) att.generals += 1
      continue
    }
    const b: BattleState = {
      decl,
      slots: { [att.id]: null, [def.id]: null },
      chooseQueue: [],
      picks: {},
      step: 'arrange',
      coastal: target.tile.card.terrains.includes('해안'),
    }
    for (const pl of [att, def]) {
      if (!pl.military.some((c) => usableInBattle(s, b, pl, c))) b.slots[pl.id] = [null, null, null, null]
    }
    s.battle = b
    s.phase = 'battle'
    say(s, `전투: ${civById(att.civId).name} vs ${civById(def.civId).name}`)
    if (b.slots[att.id] && b.slots[def.id]) beginChoosing(s)
    return true
  }
  return false
}

export function arrangeBattle(s: GameState, playerId: number, slots: (number | null)[]): void {
  const b = s.battle
  if (!b || b.step !== 'arrange') throw new RuleError('지금은 카드를 놓는 단계가 아닙니다')
  if (playerId !== b.decl.attackerId && playerId !== b.decl.defenderId) throw new RuleError('전투 참가자가 아닙니다')
  if (b.slots[playerId]) throw new RuleError('이미 카드를 놓았습니다')
  const p = s.players[playerId]
  if (slots.length !== 4) throw new RuleError('1~4번 자리 4칸을 모두 지정해야 합니다 (빈 자리는 null)')
  const used = slots.filter((x): x is number => x !== null)
  if (new Set(used).size !== used.length) throw new RuleError('같은 카드를 두 번 놓을 수 없습니다')
  for (const uid of used) {
    const c = instOf(p, uid)
    if (!c || !usableInBattle(s, b, p, c)) throw new RuleError('이 전투에 쓸 수 없는 카드입니다')
  }
  b.slots[playerId] = slots
  if (b.slots[b.decl.attackerId] && b.slots[b.decl.defenderId]) beginChoosing(s)
}

function boardUids(b: BattleState, pid: number): number[] {
  return (b.slots[pid] ?? []).filter((x): x is number => x !== null)
}

const impiOn = (s: GameState, b: BattleState, pid: number): boolean =>
  boardUids(b, pid).some((uid) => cardStats(instOf(s.players[pid], uid)!).effect === 'impi')

/** 카드를 공개한 뒤, 대상을 고르는 카드가 있으면 우선도가 높은 쪽부터 고른다. 코사크는 모두 고른 뒤에 고른다. 상대에게 임피가 있으면 효과 칸의 공격은 없어진다. */
function beginChoosing(s: GameState): void {
  const b = s.battle!
  const ids = [b.decl.attackerId, b.decl.defenderId].sort((x, y) => prio(s, x) - prio(s, y))
  const chooser = (pid: number, late: boolean): number[] => {
    const p = s.players[pid]
    const other = pid === ids[0] ? ids[1] : ids[0]
    if (impiOn(s, b, other)) return []
    return boardUids(b, pid).filter((uid) => {
      const st = cardStats(instOf(p, uid)!)
      return st.choose !== undefined && st.lateTarget === late
    })
  }
  b.chooseQueue = []
  for (const late of [false, true]) {
    for (const pid of ids) {
      const uids = chooser(pid, late)
      const other = pid === ids[0] ? ids[1] : ids[0]
      if (uids.length > 0 && boardUids(b, other).length > 0) b.chooseQueue.push({ playerId: pid, uids })
    }
  }
  b.step = 'choose'
  if (b.chooseQueue.length === 0) resolveBattle(s)
}

/** picks: 카드 → 상대 카드. null이면 일부러 빈칸을 공격한다 (대미지도 반격도 없다). */
export function chooseTargets(s: GameState, playerId: number, picks: Record<number, number | null>): void {
  const b = s.battle
  if (!b || b.step !== 'choose' || b.chooseQueue.length === 0) throw new RuleError('지금은 대상을 고르는 단계가 아닙니다')
  const head = b.chooseQueue[0]
  if (head.playerId !== playerId) throw new RuleError('지금은 상대가 대상을 고를 차례입니다')
  const enemyId = playerId === b.decl.attackerId ? b.decl.defenderId : b.decl.attackerId
  const enemyBoard = boardUids(b, enemyId)
  const enemy = s.players[enemyId]
  for (const uid of head.uids) {
    const target = picks[uid]
    if (target === undefined || (target !== null && !enemyBoard.includes(target))) throw new RuleError('모든 카드의 대상을 상대 카드(또는 빈칸) 중에서 골라야 합니다')
    // 대전차포: 상대 탱크는 카드를 고른다면 반드시 대전차포를 골라야 한다 (내 쪽에 임피가 있으면 대전차포의 효과는 무시된다). 일부러 빈칸을 고르는 것은 괜찮다.
    const me = cardStats(instOf(s.players[playerId], uid)!)
    const hasAT = enemyBoard.some((u) => cardStats(instOf(enemy, u)!).baseId === 'anti_tank_gun')
    if (me.baseId === 'tank' && hasAT && !impiOn(s, b, playerId) && target !== null && cardStats(instOf(enemy, target)!).baseId !== 'anti_tank_gun') {
      throw new RuleError('탱크는 대전차포를 공격 대상으로 골라야 합니다')
    }
  }
  for (const uid of head.uids) b.picks[uid] = picks[uid]
  b.chooseQueue.shift()
  if (b.chooseQueue.length === 0) resolveBattle(s)
}

interface Unit {
  inst: CardInst
  st: CardStats
  owner: number
  slot: number // 1~4
}

/** 공격 방향 → 마주 보는 상대 자리: 가운데 5-i, 왼쪽 6-i, 오른쪽 4-i (범위 밖이면 빈칸) */
const targetSlot = (dir: 'L' | 'C' | 'R', i: number): number => (dir === 'C' ? 5 - i : dir === 'L' ? 6 - i : 4 - i)

const isKnightLike = (u: Unit): boolean => u.st.baseId === 'knight' || u.st.baseId === 'cavalry'

function resolveBattle(s: GameState): void {
  const b = s.battle!
  const { attackerId, defenderId } = b.decl
  const decl = b.decl
  const units: Record<number, Unit[]> = { [attackerId]: [], [defenderId]: [] }
  const board: Record<number, (Unit | null)[]> = {}
  for (const pid of [attackerId, defenderId]) {
    const p = s.players[pid]
    board[pid] = (b.slots[pid] ?? [null, null, null, null]).map((uid, idx) => {
      if (uid === null) return null
      const inst = instOf(p, uid)!
      const u: Unit = { inst, st: cardStats(inst), owner: pid, slot: idx + 1 }
      units[pid].push(u)
      return u
    })
  }
  const all = [...units[attackerId], ...units[defenderId]]
  const unitByUid = (uid: number) => all.find((u) => u.inst.uid === uid)!
  const enemyIdOf = (u: Unit) => (u.owner === attackerId ? defenderId : attackerId)

  // 목표 타일: 원래 주인과 지형 (지형·주인에 따라 달라지는 고유 유닛 효과용)
  const tileOwnerId = decl.kind === 'retake' ? attackerId : defenderId
  const terrains = findTile(s.players[tileOwnerId], decl.cityId, decl.tileId)?.tile.card.terrains ?? []
  const onTerrain = (list: string[]) => terrains.some((t) => list.includes(t))

  // 임피: 상대 카드의 효과 칸 공격과 효과를 모두 무시한다
  const hasImpi = (pid: number) => units[pid].some((u) => u.st.effect === 'impi')
  const eff = (u: Unit) => !hasImpi(enemyIdOf(u))

  // 해안 타일 전투: 영국, 알렉산드리아 등대는 모든 카드 공격 전투력 +1 (함께 있으면 +2)
  const coastalBonus = (pid: number) => {
    if (!b.coastal) return 0
    const p = s.players[pid]
    return (p.civId === 'england' ? 1 : 0) + (p.wonders.includes('great_lighthouse') ? 1 : 0)
  }

  /** 체력: 스키 보병(툰드라·설원·언덕 +2), 화차(원래 내 타일 +2), 캐롤리언(원래 상대 타일 +1) */
  const hpOf = (u: Unit): number => {
    let hp = u.st.hp ?? Infinity
    if (eff(u)) {
      if (u.st.effect === 'ski' && onTerrain(['툰드라', '설원', '언덕'])) hp += 2
      if (u.st.effect === 'hwacha' && u.owner === tileOwnerId) hp += 2
      if (u.st.effect === 'carolean' && u.owner !== tileOwnerId) hp += 1
    }
    return hp
  }
  /** 전투력 마크 하나의 전투력: 테르시오(기사·기병대가 아니면 2), 스키 보병(+2), 사무라이(4로 지정) */
  const markPower = (u: Unit, base: number, target: Unit | null, over: Map<number, number>): number => {
    let p = base
    if (eff(u)) {
      if (u.st.effect === 'tercio' && target && !isKnightLike(target)) p = 2
      if (u.st.effect === 'ski' && onTerrain(['툰드라', '설원', '언덕'])) p += 2
    }
    if (over.has(u.inst.uid)) p = over.get(u.inst.uid)!
    return p + coastalBonus(u.owner)
  }
  /** 공격받았을 때 공격한 카드에게 주는 반격 대미지(방어력): 테르시오(기사·기병대가 아니면 1), 모호크(숲·정글 +2) */
  const defVs = (t: Unit, attacker: Unit): number => {
    let d = t.st.def
    if (eff(t)) {
      if (t.st.effect === 'tercio' && !isKnightLike(attacker)) d = 1
      if (t.st.effect === 'mohawk' && onTerrain(['숲', '정글'])) d += 2
    }
    return d
  }
  /** from이 to에게 주는 대미지: 전투기·폭격기는 전투기·대공포 외에게서 0, 대공포는 폭격기에게서 0 (효과가 무시되면 해당 없음) */
  const dmg = (from: Unit, to: Unit, amount: number): number => {
    if (eff(to) && to.st.special === 'airImmune' && from.st.baseId !== 'fighter' && from.st.baseId !== 'aa_gun') {
      // 로켓공학을 연구한 문명은 상대 전투기의 효과를 무시한다
      if (to.st.baseId === 'fighter' && s.players[from.owner].techs.includes('rocketry')) return amount
      return 0
    }
    if (eff(to) && to.st.special === 'bomberImmune' && from.st.baseId === 'bomber') return 0
    return amount
  }

  interface Calc {
    total: Map<number, number>
    hits: Map<number, Unit[]>
    inAtk: Map<number, number>
    inCnt: Map<number, number>
    links: BattleHit[]
  }
  /** 모든 카드가 동시에 공격한 결과. over: 사무라이처럼 전투력이 새로 정해진 카드 */
  const compute = (over: Map<number, number>): Calc => {
    const attacksIn = new Map<number, number[]>()
    const counterIn = new Map<number, number>()
    const hits = new Map<number, Unit[]>()
    const links: BattleHit[] = []
    for (const u of all) hits.set(u.inst.uid, [])
    for (const pid of [attackerId, defenderId]) {
      const enemyId = pid === attackerId ? defenderId : attackerId
      for (const u of units[pid]) {
        const attacks: { target: Unit | null; power: number }[] = []
        if (u.st.choose !== undefined) {
          if (eff(u)) {
            const t = b.picks[u.inst.uid]
            const target = t == null ? null : unitByUid(t)
            attacks.push({ target, power: u.st.choose + coastalBonus(pid) })
          }
        } else {
          for (const m of u.st.marks) {
            const j = targetSlot(m.dir, u.slot)
            const target = j >= 1 && j <= 4 ? board[enemyId][j - 1] : null
            attacks.push({ target, power: markPower(u, m.power, target, over) })
          }
        }
        for (const a of attacks) {
          if (!a.target) continue // 빈칸: 대미지도 반격도 없음
          const list = attacksIn.get(a.target.inst.uid) ?? []
          list.push(dmg(u, a.target, a.power))
          links.push({ from: { pid: u.owner, slot: u.slot }, to: { pid: a.target.owner, slot: a.target.slot }, power: list[list.length - 1] })
          attacksIn.set(a.target.inst.uid, list)
          hits.get(u.inst.uid)!.push(a.target)
          if (!(u.st.noCounter && eff(u))) {
            counterIn.set(u.inst.uid, (counterIn.get(u.inst.uid) ?? 0) + dmg(a.target, u, defVs(a.target, u)))
          }
        }
      }
    }
    // 투석병사: 자신을 향한 공격 중 1개까지(가장 큰 것) 대미지를 0으로 한다
    for (const u of all) {
      const list = attacksIn.get(u.inst.uid)
      if (eff(u) && u.st.effect === 'slinger' && list?.length) list[list.indexOf(Math.max(...list))] = 0
    }
    // 불멸자: 받게 되는 최대 반격 대미지를 1으로 만든다
    for (const u of all) {
      if (eff(u) && u.st.effect === 'immortal') counterIn.set(u.inst.uid, Math.min(counterIn.get(u.inst.uid) ?? 0, 1))
    }
    const total = new Map<number, number>()
    const inAtk = new Map<number, number>()
    const inCnt = new Map<number, number>()
    for (const u of all) {
      const a = (attacksIn.get(u.inst.uid) ?? []).reduce((x, y) => x + y, 0)
      const c = counterIn.get(u.inst.uid) ?? 0
      inAtk.set(u.inst.uid, a)
      inCnt.set(u.inst.uid, c)
      total.set(u.inst.uid, a + c)
    }
    return { total, hits, inAtk, inCnt, links }
  }

  // 조건이 붙은 효과는 대미지 계산 결과를 보고 판정한다: 먼저 계산하고, 사무라이(받은 총 대미지 3 이상이면 전투력 4)를 반영해 다시 계산한다.
  let calc = compute(new Map())
  const over = new Map<number, number>()
  for (const u of all) {
    if (eff(u) && u.st.effect === 'samurai' && (calc.total.get(u.inst.uid) ?? 0) >= 3) over.set(u.inst.uid, 4)
  }
  if (over.size > 0) calc = compute(over)

  const destroyed = new Set<number>()
  for (const u of all) {
    if ((calc.total.get(u.inst.uid) ?? 0) >= hpOf(u)) destroyed.add(u.inst.uid)
  }
  // 예니체리: 공격한 대상이 이번 전투로 파괴되면 체력을 7으로 계산한다 (받은 대미지 5·6이어도 살아남는다)
  for (const u of all) {
    if (eff(u) && u.st.effect === 'janissary' && calc.hits.get(u.inst.uid)!.some((t) => destroyed.has(t.inst.uid))) {
      if ((calc.total.get(u.inst.uid) ?? 0) >= 7) destroyed.add(u.inst.uid)
      else destroyed.delete(u.inst.uid)
    }
  }
  const survivors = (pid: number) => units[pid].filter((u) => !destroyed.has(u.inst.uid))
  const attackerWins = survivors(attackerId).length > survivors(defenderId).length // 같으면 수비 측 승리

  // 파괴된 카드는 공용 덱으로. 오스만은 상대의 해안 전용 카드를 파괴하면 그 카드를 가져온다.
  for (const pid of [attackerId, defenderId]) {
    const p = s.players[pid]
    const enemy = s.players[pid === attackerId ? defenderId : attackerId]
    for (const u of units[pid]) {
      if (!destroyed.has(u.inst.uid)) continue
      p.military = p.military.filter((c) => c.uid !== u.inst.uid)
      if (enemy.civId === 'ottoman' && isCoastalOnly(u.inst)) enemy.military.push(u.inst)
      else releaseUnique(s, u.inst) // 파괴된 고유 유닛은 3장 재고로 돌아간다
    }
  }
  say(
    s,
    `전투 결과: 공격 ${survivors(attackerId).length} / 수비 ${survivors(defenderId).length} → ${attackerWins ? '공격' : '수비'} 승 (파괴 ${destroyed.size}장)`,
  )
  // 재규어: 공격한 대상이 이번 전투로 파괴되면 문화 1
  for (const u of all) {
    const owner = s.players[u.owner]
    if (eff(u) && u.st.effect === 'jaguar' && owner.cities.length > 0 && calc.hits.get(u.inst.uid)!.some((t) => destroyed.has(t.inst.uid))) {
      gainCulture(s, owner, 1)
    }
  }

  const attacker = s.players[attackerId]
  const defender = s.players[defenderId]
  if (decl.kind === 'normal') {
    if (attackerWins) {
      const t = findTile(defender, decl.cityId, decl.tileId)
      if (t) t.tile.occupiedBy = attackerId // 장군을 목표 타일에 올려 점령
      else attacker.generals += 1
    } else attacker.generals += 1
  } else if (decl.kind === 'retake') {
    if (attackerWins) {
      const t = findTile(attacker, decl.cityId, decl.tileId)
      if (t && t.tile.occupiedBy !== undefined) {
        s.players[t.tile.occupiedBy].generals += 1 // 상대 장군을 돌려보냄
        t.tile.occupiedBy = undefined
      }
    }
  } else {
    // 도시 공격: 장군은 돌려받고, 공성 카드가 파괴되지 않은 채 이기면 도시를 파괴한다
    attacker.generals += 1
    const siege = survivors(attackerId).some((u) => u.st.siege && eff(u))
    if (attackerWins && siege) {
      const city = defender.cities.find((c) => c.id === decl.cityId)
      if (city) destroyCity(s, defender, city)
    }
  }
  const winnerSide: 'attacker' | 'defender' = attackerWins ? 'attacker' : 'defender'
  const outcome =
    decl.kind === 'city'
      ? attackerWins && survivors(attackerId).some((u) => u.st.siege && eff(u))
        ? '도시 파괴'
        : '도시를 지켜냈다'
      : decl.kind === 'retake'
        ? attackerWins
          ? '탈환 성공 (상대 장군이 돌아갔다)'
          : '탈환 실패'
        : attackerWins
          ? '타일 점령'
          : '점령 실패 (장군은 돌아왔다)'
  s.battleReports.push({
    seq: (s.battleReports.at(-1)?.seq ?? 0) + 1,
    round: s.round,
    attackerId,
    defenderId,
    kind: decl.kind,
    terrains: [...terrains],
    coastal: b.coastal,
    units: all.map((u) => ({
      inst: structuredClone(u.inst),
      owner: u.owner,
      slot: u.slot,
      hp: hpOf(u),
      attackDamage: calc.inAtk.get(u.inst.uid) ?? 0,
      counterDamage: calc.inCnt.get(u.inst.uid) ?? 0,
      destroyed: destroyed.has(u.inst.uid),
    })),
    hits: calc.links,
    survivors: { attacker: survivors(attackerId).length, defender: survivors(defenderId).length },
    winner: winnerSide,
    outcome,
  })
  if (s.battleReports.length > 30) s.battleReports.shift()
  s.battle = null
}

/** 도시 파괴: 일꾼과 타일은 모두 사라진다. 첫 도시가 파괴되면 탈락한다. */
export function destroyCity(s: GameState, owner: Player, city: City): void {
  for (const t of city.tiles) {
    if (t.occupiedBy !== undefined) s.players[t.occupiedBy].generals += 1
  }
  owner.cities = owner.cities.filter((c) => c.id !== city.id)
  say(s, `${civById(owner.civId).name}의 도시 파괴`)
  if (city.id === 0) eliminate(s, owner.id, 'conquest')
}

/** 탈락: 도시와 타일이 사라지고, 이 문명의 장군은 판에서 사라진다. 한 명만 남으면 게임이 끝난다. */
export function eliminate(s: GameState, pid: number, cause: 'conquest' | 'culture'): void {
  const p = s.players[pid]
  if (p.eliminated) return
  for (const city of p.cities) {
    for (const t of city.tiles) if (t.occupiedBy !== undefined) s.players[t.occupiedBy].generals += 1
  }
  p.cities = []
  p.eliminated = true
  for (const other of s.players) {
    for (const c of other.cities) for (const t of c.tiles) if (t.occupiedBy === pid) t.occupiedBy = undefined
    if (other.id !== pid) other.cities.forEach((c) => (c.enemyPlaced = c.enemyPlaced?.filter((e) => e.playerId !== pid)))
  }
  s.declarations = s.declarations.filter((d) => d.attackerId !== pid && d.defenderId !== pid)
  say(s, `${civById(p.civId).name} 탈락 (${cause === 'culture' ? '문화 패배' : '정복 패배'})`)
  const left = alive(s)
  if (left.length === 1 && !s.winner) {
    s.winner = { playerId: left[0].id, type: cause === 'culture' ? 'culture' : 'conquest' }
    s.phase = 'over'
    say(s, `${civById(left[0].civId).name} ${cause === 'culture' ? '문화' : '정복'} 승리`)
  }
}

/** 문화 패배: 상대의 턴당 관광이 내 문화(타일 수)보다 많아지면 탈락. 인터넷 검열시스템이 있으면 면제. */
export function checkCultureDefeats(s: GameState): void {
  const doomed = alive(s).filter((p) => {
    if (p.wonders.includes('internet_censorship')) return false
    return alive(s).some((o) => o.id !== p.id && tourism(o) > culture(p))
  })
  for (const p of doomed) {
    if (s.winner) break
    eliminate(s, p.id, 'culture')
  }
}

/** 원자폭탄: 내 차례에 사용해, 내 장군이 올라간 상대 타일을 파괴하고 장군을 돌려받는다. 첫 5타일은 파괴할 수 없다. */
export function detonateAtomicBomb(s: GameState, p: Player, a: { defenderId: number; cityId: number; tileId: number }): void {
  const bomb = p.military.find((c) => c.defId === 'atomic_bomb')
  if (!bomb) throw new RuleError('원자폭탄 카드가 없습니다')
  const def = s.players[a.defenderId]
  const found = def && findTile(def, a.cityId, a.tileId)
  if (!def || def.eliminated || !found) throw new RuleError('대상 타일이 없습니다')
  if (found.tile.occupiedBy !== p.id) throw new RuleError('내 장군이 올라간 타일만 파괴할 수 있습니다')
  if (found.tile.role !== 'extra') throw new RuleError('도시와 첫 5타일은 파괴할 수 없습니다')
  found.city.tiles = found.city.tiles.filter((t) => t !== found.tile)
  found.city.placed = found.city.placed.filter((id) => id !== a.tileId)
  p.generals += 1
  p.military = p.military.filter((c) => c.uid !== bomb.uid)
  say(s, `${civById(p.civId).name} 원자폭탄 → ${civById(def.civId).name} 타일 파괴`)
}

/** 만리장성: 게임 중 1번, 내 영토 위의 상대 장군을 모두 돌려보낸다. */
export function activateGreatWall(s: GameState, p: Player): void {
  if (!p.wonders.includes('great_wall')) throw new RuleError('만리장성이 없습니다')
  if (p.greatWallUsed) throw new RuleError('만리장성은 게임 중 1번만 쓸 수 있습니다')
  for (const c of p.cities) {
    for (const t of c.tiles) {
      if (t.occupiedBy !== undefined && t.occupiedBy !== p.id) {
        s.players[t.occupiedBy].generals += 1
        t.occupiedBy = undefined
      }
    }
  }
  p.greatWallUsed = true
  say(s, `${civById(p.civId).name} 만리장성: 상대 장군을 모두 돌려보냄`)
}
