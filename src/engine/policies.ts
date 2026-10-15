import type { GameState, Player } from './types'
import { RuleError } from './types'
import { POLICIES, civById } from './data'
import type { PolicyId } from './data'
import { gainCulture, say } from './core'
import { happiness, totalWorkers } from './yields'
import { gainGeneral } from './military'

export function choosePolicy(
  s: GameState,
  p: Player,
  policy: PolicyId,
  discard: { cityId: number; count: number }[] = [],
  dismiss?: { cityId: number; tileId: number },
): void {
  if (p.pendingPolicies <= 0) throw new RuleError('고를 수 있는 정책 선택권이 없습니다')
  p.pendingPolicies--
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
        for (const d of discard) p.cities.find((c) => c.id === d.cityId)!.workers -= d.count
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
      // 임시: 얻은 일꾼은 첫 도시에 붙이고, 행복을 넘는 만큼 버린다
      const room = Math.max(0, happiness(p) - totalWorkers(p))
      p.cities[0].workers += Math.min(3, room)
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
