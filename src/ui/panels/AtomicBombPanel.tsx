import { useState } from 'react'
import { civById } from '../../engine'
import { ConfirmButton } from '../ConfirmButton'
import { TileView } from '../TileView'
import type { PanelProps } from './types'

/**
 * 원자폭탄 카드를 가졌다면 자신의 차례 어느 단계에서든 쓸 수 있다 (만리장성처럼 항상 보이는 버튼).
 * 사용을 누르면 내 장군이 점령 중인 상대 타일 가운데 하나를 고르고, 격발하면 그 타일이 사라진다.
 * 첫 5타일의 사면도 파괴할 수 있다 (그 면은 빈 면이 된다). 도시 타일에는 장군을 올릴 수 없으므로 파괴할 수 없다.
 */
export function AtomicBombPanel({ game, player, dispatch }: PanelProps) {
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  if (!player.military.some((c) => c.defId === 'atomic_bomb')) return null
  const occupied = game.players.flatMap((o) =>
    o.id === player.id ? [] : o.cities.flatMap((c) => c.tiles.filter((t) => t.occupiedBy === player.id && t.role !== 'city').map((t) => ({ o, c, t, ok: true }))),
  )
  const key = (x: { o: { id: number }; c: { id: number }; t: { card: { id: number } } }) => `${x.o.id}:${x.c.id}:${x.t.card.id}`
  const chosen = occupied.find((x) => key(x) === sel)
  const canUse = occupied.some((x) => x.ok)
  const close = () => {
    setOpen(false)
    setSel(null)
  }

  return (
    <div className="panel atomic">
      {!open ? (
        <div className="row">
          <button
            disabled={!canUse}
            onClick={() => setOpen(true)}
            title={canUse ? '내 장군이 점령 중인 상대 타일 하나를 파괴합니다' : '내 장군이 점령 중인 상대 타일이 없어 쓸 수 없습니다'}
          >
            ☢ 원자폭탄 사용
          </button>
          {!canUse && <small className="muted">점령 중인 상대 타일이 없어 아직 쓸 수 없습니다.</small>}
        </div>
      ) : (
        <>
          <h3>☢ 원자폭탄: 파괴할 타일을 고르세요</h3>
          <p className="muted">내 장군이 점령 중인 타일만 고를 수 있습니다. 첫 5타일의 사면도 파괴할 수 있습니다(십자의 빈 면은 다음 문화 타일이 메웁니다). 도시 타일은 장군을 올릴 수 없어 파괴할 수 없습니다. 격발하면 장군은 돌아오고 카드는 사라집니다.</p>
          <div className="atomic-tiles">
            {occupied.map((x) => (
              <div key={key(x)} className="atomic-pick">
                <TileView
                  card={x.t.card}
                  player={x.o}
                  selected={key(x) === sel}
                  disabled={!x.ok}
                  selectableMark={x.ok}
                  onClick={x.ok ? () => setSel(key(x)) : undefined}
                />
                <small className="muted">
                  {civById(x.o.civId).name} 도시 {x.c.id + 1}
                  {x.t.role === 'side' ? ' · 첫 5타일' : ''}
                </small>
              </div>
            ))}
          </div>
          <div className="row">
            <ConfirmButton
              className="primary"
              disabled={!chosen}
              warn={chosen ? `${civById(chosen.o.civId).name}의 ${chosen.t.card.terrains.join('·') || '자연경관'} 타일을 파괴합니다. 되돌릴 수 없습니다.` : null}
              onClick={() => {
                if (!chosen) return
                dispatch({ type: 'useAtomicBomb', defenderId: chosen.o.id, cityId: chosen.c.id, tileId: chosen.t.card.id })
                close()
              }}
            >
              ☢ 격발 {chosen ? `(${civById(chosen.o.civId).name} 도시 ${chosen.c.id + 1} 타일 삭제)` : '(타일을 먼저 고르세요)'}
            </ConfirmButton>
            <button onClick={close}>취소</button>
          </div>
        </>
      )}
    </div>
  )
}
