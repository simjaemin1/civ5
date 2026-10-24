import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { lanAddresses, startServer } from './index'
import { startTunnel } from './share'
import { FileStore } from './store'

const port = Number(process.env.PORT ?? 8787)
const dataDir = resolve(process.env.DATA_DIR ?? 'data/rooms')
const dist = resolve('dist')
const share = process.argv.includes('--share')
// 친구에게 보낼 공개 주소: PUBLIC_URL로 직접 주거나(포트 포워딩·고정 도메인), --share로 터널을 띄워 받는다
let publicUrl: string | null = process.env.PUBLIC_URL?.replace(/\/+$/, '') || null

const { hub } = await startServer({
  port,
  store: new FileStore(dataDir),
  staticDir: existsSync(dist) ? dist : undefined,
  publicUrl: () => publicUrl,
})

const lan = lanAddresses(port)
console.log(
  [
    `civ5 서버가 켜졌습니다 (방 ${hub.rooms.size}개 복원, 저장 위치 ${dataDir})`,
    `  내 PC에서 열기  : http://localhost:${port}`,
    ...(lan.length ? lan.map((u) => `  같은 와이파이   : ${u}   ← 같은 공유기에 있는 친구`) : ['  같은 와이파이   : (찾은 주소 없음)']),
    ...(publicUrl ? [`  인터넷 공개 주소: ${publicUrl}   ← 멀리 있는 친구`] : share ? ['  인터넷 공개 주소: 터널 여는 중…'] : ['  인터넷 친구와 하려면: npm run share']),
    ...(existsSync(dist) ? [] : ['⚠ dist가 없어 화면을 내려 주지 못합니다. 먼저 npm run build 하세요 (npm run share는 자동으로 빌드).']),
  ].join('\n'),
)

if (share && !publicUrl) {
  const child = startTunnel(port, (url) => {
    publicUrl = url
    console.log(`\n✅ 인터넷 공개 주소: ${url}\n   방장도 이 주소로 열어 방을 만들면 초대 주소가 이 주소로 나옵니다. (서버를 끄면 주소도 사라집니다)\n`)
  })
  const stop = () => {
    child?.kill()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
