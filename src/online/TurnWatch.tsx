import type { GameView, Player } from '../engine'
import { WONDERS, civById, cardStats, techById } from '../engine'
import { Board } from '../ui/Board'
import { ICON } from '../ui/format'
import { TechCard } from '../ui/cards/TechCard'
import { Board4 } from '../ui/panels/BattlePanel'

/** 한 문명의 내정 단계 (규칙서 3장): 기다리는 동안 지금 어디쯤인지 보여 준다 */
const STEPS: { phase: GameView['phase']; label: string; doing: string }[] = [
  { phase: 'setup', label: '도시 세우기', doing: '첫 도시를 세우는 중' },
  { phase: 'place', label: '① 일꾼 배치', doing: '일꾼을 배치하는 중' },
  { phase: 'research', label: '② 기술 연구', doing: '기술을 연구하는 중' },
  { phase: 'produce', label: '③ 생산', doing: '생산·투자를 하는 중' },
  { phase: 'declare', label: '④ 선전포고', doing: '선전포고를 정하는 중' },
]

interface Props {
  game: GameView
  actor: number
  name: string
}

/**
 * 다른 문명의 차례를 지켜본다. 현실 보드게임처럼 이 문명이 무엇을 하는지는 모두 보인다:
 * 지금 단계, 올려 둔 일꾼, 연구한 기술, 생산·투자 (전투 카드 배치만 전투 준비 때 가려진다).
 * 아직 확정하지 않은 고민(고르는 중인 화면)은 서버에 없으므로, 행동을 확정할 때마다 화면이 따라 바뀐다.
 */
export function TurnWatch({ game, actor, name }: Props) {
  const p = game.players[actor]
  const civName = civById(p.civId).name
  const stepIdx = STEPS.findIndex((s) => s.phase === game.phase)
  const lines = game.log.filter((l) => l.startsWith(`[R${game.round}] ${civName}`)).map((l) => l.replace(/^\[R\d+\] /, ''))
  const bids = game.investments.filter((i) => i.playerId === actor)
  const fresh = p.freshTechs.map((id) => techById(id))
  return (
    <div className="panel turn-watch" data-testid="turn-watch">
      <h3>
        👀 {civName}({name})의 차례를 지켜보는 중 — {STEPS[stepIdx]?.doing ?? '진행 중'}
      </h3>
      <div className="watch-grid">
        <section>
          <h4>이번 차례에 한 일</h4>
          {lines.length ? (
            <ul className="plain">
              {lines.slice(-12).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">아직 아무것도 하지 않았습니다.</p>
          )}
          {p.turn && (
            <p className="muted small">
              산출 {p.turn.yields.cities.map((c) => (
                <span key={c.cityId} className="res-amount">
                  {ICON.food}
                  {c.food} {ICON.hammer}
                  {c.hammer}
                </span>
              ))}
              {ICON.science}
              {p.turn.yields.science} {ICON.gold}
              {p.turn.yields.gold}
            </p>
          )}
          {bids.length > 0 && (
            <p>
              불가사의 투자:{' '}
              {bids.map((b, i) => (
                <span key={i} className="res-amount">
                  {WONDERS[b.wonderId]?.name ?? b.wonderId} {ICON.hammer}
                  {b.hammers}
                </span>
              ))}
            </p>
          )}
        </section>
        {fresh.length > 0 && (
          <section>
            <h4>연구한 기술</h4>
            <div className="row">
              {fresh.map((t) => (
                <TechCard key={t.id} tech={t} state="owned" width={110} />
              ))}
            </div>
          </section>
        )}
      </div>
      {p.cities.length > 0 && (
        <>
          <h4>{civName}의 영토 (일꾼을 올려 둔 타일에 토큰이 보입니다)</h4>
          <Board game={game} player={p} />
        </>
      )}
    </div>
  )
}

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
