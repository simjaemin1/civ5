import { CityTag } from '../icons'
import { useMemo, useState } from 'react'
import type { Placement } from '../../engine'
import { apply, civById, declarationTargets, totalWorkers, RuleError } from '../../engine'
import { Board } from '../Board'
import { TileView } from '../TileView'
import { ScoutBox } from './ScoutBox'
import { deckSize } from '../gameInfo'
import { ICON } from '../format'
import type { PanelProps } from './types'
import { ConfirmButton } from '../ConfirmButton'
import { Help } from '../prefs'

/**
 * 지난 차례 배치 중 지금도 유효한 것을 그대로 올려 둔다.
 *  - 일꾼: 내 도시의 타일(도시 타일 제외)이고 상대에게 빼앗기지 않았으며, 도시별 일꾼 수와 묶인 일꾼 수를 넘지 않는 만큼
 *  - 스웨덴의 장군: 같은 조건의 타일, 가진 장군 수만큼
 *  - 몽골의 상대 타일 일꾼: 내 장군이 아직 올라가 있는 타일
 */
function rememberedPlacement(game: PanelProps['game'], player: PanelProps['player']): { placed: Set<number>; generals: Set<number>; enemy: Placement[] } {
  const placed = new Set<number>()
  const generals = new Set<number>()
  const enemy: Placement[] = []
  let want = 0
  let free = Math.max(0, totalWorkers(player) - player.busyWorkers - (player.held || player.scouting ? 1 : 0))
  let generalsLeft = player.civId === 'sweden' ? player.generals : 0
  for (const c of player.cities) {
    let room = c.workers - ((player.scouting || player.held) && player.scoutCity === c.id ? 1 : 0) // 정찰에 쓴 이 도시의 일꾼
    // 몽골: 내 장군이 올라간 상대 타일
    for (const e of c.lastEnemyPlaced ?? []) {
      want++
      const owner = game.players[e.playerId]
      const t = owner?.cities.find((x) => x.id === e.cityId)?.tiles.find((x) => x.card.id === e.tileId)
      if (!t || t.role === 'city' || t.occupiedBy !== player.id || room <= 0 || free <= 0) continue
      enemy.push({ cityId: c.id, tileId: e.tileId, enemy: { playerId: e.playerId, cityId: e.cityId } })
      room--
      free--
    }
    for (const id of c.lastPlaced ?? []) {
      want++
      const t = c.tiles.find((x) => x.card.id === id)
      if (!t || t.role === 'city' || (t.occupiedBy !== undefined && t.occupiedBy !== player.id)) continue
      if (room <= 0 || free <= 0) continue
      placed.add(id)
      room--
      free--
    }
    // 스웨덴: 장군은 일꾼과 따로(가진 장군 수만큼)
    for (const id of c.lastGeneralPlaced ?? []) {
      want++
      const t = c.tiles.find((x) => x.card.id === id)
      if (!t || t.role === 'city' || (t.occupiedBy !== undefined && t.occupiedBy !== player.id) || placed.has(id) || generalsLeft <= 0) continue
      generals.add(id)
      generalsLeft--
    }
  }
  return { placed, generals, enemy }
}

/** 일꾼 배치 단계: 타일을 눌러 일꾼을 올리고, 산출 미리보기를 보고 확정한다. */
export function PlacePanel({ game, player, dispatch }: PanelProps) {
  // 지난 차례의 배치를 기억해 그대로 올려 둔다. 타일을 빼앗겼거나 일꾼이 줄었으면 그만큼만 돌아온다.
  const [initial] = useState(() => rememberedPlacement(game, player))
  const [placed, setPlaced] = useState<Set<number>>(initial.placed)
  const [generals, setGenerals] = useState<Set<number>>(initial.generals)
  const [enemy, setEnemy] = useState<Placement[]>(initial.enemy)
  const [mode, setMode] = useState<'worker' | 'general'>('worker')
  // 몽골: 일꾼을 올리려고 누른 점령 타일 (어느 도시의 일꾼을 쓸지 묻는 창)
  const [askEnemy, setAskEnemy] = useState<{ playerId: number; cityId: number; tileId: number } | null>(null)
  const civ = civById(player.civId)

  const cityOf = (tileId: number) => player.cities.find((c) => c.tiles.some((t) => t.card.id === tileId))!
  const reserved = player.busyWorkers + (player.held ? 1 : player.scouting ? 1 : 0)
  const used = placed.size + enemy.length
  const total = totalWorkers(player)
  // 도시별로 타일에 올릴 수 있는 일꾼: 정찰(맡아둔 타일)에 그 도시 일꾼을 썼으면 1 적다
  const cap = (c: { id: number; workers: number }) => c.workers - ((player.scouting || player.held) && player.scoutCity === c.id ? 1 : 0)
  const onCityOf = (cityId: number) => [...placed].filter((id) => cityOf(id).id === cityId).length + enemy.filter((e) => e.cityId === cityId).length

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
      if (onCityOf(cityId) < cap(city) && used + reserved < total && !generals.has(tileId)) next.add(tileId)
    }
    setPlaced(next)
  }

  // 놀고 있는 일꾼이 있는데 빈 타일도 있으면 확정 전에 한 번 묻는다
  const freeTiles = player.cities.reduce(
    (n, c) =>
      n +
      Math.min(
        cap(c) - onCityOf(c.id),
        c.tiles.filter((t) => t.role !== 'city' && !placed.has(t.card.id) && !generals.has(t.card.id) && (t.occupiedBy === undefined || t.occupiedBy === player.id)).length,
      ),
    0,
  )
  const idle = Math.min(total - reserved - used, Math.max(0, freeTiles))
  const left = total - reserved - used
  // 선전포고(내정 5단계)에는 타일에 올리지 않은 일꾼 1개가 필요하다. 일꾼을 다 올리면 그 단계가 열리지 않는다.
  // 스웨덴: 이번에 타일에 올리려는 장군은 선전포고에 쓸 수 없다
  const freeGenerals = player.generals - generals.size
  const targets = declarationTargets(game, player).filter((t) => t.kind === 'retake' || freeGenerals >= 1)
  const canWar = targets.length > 0
  const retakeOnly = canWar && targets.every((t) => t.kind === 'retake')
  const warHint = !canWar
    ? null
    : left >= 1
      ? `${retakeOnly ? '탈환 ' : ''}선전포고하려면 타일에 올리지 않은 일꾼 1개를 남겨 두세요 (지금 남는 일꾼 ${left}${retakeOnly ? '' : `, 장군 ${freeGenerals}`}).`
      : `일꾼을 모두 올리면 이번 차례에는 선전포고할 수 없습니다. ${retakeOnly ? '탈환 ' : ''}선전포고하려면 일꾼 1개를 남기세요.`
  const idleWarn =
    idle <= 0
      ? null
      : canWar && left === 1
        ? null // 선전포고용으로 1개 남긴 것으로 본다
        : `일꾼 ${idle}개가 놀고 있습니다${canWar ? ' (선전포고에는 1개면 충분)' : ''}. 빈 타일에 올리지 않으면 산출이 없습니다.`
  const canScout =
    deckSize(game) === 0
      ? { ok: false, why: '타일 덱이 비어 정찰할 수 없습니다' }
      : player.scoutedRound === game.round
        ? { ok: false, why: '정찰은 한 차례에 1장만 볼 수 있습니다 (이번 차례에 이미 봤습니다)' }
      : left < 1
        ? { ok: false, why: '정찰하려면 올린 일꾼을 1개 내리세요' }
        : { ok: true, cities: player.cities.length > 1 ? player.cities.map((c) => ({ id: c.id, free: Math.min(left, cap(c) - onCityOf(c.id)) })) : undefined }

  // 몽골: 내 장군이 올라간 상대 타일
  const enemyTiles =
    civ.id === 'mongolia'
      ? game.players.flatMap((o) =>
          o.cities.flatMap((c) => c.tiles.filter((t) => t.occupiedBy === player.id && t.role !== 'city').map((t) => ({ o, c, t }))),
        )
      : []

  // 몽골: 점령 타일을 누르면 어느 도시의 일꾼을 쓸지 묻고, 이미 일꾼이 있으면 내린다 (장군이 다시 보인다)
  const freeIn = (cityId: number) => {
    const c = player.cities.find((x) => x.id === cityId)!
    return Math.min(cap(c) - onCityOf(cityId), total - reserved - used)
  }
  const clickEnemy = (src: { playerId: number; cityId: number; tileId: number }) => {
    if (enemy.some((e) => e.tileId === src.tileId)) setEnemy(enemy.filter((e) => e.tileId !== src.tileId))
    else setAskEnemy(src)
  }
  const putEnemy = (src: { playerId: number; cityId: number; tileId: number }, cityId: number) => {
    setAskEnemy(null)
    if (freeIn(cityId) <= 0) return
    setEnemy([...enemy, { cityId, tileId: src.tileId, enemy: { playerId: src.playerId, cityId: src.cityId } }])
  }

  return (
    <div>
      <div className="panel">
        <h3>일꾼 배치</h3>
        <div className="worker-summary">
          <span className={`chip total${total - reserved - used > 0 ? ' warn' : ''}`}>
            전체 일꾼 <b>{total}</b> · 미배치 <b>{Math.max(0, total - reserved - used)}</b>
          </span>
          {player.cities.length > 1 && player.cities.map((c) => {
            return (
              <span key={c.id} className="chip">
                <CityTag id={c.id} /> 일꾼 {c.workers} · 미배치 {Math.max(0, cap(c) - onCityOf(c.id))}
                {(player.scouting || player.held) && player.scoutCity === c.id ? ' · 정찰 1' : ''}
              </span>
            )
          })}
          <button
            onClick={() => {
              setPlaced(new Set())
              setGenerals(new Set())
              setEnemy([])
            }}
            disabled={placed.size + generals.size + enemy.length === 0}
          >
            모두 내리기
          </button>
          <button
            onClick={() => {
              setPlaced(new Set(initial.placed))
              setGenerals(new Set(initial.generals))
              setEnemy(initial.enemy)
            }}
          >
            지난 배치로
          </button>
        </div>
        <Help>타일을 눌러 일꾼을 올립니다. 도시 타일은 일꾼 없이도 항상 산출합니다.</Help>
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
        <ScoutBox game={game} player={player} dispatch={dispatch} canScout={canScout} />
        {warHint && <p className="war-hint">⚔ {warHint}</p>}
        <div className="row place-confirm">
          {preview.ok ? (
            <span>
              예상 산출:{' '}
              {preview.y.cities.map((c) => (
                <span key={c.cityId} style={{ marginRight: 12 }}>
                  <CityTag id={c.cityId} /> {ICON.food}
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
          <ConfirmButton className="primary confirm-btn" hotkey disabled={!preview.ok} warn={idleWarn} onClick={() => dispatch({ type: 'placeWorkers', placements })}>
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
      {enemyTiles.length > 0 && (
        <section className="panel enemy-tiles">
          <h3>점령 중인 상대 타일</h3>
          <Help>내 장군이 올라간 상대 타일입니다. 누르면 어느 도시의 일꾼을 쓸지 고릅니다. 다시 누르면 내립니다.</Help>
          <div className="row">
            {enemyTiles.map(({ o, c, t }) => {
              const on = enemy.find((e) => e.tileId === t.card.id)
              const src = { playerId: o.id, cityId: c.id, tileId: t.card.id }
              return (
                <div key={t.card.id} className="enemy-tile">
                  <TileView card={t.card} player={player} badge={{ worker: !!on, occupiedBy: civ.name }} selected={!!on} onClick={() => clickEnemy(src)} hint={`${civById(o.civId).name}의 ${t.card.terrains.join('·')} 타일`} />
                  <small className="cell-label">
                    {civById(o.civId).name}
                    {on ? <> · <CityTag id={on.cityId} /> 일꾼</> : ''}
                  </small>
                </div>
              )
            })}
          </div>
        </section>
      )}
      {askEnemy && (
        <div className="modal-backdrop" onClick={() => setAskEnemy(null)} role="dialog" aria-modal="true" aria-label="일꾼을 쓸 도시">
          <div className="zoom pick-city" onClick={(e) => e.stopPropagation()}>
            <b>어느 도시의 일꾼을 사용하시겠습니까?</b>
            <div className="row">
              {player.cities.map((c) => {
                const free = Math.max(0, freeIn(c.id))
                return (
                  <button key={c.id} className="primary" disabled={free <= 0} onClick={() => putEnemy(askEnemy, c.id)}>
                    <CityTag id={c.id} /> 도시 {c.id + 1} <small>(남은 일꾼 {free})</small>
                  </button>
                )
              })}
            </div>
            <button onClick={() => setAskEnemy(null)}>취소</button>
          </div>
        </div>
      )}
    </div>
  )
}
