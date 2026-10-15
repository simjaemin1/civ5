import { useState } from 'react'
import { createGame } from './engine'
import type { GameState } from './engine'
import { GameScreen } from './ui/GameScreen'
import { SetupScreen } from './ui/SetupScreen'
import type { Seat } from './ui/SetupScreen'

const SAVE_KEY = 'civ5-save-v1'

function loadSave(): { game: GameState; seats: Seat[] } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function App() {
  const [run, setRun] = useState<{ game: GameState; seats: Seat[]; id: number } | null>(null)
  const saved = loadSave()
  return run ? (
    <GameScreen key={run.id} initial={run.game} seats={run.seats} onExit={() => setRun(null)} />
  ) : (
    <SetupScreen
      onStart={(seats, seed) => setRun({ game: createGame({ seed, civIds: seats.map((s) => s.civId) }), seats, id: Date.now() })}
      onResume={saved ? () => setRun({ ...saved, id: Date.now() }) : undefined}
    />
  )
}
