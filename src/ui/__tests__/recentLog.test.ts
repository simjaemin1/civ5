import { describe, expect, it } from 'vitest'
import { markRounds, recentSummary } from '../recentLog'

describe('오른쪽 최근 기록 요약', () => {
  it('생산·투자는 그대로, 인구·행복·문화는 바뀐 것만 앞→뒤로', () => {
    const log = [
      '[R1] 한국 도시 건설 (타일 4장)',
      '[R1] 한국 기술 연구: 문자',
      '[R1] 독일 전사 생산 (망치 3)',
      '[R2] 한국 문화 +1 (4→5)',
      '[R2] 한국 피라미드에 망치 4 투자',
      '[R2] 한국 인구 2→3',
      '[R2] 독일 행복 4→5',
      '[R2] 독일 식량 정산 생략 (전통/체제)',
      '[R2] 피라미드: 한국 진척도 2/2',
      '[R2] 한국 피라미드 완성',
    ]
    expect(recentSummary(log)).toEqual([
      '[R1] 독일 전사 생산 (망치 3)',
      '[R2] 한국 문화 4→5',
      '[R2] 한국 피라미드에 망치 4 투자',
      '[R2] 한국 인구 2→3',
      '[R2] 독일 행복 4→5',
      '[R2] 🏛 한국 피라미드 완성',
    ])
  })

  it('같은 라운드가 이어지면 라운드 표시 대신 -', () => {
    expect(markRounds(['[R5] a', '[R4] b', '[R4] c', '[R4] d', '[R3] e']).map((l) => `${l.mark} ${l.text}`)).toEqual(['[R5] a', '[R4] b', '- c', '- d', '[R3] e'])
  })
})
