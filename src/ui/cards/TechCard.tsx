import { useState } from 'react'
import type { TechDef } from '../../engine'
import { ICON, techCardLines } from '../format'
import { cardImage } from './cardImages'

export type TechCardState = 'owned' | 'available' | 'locked' | 'idle'

interface Props {
  tech: TechDef
  state?: TechCardState
  /** 카드 위쪽에 붙이는 작은 설명 (선행 기술 등) */
  note?: string
  disabled?: boolean
  onClick?: () => void
  /** 카드 폭(px). 높이는 카드 비율(0.7)로 정해진다 */
  width?: number
  /** 누르면 큰 카드로 보여 주기 (onClick이 없을 때) */
  zoomable?: boolean
}

/** 카드 한 장. 등록된 그림이 있으면 그 그림을, 없으면 데이터로 그린 카드 얼굴을 보여 준다. */
export function TechCard({ tech, state = 'idle', note, disabled, onClick, width = 150, zoomable = true }: Props) {
  const [zoom, setZoom] = useState(false)
  const img = cardImage('tech', tech.id)
  const click = onClick ?? (zoomable ? () => setZoom(true) : undefined)
  return (
    <>
      <button
        type="button"
        className={`card tech-card ${state}${img ? ' has-img' : ''}`}
        style={{ width }}
        disabled={disabled}
        onClick={click}
        title={note}
      >
        {img ? <img src={img} alt={tech.name} draggable={false} /> : <TechFace tech={tech} />}
        {state === 'owned' && <span className="badge">✓ 보유</span>}
      </button>
      {zoom && (
        <div className="modal-backdrop" onClick={() => setZoom(false)} role="dialog" aria-modal="true" aria-label={tech.name}>
          <div className="zoom" onClick={(e) => e.stopPropagation()}>
            <TechCard tech={tech} state={state} width={Math.min(360, window.innerWidth - 48)} zoomable={false} />
            {note && <p className="muted">{note}</p>}
            <button className="primary" autoFocus onClick={() => setZoom(false)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/** 그림이 없는 기술 카드: 실제 카드처럼 이름, 과학 비용, 문구 칸으로 그린다 */
function TechFace({ tech }: { tech: TechDef }) {
  const lines = techCardLines(tech)
  return (
    <div className="face">
      <div className="face-title">{tech.name}</div>
      <div className="face-cost">
        <span className="orb">{ICON.science}</span> {tech.cost}
      </div>
      <div className="face-art">{tech.name.slice(0, 1)}</div>
      <div className="face-rule" />
      <div className="face-text">{lines.length ? lines.map((l, i) => <p key={i}>{l}</p>) : <p className="muted">효과 없음</p>}</div>
    </div>
  )
}
