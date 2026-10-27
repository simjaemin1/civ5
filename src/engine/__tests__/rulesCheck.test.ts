import { describe, expect, it } from 'vitest'
import { TECHS, WONDER_CARDS, cardById, createGame, declarationTargets } from '..'
import type { PlacedTile } from '..'

/** 사용자가 확인해 준 규칙 (설명서와 규칙서가 다르던 곳) — 데이터·엔진이 이대로인지 지킨다 */
describe('사용자 확인 규칙', () => {
  const eff = (id: string) => TECHS.find((t) => t.id === id)!.effects
  it('다이너마이트 행복 +2, 음향학 문화 +1', () => {
    expect(eff('dynamite')).toContainEqual({ kind: 'happiness', amount: 2 })
    expect(eff('acoustics')).toContainEqual({ kind: 'culture', amount: 1 })
  })
  it('대전차포 비용 9, 야포 전투력 3, 아르테미스는 전사·궁수·창병·전차만 −1, 치첸이사 행복 +2', () => {
    expect(cardById('anti_tank_gun').cost).toBe(9)
    expect(cardById('artillery').power ?? cardById('artillery').marks?.[0].power).toBe(3)
    const artemis = WONDER_CARDS.find((w) => w.id === 'temple_of_artemis')!.effects.find((e) => e.kind === 'militaryCostMinus')
    expect(artemis && 'bases' in artemis ? [...artemis.bases].sort() : []).toEqual(['archer', 'chariot', 'spearman', 'warrior'])
    expect(WONDER_CARDS.find((w) => w.name === '치첸이사')!.effects).toContainEqual({ kind: 'happiness', amount: 2 })
    // 에펠탑: 턴당 관광 +4, 행복 +1 (정책을 바꾸지 않는다)
    expect(WONDER_CARDS.find((w) => w.id === 'eiffel_tower')!.effects).toEqual([{ kind: 'tourism', amount: 4 }, { kind: 'happiness', amount: 1 }])
  })
  it('일반 선전포고는 점령되지 않은 상대 타일만 노린다', () => {
    const s = createGame({ seed: 1, civIds: ['korea', 'germany', 'china'] })
    const tile = (id: number, role: PlacedTile['role'], occupiedBy?: number): PlacedTile => ({ card: { id, terrains: ['평지'] }, role, ...(occupiedBy !== undefined ? { occupiedBy } : {}) })
    s.players[0].cities = [{ id: 0, tiles: [tile(1, 'city')], workers: 2, placed: [], openSides: [] }]
    s.players[0].generals = 1
    s.players[1].cities = [{ id: 0, tiles: [tile(10, 'city'), tile(11, 'side'), tile(12, 'side', 2)], workers: 1, placed: [], openSides: [] }]
    s.players[2].cities = [{ id: 0, tiles: [tile(20, 'city')], workers: 1, placed: [], openSides: [] }]
    const normal = declarationTargets(s, s.players[0]).filter((t) => t.kind === 'normal').map((t) => t.tileId)
    expect(normal).toContain(11)
    expect(normal).not.toContain(12) // 중국이 점령 중인 독일 타일
  })
})
