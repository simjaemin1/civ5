import { createContext, useContext } from 'react'

/** 화면 설정: 안내문 보이기, 할 일 없는 단계 자동 넘기기. 보는 사람 브라우저에만 저장한다. */
export interface Prefs {
  help: boolean
  autoSkip: boolean
  /** AI 한 행동 사이 간격 (ms) */
  aiSpeed: number
  /** 효과음 (선전포고·새 타일·새 시대·새 정책·새 기술) */
  sound: boolean
}
export const DEFAULT_PREFS: Prefs = { help: true, autoSkip: false, aiSpeed: 300, sound: true }

export const PrefsCtx = createContext<{ prefs: Prefs; set: (p: Partial<Prefs>) => void }>({ prefs: DEFAULT_PREFS, set: () => {} })

export const usePrefs = () => useContext(PrefsCtx)
