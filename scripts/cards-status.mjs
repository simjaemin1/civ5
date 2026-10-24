// 카드 그림 등록 현황: node scripts/cards-status.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs'

const techs = JSON.parse(readFileSync('src/engine/data/techs.json', 'utf8')).techs
const dir = 'src/assets/cards/tech'
const files = existsSync(dir) ? readdirSync(dir) : []
const has = new Set(files.map((f) => f.replace(/\.[^.]+$/, '')))
const done = techs.filter((t) => has.has(t.id))
const missing = techs.filter((t) => !has.has(t.id))
const unknown = [...has].filter((id) => !techs.some((t) => t.id === id))
console.log(`기술 카드 ${done.length}/${techs.length}장 등록`)
if (done.length) console.log('등록됨:', done.map((t) => `${t.name}(${t.id})`).join(', '))
console.log('아직 없음:', missing.map((t) => `${t.name}(${t.id})`).join(', '))
if (unknown.length) console.log('⚠ 이름이 기술 id와 맞지 않는 파일:', unknown.join(', '))
