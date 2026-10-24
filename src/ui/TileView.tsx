import type { Player, TileCard } from '../engine'
import { RESOURCES, WONDERS, ctxOf, tileYield } from '../engine'
import { cardImage } from './cards/cardImages'
import { Icon } from './icons'
import { TERRAIN_COLOR, tileTitle, yieldText } from './format'

export interface TileBadge {
  worker?: boolean
  general?: boolean
  occupiedBy?: string
  city?: boolean
}

interface Props {
  card: TileCard
  player: Player
  badge?: TileBadge
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
  hint?: string
}

/** 타일 카드 한 장: 지형, 자원, 산출, 일꾼·점령 표시 */
export function TileView({ card, player, badge, selected, disabled, onClick, hint }: Props) {
  const y = tileYield(card, ctxOf(player))
  const res = card.resource ? RESOURCES[card.resource] : undefined
  const wonder = card.wonder ? WONDERS[card.wonder] : undefined
  const primary = card.terrains[0]
  const img = cardImage('tile', String(card.id))
  if (img) {
    return (
      <button
        type="button"
        className={`tile has-img${selected ? ' selected' : ''}${badge?.city ? ' city' : ''}${onClick ? '' : ' ro'}`}
        disabled={disabled || !onClick}
        onClick={onClick}
        title={hint ?? tileTitle(card)}
      >
        <img src={img} alt={tileTitle(card)} draggable={false} />
        <div className="tile-yield-chip">{yieldText(y)}</div>
        <div className="tile-badges">
          {badge?.worker && <Icon name="worker" size={24} title="일꾼" />}
          {badge?.general && <Icon name="general" size={24} title="위대한 장군(스웨덴)" />}
          {badge?.occupiedBy && <span title="점령됨">🚩{badge.occupiedBy}</span>}
        </div>
      </button>
    )
  }
  return (
    <button
      type="button"
      className={`tile${selected ? ' selected' : ''}${badge?.city ? ' city' : ''}${onClick ? '' : ' ro'}`}
      style={{ background: primary ? TERRAIN_COLOR[primary] : '#ead9a0' }}
      disabled={disabled || !onClick}
      onClick={onClick}
      title={hint}
    >
      <div className="tile-head">
        {badge?.city ? '🏛 ' : ''}
        {tileTitle(card)}
      </div>
      {res && <div className="tile-res">{res.name}</div>}
      {wonder && card.terrains.length > 0 && <div className="tile-res">✨ {wonder.name}</div>}
      {card.historic && <div className="tile-res">🏺 사적지</div>}
      <div className="tile-yield">{yieldText(y)}</div>
      <div className="tile-badges">
        {badge?.worker && <Icon name="worker" size={24} title="일꾼" />}
        {badge?.general && <Icon name="general" size={24} title="위대한 장군(스웨덴)" />}
        {badge?.occupiedBy && <span title="점령됨">🚩{badge.occupiedBy}</span>}
      </div>
    </button>
  )
}

