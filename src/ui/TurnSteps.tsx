import type { GameState } from '../engine'

/** 한 문명의 내정 단계 (규칙서 3장). 식량 정산은 선전포고 단계가 끝나면 자동으로 하고 차례가 끝난다. */
const STEPS: { phase: GameState['phase'] | 'end'; label: string; note?: string }[] = [
  { phase: 'setup', label: '도시 세우기' },
  { phase: 'place', label: '①② 일꾼 배치·산출' },
  { phase: 'research', label: '③ 기술 연구' },
  { phase: 'produce', label: '④ 생산' },
  { phase: 'declare', label: '⑤ 선전포고', note: '할 수 있을 때만' },
  { phase: 'end', label: '⑥ 식량 정산 → 차례 끝', note: '되돌릴 수 없음' },
]

interface Props {
  game: GameState
  /** 이번 차례에 한 행동 직전 상태들 (오래된 것부터) */
  turnHistory: GameState[]
  onJump: (index: number) => void
  onUndo: () => void
}

/**
 * 이번 차례의 단계 막대: 지난 단계 · 지금 단계 · 남은 단계.
 * 지난 단계를 누르면 그 단계를 시작할 때로 되돌아간다. 되돌리기는 이번 차례 안에서만 된다.
 */
export function TurnSteps({ game, turnHistory, onJump, onUndo }: Props) {
  const steps = STEPS.filter((s) => s.phase !== 'setup' || game.phase === 'setup' || turnHistory.some((h) => h.phase === 'setup'))
  const cur = steps.findIndex((s) => s.phase === game.phase)
  return (
    <nav className="turn-steps" aria-label="이번 차례 단계">
      <ol>
        {steps.map((s, i) => {
          const state = i < cur ? 'done' : i === cur ? 'now' : 'next'
          const start = state === 'done' ? turnHistory.findIndex((h) => h.phase === s.phase) : -1
          return (
            <li key={s.phase} className={state} aria-current={state === 'now' ? 'step' : undefined}>
              {start >= 0 ? (
                <button className="step-btn" onClick={() => onJump(start)} title={`${s.label} 단계를 시작할 때로 되돌립니다`}>
                  ✓ {s.label} <span className="back">↶</span>
                </button>
              ) : (
                <span className="step-btn">
                  {state === 'done' ? '✓ ' : state === 'now' ? '▶ ' : ''}
                  {s.label}
                  {s.note && state !== 'done' && <small> ({s.note})</small>}
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <button className="undo" disabled={turnHistory.length === 0} onClick={onUndo} title="이번 차례에 한 마지막 행동을 되돌립니다">
        ↶ 한 단계 되돌리기{turnHistory.length > 0 ? ` (${turnHistory.length})` : ''}
      </button>
    </nav>
  )
}
