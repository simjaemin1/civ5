import { useEffect, useState } from 'react'
import type { Player } from '../engine'
import { TechTree } from './InfoTabs'
import techIconUrl from '../assets/icons/tech.png'

/** 기술표 창의 바깥 여백·테두리·제목 줄 (카드 크기를 화면에 맞출 때 뺀다) */
const FLOAT_TOP = 72
const FLOAT_BOTTOM = 12
const FLOAT_SIDE = 12
const FLOAT_PAD = 24
const FLOAT_HEAD = 44

/** 창 안에 표 전체가 스크롤 없이 들어가는 넓이·높이 */
function fitBox() {
  return {
    width: window.innerWidth - 2 * FLOAT_SIDE - FLOAT_PAD,
    height: window.innerHeight - FLOAT_TOP - FLOAT_BOTTOM - FLOAT_PAD - FLOAT_HEAD,
  }
}

/**
 * 맨 위 줄의 과학 플라스크 버튼: 누르면 기술표가 화면 위에 겹쳐 펼쳐진다 (아래 내용이 밀리지 않는다).
 * 표 전체가 한 화면에 들어가도록 카드 크기를 창 크기에 맞춘다 (휠로 내릴 필요 없음). 카드를 누르면 크게 보고 효과를 읽는다.
 * 어느 단계에서든 열 수 있고, 다시 누르거나 닫기, Esc로 닫는다.
 */
export function TechTreeButton({ player }: { player: Player }) {
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState(fitBox)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onResize = () => setBox(fitBox())
    onResize()
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open])
  return (
    <>
      <button className={`tree-btn${open ? ' on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-label="기술표" title="기술표 (선행·후행 기술)">
        <img src={techIconUrl} alt="" draggable={false} />
      </button>
      {open && (
        <div className="tree-float" role="dialog" aria-label="기술표">
          <div className="tree-overlay-head">
            <b>
              기술표 (선행 → 후행) <small className="muted">카드를 누르면 효과를 크게 봅니다</small>
            </b>
            <button onClick={() => setOpen(false)}>닫기 ✕</button>
          </div>
          <TechTree player={player} fit={box} />
        </div>
      )}
    </>
  )
}
