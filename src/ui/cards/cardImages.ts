/**
 * 카드 그림 등록: `src/assets/cards/<종류>/<id>.<png|webp|jpg>` 파일을 넣으면 자동으로 쓰인다.
 *   기술 카드    → src/assets/cards/tech/<기술 id>.webp        (예: agriculture.webp)
 *   불가사의 카드 → src/assets/cards/wonder/<불가사의 id>.webp (예: pyramids.webp)
 *   정책 카드    → src/assets/cards/policy/<정책 id>.webp      (예: liberty.webp)
 *   문명 카드    → src/assets/cards/civ/<문명 id>.webp         (예: korea.webp)
 *   고유 유닛    → src/assets/cards/unique/<유닛 id>.<방향>.webp (예: jaguar.L.webp, chu_ko_nu.LC.webp, battering_ram.x.webp)
 *   일반 군사 카드 → src/assets/cards/unit/<카드 id>.<방향>.webp   (예: warrior.C.webp, 방향이 없으면 tank.x.webp)
 *   타일 카드    → src/assets/cards/tile/<타일 번호>.webp       (번호 = tiles.json의 순서, 0부터)
 *   방향 = 전투력 마크 위치: L(왼쪽) C(가운데) R(오른쪽), 마크가 둘이면 LC·LR·CR, 없으면 x
 * 그림이 없는 카드는 데이터로 그린 대체 카드 얼굴이 나온다.
 */
const files = import.meta.glob('../../assets/cards/**/*.{png,webp,jpg,jpeg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

const registry = new Map<string, string>()
for (const [path, url] of Object.entries(files)) {
  const m = path.match(/assets\/cards\/([^/]+)\/([^/]+)\.[a-z]+$/)
  if (m) registry.set(`${m[1]}/${m[2]}`, url)
}

export type CardKind = 'tech' | 'wonder' | 'policy' | 'civ' | 'unique' | 'unit' | 'tile'

export const cardImage = (kind: CardKind, id: string): string | undefined => registry.get(`${kind}/${id}`)
export const registeredCards = (kind: CardKind): string[] => [...registry.keys()].filter((k) => k.startsWith(`${kind}/`)).map((k) => k.slice(kind.length + 1))
