import { useEffect, useState } from 'react'
import type { GameState } from '../engine'
import { WONDER_CARDS, civById, techById } from '../engine'
import { josa } from './format'

/** 시점 화면 알림에 쓰는 지금 차례 문명의 진행 상태 */
export interface Snap {
  id: number
  turn: string
  phase: GameState['phase']
  techs: string[]
  produced: number
  invested: number
}

/** 생산·투자 한 줄: 도시 N에서 망치 n으로 무엇을 */
export interface ProduceLine {
  cityId: number
  hammers: number
  what: string
}

export type ToastMsg = { kind: 'research'; text: string } | { kind: 'undo' } | { kind: 'produce'; lines: ProduceLine[] }

/** 알리지 않고 모아 두기만 하는 생산 단계 중간 상태 (생산 단계를 마칠 때 한 번에 알린다) */
export type Change = ToastMsg | { kind: 'collect'; lines: ProduceLine[] }

const PHASE_ORDER: GameState['phase'][] = ['setup', 'place', 'research', 'produce', 'declare']

/** 지금 차례 문명이 결정을 기다리는 동안 정보 상자 자리에 계속 나오는 문구 (선전포고·식량 정산은 문구 없음) */
const WAITING: Partial<Record<GameState['phase'], string>> = { setup: '도시 세우는 중', place: '일꾼 배치 중', research: '기술 선택 중', produce: '생산 중' }

export function waitingText(phase: GameState['phase']): string | undefined {
  return WAITING[phase]
}

export function snap(game: GameState, id: number): Snap {
  const p = game.players[id]
  return {
    id,
    turn: `${game.round}:${game.turnIdx}`,
    phase: game.phase,
    techs: p.techs,
    produced: p.turn?.produced.length ?? 0,
    invested: game.investments.filter((i) => i.playerId === id).length,
  }
}

/**
 * 두 상태를 비교해 알릴 것을 고른다. 결정을 마쳤을 때만 알리고, 고르는 중간 과정은 알리지 않는다.
 * - 기술이 늘면 연구 ("철제기술을 선택!").
 * - 생산·투자는 하나씩 모아 두기만 하고(collect), 생산 단계를 마치고 넘어갈 때 모은 줄을 한 번에 알린다 (하나도 없으면 "생산 없음").
 *   생산 단계 안에서 하나를 되돌리면 모은 줄에서 빼기만 한다.
 * - 단계가 앞으로 돌아가거나 연구가 취소되면 "취소!".
 * 일꾼 배치(영토 그림이 바뀜)·선전포고·식량 정산은 알리지 않는다.
 */
export function actorChange(prev: Snap, game: GameState, lines: ProduceLine[]): Change | null {
  const now = snap(game, prev.id)
  const leftProduce = prev.phase === 'produce' && (now.turn !== prev.turn || now.phase !== 'produce')
  if (now.turn !== prev.turn || game.phase === 'over' || game.phase === 'battle') return leftProduce ? { kind: 'produce', lines } : null
  if (PHASE_ORDER.indexOf(now.phase) < PHASE_ORDER.indexOf(prev.phase) || now.techs.length < prev.techs.length) return { kind: 'undo' }
  const p = game.players[prev.id]
  const name = civById(p.civId).name
  const fresh = now.techs.filter((t) => !prev.techs.includes(t))
  if (fresh.length) {
    const tech = techById(fresh[0]).name
    return { kind: 'research', text: `${josa(tech, '을', '를')} 선택!` }
  }
  // 생산 단계 안에서 하나 되돌림: 모은 줄에서 그만큼 뺀다 (생산·투자 순서대로 쌓이므로 끝에서)
  let kept = lines
  const dropped = Math.max(0, prev.produced - now.produced) + Math.max(0, prev.invested - now.invested)
  if (dropped) kept = lines.slice(0, Math.max(0, lines.length - dropped))
  const added: ProduceLine[] = []
  if (now.produced > prev.produced) {
    // 생산 기록: "[R3] 브라질 전사 생산 (망치 3)" — 이번에 늘어난 만큼 끝에서부터, 도시는 생산한 순서
    const made = game.log.filter((l) => l.startsWith(`[R${game.round}] ${name} `) && / 생산 \(망치 \d+\)$/.test(l)).slice(-(now.produced - prev.produced))
    const cities = p.turn!.produced.slice(prev.produced)
    made.forEach((l, i) => {
      const m = / (.+) 생산 \(망치 (\d+)\)$/.exec(l.slice(`[R${game.round}] ${name}`.length))
      if (m) added.push({ cityId: cities[i], hammers: Number(m[2]), what: `${m[1]} 생산` })
    })
  }
  if (now.invested > prev.invested) {
    for (const inv of game.investments.filter((i) => i.playerId === prev.id).slice(prev.invested)) {
      added.push({ cityId: inv.cityId, hammers: inv.hammers, what: `${WONDER_CARDS.find((w) => w.id === inv.wonderId)?.name ?? inv.wonderId}에 투자` })
    }
  }
  const all = [...kept, ...added]
  if (leftProduce) return { kind: 'produce', lines: all }
  return dropped || added.length ? { kind: 'collect', lines: all } : null
}

/**
 * 지금 차례인 문명의 시점을 볼 때 그 문명이 확정한 행동을 잠깐 알린다 (몇 초 뒤 null로 돌아간다).
 * 연구: "철제기술을 선택!", 생산: "도시 1에서 망치 3으로 전사 생산, 도시 2에서 …", 되돌리기: "취소!".
 */
export function useActorNotice(game: GameState, id: number, actor: number): [{ m: ToastMsg; n: number } | null, () => void] {
  // 상태가 바뀔 때마다 그리는 중에 바로 비교한다 (효과에서 하면 "생산 중"이 "선택!"보다 먼저 한 번 깜박인다)
  const [st, setSt] = useState<{ game: GameState; id: number; actor: number; prev: Snap | null; lines: ProduceLine[]; msg: { m: ToastMsg; n: number } | null }>(() => ({
    game,
    id,
    actor,
    prev: id === actor ? snap(game, id) : null,
    lines: [],
    msg: null,
  }))
  if (st.game !== game || st.id !== id || st.actor !== actor) {
    // 이 문명의 차례 동안 이 문명을 보고 있을 때만 비교한다 (차례가 막 끝난 순간은 마친 생산 단계를 알리려고 한 번 더 비교)
    const before = st.id === id ? st.prev : null
    const next = { game, id, actor, prev: id === actor ? snap(game, id) : null, lines: [] as ProduceLine[], msg: st.id === id ? st.msg : null }
    const m = before ? actorChange(before, game, st.lines) : null
    if (m?.kind === 'collect') next.lines = before!.turn === next.prev?.turn ? m.lines : []
    else if (m) next.msg = { m, n: (st.msg?.n ?? 0) + 1 }
    else if (before && before.turn === next.prev?.turn) next.lines = st.lines
    setSt(next)
  }
  const msg = st.msg
  // 연구·취소는 잠깐 보이고, 생산 결과는 닫기를 누를 때까지 남는다
  useEffect(() => {
    if (!msg || msg.m.kind === 'produce') return
    const t = setTimeout(() => setSt((x) => (x.msg === msg ? { ...x, msg: null } : x)), 2500)
    return () => clearTimeout(t)
  }, [msg])
  return [msg, () => setSt((x) => ({ ...x, msg: null }))]
}
