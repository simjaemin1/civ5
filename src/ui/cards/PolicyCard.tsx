import { useState } from 'react'
import type { PolicyId } from '../../engine'
import { POLICIES } from '../../engine'
import { cardImage } from './cardImages'

interface Props {
  policy: PolicyId
  width?: number
  /** 지금 시행 중인 정책 */
  active?: boolean
  disabled?: boolean
  /** 있으면 눌러서 이 동작을 한다 (정책 고르기). 없으면 누르면 크게 본다 */
  onClick?: () => void
}

/** 정책 카드. 등록된 그림이 있으면 그 그림을, 없으면 데이터로 그린 얼굴을 보여 준다. */
export function PolicyCard({ policy, width = 150, active, disabled, onClick }: Props) {
  const [zoom, setZoom] = useState(false)
  const img = cardImage('policy', policy)
  const def = POLICIES[policy]
  const face = (w: number, click?: () => void) => (
    <button type="button" className={`card policy-card${img ? ' has-img' : ''}${active ? ' active-policy' : ''}`} style={{ width: w }} disabled={disabled} onClick={click} title={`${def.name} 정책 — ${def.desc}`}>
      {img ? (
        <img src={img} alt={`${def.name} 정책`} draggable={false} />
      ) : (
        <div className="face">
          <div className="face-title">{def.name} 정책</div>
          <div className="face-art">{def.name.slice(0, 1)}</div>
          <div className="face-rule" />
          <div className="face-text">
            <p>{def.desc}</p>
          </div>
        </div>
      )}
      {active && <span className="badge">시행 중</span>}
    </button>
  )
  return (
    <>
      {face(width, onClick ?? (() => setZoom(true)))}
      {zoom && (
        <div className="modal-backdrop" onClick={() => setZoom(false)} role="dialog" aria-modal="true" aria-label={def.name}>
          <div className="zoom" onClick={(e) => e.stopPropagation()}>
            {face(Math.min(360, window.innerWidth - 48))}
            <button className="primary" autoFocus onClick={() => setZoom(false)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  )
}
