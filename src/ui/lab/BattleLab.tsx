import { useMemo, useState } from 'react'
import { CIVS, RuleError, actorOf, civById } from '../../engine'
import type { Action, GameState } from '../../engine'
import { BattlePanel } from '../panels/BattlePanel'
import { BattleReportModal } from '../BattleReportModal'
import { UnitCard } from '../cards/UnitCard'
import { cardText } from '../format'
import { buildLab, labAi, labApply, labCatalog, labReport, labTiles } from './labGame'
import type { LabCard, LabSetup, LabSide } from './labGame'

const STORE = 'civ5-lab-v1'
const KIND = { normal: '일반 선전포고 (타일 점령)', retake: '탈환 선전포고', city: '도시 공격' } as const
const TILES = labTiles()

function defaultSide(civId: string): LabSide {
  // 기본 편성: 서로 다른 일반 카드 3종
  const seen = new Set<string>()
  const cards = labCatalog(civId).filter((c) => !c.unique && !seen.has(c.defId) && seen.add(c.defId)).slice(0, 3)
  return { civId, cards, lighthouse: false, rocketry: false }
}

function loadSetup(): LabSetup {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? 'null') as LabSetup | null
    if (v?.attacker?.cards && v.defender?.cards && v.tile?.terrains) return v
  } catch {
    // 저장이 깨졌으면 기본 편성
  }
  return { attacker: defaultSide(CIVS[0].id), defender: defaultSide(CIVS[1].id), kind: 'normal', tile: TILES[0], attackerFirst: true }
}

function saveSetup(s: LabSetup) {
  try {
    localStorage.setItem(STORE, JSON.stringify(s))
  } catch {
    // 저장할 수 없어도 랩은 그대로 쓴다
  }
}

/** 모의 전투 랩: 두 문명의 카드를 자유롭게 골라 실제 전투 화면으로 놓고, 엔진이 계산한 전투를 애니메이션으로 본다. */
export function BattleLab({ onBack }: { onBack: () => void }) {
  const [setup, setSetupRaw] = useState<LabSetup>(loadSetup)
  const [game, setGame] = useState<GameState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showReport, setShowReport] = useState(true)
  const setSetup = (s: LabSetup) => {
    setSetupRaw(s)
    saveSetup(s)
  }
  const start = () => {
    setError(null)
    setShowReport(true)
    setGame(buildLab(setup))
  }
  const run = (fn: () => GameState) => {
    try {
      setGame(fn())
      setError(null)
    } catch (e) {
      if (e instanceof RuleError) setError(e.message)
      else throw e
    }
  }
  const dispatch = (a: Action) => game && run(() => labApply(game, a))
  const report = game ? labReport(game) : null

  if (game && !report) {
    const b = game.battle!
    const actor = actorOf(game)
    const role = actor === 0 ? '공격' : '수비'
    return (
      <div className="lab">
        <div className="lab-bar">
          <button onClick={() => setGame(null)}>← 편성으로</button>
          <b>
            ⚔ 모의 전투 — 지금 {role} 측({civById(game.players[actor].civId).name}) {b.step === 'arrange' ? '카드 놓기' : '대상 고르기'}
          </b>
          <button onClick={() => run(() => labAi(game))}>🤖 AI가 대신</button>
        </div>
        {b.step === 'arrange' && actor === 1 && <p className="muted">공격 측 배치는 끝났고 가려져 있습니다. 실제 게임처럼 수비 측도 보지 않고 놓습니다.</p>}
        {error && <p className="error">⚠ {error}</p>}
        <BattlePanel key={`${actor}-${b.step}-${b.chooseQueue.length}`} game={game} player={game.players[actor]} dispatch={dispatch} />
      </div>
    )
  }

  return (
    <div className="lab">
      <div className="lab-bar">
        <button onClick={onBack}>← 처음 화면</button>
        <b>⚔ 모의 전투 랩</b>
        <span className="muted">카드를 마음대로 골라 실제 전투 규칙으로 싸워 봅니다. 게임에는 영향이 없습니다.</span>
      </div>
      <div className="lab-common">
        <label>
          전투 종류{' '}
          <select value={setup.kind} onChange={(e) => setSetup({ ...setup, kind: e.target.value as LabSetup['kind'] })}>
            {Object.entries(KIND).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          목표 타일 지형{' '}
          <select value={setup.tile.terrains.join('·')} onChange={(e) => setSetup({ ...setup, tile: TILES.find((t) => t.terrains.join('·') === e.target.value)! })}>
            {TILES.map((t) => (
              <option key={t.id} value={t.terrains.join('·')}>
                {t.terrains.join('·')}
                {t.terrains.includes('해안') ? ' (해안 전투)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          대상 먼저 고르는 쪽{' '}
          <select value={setup.attackerFirst ? 'a' : 'd'} onChange={(e) => setSetup({ ...setup, attackerFirst: e.target.value === 'a' })}>
            <option value="a">공격 측 (차례 순서가 빠름)</option>
            <option value="d">수비 측 (차례 순서가 빠름)</option>
          </select>
        </label>
      </div>
      <div className="lab-sides">
        <SideEditor title="공격 측" side={setup.attacker} onChange={(attacker) => setSetup({ ...setup, attacker })} coastal={setup.tile.terrains.includes('해안')} />
        <SideEditor title="수비 측" side={setup.defender} onChange={(defender) => setSetup({ ...setup, defender })} coastal={setup.tile.terrains.includes('해안')} />
      </div>
      <p>
        <button className="primary" onClick={start}>
          ⚔ 전투 시작 (공격 측부터 카드 놓기)
        </button>
      </p>
      {game && report && showReport && (
        <BattleReportModal game={game} report={report} viewerId={0} lossSound onClose={() => setShowReport(false)} />
      )}
      {game && report && !showReport && (
        <p>
          지난 결과: <b>{report.winner === 'attacker' ? '공격' : '수비'} 측 승리</b> — {report.outcome} (남은 카드 공격 {report.survivors.attacker} / 수비 {report.survivors.defender}){' '}
          <button onClick={() => setShowReport(true)}>▶ 다시 보기</button>
        </p>
      )}
    </div>
  )
}

function SideEditor({ title, side, onChange, coastal }: { title: string; side: LabSide; onChange: (s: LabSide) => void; coastal: boolean }) {
  const catalog = useMemo(() => labCatalog(side.civId), [side.civId])
  const [pick, setPick] = useState(catalog[0]?.key ?? '')
  const chosen = catalog.find((c) => c.key === pick) ?? catalog[0]
  const add = (c: LabCard) => onChange({ ...side, cards: [...side.cards, c] })
  const civ = civById(side.civId)
  return (
    <section className="lab-side">
      <h3>
        {title}: {civ.name}
      </h3>
      <label>
        문명{' '}
        <select
          value={side.civId}
          onChange={(e) => {
            // 다른 문명의 고유 유닛은 뺀다
            const own = new Set(labCatalog(e.target.value).map((c) => c.key))
            onChange({ ...side, civId: e.target.value, cards: side.cards.filter((c) => own.has(c.key)) })
          }}
        >
          {CIVS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="lab-add">
        <select value={chosen?.key} onChange={(e) => setPick(e.target.value)} aria-label={`${title} 추가할 카드`}>
          {catalog.map((c) => (
            <option key={c.key} value={c.key}>
              {c.unique ? '★ ' : ''}
              {cardText(c, false)}
            </option>
          ))}
        </select>
        <button onClick={() => chosen && add(chosen)}>+ 추가</button>
      </div>
      <div className="lab-flags">
        <label>
          <input type="checkbox" checked={side.lighthouse} onChange={(e) => onChange({ ...side, lighthouse: e.target.checked })} /> 알렉산드리아 등대
        </label>
        <label>
          <input type="checkbox" checked={side.rocketry} onChange={(e) => onChange({ ...side, rocketry: e.target.checked })} /> 로켓공학 연구
        </label>
      </div>
      <p className="muted small">
        가진 카드 {side.cards.length}장 (전투에는 4장까지 냅니다). 카드를 누르면 뺍니다.
        {!coastal && side.cards.some((c) => cardText(c).includes('해안')) ? ' 해안 전용 카드는 해안 타일이 아니면 낼 수 없습니다.' : ''}
      </p>
      <div className="hand">
        {side.cards.map((c, i) => (
          <UnitCard key={i} card={c} width={96} title={`${cardText(c)} (눌러서 빼기)`} onClick={() => onChange({ ...side, cards: side.cards.filter((_, j) => j !== i) })} />
        ))}
      </div>
    </section>
  )
}
