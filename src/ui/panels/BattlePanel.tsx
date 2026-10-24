import { useState } from 'react'
import { actorOf, cardStats, civById, usableInBattle } from '../../engine'
import type { CardInst, GameState, Player } from '../../engine'
import { UnitCard } from '../cards/UnitCard'
import { cardText } from '../format'
import type { PanelProps } from './types'
import { ConfirmButton } from '../ConfirmButton'
import { Help } from '../prefs'
import { DIR_ARROW, plannedAttacks } from '../battleView'
import { DIR_LABEL } from '../format'

const label = (_p: Player, c: CardInst) => cardText(c, false)

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
      <p>
        {kindLabel} · 목표 타일: <b>{tile ? tile.card.terrains.join('·') || '자연경관' : '?'}</b>
        {b.coastal ? ' (해안 타일 전투)' : ''} · 나는 <b>{me.id === b.decl.attackerId ? '공격' : '수비'}</b> 측
      </p>
      <Help>남은 카드가 많은 쪽이 이기고, 같으면 수비 측이 이깁니다. 내 1번은 상대 4번과 마주 봅니다.</Help>
      {b.step === 'arrange' ? <Arrange game={game} me={me} enemy={enemy} dispatch={dispatch} /> : <Choose game={game} me={me} enemy={enemy} dispatch={dispatch} />}
    </div>
  )
}

function Arrange({ game, me, enemy, dispatch }: { game: GameState; me: Player; enemy: Player; dispatch: PanelProps['dispatch'] }) {
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
  const attacks = slots.flatMap((uid, i) => {
    const c = inst(uid)
    return c ? plannedAttacks(c, i + 1).map((a) => ({ ...a, from: i + 1 })) : []
  })
  const canPlace = Math.min(4, usable.length)
  const leftWarn = placed.size < canPlace ? `빈 자리가 있는데 카드 ${usable.length - placed.size}장이 손에 남아 있습니다. 남은 카드가 많은 쪽이 이깁니다.` : null
  const clear = (i: number) => {
    const next = [...slots]
    next[i] = null
    setSlots(next)
  }

  return (
    <>
      <h4>{civById(me.civId).name}: 카드 놓기 (상대에게 보이지 않게)</h4>
      <EnemyIntel game={game} enemy={enemy} />
      <Help>카드를 눌러 집은 뒤 자리를 누르거나, 카드를 자리로 끌어다 놓으세요. 놓인 카드를 누르면 다시 집어 옮길 수 있습니다. 화살표는 그 카드가 공격할 상대 자리입니다.</Help>
      <div className="hand">
        {usable.length === 0 && <p className="muted">쓸 수 있는 카드가 없습니다.</p>}
        {usable.map((c) => (
          <div
            key={c.uid}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', String(c.uid))
              setHeld(c.uid)
            }}
          >
            <UnitCard
              card={c}
              width={120}
              selected={held === c.uid}
              dim={placed.has(c.uid)}
              onClick={() => setHeld(held === c.uid ? null : c.uid)}
              overlay={placed.has(c.uid) ? `${slots.indexOf(c.uid) + 1}번에 놓음` : undefined}
              title={placed.has(c.uid) ? '이미 자리에 있음 (다른 자리를 누르면 옮김)' : cardText(c)}
            />
          </div>
        ))}
      </div>
      <div className="slot-row ghost-row" aria-label="상대 자리 (마주 보는 순서)">
        {[4, 3, 2, 1].map((j) => {
          const incoming = attacks.filter((a) => a.enemySlot === j)
          return (
            <div key={j} className={`ghost-slot${incoming.length ? ' hit' : ''}`}>
              <b>상대 {j}번</b>
              {incoming.length ? (
                <small>
                  ⚔{incoming.reduce((n, a) => n + a.power, 0)} 받음 ({incoming.map((a) => `내 ${a.from}번`).join(', ')})
                </small>
              ) : (
                <small className="muted">공격 안 함</small>
              )}
            </div>
          )
        })}
      </div>
      <svg className="arrows" viewBox="0 0 400 36" preserveAspectRatio="none" aria-hidden="true">
        {attacks
          .filter((a) => a.enemySlot !== null)
          .map((a, k) => {
            const x1 = (a.from - 0.5) * 100
            const x2 = (4 - a.enemySlot! + 0.5) * 100
            return (
              <g key={k}>
                <line x1={x1} y1={36} x2={x2} y2={3} vectorEffect="non-scaling-stroke" />
                <circle cx={x2} cy={3} r={3} />
              </g>
            )
          })}
      </svg>
      <div className="slot-row battle-row">
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
              <small className="muted facing">상대 {4 - i}번과 마주 봄</small>
              <div className="slot-card">{c ? <UnitCard card={c} width={120} zoomable={false} /> : <span className="muted">(비어 있음)</span>}</div>
              {c && (
                <small className="aim">
                  {plannedAttacks(c, i + 1)
                    .map((a) =>
                      a.dir === 'choose'
                        ? `⚔${a.power} 대상은 공개 후 고름`
                        : `${DIR_ARROW[a.dir]} ${DIR_LABEL[a.dir]} ⚔${a.power} → ${a.enemySlot ? `상대 ${a.enemySlot}번` : '빈 공간 (공격 없음)'}`,
                    )
                    .join(' · ') || '공격 없음'}
                </small>
              )}
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
      <ConfirmButton hotkey warn={leftWarn} onClick={() => dispatch({ type: 'arrangeBattle', playerId: me.id, slots })}>
        확정 ({placed.size}장 배치)
      </ConfirmButton>
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
            <div>{c ? <UnitCard card={c} width={120} /> : '(빈칸)'}</div>
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
          <div key={uid} className="row">
            <span>{label(me, mine)} →</span>
            <span className="chips" role="radiogroup">
              <button className={picks[uid] === null ? 'active' : ''} onClick={() => setPicks({ ...picks, [uid]: null })} title="대미지도 반격도 없음">
                빈칸 (공격 안 함)
              </button>
              {enemyBoard.map(({ u, i }) => {
                const c = enemy.military.find((m) => m.uid === u)!
                return (
                  <button
                    key={u}
                    className={picks[uid] === u ? 'active' : ''}
                    disabled={must && cardStats(c).baseId !== 'anti_tank_gun'}
                    onClick={() => setPicks({ ...picks, [uid]: u })}
                  >
                    상대 {i + 1}번 {label(enemy, c)}
                  </button>
                )
              })}
            </span>
            {must && <small className="muted">탱크가 카드를 고른다면 대전차포를 골라야 합니다 (빈칸은 가능)</small>}
          </div>
        )
      })}
      <ConfirmButton hotkey disabled={head.uids.some((u) => picks[u] === undefined)} onClick={() => dispatch({ type: 'chooseTargets', playerId: me.id, picks })}>
        확정
      </ConfirmButton>
    </>
  )
}

/** 상대가 이 전투에 낼 수 있는 카드 (공개 정보: 종류와 장수. 공격 방향은 비공개라 보여 주지 않는다) */
function EnemyIntel({ game, enemy }: { game: GameState; enemy: Player }) {
  const b = game.battle!
  const usable = enemy.military.filter((c) => usableInBattle(game, b, enemy, c))
  const groups = new Map<string, { n: number; hp?: number; def: number }>()
  for (const c of usable) {
    const st = cardStats({ ...c, dirs: undefined })
    const g = groups.get(st.name) ?? { n: 0, hp: st.hp, def: st.def }
    g.n++
    groups.set(st.name, g)
  }
  return (
    <div className="intel">
      <b>
        상대({civById(enemy.civId).name})가 낼 수 있는 카드 {usable.length}장
      </b>
      {usable.length > 4 && <span className="muted"> (최대 4장 배치)</span>}:{' '}
      {[...groups].map(([name, g]) => `${name} ×${g.n} (♥${g.hp ?? '-'} 🛡${g.def})`).join(' · ') || '없음'}
      <small className="muted"> · 방향은 비공개</small>
    </div>
  )
}
