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
/** 타일 왼쪽 위 도시·일꾼 토큰 크기 (px) */
const TOKEN = 38

export function TileView({ card, player, badge, selected, disabled, onClick, hint, selectableMark }: Props) {
  const mark = selectableMark === undefined ? '' : selectableMark ? ' pickable' : ' unpickable'
  const y = tileYield(card, ctxOf(player))
  const res = card.resource ? RESOURCES[card.resource] : undefined
  const wonder = card.wonder ? WONDERS[card.wonder] : undefined
  const primary = card.terrains[0]
  const img = cardImage('tile', String(card.id))
  // 카드에 인쇄된 산출 (실제 카드 덱일 때만): 기술 효과 등으로 달라지면 아이콘 줄을 다시 그린다
  const printed = img ? REAL_TILES[card.id]?.printed : undefined
  // 장군(스웨덴이 올린 장군, 점령한 문명의 장군)이 있으면 빨간 테두리. 그 위에 일꾼이 올라가면 일꾼(주황)이 가린다
  const gen = !!(badge?.general || badge?.occupiedBy)
  const cls = `${selected ? ' selected' : ''}${gen && !badge?.worker ? ' gen' : ''}${badge?.city ? ' city' : ''}${onClick ? '' : ' ro'}${badge?.target ? ' targeted' : ''}${mark}`
  // 도시·일꾼·장군 토큰은 타일 왼쪽 위에 같은 크기로 놓는다. 일꾼이 장군 위에 올라가면 장군 토큰은 가려진다
  const token = (badge?.city || badge?.worker || gen) && (
    <div className="tile-city-token">
      {badge?.city && <Icon name="city" size={TOKEN} title="도시" />}
      {badge?.worker ? (
        <Icon name="worker" size={TOKEN} title={gen ? '일꾼 (장군 위)' : '일꾼'} />
      ) : badge?.occupiedBy ? (
        <span className="occupier" title={`${badge.occupiedBy}의 위대한 장군이 점령 중`}>
          <Icon name="general" size={TOKEN} />
          <small>{badge.occupiedBy}</small>
        </span>
      ) : (
        badge?.general && <Icon name="general" size={TOKEN} title="위대한 장군 (스웨덴)" />
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
        {token}
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
      {(badge?.worker || gen) && token}
      {target}
    </button>
  )
}
