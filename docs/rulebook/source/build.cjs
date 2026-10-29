// 규칙서 HTML을 묶어 A5 PDF로 찍고, 페이지별 PNG를 만든다.
// 사용: python3 fonts.py (처음 한 번, 글꼴 준비) → node build.cjs [out-dir, 기본 docs/rulebook]
// 차례의 쪽 번호는 1차 렌더 결과로 채운 뒤 다시 찍는다. 필요: playwright(chromium), poppler(pdfinfo·pdftotext·pdftoppm)
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { chromium } = require('playwright')

const dir = __dirname
const out = path.resolve(process.argv[2] || path.join(dir, '..'))
fs.mkdirSync(out, { recursive: true })

const parts = fs.readdirSync(dir).filter((f) => /^part\d+\.html$/.test(f)).sort((a, b) => parseInt(a.slice(4)) - parseInt(b.slice(4)))
const body = parts.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n')
const page = (pages) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>문명 보드게임 규칙서</title><link rel="stylesheet" href="style.css"></head><body>${body.replace(/\{\{p(\d+)\}\}/g, (_, n) => (pages ? pages[n] ?? '' : '00'))}</body></html>`

const footer = `<div style="width:100%;font-size:7px;font-family:sans-serif;color:#8a8073;text-align:center;padding-bottom:3mm"><span class="pageNumber"></span></div>`

async function render(html, file) {
  const htmlFile = path.join(dir, 'rulebook.html')
  fs.writeFileSync(htmlFile, html)
  const browser = await chromium.launch()
  const p = await browser.newPage()
  await p.goto('file://' + htmlFile, { waitUntil: 'networkidle' })
  await p.evaluate(() => document.fonts.ready)
  await p.pdf({ path: file, width: '148mm', height: '210mm', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: footer, margin: { top: '12mm', bottom: '13mm', left: '11mm', right: '11mm' }, preferCSSPageSize: true })
  await browser.close()
}

;(async () => {
  const pdf = path.join(out, 'rulebook.pdf')
  await render(page(null), pdf)
  // 장 제목이 있는 쪽 찾기
  const n = parseInt(execSync(`pdfinfo "${pdf}"`).toString().match(/Pages:\s+(\d+)/)[1])
  const pages = {}
  const titles = ['게임 소개', '게임 준비', '차례 진행', '타일과 산출', '일꾼, 행복, 성장', '과학과 기술', '문화와 정책', '생산', '정찰과 나침반', '전쟁', '두 번째 도시', '탈락과 승리', '참조표']
  for (let i = 3; i <= n; i++) {
    const t = execSync(`pdftotext -f ${i} -l ${i} -layout "${pdf}" -`).toString()
    const lines = t.split('\n').map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean)
    titles.forEach((tt, k) => {
      if (!pages[k + 1] && lines.some((l) => l === `${k + 1} ${tt}`)) pages[k + 1] = i
    })
  }
  console.log('pages', n, JSON.stringify(pages))
  await render(page(pages), pdf)
  fs.mkdirSync(path.join(out, 'pages'), { recursive: true })
  execSync(`rm -f "${out}"/pages/page-*.png && pdftoppm -r ${process.env.DPI || 200} -png "${pdf}" "${out}/pages/page"`)
  console.log('done', out)
})()
