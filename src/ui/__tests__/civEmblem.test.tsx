import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CIVS } from '../../engine'
import { CivEmblem } from '../CivEmblem'
import { civEmblem } from '../civEmblems'

describe('문명 기호', () => {
  it('24개 문명 모두 기호 그림이 있다', () => {
    expect(CIVS.filter((c) => !civEmblem(c.id)).map((c) => c.id)).toEqual([])
  })
  it('기호 버튼은 문명 이름을 안내하고, 눌러야 카드가 뜬다 (처음에는 닫혀 있다)', () => {
    const html = renderToStaticMarkup(<CivEmblem civId="germany" />)
    expect(html).toContain('독일')
    expect(html).toContain('civ-emblem')
    expect(html).not.toContain('modal-backdrop')
  })
})
