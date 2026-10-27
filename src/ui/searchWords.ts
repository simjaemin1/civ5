import { TECHS } from '../engine'

/**
 * 맨 위 검색창에서 찾을 수 있는 단어 목록. 단어를 고르면 그 항목을 크게 보여 준다.
 * 지금은 과학기술만 있다. 새 종류를 넣으려면 kind를 늘리고 SearchBox의 보여 주기에 한 줄 더한다.
 */
export interface SearchWord {
  word: string
  kind: 'tech'
  id: string
}

export const SEARCH_WORDS: SearchWord[] = TECHS.map((t) => ({ word: t.name, kind: 'tech' as const, id: t.id }))

/** 입력한 글자가 들어 있는 단어 (앞에서 시작하는 단어가 먼저). 공백은 무시한다 */
export function searchWords(query: string, limit = 8): SearchWord[] {
  const q = query.replace(/\s+/g, '')
  if (!q) return []
  const norm = (w: string) => w.replace(/\s+/g, '')
  return SEARCH_WORDS.filter((w) => norm(w.word).includes(q))
    .sort((a, b) => Number(!norm(a.word).startsWith(q)) - Number(!norm(b.word).startsWith(q)) || a.word.length - b.word.length)
    .slice(0, limit)
}
