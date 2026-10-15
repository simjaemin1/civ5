import { civById, declarationTargets } from '../../engine'
import type { PanelProps } from './types'

const KIND = { normal: '선전포고', retake: '탈환 선전포고 (일꾼 1개만)', city: '도시 공격 선전포고' } as const

export function DeclarePanel({ game, player, dispatch }: PanelProps) {
  const targets = declarationTargets(game, player)
  const tileOf = (defenderId: number, cityId: number, tileId: number) => {
    const owner = game.players[defenderId]
    const t = (game.players[defenderId].cities.find((c) => c.id === cityId) ?? player.cities.find((c) => c.id === cityId))
    const tile = t?.tiles.find((x) => x.card.id === tileId) ?? owner.cities.flatMap((c) => c.tiles).find((x) => x.card.id === tileId)
    return tile
  }
  return (
    <div className="panel">
      <h3>선전포고 (한 차례에 1번)</h3>
      <p className="muted">장군 1개와 타일에 올리지 않은 일꾼 1개를 걸고 상대 타일 1장을 목표로 합니다. 전투는 라운드 정산에서 진행됩니다. 탈환은 일꾼 1개만 필요합니다.</p>
      <div className="list">
        {targets.map((t) => {
          const tile = tileOf(t.defenderId, t.cityId, t.tileId)
          return (
            <button key={`${t.defenderId}-${t.cityId}-${t.tileId}`} onClick={() => dispatch({ type: 'declareWar', defenderId: t.defenderId, cityId: t.cityId, tileId: t.tileId })}>
              {KIND[t.kind]} → {civById(game.players[t.defenderId].civId).name} 도시{t.cityId + 1} · {tile ? tile.card.terrains.join('·') : '?'}
              {tile?.role === 'city' ? ' (도시 타일)' : ''}
            </button>
          )
        })}
      </div>
      <button className="primary" onClick={() => dispatch({ type: 'endTurn' })}>
        선전포고하지 않고 차례 끝내기 (식량 정산)
      </button>
    </div>
  )
}
