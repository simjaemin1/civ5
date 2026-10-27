import { useEffect, useState } from 'react'
import { civById } from '../engine'
import { CivCard } from './cards/CivCard'
import { civEmblem } from './civEmblems'
import { useWide } from './hooks'
import { usePrefs } from './prefsStore'

/**
 * 화면 오른쪽 위의 문명 기호. 누르면 문명 카드(능력·시작 값·고유 유닛)가 크게 뜬다.
 * 기호 그림이 없는 문명은 이름 첫 글자로 대신한다.
 * 넓은 화면에서는 오른쪽 정보 칸에 문명 카드가 늘 펼쳐져 있고, 이 버튼은 그 카드를 켜고 끈다.
 */
export function CivEmblem({ civId }: { civId: string }) {
  const wide = useWide()
  const { prefs, set } = usePrefs()
  const [modal, setOpen] = useState(false)
  const open = modal && !wide
  const civ = civById(civId)
  const img = civEmblem(civId)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <>
      <button
        className={`civ-emblem${wide && prefs.dockCiv ? ' on' : ''}`}
        onClick={() => (wide ? set({ dockCiv: !prefs.dockCiv }) : setOpen(true))}
        title={wide ? `${civ.name} — 문명 카드 ${prefs.dockCiv ? '접기' : '펼치기'} (오른쪽 정보 칸)` : `${civ.name} — 눌러서 문명 정보 보기`}
        aria-label={`${civ.name} 문명 정보`}
        aria-expanded={wide ? prefs.dockCiv : undefined}
      >
        {img ? <img src={img} alt="" draggable={false} /> : <span>{civ.name.slice(0, 1)}</span>}
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label={`${civ.name} 문명 정보`}>
          <div className="zoom" onClick={(e) => e.stopPropagation()}>
            <CivCard civId={civId} width={Math.min(720, window.innerWidth - 48)} zoomable={false} />
            <button className="primary" autoFocus onClick={() => setOpen(false)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  )
}
