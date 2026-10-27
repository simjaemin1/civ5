import { useState } from 'react'
import type { Dir } from '../../engine'
import { MILITARY_CARDS, UNIQUES, cardById, cardStats } from '../../engine'
import { unitImage } from './unitImage'
import type { UnitCardData } from './unitImage'
import { ICON } from '../format'

interface Props {
  card: UnitCardData
  width?: number
  selected?: boolean
  /** 흐리게 (이미 놓인 카드 등) */
  dim?: boolean
  onClick?: () => void
  /** onClick이 없을 때 누르면 크게 보기 */
  zoomable?: boolean
  /** 카드 위에 겹쳐 보여 줄 글 (예: 대미지) */
  overlay?: string
  title?: string
  /** 상대 쪽에서 마주 보는 카드처럼 180도 뒤집어 보여 준다 */
  flip?: boolean
}

const POS: Record<Dir, string> = { L: '8%', C: '50%', R: '92%' }

/** 군사 카드 한 장. 그림이 등록돼 있으면 그림을, 없으면 능력치로 그린 카드 얼굴(전투력 별 위치 = 공격 방향)을 보여 준다. */
export function UnitCard({ card, width = 150, selected, dim, onClick, zoomable = true, overlay, title, flip }: Props) {
  const [zoom, setZoom] = useState(false)
  const img = unitImage(card)
  const st = cardStats({ uid: 0, ...card })
  const base = cardById(card.defId)
  const cost = card.unique ? UNIQUES[card.unique]?.def.cost : base.cost
  const isBase = card.unique && !MILITARY_CARDS.find((m) => m.id === card.defId)?.uniqueOnly
  const face = (w: number, click?: () => void, flipped?: boolean) => (
    <button
      type="button"
      className={`card unit-card${img ? ' has-img' : ''}${selected ? ' selected' : ''}${dim ? ' dim' : ''}`}
      style={{ width: w, transform: flipped ? 'rotate(180deg)' : undefined }}
      onClick={click}
      title={title ?? st.name}
    >
      {img ? (
        <img src={img} alt={st.name} draggable={false} />
      ) : (
        <div className="face unit-face">
          <div className="stars">
            {st.choose !== undefined ? (
              <span className="star" style={{ left: POS.C }}>
                {st.choose}
              </span>
            ) : (
              st.marks.map((m) => (
                <span key={m.dir} className="star" style={{ left: POS[m.dir] }}>
                  {m.power}
                </span>
              ))
            )}
            {st.hp !== undefined && st.choose === undefined && st.marks.length === 0 && st.markPower !== undefined && (
              <span className="star" style={{ left: POS.C }}>
                {st.markPower}
              </span>
            )}
          </div>
          <div className="face-cost">{ICON.hammer} {cost}</div>
          <div className="face-art">{st.name.slice(0, 1)}</div>
          <div className="face-title">
            {st.name}
            {isBase && <small>({base.name})</small>}
          </div>
          <div className="face-text">{st.choose !== undefined ? <p>상대 1-4번 위치 중 1개를 골라 공격</p> : null}{st.text ? <p>{st.text}</p> : null}</div>
          <div className="unit-foot">
            <span className="hp">체력 {st.hp ?? '-'}</span>
            <span className="def">방어력 {st.def}</span>
          </div>
        </div>
      )}
      {overlay && <span className="overlay">{overlay}</span>}
    </button>
  )
  return (
    <>
      {face(width, onClick ?? (zoomable ? () => setZoom(true) : undefined), flip)}
      {zoom && (
        <div className="modal-backdrop" onClick={() => setZoom(false)} onKeyDown={(e) => e.key === 'Escape' && setZoom(false)} role="dialog" aria-modal="true" aria-label={st.name}>
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
