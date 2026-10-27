import foodUrl from '../assets/icons/res-food.png'
import hammerUrl from '../assets/icons/res-hammer.png'
import goldUrl from '../assets/icons/res-gold.png'
import cultureUrl from '../assets/icons/res-culture.png'
import scienceUrl from '../assets/icons/res-science.png'

/** 자원 아이콘 원본 그림: 식량·망치·금·문화·과학 */
export const RES_URL = { food: foodUrl, hammer: hammerUrl, gold: goldUrl, culture: cultureUrl, science: scienceUrl } as const
export type ResName = keyof typeof RES_URL
export const RES_NAME: Record<ResName, string> = { food: '식량', hammer: '망치', gold: '금', culture: '문화', science: '과학' }
