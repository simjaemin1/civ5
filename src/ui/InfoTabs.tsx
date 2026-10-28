import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { GameState, PolicyId, Player } from '../engine'
import { ArrowLayer } from './ArrowLayer'
import type { Arrow } from './ArrowLayer'
import { POLICIES, prereqsMet, CIVS, MILITARY_CARDS, TECHS, WONDER_CARDS, civById } from '../engine'
import { TechCard } from './cards/TechCard'
import { PolicyCard } from './cards/PolicyCard'
import { UnitCard } from './cards/UnitCard'
import { catalogCard } from './cards/unitImage'
import { WonderCard } from './cards/WonderCard'
import { ICON, josa } from './format'
import { civEmblem } from './civEmblems'
import { markRounds } from './recentLog'

/** 도표의 줄 배치: 줄이 시작되는 기술(선행 기술 없음)이 어느 줄에 놓이는지. 이어지는 기술은 선행 기술과 같은 줄에 놓인다. */
const ROOT_ROW: Record<string, number> = {
  agriculture: 0, civil_service: 0,
  writing: 1, education: 1,
  archery: 2, rifling: 2,
  sailing: 3, ballistics: 3,
  animal_husbandry: 4, atomic_theory: 4,
  mining: 5, combined_arms: 5,
  bronze_working: 6,
}
const APOLLO_ROW = 3
const TECH_GAP = 6
/** 기술 카드 높이 / 폭 (카드 그림 309×444), 카드 줄 수, 맨 위 과학 비용 줄 높이 (화면에 맞출 때 쓴다) */
const CARD_RATIO = 444 / 309
const TREE_ROWS = 7
const HEAD_H = 24

/** 넓이·높이 안에 10열 × 7줄이 다 들어가는 카드 폭 */
function fitCardW(fit: { width: number; height: number }): number {
  const byW = (fit.width - 9 * TECH_GAP - 8) / 10
  const byH = (fit.height - HEAD_H - TREE_ROWS * TECH_GAP - 8) / TREE_ROWS / CARD_RATIO
  return Math.max(30, Math.min(150, Math.floor(Math.min(byW, byH))))
}

function rowOf(id: string): number {
  const t = TECHS.find((x) => x.id === id)!
  if (t.prereqs && t.prereqs.length > 1) return APOLLO_ROW // 여러 줄이 모이는 기술은 가운데
  if (t.prereqs && t.prereqs.length === 1) return rowOf(t.prereqs[0])
  return ROOT_ROW[id] ?? 0
}

/**
 * 기술 트리: 가로는 열(과학 비용), 세로는 도표의 줄. 선행 기술은 왼쪽, 후행 기술은 오른쪽에 놓이고 화살표로 이어진다.
 * 보유·연구 가능·잠김은 테두리로 보여 주고, 카드를 누르면 크게 본다.
 */
export function TechTree({ player, fit, glow }: { player: Player; fit?: { width: number; height: number } | 'screen'; glow?: boolean }) {
  // 열 10개가 가로 스크롤 없이 한눈에 들어오도록 카드 폭을 화면 폭에 맞춘다.
  // fit을 주면 그 넓이·높이 안에 표 전체(10열 × 7줄)가 스크롤 없이 들어가도록 카드 크기를 정한다.
  // fit='screen'이면 표가 놓인 자리에서 화면 아래 끝까지의 높이와 칸 폭에 맞춘다 (페이지를 내리지 않고 한눈에).
  const wrap = useRef<HTMLDivElement>(null)
  const [measuredW, setCardW] = useState(110)
  const cardW = fit && fit !== 'screen' ? fitCardW(fit) : measuredW
  const fixed = !!fit && fit !== 'screen'
  const screen = fit === 'screen'
  useLayoutEffect(() => {
    if (fixed) return
    const el = wrap.current
    if (!el) return
    const measure = () => {
      if (screen) {
        const top = el.getBoundingClientRect().top + window.scrollY
        setCardW(fitCardW({ width: el.clientWidth, height: Math.max(320, window.innerHeight - top - 12) }))
      } else setCardW(Math.max(56, Math.min(150, Math.floor((el.clientWidth - 9 * TECH_GAP - 8) / 10))))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [fixed, screen])
  const cols = Array.from({ length: 10 }, (_, i) => i + 1)
  const arrows: Arrow[] = TECHS.flatMap((t) =>
    (t.prereqs ?? []).map((pre) => ({
      from: pre,
      to: t.id,
      color: player.techs.includes(pre) ? '#2e7d32' : '#9a9a9a',
    })),
  )
  return (
    <div className="techwrap" ref={wrap}>
      <ArrowLayer arrows={arrows}>
        <div className="techmap" style={{ gridTemplateColumns: `repeat(10, ${cardW}px)`, gap: `${TECH_GAP}px` }}>
          {cols.map((col) => (
            <h5 key={col} className="techmap-head" style={{ gridColumn: col, gridRow: 1 }}>
              {ICON.science}
              {TECHS.find((t) => t.column === col)?.cost}
            </h5>
          ))}
          {TECHS.map((t) => {
            const owned = player.techs.includes(t.id)
            const pre = t.prereqs?.map((id) => TECHS.find((x) => x.id === id)?.name).join(', ')
            const note = `${t.name} — ${pre ? `선행: ${pre}` : '연결선 없음: 같은 비용의 다른 기술이 있어야 함'}`
            return (
              <div key={t.id} data-slot={t.id} className="techmap-cell" style={{ gridColumn: t.column, gridRow: rowOf(t.id) + 2 }}>
                <TechCard tech={t} width={cardW} note={note} state={owned ? 'owned' : prereqsMet(player, t) ? 'available' : 'locked'} glow={glow} />
              </div>
            )
          })}
        </div>
      </ArrowLayer>
      {!fit && <p className="muted">
        왼쪽이 선행 기술, 오른쪽이 후행 기술입니다 (화살표 초록 = 이미 얻은 선행 기술). 테두리: 초록 = 보유, 주황 = 지금 연구할 수 있음, 흐림 = 선행 기술이 모자람. 카드를 누르면 크게 보입니다.
      </p>}
    </div>
  )
}

type Tab = 'wonder' | 'policy' | 'card' | 'unique'

// 기술 트리는 플라스크 버튼과 겹쳐서 빼고, 로그는 화면 아래 칸(LogPanel)에 둔다 (사용자 결정)
const TABS: [Tab, string][] = [
  ['wonder', '불가사의'],
  ['policy', '정책'],
  ['card', '군사 카드'],
  ['unique', '고유 유닛'],
]

/**
 * 맨 위 줄의 정보 탭(불가사의·정책·군사 카드·고유 유닛).
 * 탭을 누르면 그 내용이 화면 위에 겹쳐 뜬다 (아래 내용이 밀리지 않는다). 같은 탭을 다시 누르거나 닫기, Esc로 닫는다.
 */
export function InfoTabs({ game, viewer }: { game: GameState; viewer: number }) {
  const [tab, setTab] = useState<Tab | null>(null)
  useEffect(() => {
    if (!tab) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setTab(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab])
  return (
    <>
      <div className="tabs top-tabs" role="tablist" aria-label="정보">
        {TABS.map(([k, name]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(tab === k ? null : k)}>
            {name}
          </button>
        ))}
      </div>
      {tab && (
        <div className="tree-float info-float" role="dialog" aria-label={TABS.find(([k]) => k === tab)![1]}>
          <div className="tree-overlay-head">
            <b>{TABS.find(([k]) => k === tab)![1]}</b>
            <button onClick={() => setTab(null)}>닫기 ✕</button>
          </div>
          <TabContent game={game} viewer={viewer} tab={tab} />
        </div>
      )}
    </>
  )
}

function TabContent({ game, viewer, tab }: { game: GameState; viewer: number; tab: Tab }) {
  const me = game.players[viewer]
  return (
    <>
      {tab === 'wonder' && (
        <div>
          <div className="wonder-grid">
            {WONDER_CARDS.map((w) => {
              const owner = game.wonderOwners[w.id]
              const prog = game.wonderProgress[w.id] ?? {}
              return (
                <WonderCard
                  key={w.id}
                  wonder={w}
                  width={300}
                  owned={owner !== undefined}
                  ownerEmblem={owner !== undefined ? { url: civEmblem(game.players[owner].civId), name: civById(game.players[owner].civId).name } : undefined}
                  note={`${w.name} — ${TECHS.find((t) => t.id === w.tech)?.name} 필요`}
                  caption={
                    owner !== undefined ? (
                      <>🏛 {josa(civById(game.players[owner].civId).name, '이', '가')} 완성</>
                    ) : (
                      <>
                        필요 진척도 {w.progressNeeded} ·{' '}
                        {game.players.map((p, i) => (
                          <span key={p.id}>
                            {i > 0 && ' / '}
                            {/* 진척도가 올라간 문명은 굵게 */}
                            {(prog[p.id] ?? 0) > 0 ? <b className="prog-on">{`${civById(p.civId).name} ${prog[p.id]}`}</b> : `${civById(p.civId).name} 0`}
                          </span>
                        ))}
                        <br />
                        기술: {TECHS.find((t) => t.id === w.tech)?.name}
                      </>
                    )
                  }
                />
              )
            })}
          </div>
          <p className="muted">카드를 누르면 크게 보입니다. 카드 오른쪽의 검은 원 개수 + 기술 아이콘 1개가 필요한 진척도입니다.</p>
        </div>
      )}
      {tab === 'policy' && (
        <div>
          <div className="cardgrid">
            {(Object.keys(POLICIES) as PolicyId[]).map((id) => (
              <PolicyCard key={id} policy={id} width={170} active={me.policy === id} />
            ))}
          </div>
          <p className="muted">정책은 하나만 시행합니다. 주황 테두리가 내가 지금 시행 중인 정책입니다. 카드를 누르면 크게 보입니다.</p>
        </div>
      )}
      {tab === 'card' && (
        <div className="scroll">
        <p className="muted">한 종류는 5장까지 가질 수 있습니다 (고유 유닛은 따로 3장, 고유 유닛이 있는 문명은 그 기초 카드를 2장까지: 예를 들어 몽골은 케식텐 3장·기사 2장). 문명별 종류별 보유 수는 모두에게 공개됩니다. 방향이 있는 카드의 방향은 만들 때 무작위로 정해지고 가진 사람만 압니다. 카드를 누르면 크게 보입니다.</p>
        <div className="unit-row">
          {MILITARY_CARDS.filter((c) => !c.uniqueOnly).map((c) => (
            <div key={c.id} className="policy-pick">
              <UnitCard card={catalogCard(c.id)} width={130} />
              <small className="holders">
                {game.players
                  .map((p) => ({ p, n: p.military.filter((m) => m.defId === c.id && !m.unique).length, u: p.military.filter((m) => m.defId === c.id && m.unique).length }))
                  .filter((x) => x.n + x.u > 0)
                  .map(({ p, n, u }) => (
                    <span key={p.id} className={p.id === viewer ? 'mine' : ''}>
                      {/* 고유 유닛은 원본 칸에 따로 적는다: "아즈텍 5장(고유 3장)" */}
                      {civById(p.civId).name} {n}장{u > 0 ? `(고유 ${u}장)` : ''}
                    </span>
                  ))}
                {game.players.every((p) => !p.military.some((m) => m.defId === c.id)) && <span className="none">보유 없음</span>}
              </small>
            </div>
          ))}
        </div>
        </div>
      )}
      {tab === 'unique' && <UniqueTab civId={me.civId} />}
    </>
  )
}

/** 화면 아래 칸의 전체 기록 (최근 것이 위) */
export function LogPanel({ game }: { game: GameState }) {
  return (
    <div className="panel">
      <h3>로그</h3>
      <div className="log">
        {markRounds([...game.log].reverse()).map((l, i) => (
          <div key={i}>
            <span className="log-r">{l.mark}</span> {l.text}
          </div>
        ))}
      </div>
    </div>
  )
}

/** 고유 유닛 탭: 문명 기호를 늘어놓고, 기호를 누르면 그 문명의 고유 유닛 카드를 보여 준다 (처음에는 내 문명) */
function UniqueTab({ civId }: { civId: string }) {
  const [sel, setSel] = useState(civId)
  const civ = CIVS.find((c) => c.id === sel) ?? CIVS[0]
  return (
    <div>
      <div className="emblem-grid" role="tablist" aria-label="문명">
        {CIVS.map((c) => {
          const img = civEmblem(c.id)
          return (
            <button key={c.id} role="tab" aria-selected={c.id === sel} className={`emblem-pick${c.id === sel ? ' on' : ''}`} onClick={() => setSel(c.id)} title={`${c.name} 고유 유닛`}>
              {img ? <img src={img} alt="" draggable={false} /> : <span className="emblem-letter">{c.name.slice(0, 1)}</span>}
              <small>{c.name}</small>
            </button>
          )
        })}
      </div>
      <h4>
        {civ.name}의 고유 유닛 <small className="muted">(문명마다 3장 · 효과는 괄호 안의 기초 카드로 취급 · 카드를 누르면 크게)</small>
      </h4>
      <div className="unit-row">
        {civ.uniques.map((u) => (
          <div key={u.name} className="unit-group">
            <b>{u.name}</b>
            <div className="unit-row">
              {(u.variants ?? [undefined]).map((v) => (
                <UnitCard key={v?.join('') ?? 'x'} card={{ defId: u.base, unique: u.name, dirs: v }} width={130} />
              ))}
            </div>
            <small className="muted">
              {ICON.hammer}
              {u.cost}
              {u.variants ? '' : ' · 방향 없는 카드 (3장 모두 같음)'}
            </small>
          </div>
        ))}
        {civ.uniques.length === 0 && <p className="muted">고유 유닛이 없습니다.</p>}
      </div>
    </div>
  )
}
