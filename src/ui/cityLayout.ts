import { extraSlotOf } from '../engine'
import type { City, Side } from '../engine'
import { SIDE_LABEL } from './format'

/**
 * 문화로 얻은 타일이 놓이는 자리: 십자(도시+4면) 둘레의 네 모서리로 3×3을 채운 뒤에는 아래로 한 줄(왼쪽·가운데·오른쪽)씩 늘려 간다.
 * 도시는 가로로 나란히 놓이므로 도시 판은 옆으로 넓어지지 않고 아래로 길어진다 (사용자 결정).
 */
export function extraPosition(i: number): { x: number; y: number } {
  if (i < 4) return { x: i % 2 === 0 ? -1 : 1, y: i < 2 ? -1 : 1 } // 1 왼쪽 위, 2 오른쪽 위, 3 왼쪽 아래, 4 오른쪽 아래
  const j = i - 4
  return { x: (j % 3) - 1, y: 2 + Math.floor(j / 3) } // 아래 줄: 왼쪽, 가운데, 오른쪽 순서
}

const CROSS: { key: string; x: number; y: number; side?: Side }[] = [
  { key: 'N', x: 0, y: -1, side: 'N' },
  { key: 'W', x: -1, y: 0, side: 'W' },
  { key: 'C', x: 0, y: 0 },
  { key: 'E', x: 1, y: 0, side: 'E' },
  { key: 'S', x: 0, y: 1, side: 'S' },
]

/** 도시 한 곳의 타일을 격자 칸에 배치한다 (타일이 놓인 범위만큼만 칸을 만든다) */
export function cityGrid(city: City, side: (s: Side) => City['tiles'][number] | undefined) {
  const cells: { key: string; x: number; y: number; tile?: City['tiles'][number]; label?: string }[] = CROSS.map((c) => ({
    key: c.key,
    x: c.x,
    y: c.y,
    tile: c.side ? side(c.side) : city.tiles.find((t) => t.role === 'city'),
    label: c.side ? SIDE_LABEL[c.side] : undefined,
  }))
  // 추가 타일은 자리 번호대로 놓는다. 원자폭탄으로 타일이 사라진 자리는 빈 칸으로 남고, 새 타일이 먼저 메운다
  const extras = city.tiles.filter((t) => t.role === 'extra')
  const used = new Set(extras.map((t) => extraSlotOf(city, t)))
  for (const t of extras) cells.push({ key: `x${t.card.id}`, ...extraPosition(extraSlotOf(city, t)), tile: t })
  const top = Math.max(-1, ...used)
  for (let i = 0; i < top; i++) if (!used.has(i)) cells.push({ key: `hole${i}`, ...extraPosition(i), label: '' })
  const minX = Math.min(...cells.map((c) => c.x))
  const minY = Math.min(...cells.map((c) => c.y))
  const maxX = Math.max(...cells.map((c) => c.x))
  return { cols: maxX - minX + 1, cells: cells.map((c) => ({ ...c, col: c.x - minX + 1, row: c.y - minY + 1 })) }
}
