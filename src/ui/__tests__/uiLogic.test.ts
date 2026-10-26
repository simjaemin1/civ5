import { describe, expect, it } from 'vitest'
import type { CardInst, GameState } from '../../engine'
import {
  MILITARY_CARDS,
  RuleError,
  actorOf,
  aiStep,
  apply,
  civById,
  createGame,
  declarationTargets,
  findTile,
  culture,
  investableWonders,
  minHammers,
  researchableTechs,
} from '../../engine'
import { autoSkipAction, cityCanProduce, maxSciencePool, sciencePlan } from '../autoSkip'
import { plannedAttacks } from '../battleView'
import { declTileName, produceBlock, revealsInfo, roundBids } from '../gameInfo'
import { josa } from '../format'

/** 화면 판단이 엔진과 맞는지 보려고, AI끼리 게임을 진행하며 매 상태를 넘겨준다 */
function walk(seed: number, civs: string[], steps: number, visit: (s: GameState) => void): void {
  let s = createGame({ seed, civIds: civs })
  for (let i = 0; i < steps && s.phase !== 'over'; i++) {
    visit(s)
    s = aiStep(s).state
  }
}

const ok = (s: GameState, a: Parameters<typeof apply>[1]): boolean => {
  try {
    apply(s, a)
    return true
  } catch (e) {
    if (!(e instanceof RuleError)) throw e
    return false
  }
}

const CIVS_A = ['korea', 'netherlands', 'egypt', 'england']
const CIVS_B = ['ottoman', 'russia', 'germany', 'zulu']

describe('전투 배치 미리보기', () => {
  const card = (defId: string, dirs: ('L' | 'C' | 'R')[]): CardInst => ({ uid: 1, defId, dirs })
  it('마주 보는 자리: 내 2번은 가운데 3번, 왼쪽 4번, 오른쪽 2번 (규칙서 10장 예)', () => {
    expect(plannedAttacks(card('warrior', ['C']), 2)[0].enemySlot).toBe(3)
    expect(plannedAttacks(card('warrior', ['L']), 2)[0].enemySlot).toBe(4)
    expect(plannedAttacks(card('warrior', ['R']), 2)[0].enemySlot).toBe(2)
  })
  it('끝자리에서 바깥을 향하면 빈 공간', () => {
    expect(plannedAttacks(card('warrior', ['L']), 1)[0].enemySlot).toBeNull()
    expect(plannedAttacks(card('warrior', ['R']), 4)[0].enemySlot).toBeNull()
  })
  it('대상을 고르는 카드는 공개 후에 정한다', () => {
    const chariot = MILITARY_CARDS.find((c) => c.attack)!
    expect(plannedAttacks({ uid: 1, defId: chariot.id }, 1)[0].dir).toBe('choose')
  })
})

describe('조사', () => {
  it('받침에 맞춰 붙인다', () => {
    expect(josa('러시아', '이', '가')).toBe('러시아가')
    expect(josa('한국', '은', '는')).toBe('한국은')
    expect(josa('기계', '을', '를')).toBe('기계를')
    expect(josa('공공행정', '을', '를')).toBe('공공행정을')
  })
})

describe('불가사의 이번 라운드 순위', () => {
  it('최다 투자자가 둘 이상이면 공동 1위', () => {
    const s = createGame({ seed: 1, civIds: ['korea', 'russia', 'egypt'] })
    s.investments = [
      { wonderId: 'x', playerId: 0, cityId: 0, hammers: 5 },
      { wonderId: 'x', playerId: 1, cityId: 0, hammers: 5 },
      { wonderId: 'x', playerId: 2, cityId: 0, hammers: 3 },
    ]
    expect(roundBids(s, 'x')).toMatchObject({ top: 5, tied: true })
    s.investments.pop()
    s.investments[1].hammers = 4
    expect(roundBids(s, 'x')).toMatchObject({ top: 5, tied: false })
  })
})

describe('화면 판단과 엔진이 맞는지 (AI 게임 진행 중 모든 상태)', () => {
  it('생산 버튼: produceBlock이 null이면 엔진도 허용하고, 아니면 거절한다 (해안 도시 조건 포함)', () => {
    let checked = 0
    for (const [seed, civs] of [[3, CIVS_A], [7, CIVS_B]] as const) {
      walk(seed, [...civs], 2500, (s) => {
        if (s.phase !== 'produce') return
        const p = s.players[actorOf(s)]
        for (const city of p.cities) {
          if (p.turn!.produced.includes(city.id)) continue
          const h = p.turn!.yields.cities.find((c) => c.cityId === city.id)!.hammer
          for (const def of MILITARY_CARDS) {
            const uniques = civById(p.civId).uniques.filter((u) => u.base === def.id).map((u) => u.name)
            for (const u of [...(def.uniqueOnly ? [] : [undefined]), ...uniques]) {
              const block = produceBlock(s, p, def, u, city, h)
              expect(block === null, `${p.civId} ${u ?? def.id} 도시${city.id + 1}: ${block}`).toBe(ok(s, { type: 'produce', cityId: city.id, defId: def.id, unique: u }))
              checked++
            }
          }
        }
      })
    }
    expect(checked).toBeGreaterThan(1000)
  }, 120_000)

  it('해안이 아닌 도시에서는 전함 생산을 막는다 (엔진 producible에는 없는 조건)', () => {
    let s = createGame({ seed: 2, civIds: ['korea', 'russia'] })
    while (s.phase !== 'produce') s = aiStep(s).state
    s = structuredClone(s)
    const p = s.players[actorOf(s)]
    const ship = MILITARY_CARDS.find((c) => c.special === 'coastalOnly' && !c.uniqueOnly)!
    p.techs.push(ship.tech)
    const city = p.cities[0]
    for (const t of city.tiles) t.card = { ...t.card, terrains: t.card.terrains.map((x) => (x === '해안' ? '평지' : x)) }
    p.turn!.yields.cities.find((c) => c.cityId === city.id)!.hammer = 20
    expect(produceBlock(s, p, ship, undefined, city, 20)).toContain('해안')
    expect(ok(s, { type: 'produce', cityId: city.id, defId: ship.id })).toBe(false)
    expect(cityCanProduce(s, p, city.id)).toBe(cityCanProduce(s, { ...p, techs: p.techs.filter((t) => t !== ship.tech) }, city.id))
    // 해안 도시로 바꾸면 만들 수 있다
    city.tiles.find((t) => t.role === 'side')!.card.terrains = ['해안']
    expect(produceBlock(s, p, ship, undefined, city, 20)).toBeNull()
    expect(ok(s, { type: 'produce', cityId: city.id, defId: ship.id })).toBe(true)
  })

  it('남은 망치 경고·자동 넘기기: 도시에서 할 일이 없다고 보면 엔진도 생산·투자를 모두 거절한다', () => {
    walk(5, CIVS_A, 2500, (s) => {
      if (s.phase !== 'produce') return
      const p = s.players[actorOf(s)]
      for (const city of p.cities) {
        if (p.turn!.produced.includes(city.id) || cityCanProduce(s, p, city.id)) continue
        const h = p.turn!.yields.cities.find((c) => c.cityId === city.id)!.hammer
        for (const def of MILITARY_CARDS) expect(ok(s, { type: 'produce', cityId: city.id, defId: def.id })).toBe(false)
        for (const w of investableWonders(s, p, city)) {
          expect(h < minHammers(p, w)).toBe(true)
          expect(ok(s, { type: 'invest', cityId: city.id, wonderId: w.id, hammers: h })).toBe(false)
        }
      }
    })
  }, 120_000)

  it('자동 넘기기가 고르는 행동은 엔진이 받아들인다', () => {
    let skipped = 0
    walk(11, CIVS_B, 2500, (s) => {
      const p = s.players[actorOf(s)]
      const skip = autoSkipAction(s, p)
      if (!skip) return
      expect(ok(s, skip.action), `${s.phase} ${skip.action.type}`).toBe(true)
      skipped++
    })
    expect(skipped).toBeGreaterThan(0)
  }, 120_000)

  it('연구: 화면이 연구할 수 있다고 보는 기술은 변환안으로 실제 연구된다', () => {
    walk(13, CIVS_A, 2500, (s) => {
      if (s.phase !== 'research') return
      const p = s.players[actorOf(s)]
      const pool = maxSciencePool(p)
      for (const t of researchableTechs(s)) {
        const plan = sciencePlan(p, t.cost - p.turn!.yields.science)
        expect(!!plan, `${t.id} 비용 ${t.cost}, 최대 ${pool}`).toBe(pool >= t.cost)
        if (plan) {
          const a = { type: 'research' as const, techId: t.id, foodByCity: p.techs.includes('writing') ? plan.food : undefined, hammerByCity: p.techs.includes('scientific_theory') ? plan.hammer : undefined }
          expect(ok(s, a), t.id).toBe(true)
        }
      }
    })
  }, 120_000)

  it('선전포고: 모든 목표 타일을 화면에서 찾을 수 있고, 탈환 목표 이름이 "?"가 아니다', () => {
    let retakes = 0
    for (const seed of [17, 19]) {
      walk(seed, ['korea', 'russia', 'egypt'], 3000, (s) => {
        for (const d of s.declarations) {
          expect(declTileName(s, d)).not.toBe('?')
          if (d.kind === 'retake') retakes++
        }
        if (s.phase !== 'declare') return
        const p = s.players[actorOf(s)]
        for (const t of declarationTargets(s, p)) {
          const owner = t.kind === 'retake' ? p : s.players[t.defenderId]
          expect(findTile(owner, t.cityId, t.tileId), JSON.stringify(t)).not.toBeNull()
        }
      })
    }
    expect(retakes).toBeGreaterThan(0)
  }, 120_000)

  it('되돌리기 잠금: 무작위 결과·덱 카드를 보여 주는 행동만 잠그고, 고르기만 하는 행동은 잠그지 않는다', () => {
    const seen: Record<string, { locked: number; free: number }> = {}
    for (const seed of [21, 23]) {
      let s = createGame({ seed, civIds: ['germany', 'korea', 'netherlands'] })
      for (let i = 0; i < 2500 && s.phase !== 'over'; i++) {
        const { state, action } = aiStep(s)
        const sameTurn = state.round === s.round && state.turnIdx === s.turnIdx && state.phase !== 'battle'
        if (sameTurn) {
          const r = revealsInfo(s, state)
          const k = action.type === 'produce' ? `produce:${MILITARY_CARDS.find((c) => c.id === action.defId)?.variantDirs || action.unique ? 'random' : 'fixed'}` : action.type
          seen[k] ??= { locked: 0, free: 0 }
          seen[k][r ? 'locked' : 'free']++
          // 고르기만 하는 행동은 절대 잠그지 않는다
          if (['placeWorkers', 'invest', 'skipResearch', 'setChoices', 'holdScouted', 'placeGainedTile', 'recallGeneral'].includes(action.type) || k === 'produce:fixed')
            expect(r, `${k} 잠금`).toBe(action.type === 'placeGainedTile' && culture(state.players[actorOf(s)]) > culture(s.players[actorOf(s)]))
          // 무작위로 방향이 정해지는 생산·정찰은 반드시 잠근다
          if (k === 'produce:random' || action.type === 'scout') expect(r, `${k} 잠금`).toBe(true)
        }
        s = state
      }
    }
    expect(seen['produce:random']?.locked).toBeGreaterThan(0)
    expect(seen['placeWorkers']?.free).toBeGreaterThan(0)
  }, 120_000)
})
