import type { City, Side } from '../engine'
import { SIDE_LABEL } from './format'

/** 문화로 얻은 타일이 놓이는 자리: 십자(도시+4면) 둘레의 네 모서리부터, 그다음 오른쪽 줄·왼쪽 줄 순서로 쌓아 간다 */
export function extraPosition(i: number): { x: number; y: number } {
  if (i < 4) return { x: i % 2 === 0 ? -1 : 1, y: i < 2 ? -1 : 1 } // 1 왼쪽 위, 2 오른쪽 위, 3 왼쪽 아래, 4 오른쪽 아래
  const j = i - 4
  const k = Math.floor(j / 3) // 세 칸짜리 줄: 오른쪽 → 왼쪽 → 오른쪽 …
  return { x: k % 2 === 0 ? 2 + k / 2 : -2 - (k - 1) / 2, y: (j % 3) - 1 } // 위, 가운데, 아래 순서
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
  city.tiles.filter((t) => t.role === 'extra').forEach((t, i) => cells.push({ key: `x${t.card.id}`, ...extraPosition(i), tile: t }))
  const minX = Math.min(...cells.map((c) => c.x))
  const minY = Math.min(...cells.map((c) => c.y))
  const maxX = Math.max(...cells.map((c) => c.x))
  return { cols: maxX - minX + 1, cells: cells.map((c) => ({ ...c, col: c.x - minX + 1, row: c.y - minY + 1 })) }
}
