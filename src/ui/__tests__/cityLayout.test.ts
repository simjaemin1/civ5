import { describe, expect, it } from 'vitest'
import { cityGrid, extraPosition } from '../cityLayout'
import type { City } from '../../engine'

const tile = (id: number, role: 'city' | 'side' | 'extra', side?: 'N' | 'E' | 'S' | 'W') => ({ card: { id, terrains: ['평지'] }, role, side }) as City['tiles'][number]

describe('도시 타일 배치: 십자 둘레로 쌓는다', () => {
  it('문화 타일은 네 모서리(왼위·오른위·왼아래·오른아래) 다음에 아래 줄(왼쪽·가운데·오른쪽)로 늘어난다', () => {
    const pos = Array.from({ length: 13 }, (_, i) => extraPosition(i))
    expect(pos.slice(0, 4)).toEqual([{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }])
    expect(pos.slice(4, 7)).toEqual([{ x: -1, y: 2 }, { x: 0, y: 2 }, { x: 1, y: 2 }])
    expect(pos.slice(7, 10)).toEqual([{ x: -1, y: 3 }, { x: 0, y: 3 }, { x: 1, y: 3 }])
    expect(pos.slice(10, 13)).toEqual([{ x: -1, y: 4 }, { x: 0, y: 4 }, { x: 1, y: 4 }])
    expect(pos.every((p) => p.x >= -1 && p.x <= 1)).toBe(true) // 가로는 늘 3칸
    expect(new Set(pos.map((p) => `${p.x},${p.y}`)).size).toBe(13) // 겹치는 칸이 없다
  })

  it('격자는 놓인 타일 범위만큼만 칸을 만들고, 십자 가운데가 도시다', () => {
    const tiles = [tile(1, 'city'), tile(2, 'side', 'N'), tile(3, 'side', 'E'), tile(4, 'side', 'S'), tile(5, 'side', 'W'), ...[6, 7, 8, 9, 10].map((i) => tile(i, 'extra'))]
    const city = { id: 0, tiles, workers: 1, placed: [], openSides: [] } as City
    const g = cityGrid(city, (s) => tiles.find((t) => t.side === s))
    expect(g.cols).toBe(3) // 가로는 3칸 그대로
    const at = (id: number) => g.cells.find((c) => c.tile?.card.id === id)!
    expect([at(1).col, at(1).row]).toEqual([2, 2]) // 도시
    expect([at(6).col, at(6).row]).toEqual([1, 1]) // 1번: 왼쪽 위
    expect([at(7).col, at(7).row]).toEqual([3, 1]) // 2번: 오른쪽 위
    expect([at(8).col, at(8).row]).toEqual([1, 3]) // 3번: 왼쪽 아래
    expect([at(9).col, at(9).row]).toEqual([3, 3]) // 4번: 오른쪽 아래
    expect([at(10).col, at(10).row]).toEqual([1, 4]) // 5번: 아래 줄 왼쪽
  })

  it('사라진 타일의 빈 자리는 칸으로 남고, 타일은 자리 번호대로 놓인다', () => {
    const tiles = [tile(1, 'city'), tile(2, 'side', 'N'), tile(3, 'side', 'E'), tile(4, 'side', 'S'), tile(5, 'side', 'W')]
    const ex = (id: number, slot: number) => ({ ...tile(id, 'extra'), slot })
    const city = { id: 0, tiles: [...tiles, ex(6, 0), ex(7, 2)], workers: 1, placed: [], openSides: [] } as City // 자리 1(오른쪽 위)이 비었다
    const g = cityGrid(city, (s) => tiles.find((t) => t.side === s))
    const at = (id: number) => g.cells.find((c) => c.tile?.card.id === id)!
    expect([at(7).col, at(7).row]).toEqual([1, 3]) // 3번 자리: 왼쪽 아래
    const hole = g.cells.find((c) => !c.tile && c.key.startsWith('hole'))!
    expect([hole.col, hole.row]).toEqual([3, 1]) // 비어 있는 2번 자리: 오른쪽 위
  })
})
