// 두 브라우저의 사람 둘이 UI 버튼만 눌러 한 판을 끝까지 두는 점검 (소극적으로: 연구·생산 없이 넘긴다).
// 준비: npm run build && npm run server, playwright-core 설치. 실행: node scripts/e2e-online-fullgame.mjs [스크린샷 폴더]
import { chromium } from 'playwright-core'
const BASE = process.env.BASE ?? 'http://localhost:8787'
const SP = process.argv[2] ?? '.'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const mk = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => console.log(name, 'PAGEERROR', e.message))
  return p
}
const A = await mk('A'), B = await mk('B')
await A.goto(BASE)
await A.getByText('온라인으로 하기').click()
await A.getByPlaceholder('닉네임').fill('방장')
await A.getByText('방 만들기').click()
const invite = await A.getByTestId('invite').innerText()
await A.locator('select').first().selectOption('korea')
await B.goto(invite)
await B.getByPlaceholder('닉네임').fill('손님')
await B.getByRole('button', { name: '입장' }).click()
await B.getByTestId('invite').waitFor()
await B.locator('select').first().selectOption('russia')
await A.getByText('게임 시작').click()

// 한 번의 evaluate로 화면을 읽고 누른다 (왕복을 줄여 빠르게)
const BUTTONS = ['도시 건설', '배치 확정', '이번 차례는 연구하지 않음', '생산 끝내기', '선전포고하지 않고 차례 끝내기']
function step(p) {
  return p.evaluate((names) => {
    if (document.body.innerText.includes('게임이 끝났습니다')) return 'over'
    const buttons = [...document.querySelectorAll('button')]
    const close = document.querySelector('.modal-backdrop button')
    if (close) { close.click(); return 'acted' }
    for (const name of names) {
      const b = buttons.find((x) => x.textContent.trim() === name && !x.disabled)
      if (b) { b.click(); return 'acted' }
    }
    // 전투: 대상 선택(빈칸) 후 확정
    const confirm = buttons.find((x) => /^확정/.test(x.textContent.trim()))
    if (confirm) {
      for (const s of document.querySelectorAll('.panel select')) {
        if ([...s.options].some((o) => o.value === 'empty')) {
          const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
          set.call(s, 'empty')
          s.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }
      return 'selected' // 다음 반복에 확정을 누른다 (React가 다시 그린 뒤)
    }
    return 'idle'
  }, BUTTONS).catch(() => 'idle')
}
const t0 = Date.now()
let n = 0, idle = 0
for (;;) {
  const r = await Promise.all([step(A), step(B)])
  if (r.includes('over')) break
  if (r.every((x) => x === 'idle')) {
    // 확정만 남아 있고 선택이 끝났다면 누른다
    for (const p of [A, B]) await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^확정/.test(x.textContent.trim()) && !x.disabled)?.click()).catch(() => {})

    if (++idle > 300) { console.log('멈춤'); await A.screenshot({ path: `${SP}/stuckA.png` }); await B.screenshot({ path: `${SP}/stuckB.png` }); process.exit(1) }
    await A.waitForTimeout(100)
  } else idle = 0
  if (++n % 200 === 0) console.log('반복', n, (await A.locator('header.top b').first().innerText()), `${Math.round((Date.now() - t0) / 1000)}s`)
  if (Date.now() - t0 > 20 * 60_000) { console.log('시간 초과'); process.exit(1) }
}
console.log('게임 종료:', (await A.locator('.banner h2').innerText()), '/', (await B.locator('.banner h2').innerText()))
await A.screenshot({ path: `${SP}/overA.png` })
await browser.close()
