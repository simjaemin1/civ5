import { useMemo, useState } from 'react'
import type { Placement } from '../../engine'
import { apply, civById, totalWorkers, RuleError } from '../../engine'
import { Board } from '../Board'
import { TileView } from '../TileView'
import { ICON } from '../format'
import type { PanelProps } from './types'

/** 일꾼 배치 단계: 타일을 눌러 일꾼을 올리고, 산출 미리보기를 보고 확정한다. */
export function PlacePanel({ game, player, dispatch }: PanelProps) {
  const [placed, setPlaced] = useState<Set<number>>(new Set())
  const [generals, setGenerals] = useState<Set<number>>(new Set())
  const [enemy, setEnemy] = useState<Placement[]>([])
  const [mode, setMode] = useState<'worker' | 'general'>('worker')
  const civ = civById(player.civId)

  const cityOf = (tileId: number) => player.cities.find((c) => c.tiles.some((t) => t.card.id === tileId))!
  const reserved = player.busyWorkers + (player.held ? 1 : player.scouting ? 1 : 0)
  const used = placed.size + enemy.length
  const total = totalWorkers(player)

  const placements: Placement[] = useMemo(
    () => [
      ...[...placed].map((tileId) => ({ cityId: cityOf(tileId).id, tileId })),
      ...[...generals].map((tileId) => ({ cityId: cityOf(tileId).id, tileId, general: true })),
      ...enemy,
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placed, generals, enemy],
  )

  const preview = useMemo(() => {
    try {
      const t = apply(game, { type: 'placeWorkers', placements }).players[player.id].turn!.yields
      return { ok: true as const, y: t }
    } catch (e) {
      return { ok: false as const, msg: e instanceof RuleError ? e.message : String(e) }
    }
  }, [game, placements, player.id])

  const toggle = (cityId: number, tileId: number) => {
    const city = player.cities.find((c) => c.id === cityId)!
    if (mode === 'general') {
      const next = new Set(generals)
      if (next.has(tileId)) next.delete(tileId)
      else if (next.size < player.generals && !placed.has(tileId)) next.add(tileId)
      setGenerals(next)
      return
    }
    const next = new Set(placed)
    if (next.has(tileId)) next.delete(tileId)
    else {
      const inCity = [...placed].filter((id) => cityOf(id).id === cityId).length + enemy.filter((e) => e.cityId === cityId).length
      if (inCity < city.workers && used + reserved < total && !generals.has(tileId)) next.add(tileId)
    }
    setPlaced(next)
  }

  // 몽골: 내 장군이 올라간 상대 타일
  const enemyTiles =
    civ.id === 'mongolia'
      ? game.players.flatMap((o) =>
          o.cities.flatMap((c) => c.tiles.filter((t) => t.occupiedBy === player.id && t.role !== 'city').map((t) => ({ o, c, t }))),
        )
      : []

  return (
    <div>
      <div className="panel">
        <h3>일꾼 배치</h3>
        <p className="muted">
          타일을 눌러 일꾼을 올립니다 (도시 타일에는 올릴 수 없고, 도시 타일은 일꾼 없이도 항상 산출합니다). 일꾼 {used}/{total - reserved} 사용
          {reserved > 0 && ` · 정찰/선전포고/맡아둔 타일에 묶인 일꾼 ${reserved}`}
        </p>
        {civ.id === 'sweden' && (
          <p>
            배치 모드:{' '}
            <label>
              <input type="radio" checked={mode === 'worker'} onChange={() => setMode('worker')} /> 일꾼
            </label>{' '}
            <label>
              <input type="radio" checked={mode === 'general'} onChange={() => setMode('general')} /> 위대한 장군 (스웨덴, 보유 {player.generals})
            </label>
          </p>
        )}
        {enemyTiles.length > 0 && (
          <div className="muted">
            몽골: 내 장군이 올라간 상대 타일에 일꾼 올리기
            {enemyTiles.map(({ o, c, t }) => {
              const on = enemy.some((e) => e.tileId === t.card.id)
              return (
                <label key={t.card.id} style={{ marginLeft: 8 }}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setEnemy(on ? enemy.filter((e) => e.tileId !== t.card.id) : [...enemy, { cityId: player.cities[0].id, tileId: t.card.id, enemy: { playerId: o.id, cityId: c.id } }])
                    }
                  />{' '}
                  {civById(o.civId).name} {t.card.terrains.join('·')}
                </label>
              )
            })}
          </div>
        )}
        <div className="row">
          {!player.scouting && !player.held && (
            <button onClick={() => dispatch({ type: 'scout' })} title="일꾼 1개로 타일 덱 맨 위 카드 1장을 봅니다">
              🔭 정찰
            </button>
          )}
          {player.scouted && (
            <span className="row">
              <b>정찰한 타일:</b>
              <div style={{ width: 120 }}>
                <TileView card={player.scouted} player={player} />
              </div>
              {player.techs.includes('compass') && <button onClick={() => dispatch({ type: 'holdScouted' })}>🧭 맡아두기</button>}
            </span>
          )}
          {player.held && (
            <span className="row">
              <b>맡아둔 타일:</b>
              <div style={{ width: 120 }}>
                <TileView card={player.held} player={player} />
              </div>
              <button onClick={() => dispatch({ type: 'releaseHeld' })}>돌려보내기</button>
            </span>
          )}
        </div>
        <div className="row">
          {preview.ok ? (
            <span>
              예상 산출:{' '}
              {preview.y.cities.map((c) => (
                <span key={c.cityId} style={{ marginRight: 12 }}>
                  도시{c.cityId + 1} {ICON.food}
                  {c.food} {ICON.hammer}
                  {c.hammer}
                </span>
              ))}
              {ICON.science}
              {preview.y.science} {ICON.gold}
              {preview.y.gold}
            </span>
          ) : (
            <span className="error">{preview.msg}</span>
          )}
          <button className="primary" disabled={!preview.ok} onClick={() => dispatch({ type: 'placeWorkers', placements })}>
            배치 확정
          </button>
        </div>
      </div>
      <Board
        game={game}
        player={player}
        placed={placed}
        generalPlaced={generals}
        onTileClick={toggle}
        isDisabled={(_, tileId) => {
          const t = player.cities.flatMap((c) => c.tiles).find((x) => x.card.id === tileId)
          return !!t && t.occupiedBy !== undefined && t.occupiedBy !== player.id
        }}
      />
    </div>
  )
}
