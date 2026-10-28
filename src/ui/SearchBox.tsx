import { useEffect, useState } from 'react'
import { Overlay } from './Overlay'
import { KIND_LABEL, entryOf } from './encyclopedia'
import type { Item, Ref } from './encyclopedia'
import { searchWords } from './searchWords'

/**
 * 오른쪽 칸 맨 위의 검색창: 글자를 치면 도감에 등록된 이름 중 맞는 것이 아래에 뜨고, 누르면 도감 창이 화면 위에 뜬다.
 * 위·아래 화살표로 고르고 Enter로 연다.
 */
export function SearchBox() {
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(false)
  const [sel, setSel] = useState(0)
  const [page, setPage] = useState<Ref | null>(null)
  const hits = searchWords(q)
  const open = (w: Ref) => {
    setPage(w)
    setQ('')
    setSel(0)
  }
  return (
    <div className="search-box">
      <input
        type="search"
        value={q}
        placeholder="🔍 검색"
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
              {w.label} <small className="muted">{KIND_LABEL[w.kind]}</small>
            </li>
          ))}
        </ul>
      )}
      {page && <Encyclopedia start={page} onClose={() => setPage(null)} />}
    </div>
  )
}

/** 도감 창: 항목 설명. 다른 항목 이름을 누르면 그 항목으로 넘어가고, ← 로 돌아온다 */
function Encyclopedia({ start, onClose }: { start: Ref; onClose: () => void }) {
  const [stack, setStack] = useState<Ref[]>([start])
  const cur = stack[stack.length - 1]
  const entry = entryOf(cur.kind, cur.id)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const go = (r: Ref) => setStack([...stack, r])
  const item = (it: Item, i: number) =>
    typeof it === 'string' ? (
      it === '\n' ? <br key={i} /> : <span key={i}>{it}</span>
    ) : (
      <button key={i} className="link wiki-link" onClick={() => go(it)}>
        {it.label}
      </button>
    )
  // 화면 맨 위(문서 끝)에 그린다: 오른쪽 칸(고정 칸) 안에 두면 위쪽 단계 막대 같은 고정 요소에 가려진다
  return (
    <Overlay>
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={`도감: ${entry.title}`}>
      <div className="modal wiki" onClick={(e) => e.stopPropagation()}>
        <div className="wiki-head">
          {stack.length > 1 && (
            <button onClick={() => setStack(stack.slice(0, -1))} title="이전 항목">
              ←
            </button>
          )}
          <h2>
            {entry.title} <small className="muted">{KIND_LABEL[entry.kind]}</small>
          </h2>
          <button onClick={onClose}>닫기 ✕</button>
        </div>
        <dl className="wiki-rows">
          {entry.rows.map((r) => (
            <div key={r.label} className="wiki-row">
              <dt>{r.label}</dt>
              <dd>{r.items.map(item)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
    </Overlay>
  )
}
