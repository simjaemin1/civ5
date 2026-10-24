import { useMemo, useState } from 'react'
import type { Placement } from '../../engine'
import { apply, civById, totalWorkers, RuleError } from '../../engine'
import { Board } from '../Board'
import { TileView } from '../TileView'
import { ICON } from '../format'
import type { PanelProps } from './types'
import { ConfirmButton } from '../ConfirmButton'
import { Help } from '../prefs'

/** 일꾼 배치 단계: 타일을 눌러 일꾼을 올리고, 산출 미리보기를 보고 확정한다. */
export function PlacePanel({ game, player, dispatch, lastTiles }: PanelProps & { lastTiles?: number[] }) {
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

  // 지난 차례 배치 다시 쓰기: 지금도 내 타일이고 점령되지 않았으며 도시별 일꾼 수 안에 드는 타일만
  const lastSet = new Set(lastTiles ?? [])
  const reuseLast = () => {
    const next = new Set<number>()
    let left = total - reserved - enemy.length
    for (const city of player.cities) {
      let room = city.workers - enemy.filter((e) => e.cityId === city.id).length
      for (const t of city.tiles) {
        if (left <= 0 || room <= 0) break
        if (!lastSet.has(t.card.id) || t.role === 'city' || generals.has(t.card.id)) continue
        if (t.occupiedBy !== undefined && t.occupiedBy !== player.id) continue
        next.add(t.card.id)
        left--
        room--
      }
    }
    setPlaced(next)
  }
  // 놀고 있는 일꾼이 있는데 빈 타일도 있으면 확정 전에 한 번 묻는다
  const freeTiles = player.cities.reduce(
    (n, c) =>
      n +
      Math.min(
        c.workers - [...placed].filter((id) => cityOf(id).id === c.id).length - enemy.filter((e) => e.cityId === c.id).length,
        c.tiles.filter((t) => t.role !== 'city' && !placed.has(t.card.id) && !generals.has(t.card.id) && (t.occupiedBy === undefined || t.occupiedBy === player.id)).length,
      ),
    0,
  )
  const idle = Math.min(total - reserved - used, Math.max(0, freeTiles))
  const idleWarn = idle > 0 ? `일꾼 ${idle}개가 놀고 있습니다. 선전포고·정찰에 쓸 일꾼이 아니면 빈 타일에 올리세요.` : null

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
        <Help>타일을 눌러 일꾼을 올립니다. 도시 타일에는 올릴 수 없고, 도시 타일은 일꾼 없이도 항상 산출합니다.</Help>
        <p>
          일꾼 <b>{used}/{total - reserved}</b> 사용
          {reserved > 0 && <span className="muted"> · 정찰/선전포고/맡아둔 타일에 묶인 일꾼 {reserved}</span>}{' '}
          {lastSet.size > 0 && (
            <button onClick={reuseLast} title="지난 차례에 일꾼을 올렸던 타일에 그대로 올립니다 (지금 올릴 수 없는 타일은 빼고)">
              ↻ 지난 차례와 같은 배치
            </button>
          )}
          {placed.size > 0 && <button onClick={() => setPlaced(new Set())}>모두 내리기</button>}
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
          <ConfirmButton hotkey disabled={!preview.ok} warn={idleWarn} onClick={() => dispatch({ type: 'placeWorkers', placements })}>
            배치 확정
          </ConfirmButton>
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
