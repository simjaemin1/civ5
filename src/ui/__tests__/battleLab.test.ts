import { describe, expect, it } from 'vitest'
import { CIVS, UNIQUES } from '../../engine'
import { buildLab, labAi, labApply, labCatalog, labReport, labTiles } from '../lab/labGame'
import type { LabCard, LabSetup } from '../lab/labGame'

const card = (civId: string, defId: string, dir?: string): LabCard => labCatalog(civId).find((c) => c.defId === defId && !c.unique && (dir === undefined || c.dirs?.[0] === dir))!
const setup = (over: Partial<LabSetup> = {}): LabSetup => {
  const a = CIVS[0].id
  const d = CIVS[1].id
  const pool = labCatalog(a).filter((c) => !c.unique)
  return {
    attacker: { civId: a, cards: pool.slice(0, 4), lighthouse: false, rocketry: false },
    defender: { civId: d, cards: labCatalog(d).filter((c) => !c.unique).slice(0, 2), lighthouse: false, rocketry: false },
    kind: 'normal',
    tile: labTiles().find((t) => !t.terrains.includes('해안'))!,
    attackerFirst: true,
    ...over,
  }
}
const runAi = (s: ReturnType<typeof buildLab>) => {
  for (let i = 0; i < 10 && !labReport(s); i++) s = labAi(s)
  return s
}

describe('모의 전투 랩', () => {
  it('카드 목록: 일반 카드는 방향별로, 고유 유닛은 그 문명 것만', () => {
    for (const civ of CIVS) {
      const cat = labCatalog(civ.id)
      expect(new Set(cat.map((c) => c.key)).size).toBe(cat.length)
      for (const c of cat.filter((x) => x.unique)) expect(UNIQUES[c.unique!].civId).toBe(civ.id)
    }
  })

  it('AI끼리 놓으면 엔진 전투 보고가 나오고, 라운드는 진행하지 않는다', () => {
    const s = runAi(buildLab(setup()))
    const r = labReport(s)!
    expect(r).toBeTruthy()
    expect(r.attackerId).toBe(0)
    expect(r.units.filter((u) => u.owner === 0).length).toBeGreaterThan(0)
    expect(s.phase).toBe('battle')
    expect(s.round).toBe(1)
  })

  it('직접 놓기: 같은 체력의 카드끼리 맞붙으면 규칙대로 계산된다', () => {
    let s = buildLab(setup({ attacker: { ...setup().attacker, cards: [card(CIVS[0].id, 'warrior')] }, defender: { ...setup().defender, cards: [] } }))
    // 수비 측은 카드가 없어 자동으로 빈 배치
    expect(s.battle!.slots[1]).toEqual([null, null, null, null])
    const uid = s.players[0].military[0].uid
    s = labApply(s, { type: 'arrangeBattle', playerId: 0, slots: [uid, null, null, null] })
    const r = labReport(s)!
    expect(r.winner).toBe('attacker')
    expect(r.outcome).toBe('타일 점령')
  })

  it('해안 타일이면 해안 전투, 탈환이면 타일이 공격 측 것', () => {
    const coast = labTiles().find((t) => t.terrains.includes('해안'))!
    const s = buildLab(setup({ tile: coast, kind: 'retake' }))
    expect(s.battle!.coastal).toBe(true)
    expect(s.players[0].cities[0].tiles.some((t) => t.card.id === s.battle!.decl.tileId && t.occupiedBy === 1)).toBe(true)
  })
})
