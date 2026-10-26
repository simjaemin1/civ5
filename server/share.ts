import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'

/**
 * 인터넷 너머 친구용 공개 주소: Cloudflare 빠른 터널(cloudflared)을 띄워 https://….trycloudflare.com 주소를 받는다.
 * 계정·공유기 설정이 필요 없다. cloudflared가 없으면 설치 방법을 알려 주고 null을 돌려준다 (서버는 그대로 켜진다).
 */
export function startTunnel(port: number, onUrl: (url: string) => void): ChildProcess | null {
  const bin = process.env.CLOUDFLARED ?? 'cloudflared'
  let child: ChildProcess
  try {
    child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    return null
  }
  let found = false
  const scan = (chunk: Buffer) => {
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(chunk.toString())
    if (m && !found) {
      found = true
      onUrl(m[0])
    }
  }
  child.stdout?.on('data', scan)
  child.stderr?.on('data', scan)
  child.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') {
      console.log(
        [
          '',
          '⚠ cloudflared(터널 프로그램)가 없어 인터넷 공개 주소를 만들지 못했습니다.',
          '  Windows: PowerShell에서  winget install --id Cloudflare.cloudflared  실행 후 새 창에서 다시 npm run share',
          '  (같은 와이파이 친구는 위의 "같은 와이파이" 주소로 지금도 들어올 수 있습니다)',
          '',
        ].join('\n'),
      )
    } else console.log('⚠ 터널을 띄우지 못했습니다:', e.message)
  })
  child.on('exit', (code) => {
    if (!found && code !== null) console.log(`⚠ 터널이 주소를 받기 전에 끝났습니다 (코드 ${code}). 인터넷 연결이나 방화벽을 확인하세요.`)
  })
  return child
}
