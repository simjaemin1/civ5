import type { Player, TileCard } from '../engine'
import { REAL_TILES, RESOURCES, WONDERS, ctxOf, tileYield } from '../engine'
import { YieldRow } from './cards/YieldRow'
import { cardImage } from './cards/cardImages'
import { Icon } from './icons'
import { TERRAIN_COLOR, tileTitle, yieldText } from './format'

export interface TileBadge {
  worker?: boolean
  general?: boolean
  occupiedBy?: string
  city?: boolean
  /** 이번 라운드 선전포고 목표: 공격하는 문명 이름 */
  target?: string
}

interface Props {
  card: TileCard
  player: Player
  badge?: TileBadge
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
  hint?: string
  /** 고를 수 있는 타일(true)과 고를 수 없는 타일(false)을 구분해 보여 준다 */
  selectableMark?: boolean
}

/**
 * 타일 카드 한 장: 지형, 자원, 산출, 일꾼·점령·선전포고 표시.
 * 그림 카드는 산출 아이콘이 카드에 그려져 있으므로 이모티콘을 겹쳐 쓰지 않는다. 기술·문명 효과로 산출이 달라진 타일만
 * 카드 그림에서 딴 아이콘으로 하단 줄을 다시 그린다 (YieldRow).
 */
export function TileView({ card, player, badge, selected, disabled, onClick, hint, selectableMark }: Props) {
  const mark = selectableMark === undefined ? '' : selectableMark ? ' pickable' : ' unpickable'
  const y = tileYield(card, ctxOf(player))
  const res = card.resource ? RESOURCES[card.resource] : undefined
  const wonder = card.wonder ? WONDERS[card.wonder] : undefined
  const primary = card.terrains[0]
  const img = cardImage('tile', String(card.id))
  // 카드에 인쇄된 산출 (실제 카드 덱일 때만): 기술 효과 등으로 달라지면 아이콘 줄을 다시 그린다
  const printed = img ? REAL_TILES[card.id]?.printed : undefined
  const cls = `${selected ? ' selected' : ''}${badge?.city ? ' city' : ''}${onClick ? '' : ' ro'}${badge?.target ? ' targeted' : ''}${mark}`
  const badges = (
    <div className="tile-badges">
      {badge?.worker && <Icon name="worker" size={24} title="일꾼" />}
      {badge?.general && <Icon name="general" size={24} title="위대한 장군(스웨덴)" />}
      {badge?.occupiedBy && (
        <span className="occupier" title={`${badge.occupiedBy}의 위대한 장군이 점령 중`}>
          <Icon name="general" size={24} />
          <small>{badge.occupiedBy}</small>
        </span>
      )}
    </div>
  )
  const target = badge?.target && (
    <div className="tile-target" title="이번 라운드 선전포고 목표: 정산 때 이 타일을 두고 전투합니다">
      ⚔ {badge.target} 선전포고
    </div>
  )
  if (img) {
    return (
      <button type="button" className={`tile has-img${cls}`} disabled={disabled || !onClick} onClick={onClick} title={hint ?? `${tileTitle(card)} — 산출 ${yieldText(y)}`}>
        <img src={img} alt={tileTitle(card)} draggable={false} />
        {printed && <YieldRow printed={printed} actual={y} />}
        {badge?.city && (
          <div className="tile-city-token">
            <Icon name="city" size={30} title="도시" />
          </div>
        )}
        {badges}
        {target}
      </button>
    )
  }
  return (
    <button
      type="button"
      className={`tile${cls}`}
      style={{ background: primary ? TERRAIN_COLOR[primary] : '#ead9a0' }}
      disabled={disabled || !onClick}
      onClick={onClick}
      title={hint}
    >
      <div className="tile-head">
        {badge?.city && <Icon name="city" size={18} title="도시" />}
        {badge?.city ? ' ' : ''}
        {tileTitle(card)}
      </div>
      {res && <div className="tile-res">{res.name}</div>}
      {wonder && card.terrains.length > 0 && <div className="tile-res">✨ {wonder.name}</div>}
      {card.historic && <div className="tile-res">🏺 사적지</div>}
      <div className="tile-yield">{yieldText(y)}</div>
      {badges}
      {target}
    </button>
  )
}
