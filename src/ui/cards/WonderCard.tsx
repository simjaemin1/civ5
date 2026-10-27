import { useState } from 'react'
import type { ReactNode } from 'react'
import type { WonderCardDef } from '../../engine'
import { ICON, conditionText, wonderEffectText } from '../format'
import { cardImage } from './cardImages'

interface Props {
  wonder: WonderCardDef
  /** 카드 아래에 붙이는 설명 (주인, 진척도 등) */
  caption?: ReactNode
  width?: number
  /** 지어진 불가사의: 초록 테두리 */
  owned?: boolean
  /** 흐리게 (지금 지을 수 없음 등) */
  dim?: boolean
  note?: string
  /** 지은 문명의 기호 그림: 카드 한가운데에 올린다 */
  ownerEmblem?: { url?: string; name: string }
}

/** 불가사의 카드 (가로형). 등록된 그림이 있으면 그 그림을, 없으면 데이터로 그린 얼굴을 보여 준다. 누르면 크게 본다. */
export function WonderCard({ wonder, caption, width = 260, owned, dim, note, ownerEmblem }: Props) {
  const [zoom, setZoom] = useState(false)
  const img = cardImage('wonder', wonder.id)
  const face = (w: number, clickable: boolean) => (
    <button
      type="button"
      className={`card wonder-card${img ? ' has-img' : ''}${owned ? ' owned' : ''}${dim ? ' dim' : ''}`}
      style={{ width: w }}
      onClick={clickable ? () => setZoom(true) : undefined}
      title={note ?? wonder.name}
    >
      {img ? (
        <img src={img} alt={wonder.name} draggable={false} />
      ) : (
        <div className="face">
          <div className="face-title">
            {wonder.name} · {ICON.hammer}{wonder.minHammers}
          </div>
          <div className="face-text">
            <p>{conditionText(wonder.condition)}</p>
            <p>{wonder.effects.map(wonderEffectText).join(', ')}</p>
            <p className="muted">필요 진척도 {wonder.progressNeeded}</p>
          </div>
        </div>
      )}
      {owned && <span className="badge">🏛 완성</span>}
      {ownerEmblem && (
        <span className="wonder-owner" title={`${ownerEmblem.name}이(가) 지음`}>
          {ownerEmblem.url ? <img src={ownerEmblem.url} alt={ownerEmblem.name} draggable={false} /> : <b>{ownerEmblem.name.slice(0, 1)}</b>}
        </span>
      )}
    </button>
  )
  return (
    <figure className="wonder-fig" style={{ width }}>
      {face(width, true)}
      {caption && <figcaption>{caption}</figcaption>}
      {zoom && (
        <div className="modal-backdrop" onClick={() => setZoom(false)} onKeyDown={(e) => e.key === 'Escape' && setZoom(false)} role="dialog" aria-modal="true" aria-label={wonder.name}>
          <div className="zoom" onClick={(e) => e.stopPropagation()}>
            {face(Math.min(720, window.innerWidth - 48), false)}
            {caption && <div className="muted">{caption}</div>}
            <button className="primary" autoFocus onClick={() => setZoom(false)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </figure>
  )
}
