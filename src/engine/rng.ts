/** 상태에 저장 가능한 시드 기반 난수 (mulberry32). */
export function nextRandom(s: { rng: number }): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0
  let t = s.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function shuffle<T>(s: { rng: number }, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(s) * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}
