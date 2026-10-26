import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_PREFS, PrefsCtx, usePrefs } from './prefsStore'
import type { Prefs } from './prefsStore'

const KEY = 'civ5-ui-prefs'

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs))
    } catch {
      /* 저장 불가 환경이면 무시 */
    }
  }, [prefs])
  const set = useCallback((p: Partial<Prefs>) => setPrefs((old) => ({ ...old, ...p })), [])
  return <PrefsCtx.Provider value={{ prefs, set }}>{children}</PrefsCtx.Provider>
}

/** 처음 하는 사람을 위한 안내문. 설정에서 끄면 숨긴다. */
export function Help({ children }: { children: ReactNode }) {
  const { prefs } = usePrefs()
  return prefs.help ? <p className="muted help">{children}</p> : null
}
