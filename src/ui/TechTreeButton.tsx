import { useEffect, useState } from 'react'
import type { Player } from '../engine'
import { TechTree } from './InfoTabs'

/**
 * 맨 위 줄의 네모 칸(2×2) 버튼: 누르면 기술표가 화면 위에 겹쳐 펼쳐진다 (아래 내용이 밀리지 않는다).
 * 어느 단계에서든 열 수 있고, 연구 단계에서는 기술 카드 위를 덮는다. 다시 누르거나 닫기, Esc로 닫는다.
 */
export function TechTreeButton({ player }: { player: Player }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <>
      <button className={`tree-btn${open ? ' on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-label="기술표" title="기술표 (선행·후행 기술)">
        <svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={2 + (i % 2) * 12} y={2 + Math.floor(i / 2) * 12} width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
          ))}
        </svg>
      </button>
      {open && (
        <div className="tree-float" role="dialog" aria-label="기술표">
          <div className="tree-overlay-head">
            <b>기술표 (선행 → 후행)</b>
            <button onClick={() => setOpen(false)}>닫기 ✕</button>
          </div>
          <TechTree player={player} />
        </div>
      )}
    </>
  )
}
