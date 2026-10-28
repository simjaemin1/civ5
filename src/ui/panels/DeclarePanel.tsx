import { useEffect, useRef, useState } from 'react'
import type { DeclTarget, GameState, Player, TileCard } from '../../engine'
import { RESOURCES, WONDERS, cardStats, cityAttackLeaders, civById, declarationTargets, findTile, freeWorkers } from '../../engine'
import { Board } from '../Board'
import { josa } from '../format'
import { TileView } from '../TileView'
import { battleCards, coastalBonus, sidesHeld } from '../gameInfo'
import { Help } from '../prefs'
import type { PanelProps } from './types'

/** 지형 + 자원·자연경관·사적지 (같은 지형 타일을 구분할 수 있게) */
function tileName(card: TileCard): string {
  const extra = [card.resource ? RESOURCES[card.resource]?.name : '', card.wonder ? WONDERS[card.wonder]?.name : '', card.historic ? '사적지' : ''].filter(Boolean)
  return [card.terrains.join('·'), ...extra].filter(Boolean).join(' · ') || '?'
}

const KIND = { normal: '일반 선전포고', retake: '탈환 선전포고', city: '도시 공격' } as const
const COST = { normal: '장군 1 + 일꾼 1', retake: '일꾼 1 (장군 필요 없음)', city: '장군 1 + 일꾼 1' } as const

/** 목표 지형·주인에 따라 달라지는 고유 유닛 효과 (war.ts resolveBattle과 같은 조건) */
function terrainNotes(game: GameState, t: DeclTarget, attacker: Player): string[] {
  const owner = t.kind === 'retake' ? attacker.id : t.defenderId
  const terrains = findTile(game.players[owner], t.cityId, t.tileId)?.tile.card.terrains ?? []
  const on = (list: string[]) => terrains.some((x) => list.includes(x))
  const notes: string[] = []
  for (const p of [attacker, game.players[t.defenderId]]) {
    const name = civById(p.civId).name
    const effects = new Set(p.military.map((c) => cardStats(c).effect).filter(Boolean))
    if (effects.has('ski') && on(['툰드라', '설원', '언덕'])) notes.push(`${name} 스키 보병: 이 지형에서 체력·전투력 +2`)
    if (effects.has('mohawk') && on(['숲', '정글'])) notes.push(`${name} 모호크족 전사: 이 지형에서 방어력 +2`)
    if (effects.has('hwacha') && p.id === owner) notes.push(`${name} 화차: 원래 내 타일이라 체력 +2`)
    if (effects.has('carolean') && p.id !== owner) notes.push(`${name} 캐롤리언: 상대 원래 타일이라 체력 +1`)
  }
  return notes
}

export function DeclarePanel({ game, player, dispatch }: PanelProps) {
  const targets = declarationTargets(game, player)
  const freeGenerals = player.generals - player.generalWorkers
  const retakes = targets.filter((t) => t.kind === 'retake')
  const opponents = game.order.filter((id) => id !== player.id && !game.players[id].eliminated)
  type Group = 'retake' | number
  const groups: Group[] = [...(retakes.length ? (['retake'] as const) : []), ...opponents.filter((id) => targets.some((t) => t.kind !== 'retake' && t.defenderId === id))]
  const [group, setGroup] = useState<Group>(groups[0] ?? 'retake')
  const [sel, setSel] = useState<DeclTarget | null>(null)

  const inGroup = (t: DeclTarget) => (group === 'retake' ? t.kind === 'retake' : t.kind !== 'retake' && t.defenderId === group)
  const boardOwner = group === 'retake' ? player : game.players[group]
  const findTarget = (cityId: number, tileId: number) => targets.find((t) => inGroup(t) && t.cityId === cityId && t.tileId === tileId)

  return (
    <div className="panel declare">
      <h3>④ 선전포고 (한 차례에 1번)</h3>
      <p className="summary">
        <span>
          장군 <b>{freeGenerals}</b>
          {player.generalWorkers > 0 && <small className="muted"> (타일에 올린 {player.generalWorkers}개 제외)</small>}
        </span>
        <span>
          남은 일꾼 <b>{freeWorkers(player)}</b>
        </span>
        <span className="muted">선전포고하거나 넘기면 바로 식량 정산을 하고 차례가 끝납니다.</span>
      </p>
      <Help>
        목표 타일을 누르면 전투 전망을 보여 주고, 확정을 눌러야 선전포고합니다. 전투는 모든 문명의 내정이 끝난 뒤 정산 때 합니다. 걸었던 장군과 일꾼은 전투 결과와 상관없이 돌아옵니다.
      </Help>

      <div className="tabs" role="tablist">
        {groups.map((g) => (
          <button
            key={String(g)}
            role="tab"
            aria-selected={group === g}
            className={group === g ? 'active' : ''}
            onClick={() => {
              setGroup(g)
              setSel(null)
            }}
          >
            {g === 'retake' ? `내 타일 탈환 (${retakes.length})` : `${civById(game.players[g].civId).name} (${targets.filter((t) => t.kind !== 'retake' && t.defenderId === g).length})`}
          </button>
        ))}
      </div>
      {freeGenerals < 1 && opponents.length > 0 && (
        <p className="muted">
          {player.generalWorkers > 0 ? '장군을 모두 타일에 올려서' : '장군이 없어'} 상대 타일에는 선전포고할 수 없습니다. 점령당한 내 타일 탈환만 할 수 있습니다.
        </p>
      )}

      <div className="declare-body">
        <div className="declare-board">
          <Board
            game={game}
            player={boardOwner}
            selectable={(cityId, tileId) => !!findTarget(cityId, tileId)}
            selectedTile={sel && inGroup(sel) ? sel : null}
            onTileClick={(cityId, tileId) => setSel(findTarget(cityId, tileId) ?? null)}
            cityNote={
              group === 'retake'
                ? undefined
                : (city) => {
                    const s = sidesHeld(city, player.id)
                    const blocked = city.id === 0 && boardOwner.cities.length > 1
                    const full = s.total > 0 && s.any === s.total
                    const leaders = cityAttackLeaders(city)
                    const ready = full && leaders.includes(player.id) && !blocked
                    return (
                      <span className={ready ? 'ok' : 'muted'}>
                        · 주변 점령 {s.any}/{s.total} (내 장군 {s.held}){s.open > 0 ? ` (빈 면 ${s.open})` : ''}
                        {blocked
                          ? ' · 두 번째 도시를 먼저 파괴해야 공격 가능'
                          : ready
                            ? ' · 도시 공격 가능'
                            : full
                              ? ` · 모든 칸이 점령됐지만 장군이 가장 많은 문명(${leaders.map((id) => civById(game.players[id].civId).name).join('·')})만 도시 공격 가능`
                              : ''}
                      </span>
                    )
                  }
            }
          />
          <small className="muted">밝은 테두리 타일만 고를 수 있습니다. 이미 점령된 타일은 고를 수 없고, 도시 타일은 둘러싼 칸이 모두 점령되고 그 칸에 내 장군이 가장 많을 때(공동 포함)만 고를 수 있습니다.</small>
        </div>
        {sel && inGroup(sel) && <TargetCard game={game} me={player} t={sel} onCancel={() => setSel(null)} onDeclare={() => dispatch({ type: 'declareWar', defenderId: sel.defenderId, cityId: sel.cityId, tileId: sel.tileId })} />}
      </div>

      <button className={sel ? '' : 'primary'} data-hotkey={sel ? undefined : ''} onClick={() => dispatch({ type: 'endTurn' })}>
        선전포고하지 않고 차례 끝내기 (식량 정산)
      </button>
    </div>
  )
}

/** 고른 목표의 전투 전망과 확정 버튼 */
function TargetCard({ game, me, t, onCancel, onDeclare }: { game: GameState; me: Player; t: DeclTarget; onCancel: () => void; onDeclare: () => void }) {
  const ref = useRef<HTMLElement>(null)
  // 좁은 화면에서는 보드 아래에 붙으므로 고르면 보이게 스크롤한다
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [t.cityId, t.tileId, t.defenderId])
  const def = game.players[t.defenderId]
  const owner = t.kind === 'retake' ? me : def
  const found = findTile(owner, t.cityId, t.tileId)
  if (!found) return null
  const { city, tile } = found
  const coastal = tile.card.terrains.includes('해안')
  const mine = battleCards(me, coastal)
  const theirs = battleCards(def, coastal)
  const defName = civById(def.civId).name
  const stillToPlay = game.order.indexOf(def.id) > game.turnIdx
  const siege = me.military.filter((c) => cardStats(c).siege).length
  const others = game.declarations.filter((d) => d.defenderId === def.id)
  const side = t.kind === 'normal' && tile.role === 'side' ? sidesHeld(city, me.id) : null
  const notes = terrainNotes(game, t, me)
  const lines: React.ReactNode[] = [
    <span key="kind">
      <b>{KIND[t.kind]}</b> · 비용 {COST[t.kind]}
    </span>,
    <span key="cards">
      전투 카드: 나 <b>{mine}장</b> vs {defName} <b>{theirs}장</b> (최대 4장씩 배치, 남은 카드가 많은 쪽 승리, <b>동점이면 수비({defName}) 승</b>)
    </span>,
    mine === 0 ? (
      <span key="none" className="warn">내 전투 카드가 없어 이 전투는 반드시 집니다 (남은 카드 0장, 동점이면 수비 승).</span>
    ) : mine < theirs ? (
      <span key="none" className="warn">카드 수가 상대보다 적습니다. 상대 카드를 파괴해야 이깁니다.</span>
    ) : null,
    stillToPlay ? (
      <span key="prep" className="warn">{josa(defName, '은', '는')} 이번 라운드에 아직 차례가 남아 있어 군사 카드를 더 만들 수 있습니다.</span>
    ) : (
      <span key="prep" className="ok">{josa(defName, '은', '는')} 이번 라운드 차례를 이미 마쳐 더 대비할 수 없습니다.</span>
    ),
  ]
  if (coastal) {
    const b1 = coastalBonus(me)
    const b2 = coastalBonus(def)
    lines.push(<>해안 타일 전투: 전함·제고이센을 낼 수 있습니다.{b1 || b2 ? ` 공격 전투력 보너스 나 +${b1}, ${defName} +${b2} (영국·알렉산드리아 등대)` : ''}</>)
  }
  for (const n of notes) lines.push(<>{n}</>)
  if (t.kind === 'normal') lines.push(<>이기면 장군이 이 타일을 점령해 {josa(defName, '은', '는')} 일꾼을 올릴 수 없습니다. 지면 장군과 일꾼이 그대로 돌아옵니다.</>)
  if (side) {
    // 이기면 내 장군이 하나 늘어난다: 그때 모든 칸이 차고 내가 가장 많으면(공동 포함) 도시 공격 가능
    const after = city.tiles.map((x) => (x.card.id === tile.card.id ? { ...x, occupiedBy: me.id } : x))
    const ready = side.any + 1 === side.total && cityAttackLeaders({ ...city, tiles: after }).includes(me.id)
    lines.push(
      <>
        이 도시 주변 점령 {side.any}/{side.total} (내 장군 {side.held}) → 이기면 {side.any + 1}/{side.total} (내 장군 {side.held + 1})
        {ready ? ' (다음 차례부터 도시 공격 가능)' : ''}
      </>,
    )
  }
  if (t.kind === 'retake') lines.push(<>이기면 {defName}의 장군을 돌려보내고 타일을 되찾습니다.</>)
  if (t.kind === 'city')
    lines.push(
      siege > 0 ? (
        <>공성 카드(대포·야포·공성추)가 살아남은 채 이기면 이 도시를 파괴합니다. 내 공성 카드 {siege}장.</>
      ) : (
        <span className="warn">공성 카드가 없어 이겨도 도시를 파괴할 수 없습니다.</span>
      ),
    )
  const sameTile = game.declarations.filter((d) => d.defenderId === t.defenderId && d.cityId === t.cityId && d.tileId === t.tileId)
  if (sameTile.length)
    lines.push(
      <span key="dup" className="warn">
        이 타일에는 이미 {sameTile.map((d) => civById(game.players[d.attackerId].civId).name).join('·')}의 선전포고가 걸려 있습니다. 중복으로 걸 수 있지만, 정산 때 앞선 문명이 이 타일을 차지하면 이 선전포고는 전투 없이 끝납니다 (일꾼 행동만 쓴 셈이고 장군은 돌아옵니다).
      </span>,
    )
  if (others.length) lines.push(<>이번 라운드에 {defName}에게 걸린 다른 선전포고 {others.length}개 (전투는 선전포고 순서대로 하고, 대미지는 전투마다 사라집니다).</>)
  return (
    <aside ref={ref} className="target-card" aria-label="선전포고 목표">
      <div className="target-head">
        <div style={{ width: 120 }}>
          <TileView card={tile.card} player={owner} badge={{ city: tile.role === 'city' }} />
        </div>
        <div>
          <h4>
            {t.kind === 'retake' ? '내' : defName} 도시{t.cityId + 1} · {tileName(tile.card)}
            {tile.role === 'city' ? ' (도시 타일)' : ''}
            {t.kind === 'retake' && <small className="muted"> — {josa(defName, '이', '가')} 점령 중</small>}
          </h4>
          <ul className="plain">
            {lines.filter(Boolean).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="row">
        <button className="primary" data-hotkey="" onClick={onDeclare}>
          ⚔ 이 타일에 선전포고
        </button>
        <button onClick={onCancel}>다시 고르기</button>
      </div>
    </aside>
  )
}
