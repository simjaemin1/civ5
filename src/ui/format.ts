import type { Dir, PolicyId, WonderCondition, WonderEffect } from '../engine'
import { POLICIES, WONDERS, cardById, cardStats } from '../engine'
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
    case 'militaryCostMinus': return `군사 카드 생산 비용 -${e.amount}`
    case 'happiness': return `행복 +${e.amount}`
    case 'goldPerTurn': return `턴당 금 +${e.amount}`
    case 'gardens': return '턴당 식량 +1 (다음 차례부터)'
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
    case 'mountainInCity': return '도시 영토에 산'
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
