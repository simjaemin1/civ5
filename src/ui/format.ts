import type { Dir, PolicyId, TechDef, WonderCondition, WonderEffect } from '../engine'
import { MILITARY_CARDS, POLICIES, RESOURCES, WONDERS, WONDER_CARDS, cardById, cardStats } from '../engine'
import type { PartialYield, Terrain, TileCard, Yield } from '../engine'

export const ICON = { food: '🍎', hammer: '🔨', science: '🧪', gold: '🪙' } as const

export function yieldText(y: PartialYield | Yield): string {
  const parts = (['food', 'hammer', 'science', 'gold'] as const)
    .filter((k) => (y[k] ?? 0) !== 0)
    .map((k) => `${ICON[k]}${y[k]}`)
  return parts.length ? parts.join(' ') : '없음'
}

export const TERRAIN_COLOR: Record<Terrain, string> = {
  평지: '#dbe7a8', 정글: '#86b86c', 호수: '#9bd0ea', 오아시스: '#f2d985', 숲: '#6a9a62', 언덕: '#cfae75',
  사막: '#f1dca6', 툰드라: '#cddbe1', 습지: '#93ad9f', 해안: '#b1dbe9', 설원: '#f2f6f9', 산: '#a7a7a7',
}

export const DIR_LABEL: Record<Dir, string> = { L: '왼쪽', C: '가운데', R: '오른쪽' }
export const SIDE_LABEL = { N: '위', E: '오른쪽', S: '아래', W: '왼쪽' } as const

export const policyName = (p: PolicyId | null): string => (p ? POLICIES[p].name : '없음')

export function tileTitle(card: TileCard): string {
  return card.terrains.length ? card.terrains.join('·') : card.wonder ? WONDERS[card.wonder].name : '?'
}

export function wonderEffectText(e: WonderEffect): string {
  switch (e.kind) {
    case 'general': return `위대한 장군 +${e.amount}`
    case 'militaryCostMinus': return `${e.bases.map((b) => cardById(b).name).join('·')} 생산 비용 -${e.amount}`
    case 'happiness': return `행복 +${e.amount}`
    case 'goldPerTurn': return `턴당 금 +${e.amount}`
    case 'gardens': return '다음 차례부터 첫 도시 식량 +1'
    case 'coastalAttackPlus': return `해안 전투 공격 전투력 +${e.amount}`
    case 'setPolicy': return `정책이 ${POLICIES[e.policy].name}(으)로 바뀜`
    case 'desertBonus': return '영토의 모든 사막 타일 식량 +1'
    case 'greatWall': return '게임 중 1번, 내 영토의 상대 장군을 모두 돌려보냄'
    case 'culture': return `문화 +${e.amount}`
    case 'tourism': return `턴당 관광 +${e.amount}`
    case 'choosePolicy': return '정책 1개를 고름'
    case 'immuneCultureLoss': return '문화 패배를 당하지 않음'
  }
}

export function conditionText(c: WonderCondition | undefined): string {
  if (!c) return '없음'
  switch (c.kind) {
    case 'stoneInCity': return '석재 타일이 있는 도시'
    case 'coastFirst5': return '첫 5타일에 해안'
    case 'desertFirst5': return '첫 5타일에 사막'
    case 'mountainInTerritory': return '영토에 산 (어느 도시에서든)'
    case 'policy': return `정책이 ${POLICIES[c.policy].name}일 때`
  }
}

/** 군사 카드 한 줄 요약: ⚔ 전투력(방향) ♥ 체력 🛡 방어력, 고유 유닛은 카드에 적힌 능력치와 효과 */
export function cardText(c: { defId: string; unique?: string; dirs?: Dir[] }, withEffect = true): string {
  const st = cardStats({ uid: 0, ...c })
  const base = cardById(c.defId)
  if (st.hp === undefined) return `${st.name} — ${base.note ?? '전투에 쓰이지 않음'}`
  let atk: string
  if (st.choose !== undefined) atk = `⚔${st.choose} 대상 선택`
  else if (st.marks.length) atk = st.marks.map((m) => `⚔${m.power}${DIR_LABEL[m.dir]}`).join('·')
  else if (st.markPower !== undefined) atk = `⚔${st.markPower} 방향 무작위`
  else atk = '공격 없음'
  const flags = [st.noCounter ? '반격 없음' : '', st.siege ? '도시 파괴' : '', st.coastalOnly ? '해안 전용' : ''].filter(Boolean).join(' ')
  const effect = withEffect && st.text ? ` — ${st.text}` : ''
  return `${st.name} ${atk} ♥${st.hp} 🛡${st.def}${flags ? ` (${flags})` : ''}${effect}`
}

/** 데이터에 없는 기술 효과(엔진 코드에 있는 효과)의 카드 문구 */
const TECH_EXTRA: Record<string, string> = {
  astronomy: '자신의 첫 도시 첫 5타일에 산 타일이 존재할 경우, 자신의 차례에 과학 산출량 +5',
  economics: '다음 자신의 차례부터 금 산출량 +4',
  robotics: '자신의 차례에 도시가 얻는 망치가 10개가 되지 않는 도시는 최소 10개가 되도록 추가로 받는다',
  rocketry: '상대의 모든 전투기 카드의 효과 칸에 적힌 효과를 없앤다(무시한다)',
  education: '다른 문명이 연구한 기술을 같은 차례에는 연구하지 못하는 페널티를 없앤다',
  scientific_theory: '자신의 차례에 망치 토큰을 원하는 대로 2개까지 골라 과학으로 사용할 수 있다',
  writing: '자신의 차례에 타일의 식량을 과학으로 사용할 수 있게 된다',
}

function techEffectLine(e: TechDef['effects'][number]): string | null {
  switch (e.kind) {
    case 'general': return `위대한 장군 토큰을 ${e.amount}개 획득`
    case 'culture': return `이 기술을 얻으면 문화를 ${e.amount} 얻어 새 타일을 ${e.amount}장 획득한다`
    case 'policy': return '이 기술을 얻으면 즉시 정책 1개를 고른다'
    case 'setPolicy': return `이 기술을 얻은 시점에 자신의 정책은 ${POLICIES[e.policy].name}(으)로 바뀐다`
    case 'freeCard': return `이 기술을 얻으면 즉시 ${cardById(e.defId).name}을(를) 1장 획득한다`
    case 'secondCity': return '문화를 4 얻으며 해당 문화로 두번째 도시를 편다'
    case 'archaeology': return '이 기술을 얻으면 얻은 시점에 자신이 보유한 사적지 타일 1장당 문화를 1씩 얻는다'
    case 'tourismPerCulture': return '매 턴, 자신의 문화 2당 1의 관광 점수를 얻는다'
    case 'scienceVictory': return '이 기술을 가장 먼저 획득하였다면 이 게임에서 승리한다'
    case 'compass': return '1개의 타일까지, 정찰한 타일카드에 일꾼 토큰을 계속 배치하며 기억할 수 있다'
    default: return null // foodToScience, hammerToScience, ignoreRoundPicks 는 TECH_EXTRA가 설명
  }
}

/** 기술 카드 아래쪽 문구: 해금되는 카드·불가사의·자원 효과·기술 효과를 데이터에서 만든다 */
export function techCardLines(t: TechDef): string[] {
  const lines: string[] = []
  const cards = MILITARY_CARDS.filter((c) => c.tech === t.id && !c.uniqueOnly)
  const dead = new Set<string>()
  for (const c of cards) {
    if (!c.line || !c.tier) continue
    MILITARY_CARDS.filter((o) => o.line === c.line && o.tier! < c.tier! && !o.uniqueOnly).forEach((o) => dead.add(o.name))
  }
  if (dead.size) lines.push(`앞으로 ${[...dead].join('·')} 생산불가`)
  for (const c of cards) lines.push(`${c.requires ? `${RESOURCES[c.requires].name} 타일을 보유한 도시에서 ` : ''}${c.name} 생산가능`)
  for (const w of WONDER_CARDS.filter((x) => x.tech === t.id)) lines.push(`${w.name} 건설가능`)
  const lux = Object.values(RESOURCES).filter((r) => r.luxuryTech === t.id)
  if (lux.length) lines.push(`자신이 보유한 타일 중 ${lux.map((r) => r.name).join('·')} 존재 시 행복 +1`)
  const boosts = Object.values(RESOURCES).flatMap((r) => (r.boosts ?? []).filter((b) => b.tech === t.id).map((b) => ({ r, b })))
  for (const { r, b } of boosts) {
    const y = (['food', 'hammer', 'science', 'gold'] as const).filter((k) => (b.yield[k] ?? 0) !== 0).map((k) => `${ICON[k]}+${b.yield[k]}`).join(' ')
    lines.push(`${b.nextTurn ? '다음 자신의 차례부터' : '자신의 차례에'} ${r.name} 타일의 산출량 ${y}`)
  }
  for (const e of t.effects) {
    const l = techEffectLine(e)
    if (l) lines.push(l)
  }
  if (TECH_EXTRA[t.id]) lines.push(TECH_EXTRA[t.id])
  return lines
}
