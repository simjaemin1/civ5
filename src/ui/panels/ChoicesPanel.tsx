import type { PanelProps } from './types'
import { Help } from '../prefs'

/** 문화로 얻는 타일을 어디에 붙일지, 맡아둔 타일을 쓸지, 일꾼을 버릴 때 어느 도시에서 버릴지 고른다. */
export function ChoicesPanel({ player, dispatch }: PanelProps) {
  const ch = player.choices ?? {}
  if (player.cities.length < 2 && !player.held) return null
  const cityOptions = (value: number | undefined, onChange: (v: number | null) => void) => (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
      <option value="">자동</option>
      {player.cities.map((c) => (
        <option key={c.id} value={c.id}>
          도시 {c.id + 1}
        </option>
      ))}
    </select>
  )
  return (
    <div className="panel choices">
      <h3>선택 사항</h3>
      <div className="row">
        {player.held && (
          <label>
            문화로 타일을 얻을 때{' '}
            <select value={ch.useHeld === false ? 'draw' : 'held'} onChange={(e) => dispatch({ type: 'setChoices', useHeld: e.target.value === 'held' })}>
              <option value="held">맡아둔 타일 먹기</option>
              <option value="draw">덱에서 새로 뽑기</option>
            </select>
          </label>
        )}
        {player.cities.length > 1 && (
          <>
            <label>
              얻은 타일 붙일 도시 {cityOptions(ch.cultureCity, (v) => dispatch({ type: 'setChoices', cultureCity: v }))}
            </label>
          </>
        )}
      </div>
      <Help>한 번 고르면 다시 바꿀 때까지 유지됩니다. 문화로 얻은 타일은 얻을 때마다 타일을 보고 붙일 도시를 고릅니다.</Help>
    </div>
  )
}
