import { useState } from 'react'
import type { Side, TileCard } from '../../engine'
import { SIDES } from '../../engine'
import type { Player } from '../../engine'
import { TileView } from '../TileView'
import { SIDE_LABEL } from '../format'

interface Props {
  hand: TileCard[]
  player: Player
  label: string
  onBuild: (cityTileId: number, sideTiles: Partial<Record<Side, number>>) => void
  extra?: React.ReactNode
}

/** 손에 든 타일로 도시를 세운다: 1장을 도시로 고르고, 나머지를 서로 다른 면에 붙인다. */
export function CityBuilder({ hand, player, label, onBuild, extra }: Props) {
  const [cityId, setCityId] = useState<number>(hand[0]?.id ?? -1)
  const others = hand.filter((c) => c.id !== cityId)
  const [assign, setAssign] = useState<Record<number, Side>>({})
  const sideOf = (id: number, i: number): Side => assign[id] ?? SIDES[i]
  const used = others.map((c, i) => sideOf(c.id, i))
  const valid = new Set(used).size === used.length

  return (
    <div className="panel">
      <h3>{label}</h3>
      <p className="muted">타일 중 1장을 도시로 고르고(클릭), 나머지는 위·오른쪽·아래·왼쪽 중 서로 다른 면에 붙입니다.</p>
      <div className="hand">
        {hand.map((c) => {
          const i = others.findIndex((o) => o.id === c.id)
          return (
            <div key={c.id} className="hand-item">
              <TileView card={c} player={player} selected={c.id === cityId} badge={{ city: c.id === cityId }} onClick={() => setCityId(c.id)} />
              {c.id === cityId ? (
                <div className="muted">도시</div>
              ) : (
                <select value={sideOf(c.id, i)} onChange={(e) => setAssign({ ...assign, [c.id]: e.target.value as Side })}>
                  {SIDES.map((s) => (
                    <option key={s} value={s}>
                      {SIDE_LABEL[s]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )
        })}
      </div>
      {!valid && <p className="error">면이 겹칩니다.</p>}
      <div className="row">
        <button
          className="primary"
          disabled={!valid}
          onClick={() => {
            const sideTiles: Partial<Record<Side, number>> = {}
            others.forEach((c, i) => (sideTiles[sideOf(c.id, i)] = c.id))
            onBuild(cityId, sideTiles)
          }}
        >
          도시 건설
        </button>
        {extra}
      </div>
    </div>
  )
}
