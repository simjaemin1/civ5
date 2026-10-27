import { useState } from 'react'
import type { Player } from '../engine'
import { TECHS, prereqsMet } from '../engine'
import { TechCard } from './cards/TechCard'
import { searchWords } from './searchWords'
import type { SearchWord } from './searchWords'

/**
 * 오른쪽 칸 맨 위의 검색창: 글자를 치면 등록된 단어(지금은 과학기술) 중 맞는 것이 아래에 뜨고, 누르면 그 항목을 크게 본다.
 * 위·아래 화살표로 고르고 Enter로 연다. Esc로 닫는다.
 */
export function SearchBox({ player }: { player: Player }) {
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(false)
  const [sel, setSel] = useState(0)
  const [shown, setShown] = useState<SearchWord | null>(null)
  const hits = searchWords(q)
  const open = (w: SearchWord) => {
    setShown(w)
    setQ('')
    setSel(0)
  }
  const tech = shown?.kind === 'tech' ? TECHS.find((t) => t.id === shown.id) : undefined
  return (
    <div className="search-box">
      <input
        type="search"
        value={q}
        placeholder="🔍 검색 (예: 철제기술)"
        aria-label="검색"
        onChange={(e) => {
          setQ(e.target.value)
          setSel(0)
        }}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'ArrowDown') setSel((n) => Math.min(n + 1, hits.length - 1))
          else if (e.key === 'ArrowUp') setSel((n) => Math.max(n - 1, 0))
          else if (e.key === 'Enter' && hits[sel]) open(hits[sel])
          else if (e.key === 'Escape') setQ('')
          else return
          e.preventDefault()
        }}
      />
      {focus && q.trim() && (
        <ul className="search-hits" role="listbox">
          {hits.length === 0 && <li className="muted none">등록된 단어가 없습니다</li>}
          {hits.map((w, i) => (
            <li key={`${w.kind}:${w.id}`} role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => open(w)}>
              {w.word} <small className="muted">과학기술</small>
            </li>
          ))}
        </ul>
      )}
      {tech && (
        <div className="modal-backdrop" onClick={() => setShown(null)} role="dialog" aria-modal="true" aria-label={tech.name}>
          <div className="zoom" onClick={(e) => e.stopPropagation()}>
            <TechCard tech={tech} width={Math.min(360, window.innerWidth - 48)} zoomable={false} glow state={player.techs.includes(tech.id) ? 'owned' : prereqsMet(player, tech) ? 'available' : 'idle'} />
            <p className="muted">
              {player.techs.includes(tech.id) ? '보유 중' : prereqsMet(player, tech) ? '지금 연구할 수 있음' : `선행: ${(tech.prereqs ?? []).map((id) => TECHS.find((t) => t.id === id)?.name).join(', ') || '같은 비용의 다른 기술'}`}
            </p>
            <button className="primary" autoFocus onClick={() => setShown(null)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
