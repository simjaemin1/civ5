import { CityBuilder } from './CityBuilder'
import type { PanelProps } from './types'

export function SetupPanel({ game, player, dispatch }: PanelProps) {
  const canWasteland = game.round === 1 && !player.wastelandPending
  return (
    <CityBuilder
      key={player.hand.map((c) => c.id).join(',')}
      hand={player.hand}
      player={player}
      label="게임 준비: 첫 도시 세우기"
      onBuild={(cityTileId, sideTiles) => dispatch({ type: 'buildCity', cityTileId, sideTiles })}
      wasteland={
        canWasteland
          ? {
              warn: '이번 차례에는 도시를 세우지 않고 연구·산출·성장도 하지 못합니다. 다음 차례에 도시를 세웁니다.',
              onDiscard: (discardTileId) => dispatch({ type: 'wasteland', discardTileId }),
            }
          : undefined
      }
    />
  )
}
