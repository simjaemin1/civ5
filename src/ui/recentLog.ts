/**
 * 오른쪽 "최근 기록"에 보여 줄 줄만 골라 만든다 (엔진 로그 문장에서):
 * - 생산: "독일 전사 생산 (망치 3)" 그대로
 * - 불가사의 투자: "한국 피라미드에 망치 4 투자" 그대로
 * - 문화: "한국 문화 +1 (5→6)" → "한국 문화 5→6"
 * - 인구·행복: 엔진이 바뀐 경우에만 남기는 "한국 인구 3→4", "한국 행복 4→5" 그대로
 * 그 밖의 모든 기록은 화면 아래 로그 칸에 그대로 나온다.
 */
export function recentSummary(log: readonly string[]): string[] {
  const out: string[] = []
  for (const line of log) {
    const m = line.match(/^(\[R\d+\]) (.*)$/)
    if (!m) continue
    const [, round, body] = m
    if (/ 생산 \(망치 \d+\)$/.test(body) || /에 망치 \d+ 투자$/.test(body) || /^\S+ (인구|행복) \d+→\d+$/.test(body)) {
      out.push(line)
      continue
    }
    const c = body.match(/^(\S+) 문화 \+\d+ \((\d+)→(\d+)\)$/)
    if (c) out.push(`${round} ${c[1]} 문화 ${c[2]}→${c[3]}`)
  }
  return out
}

/** 보이는 순서대로 라운드 표시를 정리한다: 라운드가 바뀌는 줄에만 "[R4]"를 쓰고, 같은 라운드가 이어지면 "-" */
export function markRounds(lines: readonly string[]): { mark: string; text: string }[] {
  let prev = ''
  return lines.map((line) => {
    const m = line.match(/^(\[R\d+\]) (.*)$/)
    if (!m) return { mark: '', text: line }
    const mark = m[1] === prev ? '-' : m[1]
    prev = m[1]
    return { mark, text: m[2] }
  })
}
