import type { Action, City, GameState, Player, Side, TileCard } from './types'
import { RuleError, SIDES } from './types'
import { TECHS, civById, techById } from './data'
import type { TechDef } from './data'
import { shuffle } from './rng'
import { computeYields, happiness, totalWorkers } from './yields'
import { makePlaceholderDeck } from './placeholderDeck'

export interface CreateOptions {
  seed: number
  civIds: string[]
  deck?: TileCard[]
}

export function createGame(opts: CreateOptions): GameState {
  const state: GameState = {
    rng: opts.seed >>> 0,
    round: 1,
    deck: (opts.deck ?? makePlaceholderDeck(opts.seed)).map((c) => ({ ...c })),
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
    })),
    order: [],
    turnIdx: 0,
    phase: 'setup',
    roundTechPicks: [],
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

export const currentPlayer = (s: GameState): Player => s.players[s.order[s.turnIdx]]

function say(s: GameState, msg: string): void {
  s.log.push(`[R${s.round}] ${msg}`)
}

/** 덱에서 n장 뽑고, 뽑을 때마다(한 번의 뽑기마다) 덱을 섞는다. */
function drawTiles(s: GameState, n: number): TileCard[] {
  if (s.deck.length < n) throw new RuleError('타일 덱이 부족합니다')
  const cards = s.deck.splice(0, n)
  shuffle(s, s.deck)
  return cards
}

function beginTurn(s: GameState): void {
  const p = currentPlayer(s)
  p.turn = null
  p.freshTechs = []
  if (p.cities.length === 0) {
    s.phase = 'setup'
    if (p.hand.length === 0) {
      const civ = civById(p.civId)
      p.hand = drawTiles(s, 4 + civ.startCulture)
    }
  } else {
    s.phase = 'place'
    p.cities.forEach((c) => (c.placed = []))
  }
}

function endTurn(s: GameState): void {
  s.turnIdx++
  if (s.turnIdx >= s.order.length) {
    // 정산: 불가사의 진척도, 전투 (이후 단계에서 구현)
    s.round++
    s.turnIdx = 0
    s.roundTechPicks = []
  }
  beginTurn(s)
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
  const s = structuredClone(prev)
  const p = currentPlayer(s)
  switch (action.type) {
    case 'wasteland': return wasteland(s, p, action.discardTileId)
    case 'buildCity': return buildCity(s, p, action)
    case 'placeWorkers': return placeWorkers(s, p, action.placements)
    case 'research': return research(s, p, action.techId, action.foodToScience ?? 0)
    case 'skipResearch':
      expectPhase(s, 'research')
      s.phase = 'produce'
      return s
    case 'endProduction':
      expectPhase(s, 'produce')
      foodSettlement(s, p)
      endTurn(s)
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

function buildCity(
  s: GameState,
  p: Player,
  a: Extract<Action, { type: 'buildCity' }>,
): GameState {
  expectPhase(s, 'setup')
  const cityCard = p.hand.find((c) => c.id === a.cityTileId)
  if (!cityCard) throw new RuleError('손에 없는 타일입니다')
  const others = p.hand.filter((c) => c.id !== a.cityTileId)
  const entries = Object.entries(a.sideTiles) as [Side, number][]
  const ids = entries.map(([, id]) => id)
  if (
    entries.length !== others.length ||
    new Set(ids).size !== ids.length ||
    !others.every((c) => ids.includes(c.id)) ||
    !entries.every(([side]) => SIDES.includes(side))
  ) {
    throw new RuleError('도시 외의 타일을 서로 다른 면에 하나씩 붙여야 합니다')
  }
  const city: City = {
    id: 0,
    tiles: [{ card: cityCard, role: 'city' }],
    workers: 1,
    placed: [],
    openSides: SIDES.filter((side) => !(side in a.sideTiles)),
  }
  for (const [side, id] of entries) {
    city.tiles.push({ card: others.find((c) => c.id === id)!, role: 'side', side })
  }
  p.cities.push(city)
  p.hand = []
  say(s, `${civById(p.civId).name} 도시 건설 (타일 ${city.tiles.length}장)`)
  s.phase = 'place'
  return s
}

function placeWorkers(
  s: GameState,
  p: Player,
  placements: { cityId: number; tileId: number }[],
): GameState {
  expectPhase(s, 'place')
  const seen = new Set<number>()
  for (const city of p.cities) city.placed = []
  for (const { cityId, tileId } of placements) {
    const city = p.cities.find((c) => c.id === cityId)
    const tile = city?.tiles.find((t) => t.card.id === tileId)
    if (!city || !tile) throw new RuleError('내 도시의 타일이 아닙니다')
    if (tile.role === 'city') throw new RuleError('도시 타일에는 일꾼을 올릴 수 없습니다')
    if (seen.has(tileId)) throw new RuleError('한 타일에는 일꾼 1개만 올릴 수 있습니다')
    seen.add(tileId)
    city.placed.push(tileId)
    if (city.placed.length > city.workers) throw new RuleError('일꾼이 모자랍니다')
  }
  p.turn = { yields: computeYields(p), foodToScience: 0, researched: false }
  s.phase = 'research'
  return s
}

function research(s: GameState, p: Player, techId: string, foodToScience: number): GameState {
  expectPhase(s, 'research')
  const tech = techById(techId)
  if (!researchableTechs(s).some((t) => t.id === techId)) throw new RuleError('지금 연구할 수 없는 기술입니다')
  const turn = p.turn!
  const food = turn.yields.cities.reduce((n, c) => n + c.food, 0)
  if (foodToScience > 0 && !p.techs.includes('writing')) throw new RuleError('문자를 연구해야 식량을 과학으로 바꿀 수 있습니다')
  if (foodToScience < 0 || foodToScience > food) throw new RuleError('바꿀 식량이 잘못되었습니다')
  if (turn.yields.science + foodToScience < tech.cost) throw new RuleError('과학이 모자랍니다')

  turn.foodToScience = foodToScience
  turn.researched = true
  p.techs.push(tech.id)
  p.freshTechs.push(tech.id)
  s.roundTechPicks.push(tech.id)
  say(s, `${civById(p.civId).name} 기술 연구: ${tech.name}`)

  for (const e of tech.effects) {
    if (e.kind === 'culture') gainCulture(s, p, e.amount)
    else if (e.kind === 'general') p.generals += e.amount
    // policy, compass, foodToScience(조건 확인용)는 이후 단계에서 처리
  }
  // 기술 효과는 즉시 적용 ("다음 차례부터"만 제외): 산출을 다시 계산한다
  turn.yields = computeYields(p)
  s.phase = 'produce'
  return s
}

function foodSettlement(s: GameState, p: Player): void {
  const turn = p.turn!
  let converted = turn.foodToScience
  const cap = happiness(p)
  for (const c of p.cities) {
    let food = turn.yields.cities.find((y) => y.cityId === c.id)!.food
    const take = Math.min(converted, food)
    food -= take
    converted -= take
    if (food < c.workers) {
      c.workers = Math.max(0, c.workers - 1) // 한 차례에 최대 1개만 잃는다
    } else if (food >= c.workers * 2 && totalWorkers(p) < cap) {
      c.workers += 1
    }
  }
  // 어떤 이유로든 일꾼이 행복을 넘으면 넘친 만큼 버린다 (가장 많은 도시부터)
  while (totalWorkers(p) > cap) {
    const biggest = p.cities.reduce((a, b) => (b.workers > a.workers ? b : a))
    biggest.workers--
  }
  say(s, `${civById(p.civId).name} 식량 정산 → 일꾼 ${totalWorkers(p)} / 행복 ${cap}`)
}
