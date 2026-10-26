import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'
import { Hub } from './hub'
import { ServerError } from './room'
import type { Store } from './store'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}

export interface RunningServer {
  hub: Hub
  server: Server
  port: number
  close(): Promise<void>
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 10_000) throw new ServerError('요청이 너무 큽니다')
  }
  try {
    const v = body ? JSON.parse(body) : {}
    return v && typeof v === 'object' ? v : {}
  } catch {
    throw new ServerError('잘못된 요청입니다')
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** 빌드한 클라이언트(dist)가 있으면 함께 내려 준다 */
function serveStatic(dir: string | undefined, req: IncomingMessage, res: ServerResponse): void {
  if (!dir) return void sendJson(res, 404, { error: 'not found' })
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
  let file = normalize(join(dir, urlPath))
  if (!file.startsWith(dir)) return void sendJson(res, 403, { error: 'forbidden' })
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html') // 새로고침해도 SPA가 열리게
  if (!existsSync(file)) return void sendJson(res, 404, { error: 'not found' })
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
}

export function startServer(opts: { port: number; store: Store; staticDir?: string }): Promise<RunningServer> {
  const hub = new Hub(opts.store)
  const server = createServer(async (req, res) => {
    try {
      const url = (req.url ?? '/').split('?')[0]
      const m = /^\/api\/rooms(?:\/([A-Za-z0-9]+))?(\/join)?$/.exec(url)
      if (!m) return serveStatic(opts.staticDir, req, res)
      const [, id, join_] = m
      if (req.method === 'POST' && !id) return sendJson(res, 200, hub.createRoom(String((await readJson(req)).name ?? '')))
      if (req.method === 'POST' && id && join_) return sendJson(res, 200, hub.joinRoom(id, String((await readJson(req)).name ?? '')))
      if (req.method === 'GET' && id && !join_) return sendJson(res, 200, hub.roomInfo(id))
      sendJson(res, 405, { error: 'method not allowed' })
    } catch (e) {
      if (e instanceof ServerError) return void sendJson(res, 400, { error: e.message })
      console.error(e)
      sendJson(res, 500, { error: '서버 오류' })
    }
  })
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 100_000 })
  wss.on('connection', (ws: WebSocket) => {
    const ctx = hub.connect({
      send: (msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg)),
      close: () => ws.close(),
    })
    ws.on('message', (data) => hub.handle(ctx, data.toString()))
    ws.on('close', () => hub.disconnect(ctx))
    ws.on('error', () => ws.close())
  })
  return new Promise((resolve) => {
    server.listen(opts.port, () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : opts.port
      resolve({
        hub, server, port,
        close: () => new Promise((done) => {
          for (const c of wss.clients) c.terminate()
          wss.close(() => server.close(() => done()))
        }),
      })
    })
  })
}
