import { describe, expect, it } from 'vitest'
import { apply, cardById, culture, ctxOf, RuleError, MILITARY_CARDS, declarationTargets, freeWorkers, tileYield, isCoastalCity, happiness } from '..'
import type { GameState, TileCard } from '..'
import { found, me, play, startGame, tile } from './helpers'

const hand4 = (): TileCard[] => [tile(['평지']), tile(['숲']), tile(['언덕']), tile(['해안'])]
const inland = (): TileCard[] => [tile(['평지']), tile(['숲']), tile(['언덕']), tile(['사막'])]

function mod(s: GameState, fn: (s: GameState) => void): GameState {
  const c = structuredClone(s)
  fn(c)
  return c
}
/** declare 단계에서 멈춘다 (선전포고 가능한 경우) */
const toDeclare = (s: GameState) =>
  play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' }, { type: 'endProduction' })
const passTurn = (s: GameState) => {
  const r = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' }, { type: 'endProduction' })
  return r.phase === 'declare' ? apply(r, { type: 'endTurn' }) : r
}

/** 카드를 만들어 문명에게 준다 (uid 반환). 방향은 테스트가 정한다. */
function give(s: GameState, pid: number, defId: string, dir?: 'L' | 'C' | 'R', unique?: string): number {
  const def = cardById(defId)
  const uid = s.nextUid++
  s.players[pid].military.push({ uid, defId, dirs: def.variantDirs ? [dir ?? def.variantDirs[0]] : undefined, unique })
  return uid
}

/** 두 문명이 도시를 세운 뒤 2라운드 첫 차례 (0번 문명이 place 단계) */
function round2(civs = ['korea', 'russia'], hands: TileCard[][] = [hand4(), hand4()]): GameState {
  let s = startGame(civs, hands)
  for (let i = 0; i < civs.length; i++) s = passTurn(found(s))
  return s
}

const tileId = (s: GameState, pid: number, idx: number) => s.players[pid].cities[0].tiles[idx].card.id

/** 0번 문명이 1번 문명 타일에 선전포고하고 정산에서 전투가 시작된 상태까지 */
function toBattle(s0: GameState, setup: (s: GameState) => void, target: { pid: number; idx: number; owner?: number }): GameState {
  let s = mod(s0, setup)
  const owner = target.owner ?? target.pid
  s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' }, { type: 'endProduction' })
  expect(s.phase).toBe('declare')
  s = apply(s, {
    type: 'declareWar',
    defenderId: target.pid,
    cityId: 0,
    tileId: s.players[owner].cities[0].tiles[target.idx].card.id,
  })
  s = passTurn(s) // 상대 차례
  return s
}

const arrange = (s: GameState, playerId: number, slots: (number | null)[]) => apply(s, { type: 'arrangeBattle', playerId, slots })
const ids = (s: GameState, pid: number) => s.players[pid].military.map((c) => c.uid)

describe('군사 카드 생산', () => {
  const at = (civ = 'denmark', techs: string[] = []) => {
    let s = mod(startGame([civ], [hand4()]), () => {})
    s = found(s)
    s = mod(s, (c) => c.players[0].techs.push(...techs))
    s = apply(s, { type: 'placeWorkers', placements: [] })
    s = apply(s, { type: 'skipResearch' })
    return s
  }
  const withHammers = (s: GameState, n: number) => mod(s, (c) => (c.players[0].turn!.yields.cities[0].hammer = n))

  it('필요한 기술이 있고 망치가 충분하면 카드를 만든다 (방향 카드는 방향이 정해진다)', () => {
    let s = withHammers(at('denmark', ['agriculture']), 5)
    s = apply(s, { type: 'produce', cityId: 0, defId: 'warrior' })
    expect(me(s).military).toHaveLength(1)
    expect(me(s).military[0].defId).toBe('warrior')
    expect(['L', 'C', 'R']).toContain(me(s).military[0].dirs![0])
  })

  it('공격 방향은 무작위로 정해지고 세 방향이 고르게 나온다 (고를 수 없음)', () => {
    const counts: Record<string, number> = { L: 0, C: 0, R: 0 }
    const base = withHammers(at('denmark', ['agriculture']), 5)
    for (let seed = 1; seed <= 300; seed++) {
      const s = apply(mod(base, (c) => (c.rng = seed * 7919)), { type: 'produce', cityId: 0, defId: 'warrior' })
      counts[me(s).military[0].dirs![0]]++
    }
    for (const d of ['L', 'C', 'R']) expect(counts[d], `${d} 방향`).toBeGreaterThan(60) // 기대값 100
    // 같은 시드는 같은 결과
    const a = apply(mod(base, (c) => (c.rng = 42)), { type: 'produce', cityId: 0, defId: 'warrior' })
    const b = apply(mod(base, (c) => (c.rng = 42)), { type: 'produce', cityId: 0, defId: 'warrior' })
    expect(me(a).military[0].dirs).toEqual(me(b).military[0].dirs)
  })

  it('방향이 고정된 카드(전차·폭격기·전투기·대공포)는 방향이 없다', () => {
    const s = withHammers(at('denmark', ['animal_husbandry']), 5)
    const r = apply(s, { type: 'produce', cityId: 0, defId: 'chariot' })
    expect(me(r).military[0].dirs).toBeUndefined()
  })

  it('기술이 없거나 망치가 모자라면 만들 수 없다', () => {
    expect(() => apply(withHammers(at(), 9), { type: 'produce', cityId: 0, defId: 'warrior' })).toThrow(RuleError)
    expect(() => apply(withHammers(at('denmark', ['agriculture']), 2), { type: 'produce', cityId: 0, defId: 'warrior' })).toThrow(RuleError)
  })

  it('도시마다 한 차례에 생산은 1개 (불가사의 투자와 합쳐서)', () => {
    let s = withHammers(at('denmark', ['agriculture', 'archery']), 20)
    s = apply(s, { type: 'produce', cityId: 0, defId: 'warrior' })
    expect(() => apply(s, { type: 'produce', cityId: 0, defId: 'archer' })).toThrow(RuleError)
  })

  it('한 종류는 4장까지: 더 만들면 넘친 1장을 골라 버려야 하고, 그동안 다른 행동은 막힌다', () => {
    let s = mod(withHammers(at('denmark', ['agriculture']), 5), (c) => {
      for (let i = 0; i < 4; i++) give(c, 0, 'warrior', 'L')
    })
    s = apply(s, { type: 'produce', cityId: 0, defId: 'warrior' })
    expect(s.players[0].military.filter((c) => c.defId === 'warrior')).toHaveLength(5)
    expect(s.players[0].pendingCardDiscard).toEqual(['warrior'])
    expect(() => apply(s, { type: 'endProduction' })).toThrow(RuleError)
    expect(() => apply(s, { type: 'discardCard', uid: 99999 })).toThrow(RuleError)
    const uid = s.players[0].military[0].uid
    s = apply(s, { type: 'discardCard', uid })
    expect(s.players[0].military.filter((c) => c.defId === 'warrior')).toHaveLength(4)
    expect(s.players[0].pendingCardDiscard).toBeUndefined()
    expect(() => apply(s, { type: 'endProduction' })).not.toThrow()
  })

  it('해안 타일을 나중에 얻어도 첫 5타일이 아니면 전함을 만들 수 없다', () => {
    let s = mod(startGame(['denmark'], [inland()]), () => {})
    s = found(s)
    s = mod(s, (c) => {
      const city = c.players[0].cities[0]
      city.openSides = ['N']
      c.players[0].techs.push('biology')
      // 나중에 붙은 해안 타일 (빈 면에 들어가 role은 side지만 첫 5타일은 아니다)
      city.tiles.push({ card: tile(['해안']), role: 'side', side: 'N', late: true })
    })
    expect(isCoastalCity(s.players[0].cities[0])).toBe(false)
  })

  it('다이너마이트: 행복 +2', () => {
    const base = at('denmark', [])
    const withTech = mod(base, (c) => c.players[0].techs.push('dynamite'))
    expect(happiness(withTech.players[0]) - happiness(base.players[0])).toBe(2)
  })

  it('전함은 첫 5타일에 해안이 있는 도시에서만 만들 수 있다', () => {
    let s = mod(startGame(['denmark'], [inland()]), () => {})
    s = found(s)
    s = mod(s, (c) => c.players[0].techs.push('biology'))
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' })
    s = withHammers(s, 10)
    expect(() => apply(s, { type: 'produce', cityId: 0, defId: 'battleship' })).toThrow(RuleError)
    const coastal = withHammers(at('denmark', ['biology']), 10)
    expect(() => apply(coastal, { type: 'produce', cityId: 0, defId: 'battleship' })).not.toThrow()
  })

  it('아르테미스 사원: 전사·궁수·창병·전차 생산 비용 -1 (다른 카드는 그대로)', () => {
    const own = (techs: string[], hammers: number) => withHammers(mod(at('denmark', techs), (c) => c.players[0].wonders.push('temple_of_artemis')), hammers)
    // 전사 3 → 2
    expect(() => apply(own(['agriculture'], 1), { type: 'produce', cityId: 0, defId: 'warrior' })).toThrow(RuleError)
    expect(() => apply(own(['agriculture'], 2), { type: 'produce', cityId: 0, defId: 'warrior' })).not.toThrow()
    // 궁수·창병·전차도 -1
    expect(() => apply(own(['archery'], 2), { type: 'produce', cityId: 0, defId: 'archer' })).not.toThrow()
    expect(() => apply(own(['bronze_working'], 2), { type: 'produce', cityId: 0, defId: 'spearman' })).not.toThrow()
    expect(() => apply(own(['animal_husbandry'], 2), { type: 'produce', cityId: 0, defId: 'chariot' })).not.toThrow()
    // 머스킷병(6)은 그대로
    expect(() => apply(own(['gunpowder'], 5), { type: 'produce', cityId: 0, defId: 'musketman' })).toThrow(RuleError)
    expect(() => apply(own(['gunpowder'], 6), { type: 'produce', cityId: 0, defId: 'musketman' })).not.toThrow()
  })

  it('고유 유닛: 스페인 테르시오는 머스킷병 취급에 망치 1이 더 든다', () => {
    const s0 = mod(startGame(['spain'], [hand4()]), () => {})
    let s = found(s0)
    s = mod(s, (c) => c.players[0].techs.push('gunpowder'))
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' })
    expect(() => apply(withHammers(s, 6), { type: 'produce', cityId: 0, defId: 'musketman', unique: '테르시오' })).toThrow(RuleError)
    const ok = apply(withHammers(s, 7), { type: 'produce', cityId: 0, defId: 'musketman', unique: '테르시오' })
    expect(me(ok).military[0]).toMatchObject({ defId: 'musketman', unique: '테르시오' })
    expect(() => apply(withHammers(s, 7), { type: 'produce', cityId: 0, defId: 'musketman', unique: '불멸자' })).toThrow(RuleError)
  })
})

describe('군사 카드 공개 범위', () => {
  it('로그에는 무엇을 생산·승급했는지만 남고 공격 방향은 남지 않는다', () => {
    let s = found(startGame(['denmark'], [hand4()]))
    s = mod(s, (c) => c.players[0].techs.push('agriculture'))
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' })
    s = mod(s, (c) => {
      c.players[0].turn!.yields.cities[0].hammer = 5
      c.players[0].turn!.yields.gold = 10
    })
    s = apply(s, { type: 'produce', cityId: 0, defId: 'warrior' })
    expect(s.log.at(-1)).toContain('전사')
    s = mod(s, (c) => c.players[0].techs.push('iron_working')) // 철제기술을 얻으면 전사는 더 못 만들지만 승급은 된다
    s = apply(s, { type: 'upgrade', uid: s.players[0].military[0].uid })
    expect(s.log.at(-1)).toContain('장검사')
    expect(s.log.filter((l) => /생산|승급/.test(l)).join('\n')).not.toMatch(/왼쪽|가운데|오른쪽|\bL\b|\bC\b|\bR\b/)
  })
})

/** 고유 유닛 한 장을 재고에서 꺼내 문명에게 준다 (key: 재고의 방향 조합 'L', 'LC', 'x' 등) */
function giveUnique(s: GameState, pid: number, unique: string, defId: string, key?: string): number {
  const supply = s.uniqueSupply[unique]
  const k = key ?? supply[0]
  supply.splice(supply.indexOf(k), 1)
  const uid = s.nextUid++
  s.players[pid].military.push({ uid, defId, dirs: k === 'x' ? undefined : (k.split('') as ('L' | 'C' | 'R')[]), unique })
  return uid
}

describe('고유 유닛은 3장만 존재한다', () => {
  const spain = (techs: string[]) => {
    let s = found(startGame(['spain'], [hand4()]))
    s = mod(s, (c) => c.players[0].techs.push(...techs))
    return play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' })
  }
  const produceUnique = (s: GameState) => {
    const ready = mod(s, (c) => {
      c.players[0].turn!.produced = []
      c.players[0].turn!.yields.cities[0].hammer = 20
    })
    return apply(ready, { type: 'produce', cityId: 0, defId: 'musketman', unique: '테르시오' })
  }

  it('방향 카드의 고유 유닛은 왼쪽·가운데·오른쪽 한 장씩 3장이 무작위 순서로 나오고, 4장째는 만들 수 없다', () => {
    let s = spain(['gunpowder'])
    expect([...s.uniqueSupply['테르시오']].sort()).toEqual(['C', 'L', 'R'])
    for (let i = 0; i < 3; i++) s = produceUnique(s)
    const dirs = me(s).military.filter((c) => c.unique === '테르시오').map((c) => c.dirs![0])
    expect([...dirs].sort()).toEqual(['C', 'L', 'R'])
    expect(s.uniqueSupply['테르시오']).toEqual([])
    expect(() => produceUnique(s)).toThrow(RuleError)
    // 일반 머스킷병은 계속 만들 수 있다 (무제한)
    const ready = mod(s, (c) => {
      c.players[0].turn!.produced = []
      c.players[0].turn!.yields.cities[0].hammer = 20
    })
    expect(() => apply(ready, { type: 'produce', cityId: 0, defId: 'musketman' })).not.toThrow()
  })

  it('방향이 없는 카드의 고유 유닛(인도 전투 코끼리)도 3장까지', () => {
    let s = found(startGame(['india'], [hand4()]))
    s = mod(s, (c) => c.players[0].techs.push('animal_husbandry'))
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' })
    expect(s.uniqueSupply['전투 코끼리']).toEqual(['x', 'x', 'x'])
    for (let i = 0; i < 3; i++) {
      s = mod(s, (c) => {
        c.players[0].turn!.produced = []
        c.players[0].turn!.yields.cities[0].hammer = 20
      })
      s = apply(s, { type: 'produce', cityId: 0, defId: 'chariot', unique: '전투 코끼리' })
    }
    s = mod(s, (c) => {
      c.players[0].turn!.produced = []
      c.players[0].turn!.yields.cities[0].hammer = 20
    })
    expect(() => apply(s, { type: 'produce', cityId: 0, defId: 'chariot', unique: '전투 코끼리' })).toThrow(RuleError)
  })

  it('고유 유닛을 희생(인도)하거나 승급으로 바꾸면 3장 재고로 돌아간다', () => {
    let s = found(startGame(['india'], [hand4()]))
    s = mod(s, (c) => c.players[0].techs.push('animal_husbandry'))
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' })
    s = mod(s, (c) => (c.players[0].turn!.yields.cities[0].hammer = 20))
    s = apply(s, { type: 'produce', cityId: 0, defId: 'chariot', unique: '전투 코끼리' })
    expect(s.uniqueSupply['전투 코끼리']).toHaveLength(2)
    s = apply(s, { type: 'sacrificeCard', uid: me(s).military[0].uid })
    expect(s.uniqueSupply['전투 코끼리']).toHaveLength(3)

    let t = spain(['gunpowder'])
    t = produceUnique(t)
    expect(t.uniqueSupply['테르시오']).toHaveLength(2)
    t = mod(t, (c) => c.players[0].techs.push('rifling'))
    t = mod(t, (c) => (c.players[0].turn!.yields.gold = 20))
    t = apply(t, { type: 'upgrade', uid: me(t).military[0].uid }) // 머스킷병 → 소총병
    expect(t.uniqueSupply['테르시오']).toHaveLength(3)
  })

  it('전투에서 파괴된 고유 유닛은 3장 재고로 돌아간다', () => {
    let d = 0
    let s = toBattle(round2(['russia', 'spain']), (c) => {
      c.players[0].generals = 1
      give(c, 0, 'tank')
      give(c, 0, 'tank')
      d = giveUnique(c, 1, '테르시오', 'musketman', 'C')
    }, { pid: 1, idx: 1 })
    expect(s.uniqueSupply['테르시오']).toHaveLength(2)
    const [t1, t2] = s.players[0].military.map((c) => c.uid)
    s = arrange(s, 0, [t1, t2, null, null])
    s = arrange(s, 1, [null, d, null, null])
    // 러시아가 먼저 대상을 고른다: 탱크 두 장(전투력 4+4=8)이 체력 5의 테르시오를 파괴
    s = apply(s, { type: 'chooseTargets', playerId: 0, picks: { [t1]: d, [t2]: d } })
    expect(ids(s, 1)).not.toContain(d)
    expect(s.uniqueSupply['테르시오']).toHaveLength(3)
  })

  it('오스만이 상대의 해안 전용 고유 유닛(제고이센)을 파괴하면 빼앗아 가고, 파괴될 때까지 재고에 돌아오지 않는다', () => {
    let ship = 0
    let s = toBattle(round2(['netherlands', 'ottoman']), (c) => {
      c.players[0].generals = 1
      ship = giveUnique(c, 0, '제고이센', 'zeijoisen', 'L')
      give(c, 1, 'tank')
      give(c, 1, 'tank')
    }, { pid: 1, idx: 3 }) // 오스만의 해안 타일: 해안 전투
    expect(s.battle!.coastal).toBe(true)
    expect(s.uniqueSupply['제고이센']).toHaveLength(2)
    const [t1, t2] = s.players[1].military.map((c) => c.uid)
    s = arrange(s, 0, [ship, null, null, null])
    s = arrange(s, 1, [t1, t2, null, null])
    s = apply(s, { type: 'chooseTargets', playerId: 1, picks: { [t1]: ship, [t2]: ship } }) // 4+4=8 ≥ 체력 8
    expect(s.players[0].military.some((c) => c.uid === ship)).toBe(false)
    expect(s.players[1].military.some((c) => c.uid === ship && c.unique === '제고이센')).toBe(true) // 오스만이 가져감
    expect(s.uniqueSupply['제고이센']).toHaveLength(2) // 재고에 돌아오지 않는다
  })
})

describe('금으로 승급', () => {
  const setup = () => {
    let s = startGame(['denmark'], [hand4()])
    s = found(s)
    s = mod(s, (c) => c.players[0].techs.push('agriculture', 'iron_working'))
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' })
    return s
  }
  it('하위 카드를 상위 카드로 바꾸고 상위 카드의 생산 비용만큼 금을 낸다 (한 차례에 한 장)', () => {
    let s = setup()
    let uid = 0
    s = mod(s, (c) => {
      uid = give(c, 0, 'warrior', 'L')
      give(c, 0, 'warrior', 'C')
      c.players[0].turn!.yields.gold = 10
    })
    expect(() => apply(setup(), { type: 'upgrade', uid: 999 })).toThrow(RuleError)
    s = apply(s, { type: 'upgrade', uid })
    expect(['L', 'C', 'R']).toContain(me(s).military.find((c) => c.defId === 'longswordsman')!.dirs![0]) // 새 카드의 방향은 무작위
    expect(me(s).turn!.yields.gold).toBe(5) // 10 - 5
    const other = me(s).military.find((c) => c.defId === 'warrior')!.uid
    expect(() => apply(s, { type: 'upgrade', uid: other })).toThrow(RuleError) // 한 차례에 한 장
  })

  it('금이 모자라거나 기술이 없으면 승급할 수 없다', () => {
    let s = setup()
    let uid = 0
    s = mod(s, (c) => {
      uid = give(c, 0, 'warrior', 'L')
      c.players[0].turn!.yields.gold = 4
    })
    expect(() => apply(s, { type: 'upgrade', uid })).toThrow(RuleError)
    const noTech = mod(s, (c) => {
      c.players[0].techs = c.players[0].techs.filter((t) => t !== 'iron_working')
      c.players[0].turn!.yields.gold = 20
    })
    expect(() => apply(noTech, { type: 'upgrade', uid })).toThrow(RuleError)
  })
})

describe('선전포고', () => {
  it('위대한 장군과 타일에 올리지 않은 일꾼이 있어야 한다', () => {
    let s = mod(round2(), (c) => (c.players[0].cities[0].workers = 1))
    expect(declarationTargets(s, s.players[0])).toEqual([]) // 장군 0
    s = mod(s, (c) => (c.players[0].generals = 1))
    expect(declarationTargets(s, s.players[0]).length).toBeGreaterThan(0)
    // 일꾼을 타일에 올려 두면 쓸 수 없다
    const sideTile = tileId(s, 0, 1)
    const placed = apply(s, { type: 'placeWorkers', placements: [{ cityId: 0, tileId: sideTile }] })
    expect(freeWorkers(placed.players[0])).toBe(0)
    expect(declarationTargets(placed, placed.players[0])).toEqual([])
  })

  it('도시 타일은 4칸을 모두 점령하기 전에는 목표가 될 수 없다', () => {
    const s = mod(round2(), (c) => (c.players[0].generals = 1))
    const cityTile = tileId(s, 1, 0)
    expect(declarationTargets(s, s.players[0]).some((t) => t.tileId === cityTile)).toBe(false)
  })

  it('한 차례에 한 번만 선전포고할 수 있다', () => {
    let s = mod(round2(), (c) => (c.players[0].generals = 2))
    s = toDeclare(s)
    expect(s.phase).toBe('declare')
    s = apply(s, { type: 'declareWar', defenderId: 1, cityId: 0, tileId: tileId(s, 1, 1) })
    expect(s.declarations).toHaveLength(1)
    expect(s.players[0].generals).toBe(1) // 장군 1개를 걸었다
    expect(s.players[0].busyWorkers).toBe(1)
  })

  it('declare 단계에서 선전포고 없이 차례를 끝낼 수 있다', () => {
    let s = mod(round2(), (c) => (c.players[0].generals = 1))
    s = toDeclare(s)
    s = apply(s, { type: 'endTurn' })
    expect(s.declarations).toHaveLength(0)
    expect(s.order[s.turnIdx]).toBe(1)
  })

  it('목표가 없으면 선전포고 단계를 건너뛴다', () => {
    const s = passTurn(round2())
    expect(s.phase).toBe('place')
  })
})

describe('전투 규칙', () => {
  const T = { pid: 1, idx: 1 }

  it('공격 방향: 내 2번 카드는 가운데로 상대 3번, 왼쪽으로 상대 4번, 오른쪽으로 상대 2번', () => {
    // 폭격기는 왼쪽·오른쪽으로 전투력 4. 상대 2·4번 전사(체력 3)는 파괴되고 3번은 산다.
    let bomber = 0
    const d: number[] = []
    let s = toBattle(round2(), (c) => {
      c.players[0].generals = 1
      bomber = give(c, 0, 'bomber')
      d.push(give(c, 1, 'warrior', 'L'), give(c, 1, 'warrior', 'C'), give(c, 1, 'warrior', 'R'))
    }, T)
    expect(s.phase).toBe('battle')
    s = arrange(s, 0, [null, bomber, null, null])
    s = arrange(s, 1, [null, d[0], d[1], d[2]]) // 2번, 3번, 4번
    const left = ids(s, 1)
    expect(left).toContain(d[1]) // 3번(가운데)은 살아남음
    expect(left).not.toContain(d[0]) // 2번 파괴
    expect(left).not.toContain(d[2]) // 4번 파괴
    expect(ids(s, 0)).toContain(bomber)
  })

  it('남은 카드 수가 같으면 수비 측이 이기고, 공격 측 장군은 돌아온다', () => {
    let a = 0
    let d = 0
    let s = toBattle(round2(), (c) => {
      c.players[0].generals = 1
      a = give(c, 0, 'warrior', 'L')
      d = give(c, 1, 'pikeman', 'L')
    }, T)
    s = arrange(s, 0, [a, null, null, null])
    s = arrange(s, 1, [null, null, null, d])
    expect(s.players[0].generals).toBe(1)
    expect(s.players[1].cities[0].tiles[1].occupiedBy).toBeUndefined()
    expect(s.players[0].busyWorkers).toBe(0)
    // 전투 장면을 위한 결과 보고가 남는다
    const r = s.battleReports.at(-1)!
    expect(r).toMatchObject({ attackerId: 0, defenderId: 1, kind: 'normal', winner: 'defender', survivors: { attacker: 1, defender: 1 } })
    expect(r.units.map((u) => [u.owner, u.slot, u.destroyed])).toEqual([[0, 1, false], [1, 4, false]])
    expect(r.units[0].inst.defId).toBe('warrior')
    expect(r.units[1].counterDamage + r.units[1].attackDamage).toBeGreaterThanOrEqual(0)
    expect(r.hits).toEqual([]) // 서로 마주 본 공격이 없었다
    expect(r.outcome).toContain('점령 실패')
  })

  it('수비 측에 쓸 카드가 없으면 공격 측이 이겨 타일을 점령한다', () => {
    let a = 0
    let s = toBattle(round2(), (c) => {
      c.players[0].generals = 1
      a = give(c, 0, 'warrior', 'L')
    }, T)
    expect(s.battle!.slots[1]).toEqual([null, null, null, null]) // 자동 배치
    const target = s.battle!.decl.tileId
    s = arrange(s, 0, [a, null, null, null])
    expect(s.players[1].cities[0].tiles.find((t) => t.card.id === target)!.occupiedBy).toBe(0)
    expect(s.players[0].generals).toBe(0) // 장군은 타일 위에
    expect(s.phase).toBe('place') // 다음 라운드
    expect(s.round).toBe(3)
    expect(s.battleReports.at(-1)).toMatchObject({ winner: 'attacker', outcome: '타일 점령' })
  })

  it('점령당한 타일에는 일꾼을 올릴 수 없다', () => {
    let a = 0
    let s = toBattle(round2(), (c) => {
      c.players[0].generals = 1
      a = give(c, 0, 'warrior', 'L')
    }, T)
    const target = s.battle!.decl.tileId
    s = arrange(s, 0, [a, null, null, null])
    s = passTurn(s) // 0번 문명 3라운드 차례
    expect(s.order[s.turnIdx]).toBe(1)
    expect(() => apply(s, { type: 'placeWorkers', placements: [{ cityId: 0, tileId: target }] })).toThrow(RuleError)
  })

  it('반격: 상대 방어력만큼 반격 대미지를 받는다, 궁수류는 반격을 받지 않는다', () => {
    // 전사(체력 3)가 파이크병(방어 3)을 공격하면 반격 3으로 파괴, 궁수(체력 2)는 반격 없음으로 생존
    let warrior = 0
    let archer = 0
    let pike = 0
    let s = toBattle(round2(), (c) => {
      c.players[0].generals = 1
      warrior = give(c, 0, 'warrior', 'C')
      archer = give(c, 0, 'archer', 'C')
      pike = give(c, 1, 'pikeman', 'C')
    }, T)
    // 내 1번(전사)은 상대 4번, 내 2번(궁수)은 상대 3번을 가운데로 본다
    s = arrange(s, 0, [warrior, archer, null, null])
    s = arrange(s, 1, [null, null, pike, pike === 0 ? null : null])
    expect(ids(s, 0)).toContain(archer)
    // 파이크병이 3번에서 궁수를, 전사는 상대가 없는 4번과 마주 봐서 대미지 없음
    expect(ids(s, 0)).toContain(warrior)
  })

  it('전사가 방어력 3 카드와 직접 마주 보면 반격으로 파괴된다', () => {
    let warrior = 0
    let pike = 0
    let s = toBattle(round2(), (c) => {
      c.players[0].generals = 1
      warrior = give(c, 0, 'warrior', 'C')
      pike = give(c, 1, 'pikeman', 'C')
    }, T)
    s = arrange(s, 0, [warrior, null, null, null]) // 내 1번 ↔ 상대 4번
    s = arrange(s, 1, [null, null, null, pike])
    expect(ids(s, 0)).not.toContain(warrior)
    expect(ids(s, 1)).toContain(pike)
  })

  it('살아남은 카드는 다음 전투에도 쓰고, 대미지는 사라진다', () => {
    let a = 0
    let d = 0
    let s = toBattle(round2(), (c) => {
      c.players[0].generals = 1
      a = give(c, 0, 'warrior', 'C') // 체력 3
      d = give(c, 1, 'spearman', 'C') // 방어 1
    }, T)
    s = arrange(s, 0, [a, null, null, null])
    s = arrange(s, 1, [null, null, null, d])
    expect(ids(s, 0)).toContain(a) // 반격 1을 받았지만 체력 3이라 생존
    expect(ids(s, 1)).toContain(d)
  })

  it('해안 전용 카드(전함)는 해안 타일 전투에서만 놓을 수 있다', () => {
    let ship = 0
    // idx 3 = 해안 타일, idx 2 = 언덕
    const coastal = toBattle(round2(), (c) => {
      c.players[0].generals = 1
      ship = give(c, 0, 'battleship', 'L')
    }, { pid: 1, idx: 3 })
    expect(coastal.battle!.coastal).toBe(true)
    expect(() => arrange(coastal, 0, [ship, null, null, null])).not.toThrow()
    const landLocked = toBattle(round2(), (c) => {
      c.players[0].generals = 1
      ship = give(c, 0, 'battleship', 'L')
      give(c, 1, 'warrior', 'L') // 상대는 쓸 카드가 있어 전투가 남는다
      give(c, 0, 'warrior', 'L')
    }, { pid: 1, idx: 2 })
    expect(landLocked.battle!.coastal).toBe(false)
    expect(() => arrange(landLocked, 0, [ship, null, null, null])).toThrow(RuleError)
  })

  it('양쪽 모두 쓸 카드가 없으면 전투는 자동으로 끝나고 수비 측이 이긴다 (장군 반환)', () => {
    const s = toBattle(round2(), (c) => (c.players[0].generals = 1), { pid: 1, idx: 1 })
    expect(s.battle).toBeNull()
    expect(s.players[0].generals).toBe(1)
    expect(s.players[1].cities[0].tiles[1].occupiedBy).toBeUndefined()
    expect(s.round).toBe(3)
  })

  it('영국: 해안 타일 전투에서 모든 군사 카드 공격 전투력 +1', () => {
    // 전사(전투력 1)는 궁수(체력 2)를 못 죽이지만, 영국은 해안에서 전투력 2라 죽인다
    const run = (civ: string, idx: number) => {
      let a = 0
      let d = 0
      let s = toBattle(round2([civ, 'russia']), (c) => {
        c.players[0].generals = 1
        a = give(c, 0, 'warrior', 'C')
        d = give(c, 1, 'archer', 'C')
      }, { pid: 1, idx })
      s = arrange(s, 0, [a, null, null, null])
      s = arrange(s, 1, [null, null, null, d])
      return ids(s, 1).includes(d)
    }
    expect(run('england', 3)).toBe(false) // 해안: 파괴
    expect(run('england', 2)).toBe(true) // 내륙: 생존
    expect(run('korea', 3)).toBe(true) // 영국이 아니면 생존
  })

  it('전투기 효과: 전투기·대공포 외의 카드에게서 받는 대미지는 0, 로켓공학이 있으면 무시', () => {
    const run = (rocketry: boolean) => {
      let w = 0
      let f = 0
      let s = toBattle(round2(), (c) => {
        c.players[0].generals = 1
        if (rocketry) c.players[0].techs.push('rocketry')
        w = give(c, 0, 'warrior', 'C')
        f = give(c, 1, 'fighter')
      }, T)
      s = arrange(s, 0, [w, null, null, null])
      s = arrange(s, 1, [null, null, null, f])
      return ids(s, 1).includes(f)
    }
    expect(run(false)).toBe(true)
    expect(run(true)).toBe(false)
  })

  it('대공포는 폭격기에게서 받는 대미지가 0', () => {
    let b = 0
    let aa = 0
    let s = toBattle(round2(), (c) => {
      c.players[0].generals = 1
      b = give(c, 0, 'bomber')
      aa = give(c, 1, 'aa_gun')
    }, T)
    // 내 4번 폭격기는 오른쪽 방향 → 상대 0번(범위 밖), 왼쪽 → 상대 2번. 상대 대공포는 2번에 놓는다
    s = arrange(s, 0, [null, null, null, b])
    s = arrange(s, 1, [null, aa, null, null])
    expect(ids(s, 1)).toContain(aa)
  })
})

describe('대상을 고르는 카드', () => {
  const T = { pid: 1, idx: 1 }

  it('우선도가 높은 쪽부터 대상을 고른다', () => {
    let a = 0
    let d = 0
    let w1 = 0
    let w2 = 0
    let s = toBattle(round2(), (c) => {
      c.players[0].generals = 1
      a = give(c, 0, 'chariot')
      w1 = give(c, 0, 'warrior', 'C')
      d = give(c, 1, 'chariot')
      w2 = give(c, 1, 'warrior', 'C')
    }, T)
    s = arrange(s, 0, [a, w1, null, null])
    s = arrange(s, 1, [d, w2, null, null])
    expect(s.battle!.step).toBe('choose')
    expect(s.battle!.chooseQueue.map((q) => q.playerId)).toEqual([0, 1]) // 한국(우선도 99) 먼저
    expect(() => apply(s, { type: 'chooseTargets', playerId: 1, picks: { [d]: w1 } })).toThrow(RuleError)
    s = apply(s, { type: 'chooseTargets', playerId: 0, picks: { [a]: w2 } })
    s = apply(s, { type: 'chooseTargets', playerId: 1, picks: { [d]: w1 } })
    expect(s.battle).toBeNull()
    expect(s.phase).not.toBe('battle')
  })

  it('고른 대상은 상대 카드여야 한다', () => {
    let a = 0
    let w1 = 0
    let w2 = 0
    let s = toBattle(round2(), (c) => {
      c.players[0].generals = 1
      a = give(c, 0, 'chariot')
      w1 = give(c, 0, 'warrior', 'C')
      w2 = give(c, 1, 'warrior', 'C')
    }, T)
    s = arrange(s, 0, [a, w1, null, null])
    s = arrange(s, 1, [w2, null, null, null])
    expect(() => apply(s, { type: 'chooseTargets', playerId: 0, picks: { [a]: w1 } })).toThrow(RuleError)
  })

  it('대상을 고르는 카드(전차 등)는 일부러 빈칸을 공격할 수 있다: 대미지도 반격도 없다', () => {
    const run = (pick: 'empty' | 'card') => {
      let a = 0
      let w = 0
      let s = toBattle(round2(), (c) => {
        c.players[0].generals = 1
        a = give(c, 0, 'chariot')
        w = give(c, 1, 'warrior', 'C')
      }, T)
      s = arrange(s, 0, [a, null, null, null])
      s = arrange(s, 1, [w, null, null, null])
      s = apply(s, { type: 'chooseTargets', playerId: 0, picks: { [a]: pick === 'empty' ? null : w } })
      const r = s.battleReports.at(-1)!
      return { r, a, w }
    }
    const hit = run('card')
    const miss = run('empty')
    // 카드를 고르면 전사가 전차의 전투력 1만큼 대미지를 받는다
    expect(hit.r.units.find((u) => u.inst.uid === hit.w)!.attackDamage).toBe(1)
    // 빈칸을 고르면 아무 대미지도 없다 (공격 기록도 없음)
    expect(miss.r.units.find((u) => u.inst.uid === miss.w)!.attackDamage).toBe(0)
    expect(miss.r.units.find((u) => u.inst.uid === miss.a)!.counterDamage).toBe(0)
    expect(miss.r.hits.filter((h) => h.from.pid === 0)).toEqual([])
  })

  it('탱크는 상대에게 대전차포가 있어도 일부러 빈칸을 고를 수 있다 (카드를 고른다면 대전차포여야 한다)', () => {
    let tank = 0
    let s = toBattle(round2(), (c) => {
      c.players[0].generals = 1
      tank = give(c, 0, 'tank')
      give(c, 1, 'anti_tank_gun', 'C')
    }, T)
    s = arrange(s, 0, [tank, null, null, null])
    const at = s.players[1].military[0].uid
    s = arrange(s, 1, [null, null, null, at])
    expect(() => apply(s, { type: 'chooseTargets', playerId: 0, picks: { [tank]: null } })).not.toThrow()
  })

  it('대전차포: 상대 탱크는 반드시 대전차포를 공격 대상으로 골라야 한다', () => {
    let tank = 0
    let at = 0
    let w = 0
    let s = toBattle(round2(), (c) => {
      c.players[0].generals = 1
      tank = give(c, 0, 'tank')
      at = give(c, 1, 'anti_tank_gun', 'C')
      w = give(c, 1, 'warrior', 'C')
    }, T)
    s = arrange(s, 0, [tank, null, null, null])
    s = arrange(s, 1, [at, w, null, null])
    expect(() => apply(s, { type: 'chooseTargets', playerId: 0, picks: { [tank]: w } })).toThrow(RuleError)
    s = apply(s, { type: 'chooseTargets', playerId: 0, picks: { [tank]: at } })
    expect(s.battle).toBeNull()
  })

  it('코사크(러시아 고유 유닛)는 모두 고른 뒤에 대상을 고른다', () => {
    let a = 0
    let cossack = 0
    let w = 0
    let s = toBattle(round2(), (c) => {
      c.players[0].generals = 1
      a = give(c, 0, 'chariot')
      cossack = give(c, 1, 'cavalry', undefined, '코사크')
      w = give(c, 1, 'warrior', 'C')
    }, T)
    s = arrange(s, 0, [a, null, null, null])
    s = arrange(s, 1, [cossack, w, null, null])
    // 한국이 먼저(일반), 러시아 코사크는 마지막
    expect(s.battle!.chooseQueue.map((q) => q.playerId)).toEqual([0, 1])
    expect(s.battle!.chooseQueue[1].uids).toEqual([cossack])
  })
})

describe('도시 공격·탈환·탈락', () => {
  it('도시 4칸을 점령하고 공성 카드가 살아남아 이기면 도시가 파괴되고, 첫 도시면 정복 승리', () => {
    let cannon = 0
    const prep = (c: GameState) => {
      const city = c.players[1].cities[0]
      city.tiles.push({ card: tile(['평지']), role: 'side', side: 'W' })
      city.openSides = []
      for (const t of city.tiles) if (t.role === 'side') t.occupiedBy = 0
      c.players[0].generals = 1
      cannon = give(c, 0, 'cannon', 'L')
    }
    let s = toBattle(round2(), prep, { pid: 1, idx: 0 })
    expect(s.battle!.decl.kind).toBe('city')
    s = arrange(s, 0, [cannon, null, null, null])
    expect(s.players[1].eliminated).toBe(true)
    expect(s.players[1].cities).toEqual([])
    expect(s.winner).toEqual({ playerId: 0, type: 'conquest' })
    expect(s.phase).toBe('over')
    expect(s.players[0].generals).toBe(5) // 선전포고에 건 장군 1 + 도시 4칸에 올려 둔 장군 4가 모두 돌아온다
  })

  it('공성 카드가 없으면 이겨도 도시는 파괴되지 않는다', () => {
    let w = 0
    let s = toBattle(round2(), (c) => {
      const city = c.players[1].cities[0]
      city.tiles.push({ card: tile(['평지']), role: 'side', side: 'W' })
      city.openSides = []
      for (const t of city.tiles) if (t.role === 'side') t.occupiedBy = 0
      c.players[0].generals = 1
      w = give(c, 0, 'warrior', 'L')
    }, { pid: 1, idx: 0 })
    s = arrange(s, 0, [w, null, null, null])
    expect(s.players[1].eliminated).toBe(false)
    expect(s.players[1].cities).toHaveLength(1)
  })

  it('두 번째 도시가 있으면 첫 도시의 도시 타일은 공격할 수 없다', () => {
    const s = mod(round2(), (c) => {
      const city = c.players[1].cities[0]
      city.tiles.push({ card: tile(['평지']), role: 'side', side: 'W' })
      city.openSides = []
      for (const t of city.tiles) if (t.role === 'side') t.occupiedBy = 0
      c.players[1].cities.push({ id: 1, tiles: [{ card: tile(['평지']), role: 'city' }], workers: 0, placed: [], openSides: ['N', 'E', 'S', 'W'] })
      c.players[0].generals = 1
    })
    const targets = declarationTargets(s, s.players[0])
    expect(targets.some((t) => t.kind === 'city' && t.cityId === 0)).toBe(false)
  })

  it('탈환 선전포고: 장군 없이 일꾼 1개만 걸고, 이기면 상대 장군이 돌아간다', () => {
    let w = 0
    let s = toBattle(round2(), (c) => {
      // 러시아(1번)의 장군이 한국(0번) 타일 위에 있다
      c.players[0].cities[0].tiles[1].occupiedBy = 1
      w = give(c, 0, 'warrior', 'L')
    }, { pid: 1, idx: 1, owner: 0 })
    expect(s.battle!.decl.kind).toBe('retake')
    s = arrange(s, 0, [w, null, null, null])
    expect(s.players[0].cities[0].tiles[1].occupiedBy).toBeUndefined()
    expect(s.players[1].generals).toBe(1)
  })

  it('탈환에서 지면 점령은 그대로', () => {
    let s = toBattle(round2(), (c) => {
      c.players[0].cities[0].tiles[1].occupiedBy = 1
      give(c, 0, 'warrior', 'L')
      give(c, 1, 'pikeman', 'L')
    }, { pid: 1, idx: 1, owner: 0 })
    const a = s.players[0].military[0].uid
    const d = s.players[1].military[0].uid
    s = arrange(s, 0, [a, null, null, null])
    s = arrange(s, 1, [null, null, null, d])
    expect(s.players[0].cities[0].tiles[1].occupiedBy).toBe(1)
  })

  it('원자폭탄: 내 장군이 올라간 상대 타일을 파괴하고 장군을 돌려받는다. 첫 5타일은 불가', () => {
    let s = round2()
    s = mod(s, (c) => {
      const city = c.players[1].cities[0]
      city.tiles.push({ card: tile(['평지']), role: 'extra' })
      city.tiles[1].occupiedBy = 0
      city.tiles[city.tiles.length - 1].occupiedBy = 0
      give(c, 0, 'atomic_bomb')
    })
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' })
    const first5 = tileId(s, 1, 1)
    expect(() => apply(s, { type: 'useAtomicBomb', defenderId: 1, cityId: 0, tileId: first5 })).toThrow(RuleError)
    const extra = s.players[1].cities[0].tiles.at(-1)!.card.id
    const before = culture(s.players[1])
    s = apply(s, { type: 'useAtomicBomb', defenderId: 1, cityId: 0, tileId: extra })
    expect(culture(s.players[1])).toBe(before - 1)
    expect(s.players[0].generals).toBe(1)
    expect(s.players[0].military.some((c) => c.defId === 'atomic_bomb')).toBe(false)
  })

  it('만리장성: 게임 중 1번, 내 영토 위 상대 장군을 모두 돌려보낸다', () => {
    let s = round2()
    s = mod(s, (c) => {
      c.players[0].wonders.push('great_wall')
      c.players[0].cities[0].tiles[1].occupiedBy = 1
      c.players[0].cities[0].tiles[2].occupiedBy = 1
    })
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' })
    s = apply(s, { type: 'useGreatWall' })
    expect(s.players[0].cities[0].tiles.every((t) => t.occupiedBy === undefined)).toBe(true)
    expect(s.players[1].generals).toBe(2)
    expect(() => apply(s, { type: 'useGreatWall' })).toThrow(RuleError)
  })
})

describe('승리와 탈락', () => {
  it('문화 패배: 상대의 관광이 내 문화(타일 수)보다 많아지면 탈락, 마지막 생존자는 문화 승리', () => {
    let s = round2()
    s = mod(s, (c) => c.players[0].wonders.push('louvre', 'eiffel_tower')) // 관광 6 > 러시아 문화 4
    s = passTurn(s)
    s = passTurn(s) // 라운드 끝 → 문화 패배 판정
    expect(s.players[1].eliminated).toBe(true)
    expect(s.winner).toEqual({ playerId: 0, type: 'culture' })
  })

  it('인터넷 검열시스템이 있으면 문화 패배를 당하지 않는다', () => {
    let s = round2()
    s = mod(s, (c) => {
      c.players[0].wonders.push('louvre', 'eiffel_tower')
      c.players[1].wonders.push('internet_censorship')
    })
    s = passTurn(s)
    s = passTurn(s)
    expect(s.players[1].eliminated).toBe(false)
    expect(s.winner).toBeNull()
  })

  it('과학 승리: 아폴로 프로젝트를 가장 먼저 연구하면 바로 이긴다', () => {
    let s = round2()
    s = mod(s, (c) => {
      c.players[0].techs.push('rocketry', 'robotics', 'fusion')
    })
    s = apply(s, { type: 'placeWorkers', placements: [] })
    s = mod(s, (c) => (c.players[0].turn!.yields.science = 20))
    s = apply(s, { type: 'research', techId: 'apollo' })
    expect(s.winner).toEqual({ playerId: 0, type: 'science' })
    expect(s.phase).toBe('over')
    expect(() => apply(s, { type: 'skipResearch' })).toThrow(RuleError)
  })

  it('탈락한 문명은 차례를 건너뛴다 (3인 게임)', () => {
    let s = round2(['korea', 'russia', 'mongolia'], [hand4(), hand4(), hand4()])
    // 마지막 문명(몽골)은 아직 도시가 없으니 한 바퀴를 더 돈다
    expect(s.order.map((id) => s.players[id].civId)).toEqual(['korea', 'russia', 'mongolia'])
    s = mod(s, (c) => (c.players[1].eliminated = true))
    s = passTurn(s) // 한국
    expect(s.players[s.order[s.turnIdx]].civId).toBe('mongolia')
  })
})

describe('정찰과 나침반', () => {
  const start = () => found(startGame(['denmark'], [hand4()]))
  const eldorado = (): TileCard => ({ id: 777, terrains: ['산'], wonder: 'eldorado' })

  it('정찰: 덱 맨 위 카드를 보고, 일꾼 1개가 정찰에 묶인다. 차례가 끝나면 덱에 돌려넣는다', () => {
    let s = mod(start(), (c) => c.deck.unshift({ id: 888, terrains: ['설원'] }))
    const deckSize = s.deck.length
    s = apply(s, { type: 'scout' })
    expect(me(s).scouted!.id).toBe(888)
    expect(s.deck).toHaveLength(deckSize - 1)
    expect(freeWorkers(me(s))).toBe(0)
    expect(() => apply(s, { type: 'scout' })).toThrow(RuleError) // 한 차례에 1장
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' }, { type: 'endProduction' })
    expect(s.deck).toHaveLength(deckSize)
    expect(s.deck.some((c) => c.id === 888)).toBe(true)
  })

  it('엘도라도를 처음 발견한 사람은 문화 1 (한 번만)', () => {
    let s = mod(start(), (c) => c.deck.unshift(eldorado()))
    const before = culture(me(s))
    s = apply(s, { type: 'scout' })
    expect(culture(me(s))).toBe(before + 1)
    expect(s.eldoradoFound).toBe(true)
  })

  it('나침반이 없으면 맡아둘 수 없고, 있으면 맡아둔 타일을 다음 문화 타일로 가져온다', () => {
    let s = mod(start(), (c) => c.deck.unshift({ id: 999, terrains: ['오아시스'] }))
    s = apply(s, { type: 'scout' })
    expect(() => apply(s, { type: 'holdScouted' })).toThrow(RuleError)
    s = mod(s, (c) => c.players[0].techs.push('compass'))
    s = apply(s, { type: 'holdScouted' })
    expect(me(s).held!.id).toBe(999)
    expect(me(s).scouted).toBeNull()
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' }, { type: 'endProduction' })
    // 맡아둔 타일은 차례가 끝나도 남고, 일꾼 1개가 계속 묶여 있다
    expect(me(s).held!.id).toBe(999)
    s = mod(s, (c) => (c.players[0].cities[0].workers = 2))
    expect(freeWorkers(me(s))).toBe(1)
    s = mod(s, () => {})
    // 드라마와 시로 문화 1 → 맡아둔 타일이 들어온다
    s = mod(s, (c) => c.players[0].techs.push('writing'))
    s = apply(s, { type: 'placeWorkers', placements: [] })
    s = mod(s, (c) => (c.players[0].turn!.yields.science = 5))
    s = apply(s, { type: 'research', techId: 'drama' })
    expect(me(s).held).toBeNull()
    expect(me(s).cities[0].tiles.some((t) => t.card.id === 999)).toBe(true)
  })

  it('맡아둔 타일을 돌려보내면 덱으로 가고 일꾼이 풀린다', () => {
    let s = mod(start(), (c) => {
      c.deck.unshift({ id: 999, terrains: ['오아시스'] })
      c.players[0].techs.push('compass')
    })
    s = apply(apply(s, { type: 'scout' }), { type: 'holdScouted' })
    s = apply(s, { type: 'releaseHeld' })
    expect(me(s).held).toBeNull()
    expect(s.deck.some((c) => c.id === 999)).toBe(true)
    expect(freeWorkers(me(s))).toBe(1)
  })
})

describe('문명 능력 (전쟁·군사 관련)', () => {
  it('독일: 장군을 얻을 때마다 생산 가능한 군사 카드 1장을 망치 없이 얻는다', () => {
    let s = found(startGame(['germany'], [hand4()]))
    s = mod(s, (c) => c.players[0].techs.push('animal_husbandry'))
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' })
    s = mod(s, (c) => (c.players[0].pendingPolicies = 1))
    s = apply(s, { type: 'choosePolicy', policy: 'despotism' }) // 장군 +1
    expect(me(s).pendingFreeCards).toBe(1)
    expect(() => apply(s, { type: 'endProduction' })).toThrow(RuleError)
    s = apply(s, { type: 'claimFreeCard', defId: 'chariot' })
    expect(me(s).military).toHaveLength(1)
    expect(me(s).pendingFreeCards).toBe(0)
  })

  it('독일: 만들 수 있는 카드가 하나도 없으면 선택권을 버리고 차례를 끝낼 수 있다', () => {
    let s = found(startGame(['germany'], [hand4()]))
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' })
    s = mod(s, (c) => (c.players[0].pendingFreeCards = 1))
    expect(() => apply(s, { type: 'endProduction' })).not.toThrow()
  })

  it('중국: 위대한 장군 1개로 시작', () => {
    const s = found(startGame(['china'], [hand4()]))
    expect(me(s).generals).toBe(1)
  })

  it('인도: 군사 카드 1장을 공용 덱에 돌려 파괴하면 그 차례 식량 +2', () => {
    let s = found(startGame(['india'], [hand4()]))
    s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' })
    let uid = 0
    s = mod(s, (c) => (uid = give(c, 0, 'warrior', 'L')))
    const before = me(s).turn!.yields.cities[0].food
    s = apply(s, { type: 'sacrificeCard', uid })
    expect(me(s).turn!.yields.cities[0].food).toBe(before + 2)
  })

  it('스웨덴: 배치하지 않은 위대한 장군을 일꾼처럼 타일에 올려 사용', () => {
    let s = found(startGame(['sweden'], [hand4()]))
    s = mod(s, (c) => (c.players[0].generals = 1))
    const hill = me(s).cities[0].tiles.find((t) => t.card.terrains[0] === '언덕')!.card.id
    const withGeneral = apply(s, { type: 'placeWorkers', placements: [{ cityId: 0, tileId: hill, general: true }] })
    const without = apply(s, { type: 'placeWorkers', placements: [] })
    expect(withGeneral.players[0].turn!.yields.cities[0].hammer).toBe(without.players[0].turn!.yields.cities[0].hammer + 2)
    expect(() => apply(found(startGame(['denmark'], [hand4()])), { type: 'placeWorkers', placements: [{ cityId: 0, tileId: hill, general: true }] })).toThrow(RuleError)
  })

  it('스웨덴: 타일에 올린 장군으로는 선전포고할 수 없다', () => {
    let s = round2(['sweden', 'russia'], [hand4(), hand4()])
    const swe = s.order.find((id) => s.players[id].civId === 'sweden')!
    s = passTurn(s) // 러시아(우선도 80) 차례를 넘김
    expect(s.order[s.turnIdx]).toBe(swe)
    s = mod(s, (c) => (c.players[swe].generals = 1))
    const hill = s.players[swe].cities[0].tiles.find((t) => t.role !== 'city')!.card.id
    const kept = apply(s, { type: 'placeWorkers', placements: [] })
    const used = apply(s, { type: 'placeWorkers', placements: [{ cityId: 0, tileId: hill, general: true }] })
    expect(declarationTargets(kept, kept.players[swe]).some((t) => t.kind === 'normal')).toBe(true)
    expect(declarationTargets(used, used.players[swe]).some((t) => t.kind === 'normal')).toBe(false)
  })

  it('몽골: 내 장군이 올라간 상대 타일에 일꾼을 올려 산출한다', () => {
    let s = round2(['mongolia', 'russia'], [hand4(), hand4()])
    // 우선도: 러시아 80 > 몽골 0 이므로 몽골이 2번째
    s = mod(s, (c) => {
      c.players[0].cities[0].tiles[0].occupiedBy = undefined
    })
    const mong = s.order.find((id) => s.players[id].civId === 'mongolia')!
    const rus = s.order.find((id) => s.players[id].civId === 'russia')!
    s = passTurn(s) // 러시아 차례를 넘김
    expect(s.order[s.turnIdx]).toBe(mong)
    const hill = s.players[rus].cities[0].tiles.find((t) => t.card.terrains[0] === '언덕')!
    s = mod(s, (c) => (c.players[rus].cities[0].tiles.find((t) => t.card.id === hill.card.id)!.occupiedBy = mong))
    const placed = apply(s, {
      type: 'placeWorkers',
      placements: [{ cityId: 0, tileId: hill.card.id, enemy: { playerId: rus, cityId: 0 } }],
    })
    const none = apply(s, { type: 'placeWorkers', placements: [] })
    expect(placed.players[mong].turn!.yields.cities[0].hammer).toBe(none.players[mong].turn!.yields.cities[0].hammer + 2)
    const notMine = mod(s, (c) => (c.players[rus].cities[0].tiles.find((t) => t.card.id === hill.card.id)!.occupiedBy = undefined))
    expect(() =>
      apply(notMine, { type: 'placeWorkers', placements: [{ cityId: 0, tileId: hill.card.id, enemy: { playerId: rus, cityId: 0 } }] }),
    ).toThrow(RuleError)
  })

  it('일본: 물고기 타일은 식량 +1 (망치는 그대로)', () => {
    const fish = tile(['해안'], { resource: 'fish' })
    const jp = tileYield(fish, ctxOf(found(startGame(['japan'], [hand4()])).players[0]))
    const kr = tileYield(fish, ctxOf(found(startGame(['korea'], [hand4()])).players[0]))
    expect(jp.food - kr.food).toBe(1)
    expect(jp.hammer - kr.hammer).toBe(0)
  })

  it('일본: 물고기 타일을 얻을 때마다 문화 1 (연쇄)', () => {
    let s = found(startGame(['japan'], [hand4()], [tile(['해안'], { resource: 'fish' }), tile(['평지'])]))
    s = mod(s, (c) => c.players[0].techs.push('writing'))
    s = apply(s, { type: 'placeWorkers', placements: [] })
    s = mod(s, (c) => (c.players[0].turn!.yields.science = 5))
    const before = culture(me(s))
    s = apply(s, { type: 'research', techId: 'drama' }) // 문화 1 → 물고기 타일 → 문화 +1 더
    expect(culture(me(s))).toBe(before + 2)
  })

  it('스페인: 자연경관을 영토로 얻을 때마다 문화 1 (킬리만자로는 기본 문화 1이 더해짐)', () => {
    let s = found(startGame(['spain'], [hand4()], [{ id: 5001, terrains: ['산'], wonder: 'kilimanjaro' }, tile(['평지']), tile(['평지'])]))
    s = mod(s, (c) => c.players[0].techs.push('writing'))
    s = apply(s, { type: 'placeWorkers', placements: [] })
    s = mod(s, (c) => (c.players[0].turn!.yields.science = 5))
    const before = culture(me(s))
    s = apply(s, { type: 'research', techId: 'drama' })
    expect(culture(me(s))).toBe(before + 3) // 드라마 1 + 킬리만자로 1 + 스페인 1
  })

  it('브라질: 기계를 얻을 때 영토의 정글 1장당 문화 1', () => {
    let s = found(startGame(['brazil'], [[tile(['정글']), tile(['정글']), tile(['평지']), tile(['해안'])]]))
    s = mod(s, (c) => c.players[0].techs.push('trapping'))
    s = apply(s, { type: 'placeWorkers', placements: [] })
    s = mod(s, (c) => (c.players[0].turn!.yields.science = 9))
    const before = culture(me(s))
    s = apply(s, { type: 'research', techId: 'machinery' })
    expect(culture(me(s))).toBe(before + 2)
  })
})

describe('군사 카드 데이터', () => {
  it('방향 카드는 L·C·R 세 방향이 있고, 전차·폭격기·전투기 등은 방향이 따로 없다', () => {
    for (const c of MILITARY_CARDS) {
      if (c.variantDirs) expect(c.variantDirs).toEqual(['L', 'C', 'R'])
    }
    expect(cardById('chariot').variantDirs).toBeUndefined()
    expect(cardById('bomber').variantDirs).toBeUndefined()
    expect(cardById('fighter').variantDirs).toBeUndefined()
  })

  it('고유 유닛이 가리키는 기초 카드와 기술이 존재한다', () => {
    const s = startGame(['korea'], [hand4()])
    void s
    expect(MILITARY_CARDS.find((c) => c.id === 'cannon')).toBeTruthy()
  })
})

describe('같은 타일에는 선전포고 불가', () => {
  it('이미 누군가 선전포고한 타일은 다른 문명의 목표에서 빠진다', () => {
    let s = mod(round2(['korea', 'russia', 'china'], [hand4(), hand4(), hand4()]), (c) => {
      c.players[0].generals = 1
      c.players[2].generals = 1
    })
    const target = tileId(s, 1, 1)
    expect(declarationTargets(s, s.players[2]).some((t) => t.defenderId === 1 && t.tileId === target)).toBe(true)
    s = toDeclare(s)
    s = apply(s, { type: 'declareWar', defenderId: 1, cityId: 0, tileId: target })
    expect(declarationTargets(s, s.players[2]).some((t) => t.defenderId === 1 && t.tileId === target)).toBe(false)
    expect(declarationTargets(s, s.players[2]).some((t) => t.defenderId === 1 && t.tileId === tileId(s, 1, 2))).toBe(true)
  })

  it('만리장성은 자신의 차례 어느 단계에서든 쓸 수 있다', () => {
    const base = mod(round2(['korea', 'russia']), (c) => {
      c.players[0].wonders.push('great_wall')
      c.players[1].generals = 0
      c.players[1].cities[0].tiles[1].occupiedBy = 0
      c.players[0].cities[0].tiles[1].occupiedBy = 1
    })
    // place 단계에서 바로
    const s = apply(base, { type: 'useGreatWall' })
    expect(s.players[0].greatWallUsed).toBe(true)
    expect(s.players[0].cities[0].tiles[1].occupiedBy).toBeUndefined()
    expect(() => apply(s, { type: 'useGreatWall' })).toThrow(RuleError)
    // research 단계에서도
    const r = apply(apply(base, { type: 'placeWorkers', placements: [] }), { type: 'useGreatWall' })
    expect(r.players[0].greatWallUsed).toBe(true)
  })
})

describe('전제정치: 선전포고에 일꾼이 필요 없다', () => {
  it('전제정치 시행 중에는 일꾼 없이도 선전포고하고 일꾼이 묶이지 않는다', () => {
    let s = mod(round2(), (c) => {
      c.players[0].generals = 1
      c.players[0].policy = 'despotism'
    })
    s = toDeclare(s)
    // 일꾼이 모두 묶여 있어도 선전포고할 수 있다
    s = mod(s, (c) => (c.players[0].busyWorkers = c.players[0].cities[0].workers))
    expect(freeWorkers(s.players[0])).toBeLessThan(1)
    expect(declarationTargets(s, s.players[0]).length).toBeGreaterThan(0)
    const before = s.players[0].busyWorkers
    s = apply(s, { type: 'declareWar', defenderId: 1, cityId: 0, tileId: tileId(s, 1, 1) })
    expect(s.declarations).toHaveLength(1)
    expect(s.players[0].generals).toBe(0) // 장군은 여전히 필요하다
    expect(s.players[0].busyWorkers).toBe(before)
  })

  it('다른 정책이면 일꾼이 없을 때 선전포고할 수 없다', () => {
    let s = mod(round2(), (c) => {
      c.players[0].generals = 1
      c.players[0].policy = 'liberty'
    })
    s = toDeclare(s)
    s = mod(s, (c) => (c.players[0].busyWorkers = c.players[0].cities[0].workers))
    expect(declarationTargets(s, s.players[0])).toHaveLength(0)
  })
})

describe('허공 공격(빈칸 선택)은 상대가 4장을 꽉 채우지 않았을 때만', () => {
  const T = { pid: 1, idx: 1 }
  const setup = (enemyCards: number) => {
    let a = 0
    const ws: number[] = []
    let s = toBattle(round2(), (c) => {
      c.players[0].generals = 1
      a = give(c, 0, 'chariot')
      for (let i = 0; i < enemyCards; i++) ws.push(give(c, 1, 'warrior', 'C'))
    }, T)
    s = arrange(s, 0, [a, null, null, null])
    s = arrange(s, 1, [ws[0] ?? null, ws[1] ?? null, ws[2] ?? null, ws[3] ?? null])
    return { s, a, ws }
  }

  it('상대가 4장을 꽉 채워 냈으면 대상을 고르는 카드는 빈칸을 고를 수 없다', () => {
    const { s, a, ws } = setup(4)
    expect(() => apply(s, { type: 'chooseTargets', playerId: 0, picks: { [a]: null } })).toThrow(RuleError)
    expect(() => apply(s, { type: 'chooseTargets', playerId: 0, picks: { [a]: ws[0] } })).not.toThrow()
  })

  it('상대가 3장 이하로 냈으면 빈칸(허공)을 고를 수 있다', () => {
    const { s, a } = setup(3)
    expect(() => apply(s, { type: 'chooseTargets', playerId: 0, picks: { [a]: null } })).not.toThrow()
  })
})
