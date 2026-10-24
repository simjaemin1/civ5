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
const civs = JSON.parse(readFileSync('src/engine/data/civs.json', 'utf8'))
status('문명 카드', civs.civs ?? civs, 'src/assets/cards/civ')

// 고유 유닛 카드: 유닛마다 방향 조합별로 한 장씩 (방향 없는 카드는 x 한 장)
{
  const files = existsSync('src/assets/cards/unique') ? readdirSync('src/assets/cards/unique').map((f) => f.replace(/\.[^.]+$/, '')) : []
  const have = new Set(files)
  const all = (civs.civs ?? civs).flatMap((c) => c.uniques)
  let need = 0
  const missing = []
  for (const u of all) {
    const keys = u.variants ? u.variants.map((v) => v.join('')) : ['x']
    for (const k of keys) {
      need++
      if (!have.has(`${u.id}.${k}`)) missing.push(`${u.name}(${u.id}.${k})`)
    }
  }
  console.log(`고유 유닛 카드 ${need - missing.length}/${need}장 등록`)
  if (missing.length) console.log('  아직 없음:', missing.join(', '))
  const known = new Set(all.flatMap((u) => (u.variants ? u.variants.map((v) => `${u.id}.${v.join('')}`) : [`${u.id}.x`])))
  const bad = files.filter((f) => !known.has(f))
  if (bad.length) console.log('  ⚠ 이름이 맞지 않는 파일:', bad.join(', '))
}

// 일반 군사 카드: 카드마다 방향별 한 장씩 (variantDirs가 없으면 x 한 장). 고유 유닛 전용 카드(화차·제고이센)는 위 고유 유닛으로 센다.
{
  const cards = JSON.parse(readFileSync('src/engine/data/militaryCards.json', 'utf8')).cards.filter((c) => !c.uniqueOnly)
  const files = existsSync('src/assets/cards/unit') ? readdirSync('src/assets/cards/unit').map((f) => f.replace(/\.[^.]+$/, '')) : []
  const have = new Set(files)
  const missing = []
  let need = 0
  for (const c of cards) {
    const keys = c.variantDirs ? c.variantDirs : ['x']
    for (const k of keys) {
      need++
      if (!have.has(`${c.id}.${k}`)) missing.push(`${c.name}(${c.id}.${k})`)
    }
  }
  console.log(`일반 군사 카드 ${need - missing.length}/${need}장 등록`)
  if (missing.length) console.log('  아직 없음:', missing.join(', '))
}

