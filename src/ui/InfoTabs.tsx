import { useState } from 'react'
import type { GameState, PolicyId, Player } from '../engine'
import { POLICIES, prereqsMet, CIVS, MILITARY_CARDS, TECHS, WONDER_CARDS, civById } from '../engine'
import { TechCard } from './cards/TechCard'
import { PolicyCard } from './cards/PolicyCard'
import { UnitCard } from './cards/UnitCard'
import { WonderCard } from './cards/WonderCard'
import { ICON, josa } from './format'

/** 기술 트리: 열(과학 비용)별로 카드를 늘어놓고, 보유·연구 가능·잠김을 테두리로 보여 준다. 카드를 누르면 크게 본다. */
export function TechTree({ player }: { player: Player }) {
  return (
    <div className="scroll">
      <div className="techgrid cards">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((col) => (
          <div key={col} className="techcol cards">
            <h5>
              {ICON.science}
              {TECHS.find((t) => t.column === col)?.cost}
            </h5>
            {TECHS.filter((t) => t.column === col).map((t) => {
              const owned = player.techs.includes(t.id)
              const pre = t.prereqs?.map((id) => TECHS.find((x) => x.id === id)?.name).join(', ')
              const note = `${t.name} — ${pre ? `선행: ${pre}` : '연결선 없음: 같은 비용의 다른 기술이 있어야 함'}`
              return <TechCard key={t.id} tech={t} width={150} note={note} state={owned ? 'owned' : prereqsMet(player, t) ? 'available' : 'locked'} />
            })}
          </div>
        ))}
      </div>
      <p className="muted">테두리: 초록 = 보유, 주황 = 지금 연구할 수 있음, 흐림 = 선행 기술이 모자람. 카드를 누르면 크게 보입니다.</p>
    </div>
  )
}

type Tab = 'tech' | 'wonder' | 'policy' | 'card' | 'unique' | 'log'

export function InfoTabs({ game, viewer }: { game: GameState; viewer: number }) {
  const [tab, setTab] = useState<Tab>('tech')
  const me = game.players[viewer]
  return (
    <div className="panel">
      <div className="tabs">
        {(
          [
            ['tech', '기술 트리'],
            ['wonder', '불가사의'],
            ['policy', '정책'],
            ['card', '군사 카드'],
            ['unique', '고유 유닛'],
            ['log', '로그'],
          ] as [Tab, string][]
        ).map(([k, name]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {name}
          </button>
        ))}
      </div>
      {tab === 'tech' && <TechTree player={me} />}
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
                  note={`${w.name} — ${TECHS.find((t) => t.id === w.tech)?.name} 필요`}
                  caption={
                    owner !== undefined ? (
                      <>🏛 {josa(civById(game.players[owner].civId).name, '이', '가')} 완성</>
                    ) : (
                      <>
                        필요 진척도 {w.progressNeeded} · {game.players.map((p) => `${civById(p.civId).name} ${prog[p.id] ?? 0}`).join(' / ')}
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
        <p className="muted">공용 덱의 카드는 사실상 무제한이고, 한 종류는 6장까지 가질 수 있습니다. 방향이 있는 카드는 만들 때 방향이 무작위로 정해지고, 누가 어떤 방향의 카드를 가졌는지는 비공개입니다. 무엇을 생산했는지는 로그에 남습니다.</p>
        <table className="table">
          <thead>
            <tr>
              <th>카드</th>
              <th>망치</th>
              <th>기술</th>
              <th>내 보유</th>
            </tr>
          </thead>
          <tbody>
            {MILITARY_CARDS.filter((c) => !c.uniqueOnly).map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.cost}</td>
                <td>{TECHS.find((t) => t.id === c.tech)?.name}</td>
                <td>
                  {me.military.filter((m) => m.defId === c.id).length}/6장
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      {tab === 'unique' && (
        <div>
          <p className="muted">고유 유닛은 문명마다 3장만 존재합니다 (방향 카드는 방향마다 한 장). 효과를 적용할 때는 괄호 안의 기초 카드로 취급합니다. 카드를 누르면 크게 보입니다.</p>
          <div className="unit-row">
            {CIVS.flatMap((c) =>
              c.uniques.map((u) => (
                <div key={u.name} className="unit-group">
                  <b>
                    {c.name} · {u.name}
                  </b>
                  <div className="unit-row">
                    {(u.variants ?? [undefined]).map((v) => (
                      <UnitCard key={v?.join('') ?? 'x'} card={{ defId: u.base, unique: u.name, dirs: v }} width={130} />
                    ))}
                  </div>
                  <small className="muted">
                    🔨{u.cost}
                    {u.variants ? '' : ' · 방향 없는 카드 (3장 모두 같음)'}
                  </small>
                </div>
              )),
            )}
          </div>
        </div>
      )}
      {tab === 'log' && (
        <div className="log">
          {[...game.log].reverse().map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
    </div>
  )
}
