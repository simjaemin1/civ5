import type { GameState, Player } from './types'
import { RuleError } from './types'
import { POLICIES, civById } from './data'
import type { PolicyId } from './data'
import { gainCulture, say } from './core'
import { happiness, totalWorkers } from './yields'
import { gainGeneral } from './military'

/** 체제 정책으로 얻는 일꾼 수 (행복 한도 안에서) */
export const REGIME_WORKERS = 4

export function choosePolicy(
  s: GameState,
  p: Player,
  policy: PolicyId,
  discard: { cityId: number; count: number }[] = [],
  dismiss?: { cityId: number; tileId: number },
  addWorkers?: { cityId: number; count: number }[],
): void {
  if (p.pendingPolicies <= 0) throw new RuleError('고를 수 있는 정책 선택권이 없습니다')
  p.pendingPolicies--
  p.policyPicks = (p.policyPicks ?? 0) + 1
  p.policy = policy // 새 정책을 고르면 기존 정책은 끝난다 (같은 정책을 다시 골라도 효과가 다시 발동)
  const name = civById(p.civId).name
  say(s, `${name} 정책: ${POLICIES[policy].name}`)
  const turn = p.turn!
  switch (policy) {
    case 'tradition': {
      turn.skipFoodSettle = true
      const total = discard.reduce((n, d) => n + d.count, 0)
      if (total > 0) {
        if (total !== 3) throw new RuleError('일꾼은 정확히 3개를 골라 버려야 합니다')
        for (const d of discard) {
          const city = p.cities.find((c) => c.id === d.cityId)
          if (!city || d.count > city.workers) throw new RuleError('버릴 일꾼이 모자랍니다')
        }
        // 이미 타일에서 일한 일꾼부터 버린다. 쉬고 있는 일꾼(선전포고에 남겨 둔 일꾼)은 맨 나중에 버린다
        for (const d of discard) {
          const city = p.cities.find((c) => c.id === d.cityId)!
          const retired = (turn.retiredWorked ??= {})
          const working = city.placed.length + (city.enemyPlaced?.length ?? 0) - (retired[city.id] ?? 0)
          retired[city.id] = (retired[city.id] ?? 0) + Math.min(d.count, Math.max(0, working))
          city.workers -= d.count
        }
        gainCulture(s, p, 2)
      }
      break
    }
    case 'aesthetics':
      gainCulture(s, p, 1)
      break
    case 'despotism':
      gainGeneral(p, 1)
      break
    case 'regime': {
      turn.skipFoodSettle = true
      // 일꾼 4개를 얻되 행복 한도를 넘는 만큼은 못 얻는다. 일꾼 1개마다 어느 도시에 붙일지 고른다 (고르지 않으면 첫 도시)
      const gain = Math.min(REGIME_WORKERS, Math.max(0, happiness(p) - totalWorkers(p)))
      if (addWorkers?.length) {
        const total = addWorkers.reduce((n, a) => n + a.count, 0)
        if (total !== gain || addWorkers.some((a) => !Number.isInteger(a.count) || a.count < 0 || !p.cities.some((c) => c.id === a.cityId))) {
          throw new RuleError(`일꾼 ${gain}개를 내 도시에 나누어 붙여야 합니다`)
        }
        for (const a of addWorkers) p.cities.find((c) => c.id === a.cityId)!.workers += a.count
      } else {
        p.cities[0].workers += gain
      }
      if (gain > 0) say(s, `${name} 체제: 일꾼 ${gain}개 추가`)
      break
    }
    case 'diplomacy': {
      // 내 원래 타일 위의 상대 위대한 장군 토큰 1개를 골라 파괴한다 (그 문명은 장군을 돌려받지 못함)
      if (dismiss) {
        const city = p.cities.find((c) => c.id === dismiss.cityId)
        const tile = city?.tiles.find((t) => t.card.id === dismiss.tileId)
        if (!tile || tile.occupiedBy === undefined || tile.occupiedBy === p.id) {
          throw new RuleError('상대 장군이 올라간 내 타일을 골라야 합니다')
        }
        tile.occupiedBy = undefined
        say(s, `${name} 외교: 상대 장군 토큰 파괴`)
      }
      break
    }
    case 'liberty':
    case 'rationalism':
    case 'equality':
      break
  }
}

/** 과학이론: 정책을 합리주의로 바꿀지 말지. 바꾸지 않으면 아무 일도 없다 (지금 정책을 다시 고르는 효과 재발동도 없다) */
export function answerPolicyOffer(s: GameState, p: Player, accept: boolean): void {
  const offer = p.policyOffer
  if (!offer) throw new RuleError('정책을 바꿀 기회가 없습니다')
  p.policyOffer = undefined
  const name = civById(p.civId).name
  if (!accept) {
    say(s, `${name} 정책 유지: ${p.policy ? POLICIES[p.policy].name : '없음'}`)
    return
  }
  p.policy = offer
  p.policyPicks = (p.policyPicks ?? 0) + 1
  say(s, `${name} 정책: ${POLICIES[offer].name} (과학이론)`)
}
