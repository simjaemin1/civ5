import type { Action, BattleReport, BattleState, CardInst, Declaration, GameState, Player } from './types'
import { RuleError } from './types'
import { cardById } from './data'
import { cardStats } from './cardstats'
import { arrangeBattle, chooseTargets, findTile, targetSlot, usableInBattle } from './war'
import type { DeclTarget } from './war'

/**
 * AI 전투: 배치(arrangeBattle)와 대상 고르기(chooseTargets)에 게임 이론을 쓴다.
 * 결과는 모두 상태 복사본에서 엔진 전투를 그대로 돌려 얻는다 (규칙을 두 군데 구현하지 않는다).
 * 상대의 비공개 정보(카드 방향, 아직 안 낸 배치)는 쓰지 않는다: 방향은 왼쪽·가운데·오른쪽을 고르게 뽑은 표본으로 센다.
 */
export const BATTLE_TUNE = {
  /** 꺼지면 예전 휴리스틱 (체력 + 공격력×2 상위 4장, 대상은 체력 최저) */
  enabled: true,
  /** 배치를 최소 손해(maximin) 대신 균형 혼합 전략(가상 플레이)에서 상태 난수로 뽑는다 */
  mixed: false,
  /** 배치 결과 표: 상대 방향 표본 수 */
  samples: 3,
  /** 선전포고 전 승률 추정: 결과 표를 쓴다 (꺼지면 양쪽을 내 AI 복사본으로 두고 돌린다) */
  oddsMatrix: true,
  /** 승률 추정: 상대 방향 표본 수 */
  oddsSamples: 6,
  /** 대상 고르기에서 돌려 볼 전투 수의 상한 (넘으면 한 장씩 바꿔 보며 고른다) */
  maxChooseSims: 400,
}

// ───── 예전 휴리스틱 (결과 표 안에서 빠르게 돌릴 때와 설정을 끌 때 쓴다) ─────

/**
 * 공격 마크가 상대 칸 안쪽(1~4번)을 향하면 값이 있고 벽(범위 밖)을 향하면 헛방이다.
 * 원거리 계열은 반드시 안쪽을 향하게, 창병 계열은 벽을 향해도 괜찮지만 임피는 공격수라 안쪽을 향하게 둔다.
 */
function wallWeight(c: CardInst): number {
  if (cardStats(c).effect === 'impi') return 3
  const line = cardById(c.defId).line
  if (line === 'ranged') return 3
  if (line === 'anti_cavalry') return 0.3
  return 2
}

/** 이 카드를 slot(1~4번)에 놓았을 때 안쪽을 향하는 공격의 가치 */
function inwardValue(c: CardInst, slot: number): number {
  const w = wallWeight(c)
  return cardStats(c).marks.reduce((n, m) => {
    const j = targetSlot(m.dir, slot)
    return n + (j >= 1 && j <= 4 ? m.power * w : 0)
  }, 0)
}

/** 낼 카드(최대 4장)를 4칸에 놓는 방법 중 안쪽을 향하는 공격이 가장 많은 것. 같으면 원래 순서를 지킨다 */
export function bestSlots(p: Player, uids: number[]): (number | null)[] {
  const base: (number | null)[] = [uids[0] ?? null, uids[1] ?? null, uids[2] ?? null, uids[3] ?? null]
  const inst = (u: number) => p.military.find((c) => c.uid === u)!
  const score = (slots: (number | null)[]): number => slots.reduce<number>((n, u, i) => n + (u === null ? 0 : inwardValue(inst(u), i + 1)), 0)
  let best = base
  let bestScore = score(base)
  const used = new Set<number>()
  const cur: (number | null)[] = []
  const walk = (i: number) => {
    if (i === 4) {
      const sc = score(cur)
      if (sc > bestScore) {
        best = [...cur]
        bestScore = sc
      }
      return
    }
    for (const u of uids) {
      if (used.has(u)) continue
      used.add(u)
      cur[i] = u
      walk(i + 1)
      used.delete(u)
    }
    // 카드가 4장보다 적으면 빈칸도 둘 수 있다
    if (cur.filter((x, k) => k < i && x !== null).length + (4 - i) > uids.length) {
      cur[i] = null
      walk(i + 1)
    }
  }
  walk(0)
  return best
}

/** 체력 + 공격력×2 */
const powerOf = (c: CardInst): number => {
  const st = cardStats(c)
  return (st.hp ?? 0) + (st.choose ?? st.marks[0]?.power ?? st.markPower ?? 0) * 2
}

/** 이 전투에 낼 수 있는 카드, 강한 순 (도시를 공격할 때는 공성 카드를 먼저: 살아남아 이겨야 도시가 파괴된다) */
function usableSorted(s: GameState, b: BattleState, p: Player): CardInst[] {
  const siegeFirst = (c: CardInst) => (b.decl.kind === 'city' && b.decl.attackerId === p.id && cardStats(c).siege ? 1000 : 0)
  return p.military.filter((c) => usableInBattle(s, b, p, c)).sort((x, y) => powerOf(y) + siegeFirst(y) - (powerOf(x) + siegeFirst(x)))
}

/** 예전 대상 고르기: 체력이 가장 낮은 상대 카드 (탱크는 상대에게 대전차포가 있으면 대전차포) */
export function simplePicks(s: GameState, pid: number): Record<number, number | null> {
  const b = s.battle!
  const head = b.chooseQueue[0]
  const enemyId = pid === b.decl.attackerId ? b.decl.defenderId : b.decl.attackerId
  const enemy = s.players[enemyId]
  const enemyBoard = boardOf(b, enemyId)
  const hpOf = (uid: number) => cardStats(enemy.military.find((c) => c.uid === uid)!).hp ?? 99
  const sorted = [...enemyBoard].sort((x, y) => hpOf(x) - hpOf(y))
  const antiTank = enemyBoard.filter((u) => cardStats(enemy.military.find((c) => c.uid === u)!).baseId === 'anti_tank_gun')
  const picks: Record<number, number | null> = {}
  for (const uid of head.uids) {
    const me = s.players[pid].military.find((c) => c.uid === uid)!
    picks[uid] = cardStats(me).baseId === 'tank' && antiTank.length ? antiTank[0] : (sorted[0] ?? null)
  }
  return picks
}

const boardOf = (b: BattleState, pid: number): number[] => (b.slots[pid] ?? []).filter((x): x is number => x !== null)

// ───── 엔진 전투를 복사본에서 돌리기 ─────

/** 전투가 바꾸는 것만 새로 만든 플레이어 (군사 카드 목록, 도시 타일의 점령 표시, 문화로 붙는 타일) */
function lightPlayer(o: Player): Player {
  return {
    ...o,
    military: o.military.slice(),
    hand: o.hand.slice(),
    pendingTiles: o.pendingTiles?.slice(),
    cities: o.cities.map((c) => ({ ...c, tiles: c.tiles.map((t) => ({ ...t })), openSides: c.openSides.slice(), placed: c.placed.slice() })),
  }
}

/** 전투용 복사본: 두 문명만 (도시 공격은 도시가 무너지면 다른 문명의 장군도 돌아오므로 모두) */
function battleCopy(s: GameState, decl: Declaration): GameState {
  const both = [decl.attackerId, decl.defenderId]
  return {
    ...s,
    players: s.players.map((o) => (decl.kind === 'city' || both.includes(o.id) ? lightPlayer(o) : o)),
    deck: s.deck.slice(),
    log: [],
    battleReports: [],
    declarations: [],
    uniqueSupply: Object.fromEntries(Object.entries(s.uniqueSupply).map(([k, v]) => [k, v.slice()])),
    winner: null,
  }
}

/** 선전포고 하나에 대한 전투 판 (startNextBattle과 같은 해안 판정) */
function shellBattle(s: GameState, decl: Declaration): BattleState {
  const owner = decl.kind === 'retake' ? s.players[decl.attackerId] : s.players[decl.defenderId]
  return {
    decl,
    slots: { [decl.attackerId]: null, [decl.defenderId]: null },
    chooseQueue: [],
    picks: {},
    step: 'arrange',
    coastal: !!findTile(owner, decl.cityId, decl.tileId)?.tile.card.terrains.includes('해안'),
  }
}

const copyBattle = (b: BattleState): BattleState => ({
  ...b,
  slots: { ...b.slots },
  picks: { ...b.picks },
  chooseQueue: b.chooseQueue.map((x) => ({ ...x, uids: x.uids.slice() })),
})

type Chooser = (q: GameState, pid: number) => Record<number, number | null>

/** 대상 고르기 단계가 남아 있으면 chooser로 끝까지 진행한다. 규칙에 어긋나면 예전 규칙으로 */
function finishChoosing(q: GameState, chooser: Chooser): BattleReport | null {
  for (let i = 0; i < 12 && q.battle; i++) {
    const pid = q.battle.chooseQueue[0].playerId
    try {
      chooseTargets(q, pid, chooser(q, pid))
    } catch (e) {
      if (!(e instanceof RuleError)) throw e
      chooseTargets(q, pid, simplePicks(q, pid))
    }
  }
  return q.battle ? null : (q.battleReports.at(-1) ?? null)
}

/**
 * 양쪽 배치로 전투를 끝까지 돌린 결과. override: 방향을 표본으로 바꾼 상대 카드 (비공개 방향 대신).
 * 규칙에 어긋나는 배치면 null.
 */
function runBattle(s: GameState, decl: Declaration, slots: Record<number, (number | null)[]>, override?: { pid: number; military: CardInst[] }): BattleReport | null {
  const q = battleCopy(s, decl)
  if (override) q.players[override.pid].military = override.military.slice()
  q.battle = shellBattle(q, decl)
  q.phase = 'battle'
  try {
    arrangeBattle(q, decl.attackerId, slots[decl.attackerId])
    if (q.battle) arrangeBattle(q, decl.defenderId, slots[decl.defenderId])
  } catch (e) {
    if (!(e instanceof RuleError)) throw e
    return null
  }
  return finishChoosing(q, simplePicks)
}

// ───── 결과 비교 ─────

interface Outcome {
  /** 이겼는가 (도시 공격은 공성 카드가 살아남아 이겨야 성공) */
  won: boolean
  /** 살아남은 카드 수 차이 (내 쪽 − 상대) */
  surv: number
  /** 잃은 카드 가치 차이 (상대가 잃은 생산 비용 − 내가 잃은 비용) */
  lost: number
  /** 살아남은 상대 카드에 준 대미지 */
  dealt: number
  /** 내 카드가 받은 반격 대미지 */
  taken: number
}

const cardValue = (c: CardInst): number => cardById(c.defId).cost ?? 0

function outcomeOf(rep: BattleReport, me: number): Outcome {
  const attackerSucceeded = rep.winner === 'attacker' && (rep.kind !== 'city' || rep.units.some((u) => u.owner === rep.attackerId && !u.destroyed && cardStats(u.inst).siege))
  const won = me === rep.attackerId ? attackerSucceeded : !attackerSucceeded
  const mine = rep.units.filter((u) => u.owner === me)
  const theirs = rep.units.filter((u) => u.owner !== me)
  return {
    won,
    surv: mine.filter((u) => !u.destroyed).length - theirs.filter((u) => !u.destroyed).length,
    lost: theirs.filter((u) => u.destroyed).reduce((n, u) => n + cardValue(u.inst), 0) - mine.filter((u) => u.destroyed).reduce((n, u) => n + cardValue(u.inst), 0),
    dealt: theirs.filter((u) => !u.destroyed).reduce((n, u) => n + u.attackDamage, 0),
    taken: mine.reduce((n, u) => n + u.counterDamage, 0),
  }
}

/** 앞쪽 기준부터 비교: ① 승패 ② 살아남은 카드 수 차이 ③ 잃은 카드 가치 ④ 살아남은 상대 카드에 준 대미지 ⑤ 받은 반격(작을수록) */
function compareOutcome(a: Outcome, b: Outcome): number {
  return Number(a.won) - Number(b.won) || a.surv - b.surv || a.lost - b.lost || a.dealt - b.dealt || b.taken - a.taken
}

/** 결과 표에 넣는 수치 (승패가 가장 크고, 그다음 살아남은 카드 수, 잃은 카드 가치) */
const payoffOf = (o: Outcome): number => (o.won ? 100 : 0) + 10 * o.surv + o.lost

// ───── 대상 고르기 ─────

/** 고르는 카드들의 대상 조합: 같은 종류의 카드끼리는 순서만 다른 조합을 한 번만 센다 */
function pickCombos(q: GameState, pid: number, uids: number[], opts: (number | null)[]): Record<number, number | null>[] {
  const p = q.players[pid]
  const kind = (uid: number) => {
    const c = p.military.find((x) => x.uid === uid)!
    return `${c.defId}:${c.unique ?? ''}`
  }
  const out: Record<number, number | null>[] = []
  const cur: number[] = []
  const walk = (i: number) => {
    if (i === uids.length) {
      out.push(Object.fromEntries(uids.map((u, k) => [u, opts[cur[k]]])))
      return
    }
    // 바로 앞 카드와 같은 종류면 대상 번호가 줄지 않게 (순서만 다른 조합 제외)
    const from = i > 0 && kind(uids[i - 1]) === kind(uids[i]) ? cur[i - 1] : 0
    for (let j = from; j < opts.length; j++) {
      cur[i] = j
      walk(i + 1)
    }
  }
  walk(0)
  return out
}

/**
 * 대상 고르기: 고르는 카드들의 대상 조합(상대 판 위 카드, 상대가 4장을 꽉 채우지 않았으면 빈칸도)을 모두 엔진으로 돌려
 * ① 승패 ② 살아남은 카드 수 차이 ③ 잃은 카드 가치 ④ 살아남은 상대 카드에 준 대미지 ⑤ 받은 반격 순으로 고른다.
 * 이미 확정된 상대의 고르기(b.picks)는 그대로 반영한다. 뒤에 고르는 상대의 응수는 경우의 수가 작으면 내게 가장 나쁜 것을 가정하고,
 * 크면 지금 AI 규칙(예전 휴리스틱)으로 둔다.
 */
export function choosePicks(s: GameState, pid: number): Record<number, number | null> {
  const b = s.battle!
  const head = b.chooseQueue[0]
  const enemyId = pid === b.decl.attackerId ? b.decl.defenderId : b.decl.attackerId
  const board = boardOf(b, enemyId)
  const opts: (number | null)[] = board.length < 4 ? [...board, null] : board
  const combos = pickCombos(s, pid, head.uids, opts)
  if (combos.length <= 1) return combos[0] ?? simplePicks(s, pid)
  // 뒤에 고를 상대 차례가 있으면 그 경우의 수 (최악 가정에 쓸 수 있는지)
  const later = b.chooseQueue.slice(1).find((x) => x.playerId === enemyId)
  const myBoard = boardOf(b, pid)
  const replyCount = later ? (myBoard.length < 4 ? myBoard.length + 1 : myBoard.length) ** later.uids.length : 1
  const worstCase = !!later && combos.length * replyCount <= BATTLE_TUNE.maxChooseSims

  const evaluate = (picks: Record<number, number | null>): Outcome | null => {
    const q = battleCopy(s, b.decl)
    q.battle = copyBattle(b)
    try {
      chooseTargets(q, pid, picks)
    } catch (e) {
      if (!(e instanceof RuleError)) throw e
      return null // 규칙에 어긋나는 조합 (탱크는 대전차포를 골라야 한다 등)
    }
    if (!q.battle) return outcomeOf(q.battleReports.at(-1)!, pid)
    if (!worstCase) {
      const rep = finishChoosing(q, simplePicks)
      return rep && outcomeOf(rep, pid)
    }
    // 상대의 응수를 모두 돌려 보고 내게 가장 나쁜 것을 가정한다 (그 뒤의 고르기는 예전 규칙)
    let worst: Outcome | null = null
    const replyFor = (r: GameState): Record<number, number | null>[] => {
      const h = r.battle!.chooseQueue[0]
      const mb = boardOf(r.battle!, pid)
      return pickCombos(r, h.playerId, h.uids, mb.length < 4 ? [...mb, null] : mb)
    }
    // 상대 차례까지 예전 규칙으로 진행
    for (let i = 0; i < 12 && q.battle && q.battle.chooseQueue[0].playerId !== enemyId; i++) chooseTargets(q, q.battle.chooseQueue[0].playerId, simplePicks(q, q.battle.chooseQueue[0].playerId))
    if (!q.battle) return outcomeOf(q.battleReports.at(-1)!, pid)
    for (const reply of replyFor(q)) {
      const r = battleCopy(q, b.decl)
      r.battle = copyBattle(q.battle)
      try {
        chooseTargets(r, enemyId, reply)
      } catch (e) {
        if (!(e instanceof RuleError)) throw e
        continue
      }
      const rep = r.battle ? finishChoosing(r, simplePicks) : r.battleReports.at(-1)!
      if (!rep) continue
      const o = outcomeOf(rep, pid)
      if (!worst || compareOutcome(o, worst) < 0) worst = o
    }
    return worst
  }

  let best: Record<number, number | null> | null = null
  let bestO: Outcome | null = null
  const consider = (picks: Record<number, number | null>) => {
    const o = evaluate(picks)
    if (o && (!bestO || compareOutcome(o, bestO) > 0)) {
      best = picks
      bestO = o
    }
  }
  if (combos.length <= BATTLE_TUNE.maxChooseSims) {
    for (const c of combos) consider(c)
  } else {
    // 조합이 너무 많으면 예전 규칙에서 출발해 한 장씩 대상을 바꿔 본다 (두 바퀴)
    let cur = simplePicks(s, pid)
    consider(cur)
    for (let pass = 0; pass < 2; pass++) {
      for (const uid of head.uids) {
        for (const t of opts) {
          if (cur[uid] === t) continue
          consider({ ...cur, [uid]: t })
        }
        if (best) cur = best
      }
    }
  }
  return best ?? simplePicks(s, pid)
}

// ───── 배치: 결과 표와 최소 손해 / 혼합 전략 ─────

/**
 * 배치 방침: 상위 4·3·2·1장, 4번째를 5번째 카드로 바꾼 4장, 내지 않기, 임피+폭격기 (각각 bestSlots로 자리 정하기).
 * 임피+폭격기: 임피가 상대 대공포의 '폭격기 대미지 0'과 전투기 효과를 없애므로, 임피 1장과 폭격기를 먼저 넣고 나머지는 강한 순 (줄루)
 */
const POLICIES = ['top4', 'top3', 'top2', 'top1', 'swap5', 'impiAir', 'none'] as const
type Policy = (typeof POLICIES)[number]

function policySlots(s: GameState, b: BattleState, p: Player, policy: Policy): (number | null)[] | null {
  const cards = usableSorted(s, b, p).map((c) => c.uid)
  const take = (uids: number[]) => bestSlots(p, uids)
  switch (policy) {
    case 'top4':
      return take(cards.slice(0, 4))
    case 'top3':
      return cards.length >= 3 ? take(cards.slice(0, 3)) : null
    case 'top2':
      return cards.length >= 2 ? take(cards.slice(0, 2)) : null
    case 'top1':
      return cards.length >= 1 ? take(cards.slice(0, 1)) : null
    case 'swap5':
      return cards.length >= 5 ? take([...cards.slice(0, 3), cards[4]]) : null
    case 'impiAir': {
      const stat = (uid: number) => cardStats(p.military.find((c) => c.uid === uid)!)
      const impi = cards.find((uid) => stat(uid).effect === 'impi')
      const bombers = cards.filter((uid) => stat(uid).baseId === 'bomber')
      if (impi === undefined || !bombers.length) return null
      const rest = cards.filter((uid) => uid !== impi && !bombers.includes(uid))
      return take([impi, ...bombers, ...rest].slice(0, 4))
    }
    case 'none':
      return [null, null, null, null]
  }
}

/** 상태 난수를 바꾸지 않는 따로 된 수열 (같은 상태면 같은 판단) */
function prng(seed: number): () => number {
  let r = seed >>> 0
  return () => {
    r = (Math.imul(r, 1664525) + 1013904223) >>> 0
    return r / 2 ** 32
  }
}

const DIRS = ['L', 'C', 'R'] as const
/** 상대 카드의 방향을 표본으로 바꾼 카드 목록 (실제 방향은 비공개라 쓰지 않는다) */
const sampleDirs = (military: CardInst[], rand: () => number): CardInst[] => military.map((c) => (c.dirs ? { ...c, dirs: c.dirs.map(() => DIRS[Math.floor(rand() * 3)]) } : c))

interface Table {
  rows: (number | null)[][]
  /** payoff[i][j]: 내 배치 i 대 상대 방침 j의 수치 (표본 평균) */
  payoff: number[][]
  /** win[i][j]: 공격 측이 성공한 비율 */
  win: number[][]
}

/** 내 배치 후보 × 상대 방침의 결과 표. 상대 카드는 종류만 쓰고 방향은 표본으로 뽑는다 */
function buildTable(s: GameState, decl: Declaration, me: number, samples: number): Table {
  const b = shellBattle(s, decl)
  const opp = me === decl.attackerId ? decl.defenderId : decl.attackerId
  const rows: (number | null)[][] = []
  const seen = new Set<string>()
  for (const pol of POLICIES) {
    const sl = policySlots(s, b, s.players[me], pol)
    if (!sl || seen.has(JSON.stringify(sl))) continue
    seen.add(JSON.stringify(sl))
    rows.push(sl)
  }
  const rand = prng(s.rng ^ Math.imul(me + 1, 2654435761) ^ Math.imul(decl.tileId + 1, 40503) ^ s.round)
  const payoff = rows.map(() => POLICIES.map(() => 0))
  const win = rows.map(() => POLICIES.map(() => 0))
  const counts = rows.map(() => POLICIES.map(() => 0))
  const dup = new Map<number, number>()
  const hidden = s.players[opp].military.some((c) => c.dirs?.length)
  const n = hidden ? samples : 1
  for (let k = 0; k < n; k++) {
    const military = hidden ? sampleDirs(s.players[opp].military, rand) : s.players[opp].military
    const oppView = { ...s.players[opp], military }
    const colKeys = new Map<string, number>()
    POLICIES.forEach((pol, j) => {
      const col = policySlots(s, b, oppView, pol) ?? policySlots(s, b, oppView, 'top4')!
      // 같은 배치가 되는 방침(예: 임피가 없는 상대의 임피+폭격기)은 다시 돌리지 않고 앞 열의 결과를 쓴다
      const key = JSON.stringify(col)
      if (colKeys.has(key)) {
        dup.set(j, colKeys.get(key)!)
        return
      }
      colKeys.set(key, j)
      rows.forEach((row, i) => {
        const rep = runBattle(s, decl, { [me]: row, [opp]: col }, { pid: opp, military })
        if (!rep) return
        const o = outcomeOf(rep, me)
        payoff[i][j] += payoffOf(o)
        win[i][j] += (me === decl.attackerId ? o.won : !o.won) ? 1 : 0
        counts[i][j]++
      })
    })
  }
  for (let i = 0; i < rows.length; i++) {
    for (const [j, j0] of dup) {
      payoff[i][j] = payoff[i][j0]
      win[i][j] = win[i][j0]
      counts[i][j] = counts[i][j0]
    }
    for (let j = 0; j < POLICIES.length; j++) {
      const c = counts[i][j]
      payoff[i][j] = c ? payoff[i][j] / c : -Infinity
      win[i][j] = c ? win[i][j] / c : 0
    }
  }
  return { rows, payoff, win }
}

/** 상대가 가장 잘 대응해도 가장 덜 손해 보는 행 (같으면 평균이 높은 행) */
function maximinRow(payoff: number[][]): number {
  let best = 0
  let bestMin = -Infinity
  let bestAvg = -Infinity
  payoff.forEach((row, i) => {
    const vals = row.filter((v) => v > -Infinity)
    if (!vals.length) return
    const mn = Math.min(...vals)
    const avg = vals.reduce((x, y) => x + y, 0) / vals.length
    if (mn > bestMin + 1e-9 || (Math.abs(mn - bestMin) <= 1e-9 && avg > bestAvg)) {
      best = i
      bestMin = mn
      bestAvg = avg
    }
  })
  return best
}

/** 균형 혼합 전략 (가상 플레이: 서로 상대의 지금까지 평균 전략에 최선으로 응수하기를 반복) */
export function mixedStrategy(payoff: number[][], iterations = 400): number[] {
  const R = payoff.length
  const C = payoff[0]?.length ?? 0
  const val = (i: number, j: number) => (payoff[i][j] > -Infinity ? payoff[i][j] : -1e6)
  const rowCount = new Array(R).fill(0)
  const colCount = new Array(C).fill(0)
  const rowSum = new Array(R).fill(0) // 상대 열 누적에 대한 각 행의 합
  const colSum = new Array(C).fill(0) // 내 행 누적에 대한 각 열의 합 (상대는 이것을 줄이려 한다)
  let i = maximinRow(payoff)
  for (let t = 0; t < iterations; t++) {
    rowCount[i]++
    for (let j = 0; j < C; j++) colSum[j] += val(i, j)
    let j = 0
    for (let k = 1; k < C; k++) if (colSum[k] < colSum[j]) j = k
    colCount[j]++
    for (let r = 0; r < R; r++) rowSum[r] += val(r, j)
    i = 0
    for (let r = 1; r < R; r++) if (rowSum[r] > rowSum[i]) i = r
  }
  return rowCount.map((n) => n / iterations)
}

/** 지금 전투에서 pid의 배치: 결과 표에서 최소 손해 행 (설정을 켜면 혼합 전략에서 뽑기). 상대가 이미 낸 배치는 보지 않는다 */
export function chooseArrangement(s: GameState, pid: number): (number | null)[] {
  const b = s.battle!
  const table = buildTable(s, b.decl, pid, BATTLE_TUNE.samples)
  if (!table.rows.length) return [null, null, null, null]
  if (!BATTLE_TUNE.mixed) return table.rows[maximinRow(table.payoff)]
  const mix = mixedStrategy(table.payoff)
  const x = prng(s.rng ^ Math.imul(pid + 7, 97) ^ s.logSeq)()
  let acc = 0
  for (let i = 0; i < mix.length; i++) {
    acc += mix[i]
    if (x < acc) return table.rows[i]
  }
  return table.rows[table.rows.length - 1]
}

/** 예전 배치: 체력 + 공격력×2 상위 4장을 안쪽 공격이 가장 많게 */
function simpleArrangement(s: GameState, pid: number): (number | null)[][] {
  const b = s.battle!
  const picked = usableSorted(s, b, s.players[pid]).map((c) => c.uid).slice(0, 4)
  return [bestSlots(s.players[pid], picked), [picked[0] ?? null, picked[1] ?? null, picked[2] ?? null, picked[3] ?? null]]
}

/** 전투 중 pid의 행동 후보 (앞에 있을수록 선호, 마지막은 항상 규칙을 지키는 행동) */
export function battleActions(s: GameState, pid: number, simple = !BATTLE_TUNE.enabled): Action[] {
  const b = s.battle!
  if (b.step === 'arrange') {
    const fallback = simpleArrangement(s, pid).map((slots) => ({ type: 'arrangeBattle' as const, playerId: pid, slots }))
    const empty = { type: 'arrangeBattle' as const, playerId: pid, slots: [null, null, null, null] }
    if (simple) return [...fallback, empty]
    return [{ type: 'arrangeBattle', playerId: pid, slots: chooseArrangement(s, pid) }, ...fallback, empty]
  }
  const old = { type: 'chooseTargets' as const, playerId: pid, picks: simplePicks(s, pid) }
  if (simple) return [old]
  return [{ type: 'chooseTargets', playerId: pid, picks: choosePicks(s, pid) }, old]
}

/**
 * 선전포고하면 이길 확률. 결과 표에서 내가 낼 배치(최소 손해 행)에 상대가 가장 잘 대응했을 때의 성공률이다.
 * oddsMatrix를 끄면 예전처럼 양쪽을 내 AI(예전 휴리스틱)로 두고 방향 표본 4개로 돌린다.
 */
export function battleOdds(s: GameState, p: Player, t: DeclTarget): number {
  const decl: Declaration = { attackerId: p.id, defenderId: t.defenderId, cityId: t.cityId, tileId: t.tileId, kind: t.kind }
  if (BATTLE_TUNE.oddsMatrix) {
    const table = buildTable(s, decl, p.id, BATTLE_TUNE.oddsSamples)
    if (!table.rows.length) return 0
    const i = maximinRow(table.payoff)
    let j = 0
    for (let k = 1; k < table.payoff[i].length; k++) if (table.payoff[i][k] < table.payoff[i][j]) j = k
    return table.win[i][j]
  }
  const enemy = s.players[t.defenderId]
  const hidden = enemy.military.some((c) => c.dirs?.length)
  const samples = hidden ? 4 : 1
  const rand = prng(s.rng ^ (p.id * 2654435761) ^ (t.tileId * 40503))
  let wins = 0
  for (let k = 0; k < samples; k++) {
    const q = battleCopy(s, decl)
    if (hidden) q.players[t.defenderId].military = sampleDirs(enemy.military, rand)
    q.battle = shellBattle(q, decl)
    q.phase = 'battle'
    for (let i = 0; i < 20 && q.battle; i++) {
      const actor = q.battle.step === 'arrange' ? ([decl.attackerId, decl.defenderId].find((id) => !q.battle!.slots[id]) ?? decl.attackerId) : q.battle.chooseQueue[0].playerId
      let done = false
      for (const a of battleActions(q, actor, true)) {
        try {
          if (a.type === 'arrangeBattle') arrangeBattle(q, a.playerId, a.slots)
          else if (a.type === 'chooseTargets') chooseTargets(q, a.playerId, a.picks)
          done = true
          break
        } catch (e) {
          if (!(e instanceof RuleError)) throw e
        }
      }
      if (!done) break
    }
    const rep = q.battleReports.at(-1)
    if (rep && outcomeOf(rep, p.id).won) wins++
  }
  return wins / samples
}
