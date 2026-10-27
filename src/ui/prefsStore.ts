import { createContext, useContext } from 'react'

/** 화면 설정: 안내문 보이기, 할 일 없는 단계 자동 넘기기. 보는 사람 브라우저에만 저장한다. */
export interface Prefs {
  help: boolean
  autoSkip: boolean
  /** AI 한 행동 사이 간격 (ms) */
  aiSpeed: number
  /** 효과음 (선전포고·새 타일·새 시대·새 정책·새 기술) */
  sound: boolean
  /** 넓은 화면의 오른쪽 정보 칸에 내 문명 카드·기술표를 펼쳐 둘지 (맨 위 문명 기호·네모 버튼으로 켜고 끈다) */
  dockCiv: boolean
  dockTech: boolean
}
export const DEFAULT_PREFS: Prefs = { help: true, autoSkip: false, aiSpeed: 300, sound: true, dockCiv: true, dockTech: true }

export const PrefsCtx = createContext<{ prefs: Prefs; set: (p: Partial<Prefs>) => void }>({ prefs: DEFAULT_PREFS, set: () => {} })

export const usePrefs = () => useContext(PrefsCtx)
