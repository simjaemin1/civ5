import type { BattleState, CardInst, GameState, Player } from './types'

/**
 * 한 문명에게 보내는 상태. `GameState`와 같은 모양이라 화면 코드가 그대로 읽는다.
 * 비공개 정보는 비우거나 가린다 (docs/online-plan.md 3.2).
 */
export interface GameView extends GameState {
  /** 이 뷰를 받는 문명 */
  viewer: number
  /** 타일 덱에 남은 장수 (순서는 비공개) */
  deckCount: number
  /** 문명별 손에 든 타일 수 (내용은 본인만) */
  handCounts: Record<number, number>
}

/** 상대 배치를 숨긴 채 "냈다"만 알리는 자리 표시. 실제 카드 uid는 항상 양수다. */
export const HIDDEN_SLOT = -1

const stripDirs = (c: CardInst): CardInst => {
  const copy = { ...c }
  delete copy.dirs
  return copy
}

/**
 * 전투에서 카드를 공개한 뒤(대상 선택 단계)에는 판 위의 카드는 마크(공격 방향)까지 보인다.
 * 그 밖의 카드 방향은 계속 본인만 안다.
 */
function revealedUids(s: GameState, pid: number): Set<number> {
  const b = s.battle
  if (!b || b.step === 'arrange') return new Set()
  return new Set((b.slots[pid] ?? []).filter((x): x is number => x !== null))
}

function viewPlayer(s: GameState, p: Player, viewer: number): Player {
  if (p.id === viewer) return p
  const shown = revealedUids(s, p.id)
  return {
    ...p,
    hand: [],
    pendingCity: null,
    scouted: null,
    held: null,
    choices: undefined, // 맡아둔 타일을 쓸지 같은 선택은 본인만
    startExtras: undefined, // 시작 손에서 발견한 엘도라도 타일: 도시를 세울 때까지 본인만
    military: p.military.map((c) => (shown.has(c.uid) ? c : stripDirs(c))),
  }
}

function viewBattle(b: BattleState | null, viewer: number): BattleState | null {
  if (!b) return null
  const revealed = b.step !== 'arrange'
  const slots: BattleState['slots'] = {}
  for (const [k, v] of Object.entries(b.slots)) {
    const pid = Number(k)
    slots[pid] = !v || pid === viewer || revealed ? v : v.map(() => HIDDEN_SLOT)
  }
  // picks는 이미 확정한 선택만 들어 있고, 대상은 우선도 순으로 차례로 고르므로 뒤에 고르는 쪽에게 보인다 (화면이 "상대가 고른 대상"을 보여 준다)
  return { ...b, slots }
}

/** 고유 유닛 재고의 방향 조합은 상대 카드의 방향을 알려 주므로 장수만 남긴다. */
const hideSupply = (supply: GameState['uniqueSupply']): GameState['uniqueSupply'] =>
  Object.fromEntries(Object.entries(supply).map(([k, v]) => [k, v.map(() => 'x')]))

export function view(s: GameState, viewer: number): GameView {
  return {
    ...s,
    deck: [],
    rng: 0,
    viewer,
    deckCount: s.deck.length,
    handCounts: Object.fromEntries(s.players.map((p) => [p.id, p.hand.length])),
    players: s.players.map((p) => viewPlayer(s, p, viewer)),
    battle: viewBattle(s.battle, viewer),
    uniqueSupply: hideSupply(s.uniqueSupply),
  }
}
