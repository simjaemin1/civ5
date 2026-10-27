import { MILITARY_CARDS, POLICIES, RESOURCES, TECHS, WONDER_CARDS, cardById } from '../engine'
import type { PolicyId, TechDef } from '../engine'
import { conditionText, techOwnEffects, wonderEffectText } from './format'
import { RULE_WORDS } from './ruleWords'

/**
 * 도감: 검색창에서 찾을 수 있는 항목과 그 설명. 처음 하는 사람이 "무엇을 하려면 무엇이 필요한지" 찾아보게 한다.
 * 항목: 과학기술, 군사 카드, 정책, 사치자원, 전략자원, 불가사의. 설명의 다른 항목 이름은 눌러서 그 항목으로 넘어간다.
 */
export type EntryKind = 'rule' | 'tech' | 'card' | 'policy' | 'luxury' | 'strategic' | 'wonder'
export const KIND_LABEL: Record<EntryKind, string> = { rule: '규칙', tech: '과학기술', card: '군사 카드', policy: '정책', luxury: '사치자원', strategic: '전략자원', wonder: '불가사의' }

export interface Ref {
  kind: EntryKind
  id: string
  label: string
}
export type Item = string | Ref
export interface Row {
  label: string
  items: Item[]
}
export interface Entry {
  kind: EntryKind
  id: string
  title: string
  rows: Row[]
}

const techById = (id: string) => TECHS.find((t) => t.id === id)!
const techRef = (id: string): Ref => ({ kind: 'tech', id, label: techById(id).name })
const resKind = (id: string): EntryKind | null => (RESOURCES[id]?.kind === 'luxury' ? 'luxury' : RESOURCES[id]?.kind === 'strategic' ? 'strategic' : null)
const resRef = (id: string): Item => {
  const k = resKind(id)
  return k ? { kind: k, id, label: RESOURCES[id].name } : RESOURCES[id]?.name ?? id
}
const cardRef = (id: string): Ref => ({ kind: 'card', id, label: cardById(id).name })
const policyRef = (id: PolicyId): Ref => ({ kind: 'policy', id, label: POLICIES[id].name })
const YIELD = { food: '식량', hammer: '망치', science: '과학', gold: '금' } as const
const yieldStr = (y: Partial<Record<keyof typeof YIELD, number>>) =>
  (Object.keys(YIELD) as (keyof typeof YIELD)[])
    .filter((k) => (y[k] ?? 0) !== 0)
    .map((k) => `${YIELD[k]} ${y[k]! > 0 ? '+' : ''}${y[k]}`)
    .join(' ')

/**
 * 기술 줄: 맨 앞 기술부터 이 기술까지 연구 순서와 과학 비용 (예: 교육학 → 음향학 → 과학이론 → 전기 (과학 10)).
 * 선행 기술이 여럿이면 첫째를 따라가고 나머지는 뒤에 적는다. self: 이 기술의 도감이면 마지막 이름은 누르지 않는 글자.
 */
function techLine(t: TechDef, self = false): Item[] {
  const chain: TechDef[] = [t]
  let cur = t
  while (cur.prereqs?.length) {
    cur = techById(cur.prereqs[0])
    chain.unshift(cur)
  }
  const out: Item[] = chain.flatMap((x, i) => [...(i ? [' → '] : []), self && x.id === t.id ? x.name : techRef(x.id)])
  out.push(` (과학 ${t.cost})`)
  const more = (t.prereqs ?? []).slice(1)
  if (more.length) out.push(' — 함께 필요: ', ...more.flatMap((id, i) => (i ? [', ', techRef(id)] : [techRef(id)])))
  if (!t.prereqs?.length && t.cost > 0) out.push(' — 같은 비용의 다른 기술 1개를 먼저 연구해야 함')
  return out
}
/** 그 기술이 필요한 항목: 기술 줄 한 줄로 */
const needTech = (id: string): Row[] => [{ label: '필요 기술', items: techLine(techById(id)) }]

function techEntry(t: TechDef): Entry {
  const rows: Row[] = [{ label: '기술 줄', items: techLine(t, true) }]
  const cards = MILITARY_CARDS.filter((c) => c.tech === t.id && !c.uniqueOnly)
  if (cards.length)
    rows.push({
      label: '해금 군사 카드',
      items: cards.flatMap((c, i) => [...(i ? [', '] : []), cardRef(c.id), ...(c.requires ? [' (', resRef(c.requires), ' 필요)'] : [])]),
    })
  const obsolete = new Set<string>()
  for (const c of cards) if (c.line && c.tier) MILITARY_CARDS.filter((o) => o.line === c.line && o.tier! < c.tier! && !o.uniqueOnly).forEach((o) => obsolete.add(o.id))
  if (obsolete.size) rows.push({ label: '더 못 만드는 카드', items: [...obsolete].flatMap((id, i) => (i ? [', ', cardRef(id)] : [cardRef(id)])) })
  const wonders = WONDER_CARDS.filter((w) => w.tech === t.id)
  if (wonders.length) rows.push({ label: '해금 불가사의', items: wonders.flatMap((w, i) => [...(i ? [', '] : []), { kind: 'wonder' as const, id: w.id, label: w.name }]) })
  const lux = Object.entries(RESOURCES).filter(([, r]) => r.luxuryTech === t.id)
  if (lux.length) rows.push({ label: '행복 +1 (타일 보유 시)', items: lux.flatMap(([id], i) => (i ? [', ', resRef(id)] : [resRef(id)])) })
  const boosts = Object.entries(RESOURCES).flatMap(([id, r]) => (r.boosts ?? []).filter((b) => b.tech === t.id).map((b) => ({ id, b })))
  if (boosts.length) rows.push({ label: '자원 산출 증가', items: boosts.flatMap(({ id, b }, i) => [...(i ? [', '] : []), resRef(id), ` ${yieldStr(b.yield)}${b.nextTurn ? ' (다음 차례부터)' : ''}`]) })
  const own = techOwnEffects(t)
  const policyItems: Item[] = t.effects.flatMap((e) => (e.kind === 'policyChance' || e.kind === 'setPolicy' ? [policyRef(e.policy)] : []))
  if (own.length) rows.push({ label: '효과', items: own.flatMap((l, i) => (i ? ['\n', l] : [l])) })
  if (policyItems.length) rows.push({ label: '관련 정책', items: policyItems })
  return { kind: 'tech', id: t.id, title: t.name, rows }
}

function cardEntry(id: string): Entry {
  const c = cardById(id)
  const rows: Row[] = [...needTech(c.tech), { label: '생산 비용', items: [`망치 ${c.cost}`] }]
  if (c.requires) rows.push({ label: '필요 자원', items: [resRef(c.requires), ' 타일을 가진 도시에서만 생산'] })
  if (c.hp !== undefined) {
    const atk = c.attack ? `카드 1장을 골라 공격 ${c.attack.power}` : c.marks ? c.marks.map((m) => `${m.power}`).join('·') : c.power !== undefined ? `${c.power} (방향은 카드마다 다름)` : '없음'
    rows.push({ label: '능력치', items: [`체력 ${c.hp} · 방어력 ${c.def ?? 0} · 전투력 ${atk}`] })
  }
  if (c.note) rows.push({ label: '특징', items: [c.note] })
  if (c.line && c.tier) {
    const same = MILITARY_CARDS.filter((o) => o.line === c.line && !o.uniqueOnly).sort((a, b) => a.tier! - b.tier!)
    rows.push({ label: '계열 (승급 순서)', items: same.flatMap((o, i) => [...(i ? [' → '] : []), o.id === c.id ? o.name : cardRef(o.id)]) })
  }
  return { kind: 'card', id, title: c.name, rows }
}

function policyEntry(id: PolicyId): Entry {
  const p = POLICIES[id]
  const any = TECHS.filter((t) => t.effects.some((e) => e.kind === 'policy'))
  const special = TECHS.filter((t) => t.effects.some((e) => (e.kind === 'policyChance' || e.kind === 'setPolicy') && e.policy === id))
  const rows: Row[] = [{ label: '효과', items: [p.desc] }]
  rows.push({ label: '정책을 고르는 기술', items: any.flatMap((t, i) => (i ? [', ', techRef(t.id)] : [techRef(t.id)])) })
  if (special.length) rows.push({ label: '이 정책으로 바꾸는 기술', items: special.flatMap((t, i) => (i ? [', ', techRef(t.id)] : [techRef(t.id)])) })
  const wonders = WONDER_CARDS.filter((w) => w.condition?.kind === 'policy' && w.condition.policy === id)
  if (wonders.length) rows.push({ label: '이 정책일 때 불가사의', items: wonders.flatMap((w, i) => [...(i ? [', '] : []), { kind: 'wonder' as const, id: w.id, label: w.name }]) })
  return { kind: 'policy', id, title: p.name, rows }
}

function resourceEntry(id: string): Entry {
  const r = RESOURCES[id]
  const kind = resKind(id)!
  // 카드에 그려진 산출(금 3, 철·말 망치 +1 등)은 보면 알므로 적지 않는다. 기술을 연구해야 생기는 효과만 적는다
  const rows: Row[] = []
  if (r.luxuryTech) {
    const t = techById(r.luxuryTech)
    rows.push({ label: '행복 +1', items: ['이 자원 타일을 가지고 다음 기술을 연구하면 행복 +1', '\n', ...techLine(t)] })
  }
  const cards = MILITARY_CARDS.filter((c) => c.requires === id)
  if (cards.length) rows.push({ label: '필요로 하는 카드', items: cards.flatMap((c, i) => (i ? [', ', cardRef(c.id)] : [cardRef(c.id)])) })
  // 이 자원이 건설 조건인 불가사의 (석재 → 마우솔레움)
  const needWonders = WONDER_CARDS.filter((w) => w.condition?.kind === 'stoneInCity' && id === 'stone')
  if (needWonders.length) rows.push({ label: '건설 조건인 불가사의', items: needWonders.flatMap((w, i) => [...(i ? [', '] : []), { kind: 'wonder' as const, id: w.id, label: w.name }, ` (${conditionText(w.condition)})`]) })
  for (const b of r.boosts ?? []) rows.push({ label: '산출 증가', items: [`${yieldStr(b.yield)}${b.nextTurn ? ' (연구한 다음 차례부터)' : ''} — 이 기술을 연구하면`, '\n', ...techLine(techById(b.tech))] })
  return { kind, id, title: r.name, rows }
}

function wonderEntry(id: string): Entry {
  const w = WONDER_CARDS.find((x) => x.id === id)!
  return {
    kind: 'wonder',
    id,
    title: w.name,
    rows: [
      ...needTech(w.tech),
      { label: '최소 투자 망치', items: [String(w.minHammers)] },
      { label: '필요 진척도', items: [String(w.progressNeeded)] },
      { label: '조건', items: [conditionText(w.condition)] },
      { label: '완성 효과', items: [w.effects.map(wonderEffectText).join(', ')] },
    ],
  }
}

/** 규칙 항목: 줄마다 문장을 • 로 나누고, 관련 항목은 이름으로 찾아 누를 수 있게 한다 */
function ruleEntry(id: string): Entry {
  const r = RULE_WORDS.find((x) => x.id === id)!
  const rows: Row[] = r.rows.map(([label, lines, see]) => {
    const items: Item[] = lines.flatMap((l, i) => (i ? ['\n', `• ${l}`] : [`• ${l}`]))
    const refs = (see ?? []).map((name) => ALL_ENTRIES.find((e) => e.label === name)).filter((e): e is Ref => !!e)
    if (refs.length) items.push('\n', '관련: ', ...refs.flatMap((e, i) => (i ? [', ', e] : [e])))
    return { label, items }
  })
  return { kind: 'rule', id, title: r.title, rows }
}

export function entryOf(kind: EntryKind, id: string): Entry {
  switch (kind) {
    case 'rule': return ruleEntry(id)
    case 'tech': return techEntry(techById(id))
    case 'card': return cardEntry(id)
    case 'policy': return policyEntry(id as PolicyId)
    case 'luxury':
    case 'strategic': return resourceEntry(id)
    case 'wonder': return wonderEntry(id)
  }
}

/** 검색할 수 있는 모든 항목 (이름) */
export const ALL_ENTRIES: Ref[] = [
  ...RULE_WORDS.map((r) => ({ kind: 'rule' as const, id: r.id, label: r.title })),
  ...TECHS.map((t) => techRef(t.id)),
  ...MILITARY_CARDS.filter((c) => !c.uniqueOnly).map((c) => cardRef(c.id)),
  ...(Object.keys(POLICIES) as PolicyId[]).map(policyRef),
  ...Object.keys(RESOURCES).flatMap((id) => {
    const k = resKind(id)
    return k ? [{ kind: k, id, label: RESOURCES[id].name }] : []
  }),
  ...WONDER_CARDS.map((w) => ({ kind: 'wonder' as const, id: w.id, label: w.name })),
]
