import type { CardInst } from './types'
import { UNIQUES, cardById } from './data'
import type { Dir, UniqueEffect } from './data'

/** 카드 한 장의 실제 능력치: 고유 유닛이면 카드에 적힌 값, 아니면 기초 카드 값. */
export interface CardStats {
  name: string
  /** 효과를 적용할 때 쓰는 카드 (고유 유닛은 괄호 안의 기초 카드) */
  baseId: string
  hp: number | undefined
  def: number
  /** 전투력 마크: 위치가 공격 방향 */
  marks: { dir: Dir; power: number }[]
  /** 방향이 무작위로 정해지는 카드의 마크 하나당 전투력 (방향을 모를 때 표시용) */
  markPower?: number
  /** 카드를 1개 골라 공격하는 전투력 */
  choose?: number
  noCounter: boolean
  /** 기초 카드의 특수 효과 (airImmune, bomberImmune, ...) */
  special?: string
  siege: boolean
  lateTarget: boolean
  coastalOnly: boolean
  effect?: UniqueEffect
  text?: string
}

/** 방향 조합을 재고 키로: ['L','C'] → 'LC', 방향이 없으면 'x' */
export const dirsKey = (dirs?: Dir[]): string => (dirs && dirs.length ? dirs.join('') : 'x')

export function cardStats(inst: CardInst): CardStats {
  const base = cardById(inst.defId)
  const u = inst.unique ? UNIQUES[inst.unique]?.def : undefined
  const dirs = inst.dirs ?? []
  if (u) {
    return {
      name: u.name,
      baseId: inst.defId,
      hp: u.hp,
      def: u.def,
      marks: u.power !== undefined ? dirs.map((dir) => ({ dir, power: u.power! })) : [],
      markPower: u.power,
      choose: u.choose,
      noCounter: !!u.noCounter,
      special: base.special,
      siege: !!u.siege || base.line === 'siege',
      lateTarget: !!u.lateTarget,
      coastalOnly: !!u.coastalOnly,
      effect: u.effect,
      text: u.text,
    }
  }
  return {
    name: base.name,
    baseId: inst.defId,
    hp: base.hp,
    def: base.def ?? 0,
    marks: base.variantDirs ? dirs.map((dir) => ({ dir, power: base.power! })) : (base.marks ?? []),
    markPower: base.variantDirs ? base.power : undefined,
    choose: base.attack?.power,
    noCounter: !!base.noCounter,
    special: base.special,
    siege: base.line === 'siege',
    lateTarget: false,
    coastalOnly: base.special === 'coastalOnly',
    text: undefined,
  }
}

/** 해안 타일 전투에서만 낼 수 있는 카드 (전함, 제고이센) */
export const isCoastalOnly = (inst: CardInst): boolean => cardStats(inst).coastalOnly
