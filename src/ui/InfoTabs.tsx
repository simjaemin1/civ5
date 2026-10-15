import { useState } from 'react'
import type { GameState, Player } from '../engine'
import { MILITARY_CARDS, PROGRESS_NEEDED, TECHS, WONDER_CARDS, civById, culture, happiness, totalWorkers, tourism } from '../engine'
import { conditionText, ICON, policyName, wonderEffectText } from './format'

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

/** 기술 트리: 열(과학 비용)별로 보여 주고, 해당 문명이 가진 기술을 표시한다. */
export function TechTree({ player }: { player: Player }) {
  return (
    <div className="techgrid">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((col) => (
        <div key={col} className="techcol">
          <h5>
            {ICON.science}
            {TECHS.find((t) => t.column === col)?.cost}
          </h5>
          {TECHS.filter((t) => t.column === col).map((t) => {
            const owned = player.techs.includes(t.id)
            const pre = t.prereqs?.map((id) => TECHS.find((x) => x.id === id)?.name).join(', ')
            return (
              <div key={t.id} className={`tech${owned ? ' owned' : ''}`} title={pre ? `선행: ${pre}` : '연결선 없음: 같은 비용의 다른 기술이 있어야 함'}>
                {owned ? '✓ ' : ''}
                {t.name}
                <small>{pre ? ` ← ${pre}` : t.cost > 0 ? ' (선 없음)' : ''}</small>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

type Tab = 'tech' | 'wonder' | 'card' | 'log'

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
              <th>상태 (필요 진척도 {PROGRESS_NEEDED})</th>
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
                      : game.players.map((p) => `${civById(p.civId).name} ${prog[p.id] ?? 0}`).join(' / ')}
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
        <table className="table">
          <thead>
            <tr>
              <th>카드</th>
              <th>망치</th>
              <th>기술</th>
              <th>공용 덱 남은 장수</th>
            </tr>
          </thead>
          <tbody>
            {MILITARY_CARDS.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.cost}</td>
                <td>{TECHS.find((t) => t.id === c.tech)?.name}</td>
                <td>{game.cardPool[c.id].map((v) => (v === 'x' ? '●' : v)).join(' ') || '—'}</td>
              </tr>
            ))}
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
