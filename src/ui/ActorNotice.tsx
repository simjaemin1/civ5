import { ICON } from './format'
import type { ToastMsg } from './actorChange'

/** 기다리는 동안의 문구 ("기술 선택 중…", 점이 천천히 움직인다) */
export function ActorWaiting({ text }: { text: string }) {
  return (
    <div className="actor-notice waiting" role="status">
      <b>
        {text}
        <span className="dots" aria-hidden="true" />
      </b>
    </div>
  )
}

/** 알림 내용: 시점 화면 위쪽 정보 상자 자리에 기본 정보 대신 잠깐 나온다 */
export function ActorNotice({ msg, onClose }: { msg: { m: ToastMsg; n: number }; onClose: () => void }) {
  const { m, n } = msg
  return (
    <div key={n} className={`actor-notice ${m.kind}`} role="status">
      {m.kind === 'undo' ? (
        <b>취소!</b>
      ) : m.kind === 'research' ? (
        <b>🔬 {m.text}</b>
      ) : (
        <div className="produce-sum">
          <div>
            {m.lines.length === 0 && '생산 없음'}
            {m.lines.map((l, i) => (
              <div key={i}>
                도시 {l.cityId + 1}에서 {ICON.hammer}
                {l.hammers}
                {[0, 3, 6].includes(l.hammers % 10) ? '으로' : '로'} {l.what}
              </div>
            ))}
          </div>
          <button onClick={onClose}>닫기</button>
        </div>
      )}
    </div>
  )
}
