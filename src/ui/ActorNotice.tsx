import { ICON } from './format'
import type { ToastMsg } from './actorChange'

/** 알림 내용: 시점 화면 위쪽 정보 상자 자리에 기본 정보 대신 잠깐 나온다 */
export function ActorNotice({ msg }: { msg: { m: ToastMsg; n: number } }) {
  const { m, n } = msg
  return (
    <div key={n} className={`actor-notice ${m.kind}`} role="status">
      {m.kind === 'undo' ? (
        <b>취소!</b>
      ) : m.kind === 'research' ? (
        <b>🔬 {m.text}</b>
      ) : (
        <div>
          {m.lines.map((l, i) => (
            <div key={i}>
              도시 {l.cityId + 1}에서 {ICON.hammer}
              {l.hammers}
              {[0, 3, 6].includes(l.hammers % 10) ? '으로' : '로'} {l.what}
              {i < m.lines.length - 1 ? ',' : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
