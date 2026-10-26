import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { YieldRow } from '../cards/YieldRow'

const Y = (y: Partial<Record<'food' | 'hammer' | 'science' | 'gold', number>>) => ({ food: 0, hammer: 0, science: 0, gold: 0, ...y })
const count = (html: string, cls: string) => html.split(`yield-ic ${cls}`).length - 1

describe('타일 산출 아이콘 줄 다시 그리기', () => {
  it('카드 인쇄값과 같으면 그리지 않는다', () => {
    expect(renderToStaticMarkup(<YieldRow printed={{ food: 2, hammer: 1 }} actual={Y({ food: 2, hammer: 1 })} />)).toBe('')
  })
  it('늘어난 만큼 강조해 더 그린다 (툰드라 알루미늄: 식량 1 → 5)', () => {
    const html = renderToStaticMarkup(<YieldRow printed={{ food: 1 }} actual={Y({ food: 5 })} />)
    expect(count(html, 'base')).toBe(1)
    expect(count(html, 'plus')).toBe(4)
  })
  it('줄어든 아이콘은 흐리게 남기고, 순서는 식량 → 망치 → 금 → 과학', () => {
    const html = renderToStaticMarkup(<YieldRow printed={{ food: 2, gold: 1 }} actual={Y({ food: 1, gold: 1, science: 1 })} />)
    expect(count(html, 'minus')).toBe(1)
    expect(count(html, 'plus')).toBe(1)
    const order = [...html.matchAll(/src="[^"]*yield-(\w+)\.png"/g)].map((m) => m[1])
    expect(order).toEqual(['food', 'food', 'gold', 'science'])
  })
})
