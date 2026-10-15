// 빌드 결과(JS+CSS)를 index 한 장의 HTML로 합친다: dist-single/civ5.html
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

execSync('npx vite build --config vite.single.config.ts', { stdio: 'inherit' })
const dir = 'dist-single/assets'
const files = readdirSync(dir)
const js = readFileSync(`${dir}/${files.find((f) => f.endsWith('.js'))}`, 'utf8').replaceAll('</script', '<\\/script')
const css = readFileSync(`${dir}/${files.find((f) => f.endsWith('.css'))}`, 'utf8')
const html = `<title>문명 보드게임</title>
<style>${css}</style>
<div id="root"></div>
<script>${js}</script>
`
writeFileSync('dist-single/civ5.html', html)
console.log(`dist-single/civ5.html ${(html.length / 1024).toFixed(0)}KB`)
