import { describe, expect, it } from 'vitest'
import { apply, cardById, cardStats, CIVS, culture, dirsKey, TECHS, UNIQUES } from '..'
import type { CardInst, GameState, TileCard } from '..'
import { found, play, startGame, tile } from './helpers'

const hand4 = (): TileCard[] => [tile(['평지']), tile(['숲']), tile(['언덕']), tile(['해안'])]
const mod = (s: GameState, fn: (s: GameState) => void) => {
  const c = structuredClone(s)
  fn(c)
  return c
}
const pass = (s: GameState) => {
  const r = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' }, { type: 'endProduction' })
  return r.phase === 'declare' ? apply(r, { type: 'endTurn' }) : r
}
const round2 = (civs: string[]) => {
  let s = startGame(civs, civs.map(() => hand4()))
  for (let i = 0; i < civs.length; i++) s = pass(found(s))
  return s
}
/** 일반 카드를 만들어 준다. dir: 방향 카드의 마크 방향 */
function give(s: GameState, pid: number, defId: string, dir?: 'L' | 'C' | 'R'): number {
  const def = cardById(defId)
  const uid = s.nextUid++
  s.players[pid].military.push({ uid, defId, dirs: def.variantDirs ? [dir ?? def.variantDirs[0]] : undefined })
  return uid
}
/** 고유 유닛을 만들어 준다. key: 방향 조합('C', 'CR') 또는 'x' */
function unique(s: GameState, pid: number, name: string, key: string): number {
  const supply = s.uniqueSupply[name]
  if (supply) supply.splice(supply.indexOf(key), 1) // 게임에 없는 문명의 고유 유닛은 재고가 없다
  const uid = s.nextUid++
  const defId = UNIQUES[name].def.base
  s.players[pid].military.push({ uid, defId, dirs: key === 'x' ? undefined : (key.split('') as ('L' | 'C' | 'R')[]), unique: name })
  return uid
}
/** 0번 문명이 1번 문명 타일 idx에 선전포고하고 정산에서 전투가 시작된 상태 */
function battle(civs: string[], setup: (s: GameState) => void, idx: number, owner = 1): GameState {
  let s = mod(round2(civs), (c) => {
    c.players[0].generals = 1
    setup(c)
  })
  s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' }, { type: 'endProduction' })
  expect(s.phase).toBe('declare')
  s = apply(s, { type: 'declareWar', defenderId: 1, cityId: 0, tileId: s.players[owner].cities[0].tiles[idx].card.id })
  for (let i = 1; i < civs.length; i++) s = pass(s)
  expect(s.phase).toBe('battle')
  return s
}
const arrange = (s: GameState, pid: number, slots: (number | null)[]) => apply(s, { type: 'arrangeBattle', playerId: pid, slots })
const pick = (s: GameState, pid: number, picks: Record<number, number>) => apply(s, { type: 'chooseTargets', playerId: pid, picks })
const alive = (s: GameState, pid: number, uid: number) => s.players[pid].military.some((c) => c.uid === uid)

describe('고유 유닛 데이터', () => {
  it('27종 모두 기초 카드·기술이 있고, 카드는 3장이며 이름이 겹치지 않는다', () => {
    expect(Object.keys(UNIQUES)).toHaveLength(27)
    const techIds = new Set(TECHS.map((t) => t.id))
    for (const [name, { def }] of Object.entries(UNIQUES)) {
      const base = cardById(def.base)
      expect(techIds.has(def.tech ?? base.tech), `${name} 기술`).toBe(true)
      expect(def.hp, name).toBeGreaterThan(0)
      expect(def.cost, name).toBeGreaterThan(0)
      // 전투력 마크가 있는 카드는 방향 조합이 3가지, 그 외는 같은 카드 3장
      if (def.power !== undefined) expect(def.variants ?? [['L'], ['C'], ['R']], name).toHaveLength(3)
    }
    const s = startGame(CIVS.slice(0, 2).map((c) => c.id), [hand4()])
    for (const [name, supply] of Object.entries(s.uniqueSupply)) expect(supply, name).toHaveLength(3)
  })

  it('카드에 적힌 능력치를 쓴다 (장갑보병, 케식텐, 프라싱야, 화차)', () => {
    const st = (name: string) => cardStats({ uid: 0, defId: UNIQUES[name].def.base, unique: name, dirs: ['C'] })
    expect(st('장갑보병')).toMatchObject({ hp: 3, def: 2, marks: [{ dir: 'C', power: 2 }], baseId: 'spearman' })
    expect(st('케식텐')).toMatchObject({ hp: 4, def: 0, choose: 2, noCounter: true, baseId: 'knight' })
    expect(st('프라싱야')).toMatchObject({ hp: 6, def: 3, baseId: 'infantry' })
    expect(st('화차')).toMatchObject({ hp: 2, def: 3, noCounter: true, baseId: 'hwacha' })
    expect(st('제고이센')).toMatchObject({ hp: 6, def: 2, coastalOnly: true })
  })

  it('연노병은 마크가 둘이라 방향 조합 3종(왼+가운데, 왼+오른쪽, 가운데+오른쪽)이 있다', () => {
    const s = startGame(['china'], [hand4()])
    expect([...s.uniqueSupply['연노병']].sort()).toEqual(['CR', 'LC', 'LR'])
    expect(dirsKey(['L', 'C'])).toBe('LC')
  })

  it('방향 마크가 없는 공성추는 같은 카드 3장', () => {
    expect(startGame(['huns'], [hand4()]).uniqueSupply['공성추']).toEqual(['x', 'x', 'x'])
  })
})

describe('고유 유닛 전투 효과', () => {
  it('예니체리: 공격한 대상이 파괴되면 체력 7 — 받은 대미지 6이어도 살아남는다', () => {
    const run = (withArcher: boolean, tanks = 1) => {
      let jan = 0, archer = 0, warrior = 0
      const tankIds: number[] = []
      let s = battle(['russia', 'ottoman'], (c) => {
        jan = unique(c, 1, '예니체리', 'C')
        for (let i = 0; i < tanks; i++) tankIds.push(give(c, 0, 'tank'))
        archer = give(c, 0, 'archer', 'C')
        warrior = give(c, 0, 'warrior', 'L')
      }, 1)
      const slots = [tankIds[0], tankIds[1] ?? null, withArcher ? archer : null, warrior]
      s = arrange(s, 0, slots)
      s = arrange(s, 1, [null, jan, null, null])
      s = pick(s, 0, Object.fromEntries(tankIds.map((t) => [t, jan])))
      return alive(s, 1, jan)
    }
    // 대미지: 전차(4) + 궁수(1) + 전사(1) = 6. 궁수를 공격해 파괴했으므로 체력 7 → 생존
    expect(run(true)).toBe(true)
    // 궁수가 없으면 공격한 대상이 없어 체력 5 → 대미지 5로 파괴
    expect(run(false)).toBe(false)
    // 전차 두 장이면 대미지 10 → 체력 7이어도 파괴
    expect(run(true, 2)).toBe(false)
  })

  it('사무라이: 받은 총 대미지가 3 이상이면 전투력 4 (대미지 결과를 보고 판정)', () => {
    const run = (samurai: boolean) => {
      let jp = 0, pike = 0
      let s = battle(['russia', 'japan'], (c) => {
        jp = samurai ? unique(c, 1, '사무라이', 'C') : give(c, 1, 'longswordsman', 'C')
        pike = give(c, 0, 'pikeman', 'C')
      }, 1)
      s = arrange(s, 0, [null, null, pike, null])
      s = arrange(s, 1, [null, jp, null, null])
      return alive(s, 0, pike)
    }
    // 사무라이는 파이크병의 공격 1 + 반격 3 = 4를 받아 전투력이 4가 되어 체력 3의 파이크병을 파괴
    expect(run(true)).toBe(false)
    // 일반 장검사(전투력 2)는 파이크병을 파괴하지 못한다
    expect(run(false)).toBe(true)
  })

  it('재규어: 공격한 대상이 파괴되면 문화 1', () => {
    const run = (target: 'chariot' | 'warrior') => {
      let jag = 0, t = 0
      let s = battle(['russia', 'aztec'], (c) => {
        jag = unique(c, 1, '재규어', 'C')
        t = give(c, 0, target, 'C')
      }, 1)
      const before = culture(s.players[1])
      s = arrange(s, 0, [null, null, t, null])
      s = arrange(s, 1, [null, jag, null, null])
      if (s.battle) s = pick(s, 0, { [t]: jag })
      return culture(s.players[1]) - before
    }
    expect(run('chariot')).toBe(1) // 체력 1의 전차가 파괴됨
    expect(run('warrior')).toBe(0) // 체력 3의 전사는 살아남음
  })

  it('모호크족 전사: 숲·정글 타일을 대상으로 전투할 때 방어력 +2', () => {
    const run = (idx: number) => {
      let mo = 0, sword = 0
      let s = battle(['russia', 'iroquois'], (c) => {
        mo = unique(c, 1, '모호크족 전사', 'C')
        sword = give(c, 0, 'longswordsman', 'C')
      }, idx)
      s = arrange(s, 0, [null, null, sword, null])
      s = arrange(s, 1, [null, mo, null, null])
      return alive(s, 0, sword)
    }
    expect(run(1)).toBe(false) // 숲: 반격 4 + 공격 1 = 5 ≥ 체력 4
    expect(run(2)).toBe(true) // 언덕: 반격 2 + 공격 1 = 3
  })

  it('불멸자: 받게 되는 최대 반격 대미지를 1으로 만든다', () => {
    const run = (immortal: boolean) => {
      let def = 0, pike = 0, horse = 0
      let s = battle(['russia', 'persia'], (c) => {
        def = immortal ? unique(c, 1, '불멸자', 'C') : give(c, 1, 'musketman', 'C')
        pike = give(c, 0, 'pikeman', 'C')
        horse = give(c, 0, 'horseman')
      }, 1)
      s = arrange(s, 0, [horse, null, pike, null])
      s = arrange(s, 1, [null, def, null, null])
      s = pick(s, 0, { [horse]: def })
      return alive(s, 1, def)
    }
    // 공격 1(파이크병) + 2(기마병) + 반격: 불멸자는 min(3,1)=1 → 4 < 체력 5 생존, 머스킷병은 3 → 6 ≥ 5 파괴
    expect(run(true)).toBe(true)
    expect(run(false)).toBe(false)
  })

  it('투석병사: 자신을 향한 공격 중 1개까지 대미지를 0으로 한다', () => {
    const run = (slinger: boolean, tanks: number) => {
      let def = 0
      const ts: number[] = []
      let s = battle(['russia', 'inca'], (c) => {
        def = slinger ? unique(c, 1, '투석병사', 'C') : give(c, 1, 'archer', 'C')
        for (let i = 0; i < tanks; i++) ts.push(give(c, 0, 'tank'))
      }, 1)
      s = arrange(s, 0, [ts[0], ts[1] ?? null, null, null])
      s = arrange(s, 1, [null, def, null, null])
      s = pick(s, 0, Object.fromEntries(ts.map((t) => [t, def])))
      return alive(s, 1, def)
    }
    expect(run(true, 1)).toBe(true) // 전차 한 번(4)이 0이 된다
    expect(run(true, 2)).toBe(false) // 두 번째 공격은 막지 못한다
    expect(run(false, 1)).toBe(false) // 일반 궁수는 파괴
  })

  it('테르시오: 기사·기병대가 아닌 상대에게는 전투력 2, 방어력 1', () => {
    // 낙타궁수(기사 취급, 체력 3)는 전투력 3에 파괴되고, 기마병(체력 3)은 전투력 2라 산다
    const attackedBy = (name: 'knight' | 'horse') => {
      let tercio = 0, a = 0, dummy = 0
      let s = battle(['russia', 'spain'], (c) => {
        tercio = unique(c, 1, '테르시오', 'C')
        a = name === 'knight' ? unique(c, 0, '낙타궁수', 'x') : give(c, 0, 'horseman')
        dummy = give(c, 1, 'warrior', 'C')
      }, 1)
      s = arrange(s, 0, [null, null, a, null])
      s = arrange(s, 1, [null, tercio, null, dummy])
      s = pick(s, 0, { [a]: dummy }) // 테르시오가 아닌 카드를 공격해 반격을 받지 않게 한다
      return alive(s, 0, a)
    }
    expect(attackedBy('knight')).toBe(false)
    expect(attackedBy('horse')).toBe(true)

    // 반격 대미지(방어력): 기병대는 5, 전차(탱크)는 1
    const counter = (name: 'cavalry' | 'tank') => {
      let tercio = 0, a = 0
      let s = battle(['russia', 'spain'], (c) => {
        tercio = unique(c, 1, '테르시오', 'R') // 4번 자리의 오른쪽 마크는 범위 밖 → 공격하지 않음
        a = give(c, 0, name)
      }, 1)
      s = arrange(s, 0, [a, null, null, null])
      s = arrange(s, 1, [null, null, null, tercio])
      s = pick(s, 0, { [a]: tercio })
      return alive(s, 0, a)
    }
    expect(counter('cavalry')).toBe(false) // 반격 5 ≥ 체력 5
    expect(counter('tank')).toBe(true) // 반격 1
  })

  it('임피: 상대 카드의 효과 칸 공격(대상 선택)을 없앤다', () => {
    const run = (impi: boolean) => {
      let guard = 0, victim = 0, tank = 0
      let s = battle(['zulu', 'mongolia'], (c) => {
        guard = impi ? unique(c, 0, '임피', 'C') : give(c, 0, 'pikeman', 'C')
        victim = give(c, 0, 'warrior', 'L')
        tank = give(c, 1, 'tank')
      }, 1)
      s = arrange(s, 0, [guard, victim, null, null])
      s = arrange(s, 1, [tank, null, null, null])
      if (impi) expect(s.battle).toBeNull() // 대상을 고를 카드가 없어 바로 전투가 끝난다
      else s = pick(s, 1, { [tank]: victim })
      return alive(s, 0, victim)
    }
    expect(run(true)).toBe(true)
    expect(run(false)).toBe(false) // 전차가 전사(체력 3)를 공격해 파괴
  })

  it('스키 보병: 툰드라·설원·언덕 타일을 대상으로 전투할 때 전투력 +2, 체력 +2', () => {
    const run = (idx: number) => {
      // 석궁병(체력 4, 반격 없음)이 스키 보병을 공격: 스키 보병의 반격이 없어 전투력만 비교할 수 있다
      let ski = 0, horse = 0, xbow = 0
      let s = battle(['denmark', 'mongolia'], (c) => {
        ski = unique(c, 0, '스키 보병', 'C')
        horse = give(c, 1, 'horseman')
        xbow = give(c, 1, 'crossbowman', 'C')
      }, idx)
      s = arrange(s, 0, [null, ski, null, null])
      s = arrange(s, 1, [horse, null, xbow, null])
      s = pick(s, 1, { [horse]: ski })
      return { skiAlive: alive(s, 0, ski), xbowAlive: alive(s, 1, xbow) }
    }
    // 스키 보병이 받는 대미지: 기마병 2 + 석궁병 2 + (석궁병을 공격해 받는 반격 = 석궁병 방어력 2) = 6
    expect(run(2)).toEqual({ skiAlive: true, xbowAlive: false }) // 언덕: 체력 7 생존, 전투력 4로 석궁병(체력 4) 파괴
    expect(run(1)).toEqual({ skiAlive: false, xbowAlive: true }) // 숲: 체력 5 파괴, 전투력 2
  })

  it('캐롤리언: 원래 상대 소유의 타일을 대상으로 전투할 때 체력 +1', () => {
    const run = (civs: string[]) => {
      let car = 0, tank = 0, warrior = 0
      const sweden = civs.indexOf('sweden')
      const other = 1 - sweden
      let s = battle(civs, (c) => {
        car = unique(c, sweden, '캐롤리언', 'C')
        tank = give(c, other, 'tank')
        warrior = give(c, other, 'warrior', 'C')
      }, 1)
      const slots = (pid: number, cards: (number | null)[]) => arrange(s, pid, cards)
      if (sweden === 0) {
        s = slots(0, [null, car, null, null])
        s = arrange(s, 1, [tank, null, warrior, null])
        s = pick(s, 1, { [tank]: car })
      } else {
        s = slots(0, [tank, null, warrior, null])
        s = arrange(s, 1, [null, car, null, null])
        s = pick(s, 0, { [tank]: car })
      }
      return alive(s, sweden, car)
    }
    expect(run(['sweden', 'zulu'])).toBe(true) // 상대 타일을 공격: 체력 6, 대미지 5
    expect(run(['russia', 'sweden'])).toBe(false) // 자기 타일을 방어: 체력 5, 대미지 5
  })

  it('화차: 원래 자기 소유의 타일을 대상으로 전투할 때 체력 +2', () => {
    const attackOpp = () => {
      let hw = 0, horse = 0, warrior = 0
      let s = battle(['korea', 'russia'], (c) => {
        hw = unique(c, 0, '화차', 'C')
        horse = give(c, 1, 'horseman')
        warrior = give(c, 1, 'warrior', 'C')
      }, 1)
      s = arrange(s, 0, [null, hw, null, null])
      s = arrange(s, 1, [horse, null, warrior, null])
      s = pick(s, 1, { [horse]: hw })
      return alive(s, 0, hw)
    }
    const retake = () => {
      let hw = 0, horse = 0, warrior = 0
      let s = mod(round2(['korea', 'russia']), (c) => {
        c.players[0].cities[0].tiles[1].occupiedBy = 1 // 러시아가 한국 타일을 점령 중
        hw = unique(c, 0, '화차', 'C')
        horse = give(c, 1, 'horseman')
        warrior = give(c, 1, 'warrior', 'C')
      })
      s = play(s, { type: 'placeWorkers', placements: [] }, { type: 'skipResearch' }, { type: 'endProduction' })
      s = apply(s, { type: 'declareWar', defenderId: 1, cityId: 0, tileId: s.players[0].cities[0].tiles[1].card.id })
      s = pass(s)
      s = arrange(s, 0, [null, hw, null, null])
      s = arrange(s, 1, [horse, null, warrior, null])
      s = pick(s, 1, { [horse]: hw })
      return alive(s, 0, hw)
    }
    expect(attackOpp()).toBe(false) // 체력 2에 대미지 3
    expect(retake()).toBe(true) // 원래 내 타일: 체력 4
  })

  it('연노병: 마크가 둘이라 두 방향을 동시에 공격하고 반격을 받지 않는다', () => {
    let cb = 0, c1 = 0, c2 = 0
    let s = battle(['china', 'mongolia'], (c) => {
      cb = unique(c, 0, '연노병', 'CR') // 2번 자리: 가운데 → 상대 3번, 오른쪽 → 상대 2번
      c1 = give(c, 1, 'chariot')
      c2 = give(c, 1, 'chariot')
    }, 1)
    s = arrange(s, 0, [null, cb, null, null])
    s = arrange(s, 1, [null, c1, c2, null])
    s = pick(s, 1, { [c1]: cb, [c2]: cb })
    expect(alive(s, 1, c1)).toBe(false)
    expect(alive(s, 1, c2)).toBe(false)
    expect(alive(s, 0, cb)).toBe(true)
  })

  it('공성추: 공격하지 않지만 이기면 도시를 파괴한다', () => {
    let ram = 0
    let s = battle(['huns', 'mongolia'], (c) => {
      const city = c.players[1].cities[0]
      city.tiles.push({ card: tile(['평지']), role: 'side', side: 'W' })
      city.openSides = []
      for (const t of city.tiles) if (t.role === 'side') t.occupiedBy = 0
      ram = unique(c, 0, '공성추', 'x')
    }, 0)
    expect(s.battle!.decl.kind).toBe('city')
    s = arrange(s, 0, [ram, null, null, null])
    expect(s.players[1].eliminated).toBe(true)
    expect(s.winner).toEqual({ playerId: 0, type: 'conquest' })
  })
})

describe('고유 유닛 선택 효과 (코사크 등)', () => {
  it('고유 유닛 카드 정보가 화면에 보일 문구를 가진다', () => {
    const withText = Object.entries(UNIQUES).filter(([, { def }]) => def.effect)
    expect(withText.length).toBeGreaterThanOrEqual(11)
    for (const [name, { def }] of withText) expect(def.text, name).toBeTruthy()
    const inst: CardInst = { uid: 1, defId: 'cavalry', unique: '코사크' }
    expect(cardStats(inst)).toMatchObject({ lateTarget: true, choose: 3, hp: 5, def: 2 })
  })
})
