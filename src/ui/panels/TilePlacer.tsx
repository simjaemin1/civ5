import { useState } from 'react'
import { SIDE_LABEL } from '../format'
import { Board } from '../Board'
import { TileView } from '../TileView'
import { Help } from '../prefs'
import type { PanelProps } from './types'

/**
 * 문화로 얻은 타일 붙이기: 얻은 타일을 보고 붙일 도시로 끌어다 놓는다 (또는 도시 버튼).
 * 첫 5타일에 빈 면이 남은 도시에 붙이면 반드시 그 면에 붙는다.
 */
export function TilePlacer({ player, game, dispatch }: PanelProps) {
  const queue = player.pendingTiles ?? []
  const [dragging, setDragging] = useState(false)
  const card = queue[0]
  if (!card) return null
  const put = (cityId: number) => dispatch({ type: 'placeGainedTile', cityId })
  const where = (cityId: number) => {
    const c = player.cities.find((x) => x.id === cityId)!
    return c.openSides.length ? `${SIDE_LABEL[c.openSides[0]]} 빈 면 (첫 5타일)` : '추가 타일'
  }
  return (
    <div className="panel">
      <h3>
        🗺 문화로 얻은 새 타일 {queue.length > 1 && <small className="muted">(붙일 타일 {queue.length}장 남음)</small>}
      </h3>
      <Help>타일을 보고 붙일 도시로 끌어다 놓거나, 도시 버튼을 누르세요. 첫 5타일에 빈 면이 있는 도시는 그 면에 붙습니다. 붙이지 않고 차례를 끝내면 기본 도시에 붙습니다.</Help>
      <div className="gained">
        <div
          className="gained-tile"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', `tile:${card.id}`)
            e.dataTransfer.effectAllowed = 'move'
            setDragging(true)
          }}
          onDragEnd={() => setDragging(false)}
        >
          <TileView card={card} player={player} />
        </div>
        <div className="gained-actions">
          {player.cities.map((c) => (
            <button key={c.id} className="primary" data-hotkey={c === player.cities[0] ? '' : undefined} onClick={() => put(c.id)}>
              도시 {c.id + 1}에 붙이기 <small>→ {where(c.id)}</small>
            </button>
          ))}
          {queue.length > 1 && (
            <small className="muted">
              다음 타일: {queue
                .slice(1)
                .map((t) => t.terrains.join('·') || '자연경관')
                .join(', ')}
            </small>
          )}
        </div>
      </div>
      <p className="muted">{dragging ? '붙일 도시 위에 놓으세요.' : '아래 도시 칸으로 끌어다 놓을 수도 있습니다.'}</p>
      <Board game={game} player={player} onCityDrop={put} />
    </div>
  )
}
