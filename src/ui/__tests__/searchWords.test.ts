import { describe, expect, it } from 'vitest'
import { searchWords } from '../searchWords'
import { ALL_ENTRIES, entryOf } from '../encyclopedia'
import { RULE_WORDS } from '../ruleWords'

const text = (kind: Parameters<typeof entryOf>[0], id: string) =>
  entryOf(kind, id)
    .rows.map((r) => `${r.label}: ${r.items.map((i) => (typeof i === 'string' ? i : i.label)).join('')}`)
    .join('\n')

describe('검색·도감', () => {
  it('이름을 찾고, 앞에서 시작하는 단어가 먼저, 띄어쓰기 무시', () => {
    expect(searchWords('철제').map((w) => w.label)).toEqual(['철제기술'])
    expect(searchWords('수렵')[0]).toMatchObject({ label: '수렵', kind: 'tech' })
    expect(searchWords('모피')[0]).toMatchObject({ kind: 'luxury', id: 'furs' })
    expect(searchWords('거신상')[0]).toMatchObject({ kind: 'wonder' })
    expect(searchWords('장검사')[0]).toMatchObject({ kind: 'card', id: 'longswordsman' })
    expect(searchWords('전통')[0]).toMatchObject({ kind: 'policy' })
    expect(searchWords('없는단어')).toEqual([])
    expect(searchWords('드라마와시').map((w) => w.label)).toEqual(['드라마와 시'])
  })

  it('모든 항목의 도감 설명을 만들 수 있다', () => {
    for (const r of ALL_ENTRIES) expect(entryOf(r.kind, r.id).rows.length, `${r.kind}:${r.id}`).toBeGreaterThan(0)
  })

  it('기술 ↔ 카드·자원·불가사의가 서로 이어진다', () => {
    const iron = text('tech', 'iron_working')
    expect(iron).not.toContain('선행 기술')
    expect(iron).not.toContain('다음 기술')
    expect(text('tech', 'electricity')).toContain('기술 줄: 교육학 → 음향학 → 과학이론 → 전기 (과학 10)')
    expect(text('strategic', 'aluminum')).toContain('교육학 → 음향학 → 과학이론 → 전기 (과학 10)')
    expect(text('strategic', 'aluminum')).not.toContain('타일 산출')
    expect(text('luxury', 'furs')).not.toContain('금 +3') // 카드에 보이는 산출은 적지 않는다
    expect(text('strategic', 'iron')).not.toContain('망치')
    expect(searchWords('사적지')[0]).toMatchObject({ kind: 'rule', id: 'historic' })
    expect(iron).toContain('해금 군사 카드: 장검사 (철 필요)')
    expect(text('tech', 'trapping')).toContain('행복 +1 (타일 보유 시): 상아, 모피')
    expect(text('luxury', 'furs')).toContain('목축업 → 기마술 → 수렵 (과학 1)')
    expect(text('card', 'longswordsman')).toContain('필요 기술: 청동기술 → 철제기술 (과학 1)')
    expect(text('strategic', 'iron')).toContain('필요로 하는 카드: 장검사')
  })

  it('규칙 낱말: 금·행복 등을 찾고, 관련 항목 이름이 모두 도감에 있다', () => {
    expect(searchWords('금')[0]).toMatchObject({ kind: 'rule', id: 'gold' })
    expect(text('rule', 'gold')).toContain('중간의 등급을 무시하고 즉시 승급할 수 있습니다')
    expect(text('rule', 'gold')).toContain('한 차례에 한 장만 승급할 수 있습니다')
    for (const r of RULE_WORDS) for (const [, , see] of r.rows) for (const name of see ?? []) expect(ALL_ENTRIES.some((e) => e.label === name), `${r.title} → ${name}`).toBe(true)
  })
})
