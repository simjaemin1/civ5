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

type Cell = 'city' | Side | `x${number}`
/** 십자 5칸 + 손이 5장을 넘으면 넘는 만큼의 추가 타일 칸 */
const cellsFor = (n: number): Cell[] => ['city', ...SIDES, ...Array.from({ length: Math.max(0, n - 5) }, (_, i) => `x${i}` as const)]
const cellLabel = (k: Cell): string => (k === 'city' ? '도시' : k.startsWith('x') ? '추가 타일' : SIDE_LABEL[k as Side])

/**
 * 손에 든 타일로 도시를 세운다: 십자 모양 자리에 바로 놓는다.
 * 타일(또는 놓인 칸)을 눌러 집고 → 칸을 누르면 놓이고, 칸에 있던 타일과 자리를 바꾼다.
 * 손이 5장을 넘으면(엘도라도 발견 등) 넘는 타일은 "추가 타일" 칸에 둔다: 영토로 붙는다.
 */
export function CityBuilder({ hand, player, label, onBuild, extra }: Props) {
  const CELLS = cellsFor(hand.length)
  // 처음 배치: 1장째가 도시, 나머지는 위·오른쪽·아래·왼쪽, 그다음 추가 타일 순서
  const [at, setAt] = useState<Partial<Record<Cell, number>>>(() => {
    const init: Partial<Record<Cell, number>> = {}
    hand.forEach((c, i) => (init[CELLS[i]] = c.id))
    return init
  })
  const [held, setHeld] = useState<number | null>(null)
  const cellOf = (id: number) => CELLS.find((k) => at[k] === id)
  const card = (id: number | undefined) => hand.find((c) => c.id === id)
  const placedCount = CELLS.filter((k) => at[k] !== undefined).length
  // 사방(최대 4칸)을 먼저 채워야 한다: 추가 타일 칸은 십자가 다 찬 뒤에만 쓴다
  const sidesFilled = SIDES.filter((k) => at[k] !== undefined).length
  const valid = at.city !== undefined && placedCount === hand.length && sidesFilled === Math.min(SIDES.length, hand.length - 1)

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
            <TileView card={c} player={player} selected={held === c.id} badge={{ city: cell === 'city' }} onClick={() => clickCell(cell)} hint={`${cellLabel(cell)} — 눌러서 집기/놓기`} />
            <small className="cell-label">{cellLabel(cell)}</small>
          </div>
        ) : (
          <button type="button" className={`tile empty ${cls}`} onClick={() => clickCell(cell)}>
            {cellLabel(cell)} {held !== null ? '← 여기에 놓기' : '(비어 있음)'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="panel">
      <h3>{label}</h3>
      <Help>
        1장은 도시, 나머지는 위·오른쪽·아래·왼쪽 중 서로 다른 면에 붙입니다 (5장을 넘는 타일은 추가 타일). 타일을 눌러 집은 뒤 다른 칸을 누르면 자리가 바뀝니다. 도시는 식량이 있는 타일을 추천합니다.
      </Help>
      <div className="row build-row">
        <div className="cross">{CELLS.filter((k) => !k.startsWith('x')).map((k) => <div key={k} style={{ display: 'contents' }}>{renderCell(k)}</div>)}</div>
        {hand.length > 5 && (
          <div className="extra-cells">
            <small className="muted">추가 타일 {hand.length - 5}장 — 십자(5칸)에 놓지 않은 타일은 영토로 붙습니다</small>
            <div className="row">{CELLS.filter((k) => k.startsWith('x')).map((k) => <div key={k}>{renderCell(k)}</div>)}</div>
          </div>
        )}
        {held !== null && (
          <p className="muted">
            <b>{card(held)?.terrains.join('·') || '타일'}</b> 타일을 집었습니다. 놓을 칸을 누르세요.{' '}
            <button className="link" onClick={() => setHeld(null)}>
              내려놓기
            </button>
          </p>
        )}
      </div>
      {!valid && <p className="error">모든 타일을 칸에 놓아야 합니다{hand.length > 5 ? ' (십자 5칸을 먼저 채우세요)' : ''}.</p>}
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
