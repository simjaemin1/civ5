import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * 화면 전체를 덮는 창(카드 크게 보기, 도감 등)을 문서 맨 끝에 그린다.
 * 오른쪽 칸처럼 고정(sticky)된 칸 안에 그대로 두면 그 칸에 갇혀 위쪽 단계 막대 같은 고정 요소에 가려진다.
 */
export function Overlay({ children }: { children: ReactNode }) {
  return typeof document === 'undefined' ? <>{children}</> : createPortal(children, document.body)
}
