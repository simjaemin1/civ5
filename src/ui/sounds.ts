import { useEffect, useRef } from 'react'
import type { GameState } from '../engine'
import { TECHS } from '../engine'
import warUrl from '../assets/sounds/declare_war.mp3'
import bordersUrl from '../assets/sounds/borders_expand.mp3'
import eraUrl from '../assets/sounds/new_era.mp3'
import policyUrl from '../assets/sounds/new_policy.mp3'
import techUrl from '../assets/sounds/new_tech.mp3'
import { usePrefs } from './prefsStore'

/** 효과음: 선전포고 / 문화로 새 타일 / 새 시대 / 새 정책 / 새 기술 */
export type Sound = 'war' | 'borders' | 'era' | 'policy' | 'tech'

const URLS: Record<Sound, string> = { war: warUrl, borders: bordersUrl, era: eraUrl, policy: policyUrl, tech: techUrl }
/** 같은 소리가 겹쳐 따닥거리지 않도록 최소 간격 (ms) */
const MIN_GAP = 400
const last: Partial<Record<Sound, number>> = {}

export function playSound(kind: Sound, enabled = true): void {
  if (!enabled || typeof Audio === 'undefined') return
  const now = Date.now()
  if (now - (last[kind] ?? 0) < MIN_GAP) return
  last[kind] = now
  try {
    const a = new Audio(URLS[kind])
    a.volume = 0.6
    void a.play().catch(() => undefined) // 브라우저가 자동 재생을 막으면(첫 클릭 전) 조용히 넘어간다
  } catch {
    /* 오디오를 쓸 수 없는 환경이면 무시 */
  }
}

/** 기술의 시대: 고대(1~3열) → 중세(4~5열) → 산업(6~8열) → 현대(9~10열) */
export const eraOfColumn = (column: number): number => (column <= 3 ? 0 : column <= 5 ? 1 : column <= 8 ? 2 : 3)
const eraOfTech = (id: string): number => eraOfColumn(TECHS.find((t) => t.id === id)?.column ?? 1)

/** 이전 상태와 새 상태를 비교해 낼 소리를 정한다 (순수 함수) */
export function soundsFor(prev: GameState, next: GameState): Sound[] {
  // 되돌리기·불러오기로 로그가 줄었으면 소리를 내지 않는다
  if (next.logSeq <= prev.logSeq) return []
  const out = new Set<Sound>()
  const added = Math.min(next.logSeq - prev.logSeq, next.log.length)
  for (const line of next.log.slice(-added)) {
    if (line.includes('선전포고')) out.add('war')
    else if (/ 문화 \+\d+$/.test(line)) out.add('borders')
    else if (line.includes(' 정책: ')) out.add('policy')
  }
  // 새 기술: 그 문명이 처음 도달한 시대의 기술이면 새 시대 소리, 아니면 기술 소리
  next.players.forEach((p, i) => {
    const before = prev.players[i]?.techs ?? []
    if (p.techs.length <= before.length) return
    const era = Math.max(-1, ...before.map(eraOfTech))
    out.add(p.techs.slice(before.length).some((id) => eraOfTech(id) > era) ? 'era' : 'tech')
  })
  return [...out]
}

/** 게임 상태가 바뀔 때마다 효과음을 낸다. 설정에서 끌 수 있다. */
export function useGameSounds(game: GameState | null): void {
  const { prefs } = usePrefs()
  const prev = useRef<GameState | null>(null)
  useEffect(() => {
    if (game && prev.current && prev.current !== game) {
      for (const s of soundsFor(prev.current, game)) playSound(s, prefs.sound)
    }
    prev.current = game
  }, [game, prefs.sound])
}
