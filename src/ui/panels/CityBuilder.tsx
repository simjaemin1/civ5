import { useState } from 'react'
import type { Side, TileCard } from '../../engine'
import { SIDES } from '../../engine'
import type { Player } from '../../engine'
import { TileView } from '../TileView'
import { SIDE_LABEL } from '../format'
import { Help } from '../prefs'

interface Props {
  hand: TileCard[]
  player: Player
  label: string
  onBuild: (cityTileId: number, sideTiles: Partial<Record<Side, number>>) => void
  extra?: React.ReactNode
}

type Cell = 'city' | Side
const CELLS: Cell[] = ['city', ...SIDES]
const CELL_LABEL: Record<Cell, string> = { city: '도시', ...SIDE_LABEL }

/**
 * 손에 든 타일로 도시를 세운다: 십자 모양 자리에 바로 놓는다.
 * 타일(또는 놓인 칸)을 눌러 집고 → 칸을 누르면 놓이고, 칸에 있던 타일과 자리를 바꾼다.
 */
export function CityBuilder({ hand, player, label, onBuild, extra }: Props) {
  // 처음 배치: 1장째가 도시, 나머지는 위·오른쪽·아래·왼쪽 순서
  const [at, setAt] = useState<Partial<Record<Cell, number>>>(() => {
    const init: Partial<Record<Cell, number>> = {}
    hand.forEach((c, i) => (init[CELLS[i]] = c.id))
    return init
  })
  const [held, setHeld] = useState<number | null>(null)
  const cellOf = (id: number) => CELLS.find((k) => at[k] === id)
  const card = (id: number | undefined) => hand.find((c) => c.id === id)
  const placedCount = CELLS.filter((k) => at[k] !== undefined).length
  const valid = at.city !== undefined && placedCount === hand.length

  const put = (id: number, cell: Cell) => {
    const next = { ...at }
    const from = cellOf(id)
    const there = next[cell]
    next[cell] = id
    if (from) {
      if (there !== undefined) next[from] = there
      else delete next[from]
    }
    setAt(next)
    setHeld(null)
  }
  const clickCell = (cell: Cell) => {
    if (held !== null) put(held, cell)
    else if (at[cell] !== undefined) setHeld(at[cell]!)
  }

  const renderCell = (cell: Cell) => {
    const c = card(at[cell])
    const cls = `build-cell${held !== null ? ' target' : ''}${c && held === c.id ? ' held' : ''}`
    return (
      <div className={`c-${cell === 'city' ? 'c' : cell.toLowerCase()}`}>
        {c ? (
          <div className={cls}>
            <TileView card={c} player={player} selected={held === c.id} badge={{ city: cell === 'city' }} onClick={() => clickCell(cell)} hint={`${CELL_LABEL[cell]} — 눌러서 집기/놓기`} />
            <small className="cell-label">{CELL_LABEL[cell]}</small>
          </div>
        ) : (
          <button type="button" className={`tile empty ${cls}`} onClick={() => clickCell(cell)}>
            {CELL_LABEL[cell]} {held !== null ? '← 여기에 놓기' : '(비어 있음)'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="panel">
      <h3>{label}</h3>
      <Help>
        1장은 도시, 나머지는 위·오른쪽·아래·왼쪽 중 서로 다른 면에 붙입니다. 타일을 눌러 집은 뒤 다른 칸을 누르면 자리가 바뀝니다. 도시는 식량이 있는 타일을 추천합니다.
      </Help>
      <div className="row build-row">
        <div className="cross">{CELLS.map((k) => <div key={k} style={{ display: 'contents' }}>{renderCell(k)}</div>)}</div>
        {held !== null && (
          <p className="muted">
            <b>{card(held)?.terrains.join('·') || '타일'}</b>을(를) 집었습니다. 놓을 칸을 누르세요.{' '}
            <button className="link" onClick={() => setHeld(null)}>
              내려놓기
            </button>
          </p>
        )}
      </div>
      {!valid && <p className="error">모든 타일을 칸에 놓아야 합니다.</p>}
      <div className="row">
        <button
          className="primary"
          data-hotkey=""
          disabled={!valid}
          onClick={() => {
            const sideTiles: Partial<Record<Side, number>> = {}
            for (const s of SIDES) if (at[s] !== undefined) sideTiles[s] = at[s]
            onBuild(at.city!, sideTiles)
          }}
        >
          도시 건설
        </button>
        {extra}
      </div>
    </div>
  )
}
