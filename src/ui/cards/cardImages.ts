/**
 * 카드 그림 등록: `src/assets/cards/<종류>/<id>.<png|webp|jpg>` 파일을 넣으면 자동으로 쓰인다.
 *   기술 카드    → src/assets/cards/tech/<기술 id>.webp        (예: agriculture.webp)
 *   불가사의 카드 → src/assets/cards/wonder/<불가사의 id>.webp (예: pyramids.webp)
 *   정책 카드    → src/assets/cards/policy/<정책 id>.webp      (예: liberty.webp)
 * 그림이 없는 카드는 데이터로 그린 대체 카드 얼굴이 나온다.
 */
const files = import.meta.glob('../../assets/cards/**/*.{png,webp,jpg,jpeg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

const registry = new Map<string, string>()
for (const [path, url] of Object.entries(files)) {
  const m = path.match(/assets\/cards\/([^/]+)\/([^/]+)\.[a-z]+$/)
  if (m) registry.set(`${m[1]}/${m[2]}`, url)
}

export type CardKind = 'tech' | 'wonder' | 'policy'

export const cardImage = (kind: CardKind, id: string): string | undefined => registry.get(`${kind}/${id}`)
export const registeredCards = (kind: CardKind): string[] => [...registry.keys()].filter((k) => k.startsWith(`${kind}/`)).map((k) => k.slice(kind.length + 1))
