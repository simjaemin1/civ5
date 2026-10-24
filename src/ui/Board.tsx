import { useState } from 'react'
import type { City, GameState, Player, Side } from '../engine'
import { civById } from '../engine'
import { TileView } from './TileView'
import type { TileBadge } from './TileView'
import { SIDE_LABEL } from './format'

interface Props {
  game: GameState
  player: Player
  /** 일꾼 배치 단계에서 타일 클릭으로 토글 */
  placed?: Set<number>
  generalPlaced?: Set<number>
  onTileClick?: (cityId: number, tileId: number) => void
  isDisabled?: (cityId: number, tileId: number) => boolean
  /** 있으면 이 함수가 true인 타일만 누를 수 있다 (도시 타일 포함). 선전포고 목표 고르기용 */
  selectable?: (cityId: number, tileId: number) => boolean
  selectedTile?: { cityId: number; tileId: number } | null
  /** 도시 제목 옆에 붙일 글 (예: 사면 점령 2/4) */
  cityNote?: (city: City) => React.ReactNode
  /** 있으면 도시마다 타일을 끌어다 놓을 수 있다 (문화로 얻은 타일 붙이기) */
  onCityDrop?: (cityId: number) => void
}

/** 도시를 가운데에 두고 위·아래·왼쪽·오른쪽 타일을 십자로 보여 준다. 나머지 타일은 아래에 나열한다. */
export function Board(props: Props) {
  const { player } = props
  return (
    <div className="board">
      {player.cities.map((city) => (
        <CityBoard key={city.id} {...props} city={city} />
      ))}
    </div>
  )
}

function CityBoard({ game, player, city, placed, generalPlaced, onTileClick, isDisabled, selectable, selectedTile, cityNote, onCityDrop }: Props & { city: City }) {
  const [over, setOver] = useState(false)
  const badgeOf = (t: City['tiles'][number]): TileBadge => ({
    city: t.role === 'city',
    worker: placed ? placed.has(t.card.id) : city.placed.includes(t.card.id),
    general: generalPlaced ? generalPlaced.has(t.card.id) : city.generalPlaced?.includes(t.card.id),
    occupiedBy: t.occupiedBy !== undefined ? civById(game.players[t.occupiedBy].civId).name : undefined,
    target: targetBy(t.card.id),
  })
  // 이 도시 타일을 노리는 선전포고 (탈환은 공격 측의 원래 타일)
  const targetBy = (tileId: number) => {
    const d = game.declarations.find((x) => (x.kind === 'retake' ? x.attackerId : x.defenderId) === player.id && x.cityId === city.id && x.tileId === tileId)
    return d ? civById(game.players[d.attackerId].civId).name : undefined
  }
  const render = (t: City['tiles'][number] | undefined, label?: string) => {
    if (!t) return <div className="tile empty">{label ? `${label} 비어 있음` : ''}</div>
    return (
      <TileView
        card={t.card}
        player={player}
        badge={badgeOf(t)}
        selected={selectable ? selectedTile?.cityId === city.id && selectedTile.tileId === t.card.id : badgeOf(t).worker || badgeOf(t).general}
        disabled={selectable ? !selectable(city.id, t.card.id) : t.role === 'city' || (isDisabled?.(city.id, t.card.id) ?? false)}
        selectableMark={selectable ? selectable(city.id, t.card.id) : undefined}
        onClick={onTileClick && (selectable ? selectable(city.id, t.card.id) : t.role !== 'city') ? () => onTileClick(city.id, t.card.id) : undefined}
      />
    )
  }
  const side = (s: Side) => city.tiles.find((t) => t.role === 'side' && t.side === s)
  const extras = city.tiles.filter((t) => t.role === 'extra')
  return (
    <section
      className={`city${onCityDrop ? ' drop-zone' : ''}${over ? ' over' : ''}`}
      onDragOver={
        onCityDrop
          ? (e) => {
              e.preventDefault()
              setOver(true)
            }
          : undefined
      }
      onDragLeave={onCityDrop ? () => setOver(false) : undefined}
      onDrop={
        onCityDrop
          ? (e) => {
              e.preventDefault()
              setOver(false)
              onCityDrop(city.id)
            }
          : undefined
      }
    >
      <h3>
        도시 {city.id + 1} · 일꾼 {city.workers}
        <small> (타일 {city.tiles.length}장)</small>
        {cityNote && <small className="city-note"> {cityNote(city)}</small>}
      </h3>
      <div className="cross">
        <div className="c-n">{render(side('N'), SIDE_LABEL.N)}</div>
        <div className="c-w">{render(side('W'), SIDE_LABEL.W)}</div>
        <div className="c-c">{render(city.tiles.find((t) => t.role === 'city'))}</div>
        <div className="c-e">{render(side('E'), SIDE_LABEL.E)}</div>
        <div className="c-s">{render(side('S'), SIDE_LABEL.S)}</div>
      </div>
      {extras.length > 0 && <div className="extras">{extras.map((t) => <div key={t.card.id}>{render(t)}</div>)}</div>}
    </section>
  )
}
