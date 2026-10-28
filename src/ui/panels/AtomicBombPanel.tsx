import { useState } from 'react'
import { civById } from '../../engine'
import { ConfirmButton } from '../ConfirmButton'
import { TileView } from '../TileView'
import type { PanelProps } from './types'

/**
 * 원자폭탄 카드를 가졌다면 자신의 차례 어느 단계에서든 쓸 수 있다 (만리장성처럼 항상 보이는 버튼).
 * 사용을 누르면 위대한 장군이 점령 중인 타일(장군의 주인은 상관없음) 가운데 하나를 고르고, 격발하면 그 타일이 사라지고 장군은 주인에게 돌아간다.
 * 스웨덴이 일꾼처럼 올린 장군은 점령이 아니라 고를 수 없다.
 * 첫 5타일의 사면도 파괴할 수 있다 (그 면은 빈 면이 된다). 도시 타일에는 장군을 올릴 수 없으므로 파괴할 수 없다.
 */
export function AtomicBombPanel({ game, player, dispatch }: PanelProps) {
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  if (!player.military.some((c) => c.defId === 'atomic_bomb')) return null
  const occupied = game.players.flatMap((o) =>
    o.cities.flatMap((c) => c.tiles.filter((t) => t.occupiedBy !== undefined && t.role !== 'city').map((t) => ({ o, c, t, by: game.players[t.occupiedBy!], ok: true }))),
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
            title={canUse ? '위대한 장군이 점령 중인 타일 하나를 파괴합니다 (장군의 주인은 상관없음)' : '위대한 장군이 점령 중인 타일이 없어 쓸 수 없습니다'}
          >
            ☢ 원자폭탄 사용
          </button>
          {!canUse && <small className="muted">위대한 장군이 점령 중인 타일이 없어 아직 쓸 수 없습니다.</small>}
        </div>
      ) : (
        <>
          <h3>☢ 원자폭탄: 파괴할 타일을 고르세요</h3>
          <p className="muted">위대한 장군이 점령 중인 타일만 고를 수 있습니다 (누구의 장군이든, 내 영토여도). 첫 5타일의 사면도 파괴할 수 있습니다(십자의 빈 면은 다음 문화 타일이 메웁니다). 도시 타일은 장군을 올릴 수 없어 파괴할 수 없습니다. 격발하면 점령 중이던 장군은 주인에게 돌아가고 카드는 사라집니다.</p>
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
                  {x.o.id === player.id ? '내 ' : `${civById(x.o.civId).name} `}도시 {x.c.id + 1}
                  {x.t.role === 'side' ? ' · 첫 5타일' : ''} · {x.by.id === player.id ? '내 장군' : `${civById(x.by.civId).name} 장군`}
                </small>
              </div>
            ))}
          </div>
          <div className="row">
            <ConfirmButton
              className="primary"
              disabled={!chosen}
              warn={chosen ? `${chosen.o.id === player.id ? '내' : `${civById(chosen.o.civId).name}의`} ${chosen.t.card.terrains.join('·') || '자연경관'} 타일을 파괴합니다. ${chosen.by.id === player.id ? '내' : `${civById(chosen.by.civId).name}`} 장군은 주인에게 돌아갑니다. 되돌릴 수 없습니다.` : null}
              onClick={() => {
                if (!chosen) return
                dispatch({ type: 'useAtomicBomb', defenderId: chosen.o.id, cityId: chosen.c.id, tileId: chosen.t.card.id })
                close()
              }}
            >
              ☢ 격발 {chosen ? `(${chosen.o.id === player.id ? '내' : civById(chosen.o.civId).name} 도시 ${chosen.c.id + 1} 타일 삭제)` : '(타일을 먼저 고르세요)'}
            </ConfirmButton>
            <button onClick={close}>취소</button>
          </div>
        </>
      )}
    </div>
  )
}
