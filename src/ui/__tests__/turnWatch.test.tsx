import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { actorOf, aiStep, civById, createGame, view } from '../../engine'
import type { GameState } from '../../engine'
import { BattleWatch } from '../../online/TurnWatch'
import { CivPeek } from '../CivInspector'

/** AI끼리 진행하다 조건을 만족하는 상태에서 멈춘다 */
function until(seed: number, ok: (s: GameState) => boolean, max = 3000): GameState {
  let s = createGame({ seed, civIds: ['korea', 'russia', 'egypt'] })
  for (let i = 0; i < max && !ok(s); i++) s = aiStep(s).state
  if (!ok(s)) throw new Error('조건을 만족하는 상태를 못 찾음')
  return s
}

describe('다른 문명의 차례 지켜보기', () => {
  it('남의 차례에는 그 문명의 시점 화면: 진행 중 문구와 영토가 보이고 비공개 정보는 없다', () => {
    const s = until(3, (g) => g.phase === 'research' && g.players[actorOf(g)].cities.length > 0)
    const actor = actorOf(s)
    const viewer = s.players.find((p) => p.id !== actor)!.id
    const html = renderToStaticMarkup(<CivPeek game={view(s, viewer)} id={actor} actor={actor} me={viewer} />)
    expect(html).toContain(`${civById(s.players[actor].civId).name} 시점`)
    expect(html).toContain('기술 선택 중')
    expect(html).toContain('일꾼')
    expect(html).not.toContain('손에 든') // 비공개 정보는 쓰지 않는다
  })

  it('전투 준비 중에는 누가 놓았는지만, 카드가 공개되면 양쪽 배치가 보인다', () => {
    const arrange = until(11, (g) => g.phase === 'battle' && g.battle?.step === 'arrange' && !!g.battle.slots[g.battle.decl.attackerId] === false)
    const html1 = renderToStaticMarkup(<BattleWatch game={view(arrange, 2)} viewer={2} />)
    expect(html1).toContain('전투 준비 중')
    expect(html1).toContain('카드를 놓는 중')
    expect(html1).not.toContain('카드가 공개되었습니다')
    const choose = until(11, (g) => g.phase === 'battle' && g.battle?.step === 'choose')
    const html2 = renderToStaticMarkup(<BattleWatch game={view(choose, 2)} viewer={2} />)
    expect(html2).toContain('카드가 공개되었습니다')
  }, 60_000)
})
