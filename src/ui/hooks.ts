import { useEffect } from 'react'

/** 탭 제목으로 차례를 알린다 (다른 창을 보고 있어도 보이게). 핫시트와 온라인이 함께 쓴다 */
export function useTurnTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · 문명 보드게임`
    return () => {
      document.title = '문명 보드게임'
    }
  }, [title])
}

/** Enter: 이 단계의 확정 버튼(`.main [data-hotkey]`). 입력칸·버튼에 초점이 있거나 창이 떠 있으면 무시한다 */
export function useEnterHotkey(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 누르고 있으면 반복 입력이 들어와 여러 단계가 한꺼번에 확정되므로 반복은 무시한다
      if (e.key !== 'Enter' || e.isComposing || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
      const el = e.target as HTMLElement
      if (el.closest('input, select, textarea, button, summary, a, [role="button"]') || document.querySelector('.modal-backdrop')) return
      const btn = document.querySelector<HTMLButtonElement>('.main [data-hotkey]:not(:disabled)')
      if (btn) {
        e.preventDefault()
        btn.click()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
