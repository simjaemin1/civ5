import type { Action, City, GameState, Placement, Player, Side, TileCard } from './types'
import { RuleError, SIDES } from './types'
import { TECHS, civById, techById } from './data'
import type { TechDef } from './data'
import { shuffle } from './rng'
import { computeYields, happiness, totalWorkers } from './yields'
import { makeTileDeck } from './tileDeck'
import { currentPlayer, drawTiles, gainCulture, say } from './core'
import { choosePolicy } from './policies'
import { invest, settleWonders } from './wonders'
import {
  anyProducible, claimFreeCard, gainGeneral, initUniqueSupply, produceCard, sacrificeCard, upgradeCard,
} from './military'
import { endScouting, freeWorkers, holdScouted, releaseHeld, scout } from './scouting'
import {
  arrangeBattle, checkCultureDefeats, chooseTargets, declarationTargets, declareWar, findTile,
  startNextBattle, detonateAtomicBomb, activateGreatWall,
} from './war'

export { currentPlayer, gainCulture }

export interface CreateOptions {
  seed: number
  civIds: string[]
  deck?: TileCard[]
}

export function createGame(opts: CreateOptions): GameState {
  const state: GameState = {
    rng: opts.seed >>> 0,
    round: 1,
    deck: (opts.deck ?? makeTileDeck(opts.seed)).map((c) => ({ ...c })),
    players: opts.civIds.map((civId, id) => ({
      id,
      civId,
      cities: [],
      techs: [],
      freshTechs: [],
      generals: 0,
      hand: [],
      wastelandPending: false,
      turn: null,
      policy: null,
      pendingPolicies: 0,
      pendingCity: null,
      wonders: [],
      military: [],
      generalWorkers: 0,
      busyWorkers: 0,
      scouting: false,
      scouted: null,
      held: null,
      eliminated: false,
      greatWallUsed: false,
      pendingFreeCards: 0,
    })),
    order: [],
    turnIdx: 0,
    phase: 'setup',
    roundTechPicks: [],
    wonderProgress: {},
    wonderOwners: {},
    investments: [],
    nextUid: 1,
    uniqueSupply: initUniqueSupply(opts.civIds),
    declarations: [],
    battle: null,
    eldoradoFound: false,
    logSeq: 0,
    winner: null,
    log: [],
  }
  state.order = state.players
    .slice()
    .sort((a, b) => civById(b.civId).priority - civById(a.civId).priority)
    .map((p) => p.id)
  shuffle(state, state.deck)
  beginTurn(state)
  return state
}

function beginTurn(s: GameState): void {
  const p = currentPlayer(s)
  p.turn = null
  p.freshTechs = []
  p.generalWorkers = 0
  if (p.cities.length === 0) {
    s.phase = 'setup'
    if (p.hand.length === 0) {
      const civ = civById(p.civId)
      p.hand = drawTiles(s, 4 + civ.startCulture)
    }
  } else {
    s.phase = 'place'
    p.cities.forEach((c) => {
      c.placed = []
      c.enemyPlaced = []
      c.generalPlaced = []
    })
  }
}

/** 탈락한 문명은 건너뛴다. */
function skipEliminated(s: GameState): void {
  while (s.turnIdx < s.order.length - 1 && s.players[s.order[s.turnIdx]].eliminated) s.turnIdx++
}

function endTurn(s: GameState): void {
  endScouting(s, currentPlayer(s))
  if (s.turnIdx + 1 >= s.order.length) {
    // 정산: 불가사의 진척도 → 전투
    settleWonders(s)
    continueRound(s)
    return
  }
  s.turnIdx++
  skipEliminated(s)
  beginTurn(s)
}

/** 라운드 정산 중: 선전포고가 남아 있으면 다음 전투를 시작하고, 없으면 라운드를 끝낸다. */
function continueRound(s: GameState): void {
  while (true) {
    if (s.winner) {
      s.phase = 'over'
      return
    }
    if (s.battle) return // 카드 배치·대상 선택을 기다림
    if (!startNextBattle(s)) break
  }
  checkCultureDefeats(s)
  if (s.winner) {
    s.phase = 'over'
    return
  }
  s.round++
  s.turnIdx = 0
  s.roundTechPicks = []
  skipEliminated(s)
  beginTurn(s)
}

export function prereqsMet(p: Player, tech: TechDef): boolean {
  if (p.techs.includes(tech.id)) return false
  if (tech.prereqs?.length) return tech.prereqs.every((id) => p.techs.includes(id))
  if (tech.cost === 0) return true
  // 연결선이 없는 기술: 같은 비용의 다른 기술을 하나 가진 뒤 연구할 수 있다
  return p.techs.some((id) => id !== tech.id && techById(id).cost === tech.cost)
}

export function researchableTechs(s: GameState): TechDef[] {
  const p = currentPlayer(s)
  const free = p.techs.includes('education')
  return TECHS.filter((t) => prereqsMet(p, t) && (free || !s.roundTechPicks.includes(t.id)))
}

export function apply(prev: GameState, action: Action): GameState {
  if (prev.phase === 'over') throw new RuleError('게임이 끝났습니다')
  const s = structuredClone(prev)
  const p = currentPlayer(s)
  switch (action.type) {
    case 'wasteland': return wasteland(s, p, action.discardTileId)
    case 'buildCity': return buildCity(s, p, action)
    case 'scout':
      expectPhase(s, 'place')
      scout(s, p)
      return s
    case 'holdScouted':
      expectPhase(s, 'place', 'research', 'produce')
      holdScouted(s, p)
      return s
    case 'releaseHeld':
      expectPhase(s, 'place', 'research', 'produce')
      releaseHeld(s, p)
      return s
    case 'placeWorkers': return placeWorkers(s, p, action.placements)
    case 'research': return research(s, p, action.techId, action.foodToScience ?? 0, action.hammerToScience ?? 0)
    case 'skipResearch':
      expectPhase(s, 'research')
      s.phase = 'produce'
      return s
    case 'choosePolicy':
      expectPhase(s, 'research', 'produce')
      choosePolicy(s, p, action.policy, action.discard, action.dismiss)
      return s
    case 'buildSecondCity': return buildSecondCity(s, p, action)
    case 'invest':
      expectPhase(s, 'produce')
      invest(s, p, action.cityId, action.wonderId, action.hammers)
      return s
    case 'produce':
      expectPhase(s, 'produce')
      produceCard(s, p, action)
      return s
    case 'upgrade':
      expectPhase(s, 'produce')
      upgradeCard(s, p, action)
      return s
    case 'sacrificeCard':
      expectPhase(s, 'research', 'produce')
      sacrificeCard(s, p, action.uid)
      return s
    case 'claimFreeCard':
      expectPhase(s, 'research', 'produce')
      claimFreeCard(s, p, action)
      return s
    case 'useAtomicBomb':
      expectPhase(s, 'produce')
      detonateAtomicBomb(s, p, action)
      return s
    case 'useGreatWall':
      expectPhase(s, 'produce')
      activateGreatWall(s, p)
      return s
    case 'endProduction':
      expectPhase(s, 'produce')
      if (p.pendingPolicies > 0) throw new RuleError('정책을 먼저 골라야 합니다')
      if (p.pendingCity) throw new RuleError('두 번째 도시를 먼저 세워야 합니다')
      if (p.pendingFreeCards > 0) {
        if (anyProducible(s, p)) throw new RuleError('무료 군사 카드를 먼저 골라야 합니다')
        p.pendingFreeCards = 0
      }
      foodSettlement(s, p)
      // 선전포고(내정 6단계): 할 수 있는 선전포고가 있으면 선택하게 하고, 없으면 바로 차례를 끝낸다
      if (declarationTargets(s, p).length > 0) {
        s.phase = 'declare'
        return s
      }
      endTurn(s)
      return s
    case 'declareWar':
      expectPhase(s, 'declare')
      declareWar(s, p, action)
      endTurn(s)
      return s
    case 'endTurn':
      expectPhase(s, 'declare')
      endTurn(s)
      return s
    case 'arrangeBattle':
      expectPhase(s, 'battle')
      arrangeBattle(s, action.playerId, action.slots)
      if (!s.battle) continueRound(s)
      return s
    case 'chooseTargets':
      expectPhase(s, 'battle')
      chooseTargets(s, action.playerId, action.picks)
      if (!s.battle) continueRound(s)
      return s
  }
}

function expectPhase(s: GameState, ...phases: GameState['phase'][]): void {
  if (!phases.includes(s.phase)) throw new RuleError(`지금은 ${s.phase} 단계입니다`)
}

function wasteland(s: GameState, p: Player, discardTileId: number): GameState {
  expectPhase(s, 'setup')
  if (s.round !== 1 || p.wastelandPending) throw new RuleError('불모지 탈출은 첫 차례에 한 번만 가능합니다')
  const i = p.hand.findIndex((c) => c.id === discardTileId)
  if (i < 0) throw new RuleError('손에 없는 타일입니다')
  const [discarded] = p.hand.splice(i, 1)
  s.deck.push(discarded)
  shuffle(s, s.deck)
  p.hand.push(...drawTiles(s, 1))
  p.wastelandPending = true
  say(s, `${civById(p.civId).name} 불모지 탈출 (이번 차례 종료)`)
  endTurn(s)
  return s
}

/** 손에 든 타일로 도시를 세운다: 1장은 도시, 나머지는 서로 다른 면에 하나씩. */
function foundCity(
  hand: TileCard[],
  a: { cityTileId: number; sideTiles: Partial<Record<Side, number>> },
  id: number,
  workers: number,
): City {
  const cityCard = hand.find((c) => c.id === a.cityTileId)
  if (!cityCard) throw new RuleError('손에 없는 타일입니다')
  const others = hand.filter((c) => c.id !== a.cityTileId)
  const entries = Object.entries(a.sideTiles) as [Side, number][]
  const ids = entries.map(([, tid]) => tid)
  if (
    entries.length !== others.length ||
    new Set(ids).size !== ids.length ||
    !others.every((c) => ids.includes(c.id)) ||
    !entries.every(([side]) => SIDES.includes(side))
  ) {
    throw new RuleError('도시 외의 타일을 서로 다른 면에 하나씩 붙여야 합니다')
  }
  const city: City = {
    id,
    tiles: [{ card: cityCard, role: 'city' }],
    workers,
    placed: [],
    openSides: SIDES.filter((side) => !(side in a.sideTiles)),
  }
  for (const [side, tid] of entries) {
    city.tiles.push({ card: others.find((c) => c.id === tid)!, role: 'side', side })
  }
  return city
}

function buildCity(
  s: GameState,
  p: Player,
  a: Extract<Action, { type: 'buildCity' }>,
): GameState {
  expectPhase(s, 'setup')
  const city = foundCity(p.hand, a, 0, 1)
  p.cities.push(city)
  p.hand = []
  if (p.civId === 'china') p.generals += 1 // 중국: 위대한 장군 1개로 시작
  say(s, `${civById(p.civId).name} 도시 건설 (타일 ${city.tiles.length}장)`)
  s.phase = 'place'
  return s
}

/** 인쇄기술: 문화 4로 얻은 타일 4장으로 두 번째 도시를 세운다. 일꾼은 첫 도시에서 1개 옮겨온다. */
function buildSecondCity(
  s: GameState,
  p: Player,
  a: Extract<Action, { type: 'buildSecondCity' }>,
): GameState {
  expectPhase(s, 'research', 'produce')
  if (!p.pendingCity) throw new RuleError('세울 두 번째 도시가 없습니다')
  const moved = p.cities[0].workers > 0 ? 1 : 0
  const city = foundCity(p.pendingCity, a, 1, moved)
  p.cities[0].workers -= moved
  p.cities.push(city)
  p.pendingCity = null
  // 새 도시의 산출을 이번 차례에 쓸 수 있도록 다시 계산한다 (도시 타일은 항상 산출)
  p.turn!.yields = recomputeYields(p)
  say(s, `${civById(p.civId).name} 두 번째 도시 건설`)
  return s
}

function placeWorkers(s: GameState, p: Player, placements: Placement[]): GameState {
  expectPhase(s, 'place')
  const seen = new Set<number>()
  for (const city of p.cities) {
    city.placed = []
    city.enemyPlaced = []
    city.generalPlaced = []
  }
  p.generalWorkers = 0
  for (const pl of placements) {
    const city = p.cities.find((c) => c.id === pl.cityId)
    if (!city) throw new RuleError('내 도시가 아닙니다')
    if (seen.has(pl.tileId)) throw new RuleError('한 타일에는 일꾼 1개만 올릴 수 있습니다')
    seen.add(pl.tileId)
    if (pl.enemy) {
      // 몽골: 내 장군이 올라간 상대 타일에 일꾼을 올려 산출한다
      if (p.civId !== 'mongolia') throw new RuleError('몽골만 상대 타일에 일꾼을 올릴 수 있습니다')
      const owner = s.players[pl.enemy.playerId]
      const found = owner && findTile(owner, pl.enemy.cityId, pl.tileId)
      if (!found || found.tile.occupiedBy !== p.id) throw new RuleError('내 장군이 올라간 상대 타일이어야 합니다')
      if (found.tile.role === 'city') throw new RuleError('도시 타일에는 일꾼을 올릴 수 없습니다')
      city.enemyPlaced!.push({ playerId: owner.id, cityId: pl.enemy.cityId, tileId: pl.tileId, card: found.tile.card })
      continue
    }
    const tile = city.tiles.find((t) => t.card.id === pl.tileId)
    if (!tile) throw new RuleError('내 도시의 타일이 아닙니다')
    if (tile.role === 'city') throw new RuleError('도시 타일에는 일꾼을 올릴 수 없습니다')
    if (tile.occupiedBy !== undefined && tile.occupiedBy !== p.id) throw new RuleError('상대가 점령한 타일에는 일꾼을 올릴 수 없습니다')
    if (pl.general) {
      // 스웨덴: 배치하지 않은 위대한 장군을 일꾼처럼 타일에 올려 사용
      if (p.civId !== 'sweden') throw new RuleError('스웨덴만 장군을 일꾼처럼 쓸 수 있습니다')
      p.generalWorkers++
      if (p.generalWorkers > p.generals) throw new RuleError('위대한 장군이 모자랍니다')
      city.generalPlaced!.push(pl.tileId)
    } else {
      city.placed.push(pl.tileId)
    }
  }
  for (const city of p.cities) {
    if (city.placed.length + (city.enemyPlaced?.length ?? 0) > city.workers) throw new RuleError('일꾼이 모자랍니다')
  }
  if (freeWorkers(p) < 0) throw new RuleError('정찰·선전포고·맡아둔 타일에 쓰는 일꾼과 합쳐 일꾼이 모자랍니다')
  p.turn = {
    yields: computeYields(p),
    foodToScience: 0,
    hammerToScience: 0,
    researched: false,
    produced: [],
    upgraded: false,
    extraFood: 0,
    skipFoodSettle: false,
  }
  s.phase = 'research'
  return s
}

/** 산출을 다시 계산하고, 이미 과학으로 바꾼 망치를 도시 순서대로 뺀다. */
function recomputeYields(p: Player) {
  const y = computeYields(p)
  if (y.cities.length) y.cities[0].food += p.turn!.extraFood
  let left = p.turn!.hammerToScience
  for (const c of y.cities) {
    const take = Math.min(left, c.hammer)
    c.hammer -= take
    left -= take
  }
  return y
}

function research(
  s: GameState,
  p: Player,
  techId: string,
  foodToScience: number,
  hammerToScience: number,
): GameState {
  expectPhase(s, 'research')
  const tech = techById(techId)
  if (!researchableTechs(s).some((t) => t.id === techId)) throw new RuleError('지금 연구할 수 없는 기술입니다')
  const turn = p.turn!
  const food = turn.yields.cities.reduce((n, c) => n + c.food, 0)
  if (foodToScience > 0 && !p.techs.includes('writing')) throw new RuleError('문자를 연구해야 식량을 과학으로 바꿀 수 있습니다')
  if (foodToScience < 0 || foodToScience > food) throw new RuleError('바꿀 식량이 잘못되었습니다')
  const hammers = turn.yields.cities.reduce((n, c) => n + c.hammer, 0)
  if (hammerToScience > 0 && !p.techs.includes('scientific_theory')) {
    throw new RuleError('과학이론을 연구해야 망치를 과학으로 바꿀 수 있습니다')
  }
  if (hammerToScience < 0 || hammerToScience > 2 || hammerToScience > hammers) {
    throw new RuleError('망치는 가진 만큼, 최대 2개까지 과학으로 바꿀 수 있습니다')
  }
  if (turn.yields.science + foodToScience + hammerToScience < tech.cost) throw new RuleError('과학이 모자랍니다')

  turn.foodToScience = foodToScience
  turn.hammerToScience = hammerToScience
  turn.researched = true
  p.techs.push(tech.id)
  p.freshTechs.push(tech.id)
  s.roundTechPicks.push(tech.id)
  say(s, `${civById(p.civId).name} 기술 연구: ${tech.name}`)

  for (const e of tech.effects) {
    if (e.kind === 'culture') gainCulture(s, p, e.amount)
    else if (e.kind === 'general') gainGeneral(p, e.amount)
    else if (e.kind === 'policy') p.pendingPolicies++
    else if (e.kind === 'setPolicy') p.policy = e.policy
    else if (e.kind === 'secondCity') {
      if (p.cities.length === 1 && !p.pendingCity) p.pendingCity = drawTiles(s, 4) // 문화 4
    } else if (e.kind === 'archaeology') {
      // 고고학을 연구하는 순간 가진 사적지 1장당 문화 1 (이후 얻은 사적지는 해당 없음)
      const sites = p.cities.reduce((n, c) => n + c.tiles.filter((t) => t.card.historic).length, 0)
      if (sites > 0) gainCulture(s, p, sites)
    }
    // compass, foodToScience(조건 확인용) 등은 연구 효과로 따로 처리할 것이 없다
  }
  if (tech.id === 'machinery' && p.civId === 'brazil') {
    // 브라질: 기계를 얻을 때 영토의 정글 1장당 문화 1 (1회)
    const jungles = p.cities.reduce((n, c) => n + c.tiles.filter((t) => t.card.terrains.includes('정글')).length, 0)
    if (jungles > 0) gainCulture(s, p, jungles)
  }
  if (tech.id === 'apollo') {
    // 과학 승리: 아폴로 프로젝트를 가장 먼저 연구하면 바로 이긴다
    s.winner = { playerId: p.id, type: 'science' }
    s.phase = 'over'
    say(s, `${civById(p.civId).name} 과학 승리`)
    return s
  }
  // 기술 효과는 즉시 적용 ("다음 차례부터"만 제외): 산출을 다시 계산한다
  turn.yields = recomputeYields(p)
  s.phase = 'produce'
  return s
}

function foodSettlement(s: GameState, p: Player): void {
  const turn = p.turn!
  const cap = happiness(p)
  if (turn.skipFoodSettle) {
    say(s, `${civById(p.civId).name} 식량 정산 생략 (전통/체제)`)
  } else {
    let converted = turn.foodToScience
    for (const c of p.cities) {
      let food = turn.yields.cities.find((y) => y.cityId === c.id)!.food
      const take = Math.min(converted, food)
      food -= take
      converted -= take
      if (food < c.workers) {
        // 자유 정책 시행 중에는 식량이 모자라도 일꾼을 잃지 않는다. 한 차례에 최대 1개만 잃는다.
        if (p.policy !== 'liberty') c.workers = Math.max(0, c.workers - 1)
      } else if (food >= c.workers * 2 && totalWorkers(p) < cap) {
        c.workers += 1
      }
    }
  }
  // 어떤 이유로든 일꾼이 행복을 넘으면 넘친 만큼 버린다 (가장 많은 도시부터)
  while (totalWorkers(p) > cap) {
    const biggest = p.cities.reduce((a, b) => (b.workers > a.workers ? b : a))
    biggest.workers--
  }
  say(s, `${civById(p.civId).name} 일꾼 ${totalWorkers(p)} / 행복 ${cap}`)
}
