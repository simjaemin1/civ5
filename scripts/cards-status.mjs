// 카드 그림 등록 현황: node scripts/cards-status.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs'

function status(label, items, dir) {
  const files = existsSync(dir) ? readdirSync(dir) : []
  const has = new Set(files.map((f) => f.replace(/\.[^.]+$/, '')))
  const done = items.filter((t) => has.has(t.id))
  const missing = items.filter((t) => !has.has(t.id))
  const unknown = [...has].filter((id) => !items.some((t) => t.id === id))
  console.log(`${label} ${done.length}/${items.length}장 등록`)
  if (missing.length) console.log('  아직 없음:', missing.map((t) => `${t.name}(${t.id})`).join(', '))
  if (unknown.length) console.log('  ⚠ 이름이 id와 맞지 않는 파일:', unknown.join(', '))
}

status('기술 카드', JSON.parse(readFileSync('src/engine/data/techs.json', 'utf8')).techs, 'src/assets/cards/tech')
status('불가사의 카드', JSON.parse(readFileSync('src/engine/data/wonderCards.json', 'utf8')).wonders, 'src/assets/cards/wonder')
const policies = Object.entries(JSON.parse(readFileSync('src/engine/data/policies.json', 'utf8'))).map(([id, p]) => ({ id, name: p.name }))
status('정책 카드', policies, 'src/assets/cards/policy')
