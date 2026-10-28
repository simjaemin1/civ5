import { useEffect, useRef, useState } from 'react'
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

const PHASE_ORDER: GameState['phase'][] = ['setup', 'place', 'research', 'produce', 'declare']

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
 * 같은 차례 안에서 두 상태를 비교해 알릴 것을 고른다.
 * 무엇이든 줄었거나 단계가 앞으로 돌아갔으면 되돌리기("취소!"), 기술이 늘었으면 연구, 생산·투자가 늘었으면 그 줄.
 * 일꾼 배치(영토 그림이 바뀜)·선전포고·식량 정산은 알리지 않는다.
 */
export function actorChange(prev: Snap, game: GameState, lines: ProduceLine[]): ToastMsg | null {
  const now = snap(game, prev.id)
  if (now.turn !== prev.turn || game.phase === 'over' || game.phase === 'battle') return null
  const back =
    PHASE_ORDER.indexOf(now.phase) < PHASE_ORDER.indexOf(prev.phase) ||
    now.techs.length < prev.techs.length ||
    now.produced < prev.produced ||
    now.invested < prev.invested
  if (back) return { kind: 'undo' }
  const p = game.players[prev.id]
  const name = civById(p.civId).name
  const fresh = now.techs.filter((t) => !prev.techs.includes(t))
  if (fresh.length) {
    const tech = techById(fresh[0]).name
    return { kind: 'research', text: `${josa(name, '은', '는')} ${josa(tech, '을', '를')} 연구했다` }
  }
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
  return added.length ? { kind: 'produce', lines: [...lines, ...added] } : null
}


/**
 * 지금 차례인 문명의 시점을 볼 때 그 문명이 확정한 행동을 잠깐 알린다 (몇 초 뒤 null로 돌아간다).
 * 연구: "브라질은 철제기술을 연구했다", 생산: "도시 1에서 망치 3으로 전사 생산, 도시 2에서 …", 되돌리기: "취소!".
 */
export function useActorNotice(game: GameState, id: number, actor: number): { m: ToastMsg; n: number } | null {
  const prev = useRef<Snap | null>(null)
  const lines = useRef<ProduceLine[]>([])
  const [msg, setMsg] = useState<{ m: ToastMsg; n: number } | null>(null)
  useEffect(() => {
    const before = prev.current
    prev.current = id === actor ? snap(game, id) : null
    if (!before || before.id !== id || id !== actor) {
      lines.current = []
      if (!before || before.id !== id) setMsg(null)
      return
    }
    if (before.turn !== prev.current!.turn) lines.current = []
    const m = actorChange(before, game, lines.current)
    if (!m) return
    lines.current = m.kind === 'produce' ? m.lines : m.kind === 'undo' ? [] : lines.current
    setMsg((x) => ({ m, n: (x?.n ?? 0) + 1 }))
  }, [game, id, actor])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), msg.m.kind === 'produce' ? 5000 : 3000)
    return () => clearTimeout(t)
  }, [msg])
  return msg
}

