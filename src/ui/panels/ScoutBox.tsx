import { TileView } from '../TileView'
import type { PanelProps } from './types'

/**
 * 정찰한 타일과 맡아둔 타일. 정찰은 배치 단계에서만 하지만, 맡아두기·돌려보내기는 연구·생산 단계에서도 된다.
 * 돌려보내면 일꾼이 돌아와 선전포고에 쓸 수 있다.
 */
export function ScoutBox({ game, player, dispatch, canScout }: PanelProps & { canScout?: { ok: boolean; why?: string } }) {
  const placePhase = game.phase === 'place'
  if (!player.scouted && !player.held && !placePhase) return null
  return (
    <div className="row scout-box">
      {placePhase && !player.scouting && !player.held && (
        <button disabled={!canScout?.ok} onClick={() => dispatch({ type: 'scout' })} title={canScout?.why ?? '일꾼 1개로 타일 덱 맨 위 카드 1장을 봅니다. 본 뒤에는 그 전으로 되돌릴 수 없습니다.'}>
          🔭 정찰
        </button>
      )}
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
          <button onClick={() => dispatch({ type: 'releaseHeld' })} title="덱에 돌려넣고 일꾼을 돌려받습니다">
            돌려보내기 (일꾼 1개 돌아옴)
          </button>
        </span>
      )}
    </div>
  )
}
