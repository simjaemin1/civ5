import { civById, totalWorkers } from '../../engine'
import type { PanelProps } from './types'

/** 행복 상한을 넘은 일꾼 토큰: 도시를 눌러 한 명씩 버린다 (버려야 하는 수만큼 누른다). */
export function DiscardPanel({ player, dispatch }: PanelProps) {
  const left = player.pendingDiscard ?? 0
  return (
    <div className="panel">
      <h3>일꾼 {left}개를 버려야 합니다 (행복 상한 초과)</h3>
      <p className="muted">
        {civById(player.civId).name}: 일꾼 {totalWorkers(player)}개. 버릴 도시를 눌러 한 명씩 버립니다 ({left}번 더 누르세요). 다 버리면 차례가 끝납니다.
      </p>
      <div className="row">
        {player.cities.map((c) => (
          <button key={c.id} disabled={c.workers <= 0} onClick={() => dispatch({ type: 'discardWorker', cityId: c.id })}>
            <b>도시 {c.id + 1}</b> — 일꾼 {c.workers}명 <small>(누르면 1명 버림)</small>
          </button>
        ))}
      </div>
    </div>
  )
}
