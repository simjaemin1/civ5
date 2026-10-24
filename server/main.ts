import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { startServer } from './index'
import { FileStore } from './store'

const port = Number(process.env.PORT ?? 8787)
const dataDir = resolve(process.env.DATA_DIR ?? 'data/rooms')
const dist = resolve('dist')
const { hub } = await startServer({
  port,
  store: new FileStore(dataDir),
  staticDir: existsSync(dist) ? dist : undefined,
})
console.log(`civ5 서버: http://localhost:${port}  (방 ${hub.rooms.size}개 복원, 저장 위치 ${dataDir})`)
