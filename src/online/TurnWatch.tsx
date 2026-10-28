import type { GameView, Player } from '../engine'
import { civById, cardStats } from '../engine'
import { Board4 } from '../ui/panels/BattlePanel'

/**
 * 전투를 지켜본다. 카드를 놓는 동안(전투 준비)은 누가 놓았는지만 알려 주고,
 * 카드가 공개된 뒤에는 양쪽 배치와 대상 선택을 모두 보여 준다. 결과는 전투 장면으로 이어진다.
 */
export function BattleWatch({ game, viewer }: { game: GameView; viewer: number }) {
  const b = game.battle
  if (!b) return null
  const { attackerId, defenderId } = b.decl
  const bottom = viewer === attackerId || viewer === defenderId ? viewer : attackerId
  const top = bottom === attackerId ? defenderId : attackerId
  const name = (id: number) => civById(game.players[id].civId).name
  const notes: string[] = []
  if (b.step === 'choose') {
    for (const pid of [attackerId, defenderId]) {
      const pl: Player = game.players[pid]
      ;(b.slots[pid] ?? []).forEach((uid, idx) => {
        const inst = uid === null ? undefined : pl.military.find((m) => m.uid === uid)
        if (!inst) return
        const st = cardStats(inst)
        if (st.choose === undefined) return
        const t = b.picks[inst.uid]
        const other = pid === attackerId ? defenderId : attackerId
        const slotOf = typeof t === 'number' ? (b.slots[other] ?? []).indexOf(t) + 1 : 0
        notes.push(
          `${name(pid)} ${idx + 1}번 ${st.name}: ` + (t === undefined ? '대상을 고르는 중' : t === null ? '아무도 공격하지 않기로 함' : `${name(other)} ${slotOf}번 카드를 공격 대상으로 골랐습니다`),
        )
      })
    }
  }
  return (
    <div className="panel turn-watch" data-testid="battle-watch">
      <h3>
        ⚔ 전투 — {name(attackerId)}(공격) vs {name(defenderId)}(수비)
      </h3>
      {b.step === 'arrange' ? (
        <>
          <p>전투 준비 중입니다. 카드를 놓는 동안에는 서로 보이지 않고, 둘 다 놓으면 한꺼번에 공개됩니다.</p>
          <ul className="plain">
            {[attackerId, defenderId].map((id) => (
              <li key={id}>
                {name(id)}: {b.slots[id] ? '✓ 배치 완료' : '카드를 놓는 중…'}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="muted">카드가 공개되었습니다. 대상을 고르는 카드가 있으면 차례로 고르고, 모두 끝나면 전투 장면이 시작됩니다. 위쪽은 {name(top)}, 아래쪽은 {name(bottom)}입니다.</p>
          <Board4 game={game} pid={top} mirror />
          <div style={{ height: 24 }} />
          <Board4 game={game} pid={bottom} />
          {notes.map((t) => (
            <p key={t} className="enemy-pick">
              👁 {t}
            </p>
          ))}
        </>
      )}
    </div>
  )
}
