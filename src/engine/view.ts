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

function viewPlayer(p: Player, viewer: number): Player {
  if (p.id === viewer) return p
  return {
    ...p,
    hand: [],
    pendingCity: null,
    scouted: null,
    held: null,
    choices: undefined, // 맡아둔 타일을 쓸지 같은 선택은 본인만
    military: p.military.map(stripDirs),
  }
}

function viewBattle(b: BattleState | null, s: GameState, viewer: number): BattleState | null {
  if (!b) return null
  const revealed = b.step !== 'arrange'
  const slots: BattleState['slots'] = {}
  for (const [k, v] of Object.entries(b.slots)) {
    const pid = Number(k)
    slots[pid] = !v || pid === viewer || revealed ? v : v.map(() => HIDDEN_SLOT)
  }
  const mine = new Set(s.players[viewer]?.military.map((c) => c.uid))
  const picks: BattleState['picks'] = {}
  for (const [k, v] of Object.entries(b.picks)) if (mine.has(Number(k))) picks[Number(k)] = v
  return { ...b, slots, picks }
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
    players: s.players.map((p) => viewPlayer(p, viewer)),
    battle: viewBattle(s.battle, s, viewer),
    uniqueSupply: hideSupply(s.uniqueSupply),
  }
}
