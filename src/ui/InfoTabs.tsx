import { useState } from 'react'
import type { GameState, Player } from '../engine'
import { prereqsMet, CIVS, MILITARY_CARDS, TECHS, WONDER_CARDS, civById, culture, happiness, totalWorkers, tourism } from '../engine'
import { TechCard } from './cards/TechCard'
import { cardText, conditionText, ICON, policyName, wonderEffectText } from './format'

export function PlayersTable({ game, seats, actor }: { game: GameState; seats: { ai: boolean }[]; actor: number }) {
  return (
    <div className="scroll">
    <table className="table">
      <thead>
        <tr>
          <th>문명</th>
          <th>문화</th>
          <th>관광</th>
          <th>일꾼/행복</th>
          <th>기술</th>
          <th>정책</th>
          <th>장군</th>
          <th>군사</th>
          <th>불가사의</th>
        </tr>
      </thead>
      <tbody>
        {game.order.map((id) => {
          const p = game.players[id]
          const isNow = game.phase !== 'over' && actor === id
          return (
            <tr key={id} className={`${p.eliminated ? 'out' : ''}${isNow ? ' now' : ''}`}>
              <td>
                {civById(p.civId).name} {seats[id]?.ai ? '🤖' : '👤'} {p.eliminated ? '(탈락)' : ''}
              </td>
              <td>{culture(p)}</td>
              <td>{tourism(p)}</td>
              <td>
                {totalWorkers(p)}/{p.cities.length ? happiness(p) : '-'}
              </td>
              <td>{p.techs.length}</td>
              <td>{policyName(p.policy)}</td>
              <td>{p.generals}</td>
              <td>{p.military.length}</td>
              <td>{p.wonders.map((w) => WONDER_CARDS.find((x) => x.id === w)?.name).join(', ') || '-'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
    </div>
  )
}

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

type Tab = 'tech' | 'wonder' | 'card' | 'unique' | 'log'

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
        <div className="scroll">
        <table className="table">
          <thead>
            <tr>
              <th>불가사의</th>
              <th>기술</th>
              <th>최소 망치</th>
              <th>조건</th>
              <th>효과</th>
              <th>진척도 (필요)</th>
            </tr>
          </thead>
          <tbody>
            {WONDER_CARDS.map((w) => {
              const owner = game.wonderOwners[w.id]
              const prog = game.wonderProgress[w.id] ?? {}
              return (
                <tr key={w.id}>
                  <td>{w.name}</td>
                  <td>{TECHS.find((t) => t.id === w.tech)?.name}</td>
                  <td>{w.minHammers}</td>
                  <td>{conditionText(w.condition)}</td>
                  <td>{w.effects.map(wonderEffectText).join(', ')}</td>
                  <td>
                    {owner !== undefined
                      ? `🏛 ${civById(game.players[owner].civId).name}`
                      : `(필요 ${w.progressNeeded}) ` + game.players.map((p) => `${civById(p.civId).name} ${prog[p.id] ?? 0}`).join(' / ')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
        <div className="scroll">
          <p className="muted">고유 유닛은 문명마다 3장만 존재합니다 (방향 카드는 방향마다 한 장). 능력치와 효과는 카드에 적힌 그대로이고, 효과를 적용할 때는 괄호 안의 기초 카드로 취급합니다.</p>
          <table className="table">
            <thead>
              <tr>
                <th>문명</th>
                <th>고유 유닛</th>
                <th>기초 카드</th>
                <th>망치</th>
                <th>능력치와 효과</th>
              </tr>
            </thead>
            <tbody>
              {CIVS.flatMap((c) =>
                c.uniques.map((u) => (
                  <tr key={u.name}>
                    <td>{c.name}</td>
                    <td>{u.name}</td>
                    <td>{MILITARY_CARDS.find((m) => m.id === u.base)?.uniqueOnly ? '(없음)' : MILITARY_CARDS.find((m) => m.id === u.base)?.name}</td>
                    <td>{u.cost}</td>
                    <td>{cardText({ defId: u.base, unique: u.name })}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
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
