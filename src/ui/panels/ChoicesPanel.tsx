import type { PanelProps } from './types'
import { Help } from '../prefs'

/**
 * 맡아둔 타일이 있을 때, 문화로 타일을 얻으면 맡아둔 타일을 쓸지 덱에서 새로 뽑을지 고른다.
 * (얻은 타일을 붙일 도시는 타일을 보고 그때 고르고, 버릴 일꾼은 그때 도시를 눌러 고른다)
 */
export function ChoicesPanel({ player, dispatch }: PanelProps) {
  const ch = player.choices ?? {}
  if (!player.held) return null
  return (
    <div className="panel choices">
      <h3>선택 사항</h3>
      <div className="row">
        <label>
          문화로 타일을 얻을 때{' '}
          <select value={ch.useHeld === false ? 'draw' : 'held'} onChange={(e) => dispatch({ type: 'setChoices', useHeld: e.target.value === 'held' })}>
            <option value="held">맡아둔 타일 먹기</option>
            <option value="draw">덱에서 새로 뽑기</option>
          </select>
        </label>
      </div>
      <Help>한 번 고르면 다시 바꿀 때까지 유지됩니다.</Help>
    </div>
  )
}
