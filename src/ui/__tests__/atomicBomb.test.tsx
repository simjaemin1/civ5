import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createGame } from '../../engine'
import type { GameState } from '../../engine'
import { AtomicBombPanel } from '../panels/AtomicBombPanel'

const base = (): GameState => {
  const s = structuredClone(createGame({ seed: 3, civIds: ['korea', 'russia'] }))
  const me = s.players[0]
  const other = s.players[1]
  other.cities.push({
    id: 0, workers: 1, placed: [], openSides: [],
    tiles: [
      { card: { id: 9001, terrains: ['평지'] }, role: 'city' },
      { card: { id: 9002, terrains: ['숲'] }, role: 'extra' },
    ],
  })
  me.cities.push({ id: 0, workers: 1, placed: [], openSides: [], tiles: [{ card: { id: 9003, terrains: ['언덕'] }, role: 'city' }] })
  return s
}
const render = (s: GameState) => renderToStaticMarkup(<AtomicBombPanel game={s} player={s.players[0]} dispatch={() => {}} />)

describe('원자폭탄 사용 버튼', () => {
  it('원자폭탄 카드가 없으면 보이지 않는다', () => {
    expect(render(base())).toBe('')
  })

  it('카드가 있어도 점령 중인 추가 타일이 없으면 눌 수 없다', () => {
    const s = base()
    s.players[0].military.push({ uid: 1, defId: 'atomic_bomb' })
    const html = render(s)
    expect(html).toContain('원자폭탄 사용')
    expect(html).toMatch(/<button[^>]*disabled/)
  })

  it('점령 중인 추가 타일이 있으면 눌 수 있다', () => {
    const s = base()
    s.players[0].military.push({ uid: 1, defId: 'atomic_bomb' })
    s.players[1].cities[0].tiles[1].occupiedBy = 0
    const html = render(s)
    expect(html).toContain('원자폭탄 사용')
    expect(html).not.toMatch(/<button[^>]*disabled/)
  })
})
