// 온라인 모드 브라우저 점검 (두 브라우저로 방 만들기 → 입장 → 시작 → 재접속 → 되돌리기 → 폭파).
// 준비: npm run build && npm run server (다른 터미널), 그리고 playwright-core 설치.
// 실행: node scripts/e2e-online.mjs <스크린샷 폴더>   (BASE, CHROMIUM 환경변수로 바꿀 수 있음)
import { chromium } from 'playwright-core'
const BASE = process.env.BASE ?? 'http://localhost:8787'
const SP = process.argv[2] ?? '.'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const log = (...a) => console.log(...a)
const mk = async (name) => { const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } }); const p = await ctx.newPage(); p.on('pageerror', e => log(name, 'PAGEERROR', e.message)); return { ctx, p } }
const A = await mk('A'), B = await mk('B')

// 방장
await A.p.goto(BASE)
await A.p.getByText('온라인으로 하기').click()
await A.p.getByPlaceholder('닉네임').fill('방장')
await A.p.getByText('방 만들기').click()
await A.p.getByTestId('invite').waitFor()
// 초대 주소는 같은 와이파이 주소로 나올 수 있으니, 이 점검에서는 BASE로 바꿔 쓴다
const invite = BASE + new URL(await A.p.getByTestId('invite').innerText()).search
log('invite', invite)
await A.p.locator('select').first().selectOption('korea')

// 손님: 초대 주소로
await B.p.goto(invite)
await B.p.getByPlaceholder('닉네임').fill('손님')
await B.p.getByRole('button', { name: '입장' }).click()
await B.p.getByTestId('invite').waitFor()
// 같은 문명 고르기 시도: 선택지가 막혀 있어야 한다
const disabled = await B.p.locator('select option[value="korea"]').first().isDisabled()
log('korea disabled for guest:', disabled)
await B.p.locator('select').first().selectOption('russia')
await A.p.screenshot({ path: `${SP}/lobby.png` })
// 방장이 AI 하나 추가
await A.p.getByText('+ AI 자리 추가').click()
await A.p.getByText('게임 시작').click()
await A.p.waitForSelector('.game')
await B.p.waitForSelector('.game')
const whoFirst = async (pg) => (await pg.getByTestId('waiting').count()) === 0
log('A my turn:', await whoFirst(A.p), 'B my turn:', await whoFirst(B.p))
await A.p.screenshot({ path: `${SP}/gameA.png` })
await B.p.screenshot({ path: `${SP}/gameB.png` })

// 순서대로 첫 도시를 세운다
for (let i = 0; i < 6; i++) {
  for (const X of [A, B]) {
    if (await X.p.getByRole('button', { name: '도시 건설' }).count()) {
      await X.p.getByRole('button', { name: '도시 건설' }).click()
      await X.p.waitForTimeout(300)
    }
  }
}
await A.p.waitForTimeout(500)
log('A header:', (await A.p.locator('header.top').innerText()).replace(/\n/g, ' | '))
log('B header:', (await B.p.locator('header.top').innerText()).replace(/\n/g, ' | '))

// 재접속: B 새로고침 → 같은 자리로 복귀
await B.p.reload()
await B.p.waitForSelector('.game')
log('B after reload:', (await B.p.locator('.stats').innerText()).replace(/\n/g, ' '))
await A.p.screenshot({ path: `${SP}/afterA.png` })
await B.p.screenshot({ path: `${SP}/afterB.png` })

// 남의 손 확인: B 화면 어디에도 A의 손 타일 문구가 없어야 한다(구조 검증은 단위 테스트가 한다)
// 방장의 차례를 넘는 되돌리기 (설정 메뉴). 손님 설정 메뉴에는 없어야 한다. 자기 차례 안 되돌리기는 단계 막대에 모두 있다
await A.p.locator('.settings summary').click()
const hostBtn = A.p.getByRole('button', { name: /차례를 넘어 되돌리기/ })
await hostBtn.click(); await A.p.waitForTimeout(500)
await B.p.locator('.settings summary').click()
log('guest has host undo:', await B.p.getByRole('button', { name: /차례를 넘어 되돌리기/ }).count())
log('A after undo:', (await A.p.locator('header.top').innerText()).replace(/\n/g, ' | '))

// 방 폭파 (설정 메뉴)
A.p.on('dialog', d => d.accept())
if (!(await A.p.getByRole('button', { name: /방 폭파/ }).isVisible())) await A.p.locator('.settings summary').click()
await A.p.getByRole('button', { name: /방 폭파/ }).click()
await B.p.getByTestId('landing-error').waitFor()
log('B after bomb:', await B.p.getByTestId('landing-error').innerText())
await browser.close()
