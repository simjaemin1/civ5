import type { Action, GameState, Player } from '../../engine'

export interface PanelProps {
  game: GameState
  player: Player
  dispatch: (a: Action) => void
}
