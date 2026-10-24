import { createContext, useContext } from 'react'

/** 화면 설정: 안내문 보이기, 할 일 없는 단계 자동 넘기기. 보는 사람 브라우저에만 저장한다. */
export interface Prefs {
  help: boolean
  autoSkip: boolean
}
export const DEFAULT_PREFS: Prefs = { help: true, autoSkip: false }

export const PrefsCtx = createContext<{ prefs: Prefs; set: (p: Partial<Prefs>) => void }>({ prefs: DEFAULT_PREFS, set: () => {} })

export const usePrefs = () => useContext(PrefsCtx)
