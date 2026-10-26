import { useState } from 'react'
import { CityBuilder } from './CityBuilder'
import type { PanelProps } from './types'
import { ConfirmButton } from '../ConfirmButton'

export function SetupPanel({ game, player, dispatch }: PanelProps) {
  const [discard, setDiscard] = useState<number>(player.hand[0]?.id ?? -1)
  const canWasteland = game.round === 1 && !player.wastelandPending
  return (
    <CityBuilder
      key={player.hand.map((c) => c.id).join(',')}
      hand={player.hand}
      player={player}
      label="게임 준비: 첫 도시 세우기"
      onBuild={(cityTileId, sideTiles) => dispatch({ type: 'buildCity', cityTileId, sideTiles })}
      extra={
        canWasteland && (
          <span className="row">
            <select value={discard} onChange={(e) => setDiscard(Number(e.target.value))}>
              {player.hand.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.terrains.join('·')}
                </option>
              ))}
            </select>
            <ConfirmButton className="" warn="이번 차례에는 도시를 세우지 않고 연구·산출·성장도 하지 못합니다. 다음 차례에 도시를 세웁니다." onClick={() => dispatch({ type: 'wasteland', discardTileId: discard })}>
              불모지 탈출 (이 타일 버리고 1장 새로 뽑기, 이번 차례 종료)
            </ConfirmButton>
          </span>
        )
      }
    />
  )
}
