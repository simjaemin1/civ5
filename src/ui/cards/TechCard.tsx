import { useState } from 'react'
import { Overlay } from '../Overlay'
import type { TechDef } from '../../engine'
import { ICON, techCardLines } from '../format'
import { cardImage } from './cardImages'

/** 금빛 테두리로 빛나는 기술: 문자, 인쇄기술 */
const GOLD_TECHS = ['writing', 'printing_press']

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
  /** 정책(보라)·장군(빨강)을 주는 기술과 문자·인쇄기술(금빛)의 반짝이 테두리: 플라스크 기술표와 내 연구 창에서만 켠다 (사용자 결정) */
  glow?: boolean
}

/** 카드 한 장. 등록된 그림이 있으면 그 그림을, 없으면 데이터로 그린 카드 얼굴을 보여 준다. */
export function TechCard({ tech, state = 'idle', note, disabled, onClick, width = 150, zoomable = true, glow = false }: Props) {
  const [zoom, setZoom] = useState(false)
  const img = cardImage('tech', tech.id)
  // 정책을 고르게 해 주는 기술은 보라색, 위대한 장군을 주는 기술은 빨간색 광택 테두리
  // 문자·인쇄기술은 금빛 광택 (사용자 결정)
  const gives = {
    policy: glow && tech.effects.some((e) => e.kind === 'policy'),
    general: glow && tech.effects.some((e) => e.kind === 'general'),
    gold: glow && GOLD_TECHS.includes(tech.id),
  }
  const click = onClick ?? (zoomable ? () => setZoom(true) : undefined)
  return (
    <>
      <button
        type="button"
        className={`card tech-card ${state}${img ? ' has-img' : ''}${gives.policy ? ' gives-policy' : ''}${gives.general ? ' gives-general' : ''}${gives.gold ? ' gives-gold' : ''}`}
        style={{ width }}
        disabled={disabled}
        onClick={click}
        title={note}
      >
        {img ? <img src={img} alt={tech.name} draggable={false} /> : <TechFace tech={tech} />}
        {state === 'owned' && <span className="badge">✓ 보유</span>}
      </button>
      {zoom && (
        <Overlay>
        <div className="modal-backdrop" onClick={() => setZoom(false)} onKeyDown={(e) => e.key === 'Escape' && setZoom(false)} role="dialog" aria-modal="true" aria-label={tech.name}>
          <div className="zoom" onClick={(e) => e.stopPropagation()}>
            <TechCard tech={tech} state={state} width={Math.min(360, window.innerWidth - 48)} zoomable={false} glow={glow} />
            {note && <p className="muted">{note}</p>}
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
