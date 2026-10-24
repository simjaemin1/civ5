import { useState } from 'react'
import { createGame } from './engine'
import type { GameState } from './engine'
import { GameScreen } from './ui/GameScreen'
import type { UiSave } from './ui/GameScreen'
import { SetupScreen } from './ui/SetupScreen'
import type { Seat } from './ui/SetupScreen'

const SAVE_KEY = 'civ5-save-v1'

function loadSave(): { game: GameState; seats: Seat[]; ui?: UiSave } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    // 오래되었거나 깨진 저장은 무시한다 (이어하기 버튼을 숨김)
    if (!v?.game?.players || !Array.isArray(v.seats) || v.seats.length !== v.game.players.length) return null
    return v
  } catch {
    return null
  }
}

export default function App() {
  const [run, setRun] = useState<{ game: GameState; seats: Seat[]; ui?: UiSave; id: number } | null>(null)
  const saved = loadSave()
  return run ? (
    <GameScreen key={run.id} initial={run.game} seats={run.seats} initialUi={run.ui} onExit={() => setRun(null)} />
  ) : (
    <SetupScreen
      onStart={(seats, seed) => setRun({ game: createGame({ seed, civIds: seats.map((s) => s.civId) }), seats, id: Date.now() })}
      onResume={saved ? () => setRun({ ...saved, id: Date.now() }) : undefined}
    />
  )
}
