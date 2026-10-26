import foodUrl from '../../assets/icons/yield-food.png'
import hammerUrl from '../../assets/icons/yield-hammer.png'
import goldUrl from '../../assets/icons/yield-gold.png'
import scienceUrl from '../../assets/icons/yield-science.png'
import type { PartialYield, Yield } from '../../engine'

/** 카드 하단 산출 아이콘 순서 (실제 카드: 식량 → 망치 → 금 → 과학) */
const ORDER = ['food', 'hammer', 'gold', 'science'] as const
const URL = { food: foodUrl, hammer: hammerUrl, gold: goldUrl, science: scienceUrl }
const NAME = { food: '식량', hammer: '망치', gold: '금', science: '과학' }

/** 카드 그림 기준 배치 (255×364 카드에서 아이콘 지름 약 33px, 간격 약 36.7px, 줄 중심 높이 91.4%) */
const STEP = 14.4 // 카드 폭 대비 %
const SIZE = 13.2
const MAX_SPAN = 94

/**
 * 기술·문명·불가사의 효과로 산출이 카드에 인쇄된 값과 달라진 타일에, 카드 하단 아이콘 줄을 실제 산출로 다시 그린다.
 * 아이콘은 실제 카드 그림에서 따 왔다. 인쇄값보다 늘어난 아이콘은 초록 테두리, 줄어든 아이콘은 흐리게 보여 준다.
 */
export function YieldRow({ printed, actual }: { printed: PartialYield; actual: Yield }) {
  const same = ORDER.every((k) => (printed[k] ?? 0) === actual[k])
  if (same) return null
  const icons: { k: (typeof ORDER)[number]; kind: 'base' | 'plus' | 'minus' }[] = []
  for (const k of ORDER) {
    const p = printed[k] ?? 0
    const a = actual[k]
    for (let i = 0; i < Math.max(p, a); i++) icons.push({ k, kind: i >= p ? 'plus' : i >= a ? 'minus' : 'base' })
  }
  const nPrinted = ORDER.reduce((n, k) => n + (printed[k] ?? 0), 0)
  const step = Math.min(STEP, MAX_SPAN / Math.max(1, icons.length))
  const size = Math.min(SIZE, step * 0.92)
  const label = ORDER.filter((k) => actual[k] !== (printed[k] ?? 0))
    .map((k) => `${NAME[k]} ${printed[k] ?? 0}→${actual[k]}`)
    .join(', ')
  return (
    <div className="yield-row" aria-label={`산출이 카드와 다름: ${label}`}>
      {/* 인쇄된 아이콘 줄을 카드 바탕색으로 덮는다 */}
      <div className="yield-patch" style={{ width: `${nPrinted * STEP + 3}%` }} />
      <div className="yield-icons">
        {icons.map((ic, i) => (
          <img
            key={i}
            src={URL[ic.k]}
            alt=""
            draggable={false}
            className={`yield-ic ${ic.kind}`}
            style={{ width: `${size}cqw`, left: `${50 + (i - (icons.length - 1) / 2) * step}cqw` }}
          />
        ))}
      </div>
    </div>
  )
}
