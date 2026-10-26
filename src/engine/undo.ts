import type { GameState } from './types'

/** 한 문명의 내정 단계: 이 단계들 동안은 같은 차례다 */
export const TURN_PHASES: GameState['phase'][] = ['setup', 'place', 'research', 'produce', 'declare']

/** 같은 차례인지 가르는 열쇠 (내정 단계가 아니면 null). 차례 안 되돌리기의 범위다 */
export const turnKey = (g: GameState): string | null => (TURN_PHASES.includes(g.phase) ? `${g.round}:${g.turnIdx}` : null)

/**
 * 무작위 결과(카드 방향, 덱 섞기)를 쓰거나 덱의 카드를 보여 준 행동인지.
 * 이런 행동 뒤로는 차례 안 되돌리기를 막는다: 되돌려서 결과를 미리 보고 고르는 것(방향 고르기, 공짜 정찰)을 막기 위해서다.
 * 난수가 상태 안에 있으므로 난수 값이나 덱 장수가 바뀌었는지만 보면 빠짐없이 걸러진다.
 * 서버(전체 상태)와 핫시트가 함께 쓴다. 온라인 뷰는 난수·덱을 비우므로 클라이언트에서는 판정할 수 없다.
 */
export const revealsInfo = (prev: GameState, next: GameState): boolean => next.rng !== prev.rng || next.deck.length !== prev.deck.length
