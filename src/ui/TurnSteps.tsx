import type { GameState } from '../engine'

/** 한 문명의 내정 단계 (규칙서 3장). 식량 정산은 선전포고 단계가 끝나면 자동으로 하고 차례가 끝난다. */
const STEPS: { phase: GameState['phase'] | 'end'; label: string; note?: string }[] = [
  { phase: 'setup', label: '도시 세우기' },
  { phase: 'place', label: '① 일꾼 배치' },
  { phase: 'research', label: '② 기술 연구' },
  { phase: 'produce', label: '③ 생산' },
  { phase: 'declare', label: '④ 선전포고', note: '할 수 있을 때만' },
  { phase: 'end', label: '⑤ 식량 정산 → 차례 끝', note: '되돌릴 수 없음' },
]

interface Props {
  game: GameState
  /** 이번 차례에 되돌릴 수 있는 행동들의 직전 단계 (오래된 것부터). 핫시트는 기록에서, 온라인은 서버가 준다 */
  phases: GameState['phase'][]
  /** 이번 차례에 무작위 결과를 보여 준 행동이 있어 그 전으로는 되돌릴 수 없는지 */
  locked?: boolean
  onJump: (index: number) => void
  onUndo: () => void
}

/**
 * 이번 차례의 단계 막대: 지난 단계 · 지금 단계 · 남은 단계.
 * 지난 단계를 누르면 그 단계를 시작할 때로 되돌아간다. 되돌리기는 이번 차례 안에서만 되고,
 * 무작위 결과나 덱의 카드를 보여 준 행동(생산·승급·정찰·타일 뽑기) 뒤로는 되돌릴 수 없다 (gameInfo.revealsInfo).
 */
export function TurnSteps({ game, phases, locked, onJump, onUndo }: Props) {
  const steps = STEPS.filter((s) => s.phase !== 'setup' || game.phase === 'setup' || phases.includes('setup'))
  const cur = steps.findIndex((s) => s.phase === game.phase)
  return (
    <nav className="turn-steps" aria-label="이번 차례 단계">
      <ol>
        {steps.map((s, i) => {
          const state = i < cur ? 'done' : i === cur ? 'now' : 'next'
          const start = state === 'done' ? phases.indexOf(s.phase as GameState['phase']) : -1
          return (
            <li key={s.phase} className={state} aria-current={state === 'now' ? 'step' : undefined}>
              {start >= 0 ? (
                <button className="step-btn" onClick={() => onJump(start)} title={`${s.label} 단계를 시작할 때로 되돌립니다`}>
                  ✓ {s.label} <span className="back">↶</span>
                </button>
              ) : (
                <span className="step-btn" title={state === 'done' && locked ? '무작위 결과(카드 방향·뽑은 타일)를 본 뒤라 이 단계로 되돌릴 수 없습니다' : undefined}>
                  {state === 'done' ? '✓ ' : state === 'now' ? '▶ ' : ''}
                  {s.label}
                  {state === 'done' && locked ? ' 🔒' : ''}
                  {s.note && state !== 'done' && <small> ({s.note})</small>}
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <span className="row undo-box">
        {locked && (
          <small className="muted" title="생산·승급(카드 방향), 정찰, 문화 타일 뽑기처럼 무작위 결과나 덱의 카드를 보여 준 행동 뒤로는 되돌릴 수 없습니다">
            🔒 무작위 결과를 본 뒤라 그 전으로는 되돌릴 수 없음
          </small>
        )}
        <button className="undo" disabled={phases.length === 0} onClick={onUndo} title="이번 차례에 한 마지막 행동을 되돌립니다">
          ↶ 한 단계 되돌리기{phases.length > 0 ? ` (${phases.length})` : ''}
        </button>
      </span>
    </nav>
  )
}
