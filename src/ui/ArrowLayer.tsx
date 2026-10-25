import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export interface Arrow {
  /** 화살표가 시작·끝나는 칸: 칸 요소의 data-slot 값 ("문명번호:칸번호") */
  from: string
  to: string
  color: string
  label?: string
  dashed?: boolean
  /** 굵게 (지금 진행 중인 공격) */
  bold?: boolean
}

interface Line {
  x1: number
  y1: number
  x2: number
  y2: number
  arrow: Arrow
}

/** 자식 안의 data-slot 요소들 사이에 화살표를 그려 준다. 칸 위치는 화면에 그려진 뒤에 재서 맞춘다. */
export function ArrowLayer({ arrows, children }: { arrows: Arrow[]; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  const key = arrows.map((a) => `${a.from}>${a.to}:${a.color}:${a.label ?? ''}:${a.dashed ? 1 : 0}:${a.bold ? 1 : 0}`).join('|')

  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const measure = () => {
      const box = root.getBoundingClientRect()
      const rectOf = (k: string) => {
        const el = root.querySelector(`[data-slot="${k}"]`)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { cx: r.left - box.left + r.width / 2, cy: r.top - box.top + r.height / 2, w: r.width, h: r.height }
      }
      const out: Line[] = []
      for (const arrow of arrows) {
        const a = rectOf(arrow.from)
        const b = rectOf(arrow.to)
        if (!a || !b) continue
        const dx = b.cx - a.cx
        const dy = b.cy - a.cy
        const len = Math.hypot(dx, dy) || 1
        // 카드 가장자리에서 시작하고 끝나도록 자른다 (카드를 가리지 않게)
        const exit = (w: number, h: number) => Math.min(dx ? w / 2 / Math.abs(dx) : Infinity, dy ? h / 2 / Math.abs(dy) : Infinity)
        const t1 = Math.min(0.45, exit(a.w, a.h))
        const t2 = Math.min(0.45, exit(b.w, b.h))
        out.push({ x1: a.cx + dx * t1, y1: a.cy + dy * t1, x2: b.cx - dx * t2 - (dx / len) * 4, y2: b.cy - dy * t2 - (dy / len) * 4, arrow })
      }
      setLines(out)
      setSize({ w: box.width, h: box.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const colors = [...new Set(arrows.map((a) => a.color))]
  return (
    <div ref={ref} className="arrow-layer">
      {children}
      <svg className="arrow-svg" width={size.w} height={size.h} viewBox={`0 0 ${size.w || 1} ${size.h || 1}`} aria-hidden>
        <defs>
          {colors.map((c) => (
            <marker key={c} id={`ah-${c.replace(/[^a-z0-9]/gi, '')}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill={c} />
            </marker>
          ))}
        </defs>
        {lines.map((l, i) => (
          <g key={i}>
            <line
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={l.arrow.color}
              strokeWidth={l.arrow.bold ? 6 : 3}
              strokeDasharray={l.arrow.dashed ? '8 6' : undefined}
              strokeLinecap="round"
              opacity={l.arrow.bold ? 0.95 : 0.75}
              markerEnd={`url(#ah-${l.arrow.color.replace(/[^a-z0-9]/gi, '')})`}
            />
            {l.arrow.label && (
              <text x={(l.x1 + l.x2) / 2} y={(l.y1 + l.y2) / 2 - 6} textAnchor="middle" className="arrow-label" fill={l.arrow.color}>
                {l.arrow.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}
