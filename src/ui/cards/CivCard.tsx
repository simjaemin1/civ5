import { useState } from 'react'
import { Overlay } from '../Overlay'
import { civById } from '../../engine'
import { cardImage } from './cardImages'

interface Props {
  civId: string
  width?: number
  /** 누르면 크게 보기 (기본) */
  zoomable?: boolean
}

/** 문명 카드 (가로형). 등록된 그림이 있으면 그 그림을, 없으면 데이터로 그린 얼굴을 보여 준다. */
export function CivCard({ civId, width = 260, zoomable = true }: Props) {
  const [zoom, setZoom] = useState(false)
  const civ = civById(civId)
  const img = cardImage('civ', civId)
  const face = (w: number, click?: () => void) => (
    <button type="button" className={`card wonder-card civ-card${img ? ' has-img' : ''}`} style={{ width: w }} onClick={click} title={`${civ.name} — ${civ.ability}`}>
      {img ? (
        <img src={img} alt={civ.name} draggable={false} />
      ) : (
        <div className="face">
          <div className="face-title">
            {civ.name} · 우선도 {civ.priority}
          </div>
          <div className="face-text">
            <p>행복 {civ.happiness}</p>
            <p>{civ.ability}</p>
            <p>{civ.unique}</p>
          </div>
        </div>
      )}
    </button>
  )
  return (
    <>
      {face(width, zoomable ? () => setZoom(true) : undefined)}
      {zoom && (
        <Overlay>
        <div className="modal-backdrop" onClick={() => setZoom(false)} onKeyDown={(e) => e.key === 'Escape' && setZoom(false)} role="dialog" aria-modal="true" aria-label={civ.name}>
          <div className="zoom" onClick={(e) => e.stopPropagation()}>
            {face(Math.min(720, window.innerWidth - 48))}
            <button className="primary" autoFocus onClick={() => setZoom(false)}>
              닫기
            </button>
          </div>
        </div>
        </Overlay>
      )}
    </>
  )
}
