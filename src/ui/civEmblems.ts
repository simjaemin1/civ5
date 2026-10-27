/**
 * 문명 기호 그림: `src/assets/icons/civ/<문명 id>.webp`
 * 독일은 받은 원본 그림, 나머지는 문명 카드 그림에서 기호 원만 오려 낸 것이다 (새 문명 기호 그림을 같은 이름으로 넣으면 바뀐다).
 */
const files = import.meta.glob('../assets/icons/civ/*.{png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

const registry = new Map<string, string>()
for (const [path, url] of Object.entries(files)) {
  const m = path.match(/civ\/([^/]+)\.[a-z]+$/)
  if (m) registry.set(m[1], url)
}

export const civEmblem = (civId: string): string | undefined => registry.get(civId)
