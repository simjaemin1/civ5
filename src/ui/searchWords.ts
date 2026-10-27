import { ALL_ENTRIES } from './encyclopedia'
import type { Ref } from './encyclopedia'

/**
 * 맨 위 검색창에서 찾을 수 있는 단어 = 도감 항목 이름 (과학기술·군사 카드·정책·사치자원·전략자원·불가사의).
 * 새 종류를 넣으려면 encyclopedia.ts의 ALL_ENTRIES와 entryOf에 더한다.
 */
export type SearchWord = Ref

/** 입력한 글자가 들어 있는 단어 (앞에서 시작하는 단어가 먼저). 공백은 무시한다 */
export function searchWords(query: string, limit = 8): SearchWord[] {
  const q = query.replace(/\s+/g, '')
  if (!q) return []
  const norm = (w: string) => w.replace(/\s+/g, '')
  return ALL_ENTRIES.filter((w) => norm(w.label).includes(q))
    .sort((a, b) => Number(!norm(a.label).startsWith(q)) - Number(!norm(b.label).startsWith(q)) || a.label.length - b.label.length)
    .slice(0, limit)
}
