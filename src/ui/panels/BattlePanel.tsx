import { useState } from 'react'
import { cardStats, civById, usableInBattle } from '../../engine'
import type { CardInst, GameState, Player } from '../../engine'
import { cardText } from '../format'
import type { PanelProps } from './types'

const label = (_p: Player, c: CardInst) => cardText(c, false)

/** 전투: 비공개로 카드를 1~4번 자리에 놓고, 공개 후 대상을 고르는 카드는 대상을 고른다. */
export function BattlePanel({ game, player, dispatch }: PanelProps) {
  const b = game.battle!
  const me = player // 지금 입력하는 사람 (핫시트는 actorOf, 온라인은 나)
  const enemyId = me.id === b.decl.attackerId ? b.decl.defenderId : b.decl.attackerId
  const enemy = game.players[enemyId]
  const tileOwner = b.decl.kind === 'retake' ? game.players[b.decl.attackerId] : game.players[b.decl.defenderId]
  const tile = tileOwner.cities.find((c) => c.id === b.decl.cityId)?.tiles.find((t) => t.card.id === b.decl.tileId)
  const kindLabel = { normal: '일반 선전포고', retake: '탈환 선전포고', city: '도시 공격' }[b.decl.kind]

  return (
    <div className="panel">
      <h3>
        전투 — {civById(game.players[b.decl.attackerId].civId).name}(공격) vs {civById(game.players[b.decl.defenderId].civId).name}(수비)
      </h3>
      <p className="muted">
        {kindLabel} · 목표 타일: {tile ? tile.card.terrains.join('·') : '?'}
        {b.coastal ? ' (해안 타일 전투)' : ''} · 남은 카드가 많은 쪽이 이기고, 같으면 수비 측이 이깁니다. 내 1번은 상대 4번과 마주 봅니다.
      </p>
      {b.step === 'arrange' ? <Arrange game={game} me={me} dispatch={dispatch} /> : <Choose game={game} me={me} enemy={enemy} dispatch={dispatch} />}
    </div>
  )
}

function Arrange({ game, me, dispatch }: { game: GameState; me: Player; dispatch: PanelProps['dispatch'] }) {
  const b = game.battle!
  const usable = me.military.filter((c) => usableInBattle(game, b, me, c))
  const [slots, setSlots] = useState<(number | null)[]>([null, null, null, null])
  const [held, setHeld] = useState<number | null>(null) // 집어 든 카드 (클릭 → 자리 클릭, 또는 끌어다 놓기)
  const placed = new Set(slots.filter((x): x is number => x !== null))
  const inst = (uid: number | null) => (uid === null ? undefined : usable.find((c) => c.uid === uid))

  /** 카드를 자리에 놓는다. 이미 다른 자리에 있으면 옮기고, 자리에 카드가 있으면 서로 바꾼다. */
  const put = (uid: number, slot: number) => {
    const next = [...slots]
    const from = next.indexOf(uid)
    const displaced = next[slot]
    next[slot] = uid
    if (from >= 0) next[from] = displaced
    setSlots(next)
    setHeld(null)
  }
  const clickSlot = (i: number) => {
    if (held !== null) put(held, i)
    else if (slots[i] !== null) setHeld(slots[i]) // 놓인 카드를 집어 다른 자리로 옮긴다
  }
  const clear = (i: number) => {
    const next = [...slots]
    next[i] = null
    setSlots(next)
  }

  return (
    <>
      <h4>{civById(me.civId).name}: 카드 놓기 (상대에게 보이지 않게)</h4>
      <p className="muted">카드를 눌러 집은 뒤 자리를 누르거나, 카드를 자리로 끌어다 놓으세요. 내 1번 자리는 상대 4번 자리와 마주 봅니다. 놓인 카드를 누르면 다시 집어 옮길 수 있습니다.</p>
      <div className="hand">
        {usable.length === 0 && <p className="muted">쓸 수 있는 카드가 없습니다.</p>}
        {usable.map((c) => (
          <button
            key={c.uid}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', String(c.uid))
              setHeld(c.uid)
            }}
            className={`card-chip ${held === c.uid ? 'held' : ''} ${placed.has(c.uid) ? 'used' : ''}`}
            onClick={() => setHeld(held === c.uid ? null : c.uid)}
            title={placed.has(c.uid) ? '이미 자리에 있음 (다른 자리를 누르면 옮김)' : undefined}
          >
            {label(me, c)}
            {placed.has(c.uid) && <small> · {slots.indexOf(c.uid) + 1}번에 놓음</small>}
          </button>
        ))}
      </div>
      <div className="slot-row">
        {slots.map((s, i) => {
          const c = inst(s)
          return (
            <div
              key={i}
              className={`drop-slot ${held !== null ? 'target' : ''} ${c ? 'filled' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => clickSlot(i)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && clickSlot(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const uid = Number(e.dataTransfer.getData('text/plain'))
                if (!Number.isNaN(uid) && usable.some((m) => m.uid === uid)) put(uid, i)
              }}
            >
              <b>{i + 1}번</b>
              <small className="muted">상대 {4 - i >= 1 ? `${4 - i}번과 마주 봄` : '(마주 보는 자리 없음)'}</small>
              <div className="slot-card">{c ? label(me, c) : <span className="muted">(비어 있음)</span>}</div>
              {c && (
                <button
                  className="link"
                  onClick={(e) => {
                    e.stopPropagation()
                    clear(i)
                  }}
                >
                  빼기
                </button>
              )}
            </div>
          )
        })}
      </div>
      <button className="primary" onClick={() => dispatch({ type: 'arrangeBattle', playerId: me.id, slots })}>
        확정 ({placed.size}장 배치)
      </button>
    </>
  )
}

function Board4({ game, pid }: { game: GameState; pid: number }) {
  const b = game.battle!
  const p = game.players[pid]
  const slots = b.slots[pid] ?? []
  return (
    <div className="slots">
      {[0, 1, 2, 3].map((i) => {
        const uid = slots[i]
        const c = uid == null ? null : p.military.find((m) => m.uid === uid)
        return (
          <div key={i} className="slot">
            <b>
              {civById(p.civId).name} {i + 1}번
            </b>
            <div>{c ? label(p, c) : '(빈칸)'}</div>
          </div>
        )
      })}
    </div>
  )
}

function Choose({ game, me, enemy, dispatch }: { game: GameState; me: Player; enemy: Player; dispatch: PanelProps['dispatch'] }) {
  const b = game.battle!
  const head = b.chooseQueue[0]
  const [picks, setPicks] = useState<Record<number, number | null>>({})
  const enemyBoard = (b.slots[enemy.id] ?? []).map((u, i) => ({ u, i })).filter((x): x is { u: number; i: number } => x.u !== null)
  const hasAT = enemyBoard.some((x) => cardStats(enemy.military.find((m) => m.uid === x.u)!).baseId === 'anti_tank_gun')
  return (
    <>
      <p>카드가 공개되었습니다. 대상을 고르는 카드는 우선도가 높은 쪽부터 대상을 고릅니다 (코사크는 모두 고른 뒤에).</p>
      <Board4 game={game} pid={b.decl.attackerId} />
      <Board4 game={game} pid={b.decl.defenderId} />
      <h4>{civById(me.civId).name}: 공격 대상 고르기</h4>
      {head.uids.map((uid) => {
        const mine = me.military.find((m) => m.uid === uid)!
        const must = cardStats(mine).baseId === 'tank' && hasAT
        return (
          <label key={uid} className="row">
            <span>{label(me, mine)} →</span>
            <select
              value={picks[uid] === undefined ? '' : picks[uid] === null ? 'empty' : picks[uid]!}
              onChange={(e) => {
                const v = e.target.value
                const next = { ...picks }
                if (v === '') delete next[uid]
                else next[uid] = v === 'empty' ? null : Number(v)
                setPicks(next)
              }}
            >
              <option value="">(선택)</option>
              <option value="empty">
                빈칸 (일부러 아무도 공격하지 않음 — 대미지도 반격도 없음)
              </option>
              {enemyBoard.map(({ u, i }) => {
                const c = enemy.military.find((m) => m.uid === u)!
                return (
                  <option key={u} value={u} disabled={must && cardStats(c).baseId !== 'anti_tank_gun'}>
                    상대 {i + 1}번 {label(enemy, c)}
                  </option>
                )
              })}
            </select>
            {must && <small className="muted">탱크가 카드를 고른다면 대전차포를 골라야 합니다 (빈칸은 가능)</small>}
          </label>
        )
      })}
      <button className="primary" disabled={head.uids.some((u) => picks[u] === undefined)} onClick={() => dispatch({ type: 'chooseTargets', playerId: me.id, picks })}>
        확정
      </button>
    </>
  )
}
