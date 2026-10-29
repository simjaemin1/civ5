import { useState } from 'react'
import { TileView } from '../TileView'
import { CityTag } from '../icons'
import type { PanelProps } from './types'

/**
 * 정찰한 타일과 맡아둔 타일. 정찰은 배치 단계에서만 하지만, 맡아두기·돌려보내기는 연구·생산 단계에서도 된다.
 * 돌려보내면 일꾼이 돌아오지만, 그 차례에는 선전포고에 쓸 수 없다 (규칙서 9장).
 */
export function ScoutBox({
  game,
  player,
  dispatch,
  canScout,
}: PanelProps & { canScout?: { ok: boolean; why?: string; cities?: { id: number; free: number }[] } }) {
  const placePhase = game.phase === 'place'
  // 도시가 둘 이상이면 정찰을 누를 때 어느 도시의 일꾼을 쓸지 고른다 (남는 일꾼이 없는 도시는 흐리게)
  const [asking, setAsking] = useState(false)
  if (!player.scouted && !player.held && !placePhase) return null
  const cities = canScout?.ok ? canScout.cities : undefined
  return (
    <div className="row scout-box">
      {placePhase && !player.scouting && !player.held && (
        <button
          disabled={!canScout?.ok}
          onClick={() => (cities ? setAsking(!asking) : dispatch({ type: 'scout' }))}
          title={canScout?.why ?? '일꾼 1개로 타일 덱 맨 위 카드 1장을 봅니다. 본 뒤에는 그 전으로 되돌릴 수 없습니다.'}
        >
          🔭 정찰
        </button>
      )}
      {placePhase && cities && asking && !player.scouting && !player.held && (
        <span className="row scout-cities">
          <small>어느 도시의 일꾼으로?</small>
          {cities.map((c) => (
            <button
              key={c.id}
              disabled={c.free < 1}
              onClick={() => {
                setAsking(false)
                dispatch({ type: 'scout', cityId: c.id })
              }}
              title={c.free < 1 ? `도시 ${c.id + 1}에는 남는 일꾼이 없습니다` : `도시 ${c.id + 1}의 일꾼 1개로 정찰합니다`}
            >
              <CityTag id={c.id} /> 도시 {c.id + 1}
            </button>
          ))}
          <button onClick={() => setAsking(false)}>취소</button>
        </span>
      )}
      {placePhase && canScout?.ok && !asking && !player.scouting && !player.held && <small className="muted">일꾼 1을 사용합니다</small>}
      {placePhase && canScout && !canScout.ok && !player.scouting && !player.held && <small className="muted">{canScout.why}</small>}
      {player.scouted && (
        <span className="row">
          <b>정찰한 타일:</b>
          <div style={{ width: 120 }}>
            <TileView card={player.scouted} player={player} />
          </div>
          {player.techs.includes('compass') ? (
            <button onClick={() => dispatch({ type: 'holdScouted' })} title="다음에 새 타일을 얻을 때 이 타일을 가져옵니다. 일꾼 1개가 묶입니다.">
              🧭 맡아두기
            </button>
          ) : (
            <small className="muted">차례가 끝나면 덱에 돌아갑니다 (나침반을 연구하면 맡아둘 수 있음)</small>
          )}
        </span>
      )}
      {player.held && (
        <span className="row">
          <b>맡아둔 타일:</b>
          <div style={{ width: 120 }}>
            <TileView card={player.held} player={player} />
          </div>
          <button onClick={() => dispatch({ type: 'releaseHeld' })} title="덱에 돌려넣고 일꾼을 돌려받습니다. 돌아온 일꾼은 이번 차례에 선전포고에 쓸 수 없습니다.">
            돌려보내기 (일꾼 1개 돌아옴)
          </button>
        </span>
      )}
    </div>
  )
}
