import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BattleReportModal } from '../BattleReportModal'
import { createGame } from '../../engine'
import type { BattleReport } from '../../engine'

const game = createGame({ seed: 1, civIds: ['huns', 'zulu', 'korea'] })
const report: BattleReport = {
  seq: 1, round: 1, attackerId: 0, defenderId: 1, kind: 'normal', terrains: ['평지'], coastal: false,
  units: [], hits: [], survivors: { attacker: 0, defender: 0 }, winner: 'defender', outcome: '점령 실패 (장군은 돌아왔다)',
}
const order = (viewerId?: number) => {
  const html = renderToStaticMarkup(<BattleReportModal game={game} report={report} viewerId={viewerId} onClose={() => {}} />)
  return html.indexOf('훈족 (공격)') < html.indexOf('줄루 (수비)') ? '공격 위' : '수비 위'
}

describe('전투 장면 배치', () => {
  it('관전자에게는 공격이 위, 수비가 아래', () => {
    expect(order(2)).toBe('공격 위')
    expect(order(undefined)).toBe('공격 위')
  })
  it('내 전투면 내가 아래', () => {
    expect(order(0)).toBe('수비 위')
    expect(order(1)).toBe('공격 위')
  })
  it('"— 나", "— 상대" 꼬리표는 없다', () => {
    const html = renderToStaticMarkup(<BattleReportModal game={game} report={report} viewerId={0} onClose={() => {}} />)
    expect(html).not.toContain('— 나')
    expect(html).not.toContain('— 상대')
  })
})
