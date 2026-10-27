import { describe, expect, it } from 'vitest'
import { searchWords } from '../searchWords'

describe('검색 단어', () => {
  it('과학기술 이름을 찾고, 앞에서 시작하는 단어가 먼저', () => {
    expect(searchWords('철제').map((w) => w.word)).toEqual(['철제기술'])
    expect(searchWords('수렵')[0]).toMatchObject({ word: '수렵', kind: 'tech' })
    const r = searchWords('기술').map((w) => w.word)
    expect(r).toContain('철제기술')
    expect(r).toContain('청동기술')
    expect(searchWords('없는단어')).toEqual([])
    expect(searchWords('  ')).toEqual([])
    expect(searchWords('드라마와시').map((w) => w.word)).toEqual(['드라마와 시']) // 띄어쓰기 무시
  })
})
