import { civById, findTile, occupiedTiles } from '../../engine'
import { TileView } from '../TileView'
import { tileName } from '../gameInfo'
import type { PanelProps } from './types'

/** 점령 중인 장군 불러들이기: 일꾼 배치 단계에서만 정하고, 불러들인 장군은 이번 차례 선전포고에 바로 쓴다 (규칙서 10장). */
export function RecallBox({ game, player, dispatch }: PanelProps) {
  const occupied = occupiedTiles(game, player)
  if (!occupied.length) return null
  return (
    <details>
      <summary>점령 중인 장군 불러들이기 (원하는 만큼)</summary>
      <div className="list">
        {occupied.map((o) => {
          const owner = game.players[o.defenderId]
          const found = findTile(owner, o.cityId, o.tileId)
          return (
            <div key={`${o.defenderId}:${o.cityId}:${o.tileId}`} className="row recall-row">
              {found && (
                <div style={{ width: 96 }}>
                  <TileView card={found.tile.card} player={owner} badge={{ occupiedBy: civById(player.civId).name }} />
                </div>
              )}
              <span>
                {civById(owner.civId).name} 도시 {o.cityId + 1} · <b>{found ? tileName(found.city, o.tileId) : '?'}</b>
              </span>
              <button onClick={() => dispatch({ type: 'recallGeneral', ...o })}>불러들이기 (점령 해제, 이번 차례 선전포고에 바로 사용)</button>
            </div>
          )
        })}
      </div>
    </details>
  )
}
