import { useState } from 'react'
import { actorOf, cardById, civById, usableInBattle } from '../../engine'
import type { CardInst, GameState, Player } from '../../engine'
import { cardLine } from '../format'
import type { PanelProps } from './types'

const label = (p: Player, c: CardInst) => cardLine(cardById(c.defId), c.dir, c.unique) + (p.civId ? '' : '')

/** 전투: 비공개로 카드를 1~4번 자리에 놓고, 공개 후 대상을 고르는 카드는 대상을 고른다. */
export function BattlePanel({ game, player, dispatch }: PanelProps) {
  const b = game.battle!
  const me = game.players[actorOf(game)]
  void player
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
  const taken = new Set(slots.filter((x): x is number => x !== null))
  return (
    <>
      <h4>{civById(me.civId).name}: 카드 놓기 (상대에게 보이지 않게)</h4>
      {usable.length === 0 && <p className="muted">쓸 수 있는 카드가 없습니다.</p>}
      <div className="slots">
        {slots.map((s, i) => (
          <label key={i} className="slot">
            <b>{i + 1}번</b>
            <select
              value={s ?? ''}
              onChange={(e) => {
                const next = [...slots]
                next[i] = e.target.value === '' ? null : Number(e.target.value)
                setSlots(next)
              }}
            >
              <option value="">(비움)</option>
              {usable
                .filter((c) => c.uid === s || !taken.has(c.uid))
                .map((c) => (
                  <option key={c.uid} value={c.uid}>
                    {label(me, c)}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>
      <button className="primary" onClick={() => dispatch({ type: 'arrangeBattle', playerId: me.id, slots })}>
        확정
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
  const [picks, setPicks] = useState<Record<number, number>>({})
  const enemyBoard = (b.slots[enemy.id] ?? []).map((u, i) => ({ u, i })).filter((x): x is { u: number; i: number } => x.u !== null)
  const hasAT = enemyBoard.some((x) => enemy.military.find((m) => m.uid === x.u)?.defId === 'anti_tank_gun')
  return (
    <>
      <p>카드가 공개되었습니다. 대상을 고르는 카드는 우선도가 높은 쪽부터 대상을 고릅니다 (코사크는 모두 고른 뒤에).</p>
      <Board4 game={game} pid={b.decl.attackerId} />
      <Board4 game={game} pid={b.decl.defenderId} />
      <h4>{civById(me.civId).name}: 공격 대상 고르기</h4>
      {head.uids.map((uid) => {
        const mine = me.military.find((m) => m.uid === uid)!
        const must = mine.defId === 'tank' && hasAT
        return (
          <label key={uid} className="row">
            <span>{label(me, mine)} →</span>
            <select value={picks[uid] ?? ''} onChange={(e) => setPicks({ ...picks, [uid]: Number(e.target.value) })}>
              <option value="">(선택)</option>
              {enemyBoard.map(({ u, i }) => {
                const c = enemy.military.find((m) => m.uid === u)!
                return (
                  <option key={u} value={u} disabled={must && c.defId !== 'anti_tank_gun'}>
                    상대 {i + 1}번 {label(enemy, c)}
                  </option>
                )
              })}
            </select>
            {must && <small className="muted">탱크는 대전차포를 골라야 합니다</small>}
          </label>
        )
      })}
      <button className="primary" disabled={head.uids.some((u) => picks[u] === undefined)} onClick={() => dispatch({ type: 'chooseTargets', playerId: me.id, picks })}>
        확정
      </button>
    </>
  )
}
