import { useState } from 'react'
import type { ReactNode } from 'react'

interface Props {
  onClick: () => void
  /** 있으면 한 번 더 확인한다 (예: 쓰지 않은 망치가 사라짐) */
  warn?: string | null
  children: ReactNode
  className?: string
  disabled?: boolean
  /** Enter 키로 누르는 이 단계의 확정 버튼 */
  hotkey?: boolean
  title?: string
}

/** 쓰지 않은 자원이 사라지는 행동은 경고를 보여 주고 두 번째 클릭에 실행한다. */
export function ConfirmButton({ onClick, warn, children, className = 'primary', disabled, hotkey, title }: Props) {
  const [asked, setAsked] = useState(false)
  if (asked && warn) {
    return (
      <span className="confirm">
        <span className="warn">⚠ {warn}</span>
        <button className={className} data-hotkey={hotkey ? '' : undefined} onClick={() => { setAsked(false); onClick() }} autoFocus>
          그래도 진행
        </button>
        <button onClick={() => setAsked(false)}>취소</button>
      </span>
    )
  }
  return (
    <button className={className} disabled={disabled} title={title} data-hotkey={hotkey ? '' : undefined} onClick={() => (warn ? setAsked(true) : onClick())}>
      {children}
    </button>
  )
}
