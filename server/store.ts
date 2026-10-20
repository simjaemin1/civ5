import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LogEntry, RoomMeta } from './room'

/** 방 저장소: 서버가 재시작되어도 방이 살아 있게 한다 (메타 + 행동 기록) */
export interface Store {
  saveMeta(meta: RoomMeta): void
  appendLog(id: string, entries: LogEntry[]): void
  rewriteLog(id: string, entries: LogEntry[]): void
  loadAll(): { meta: RoomMeta; log: LogEntry[] }[]
  remove(id: string): void
}

export class MemoryStore implements Store {
  metas = new Map<string, RoomMeta>()
  logs = new Map<string, LogEntry[]>()
  saveMeta(meta: RoomMeta): void { this.metas.set(meta.id, structuredClone(meta)) }
  appendLog(id: string, entries: LogEntry[]): void { this.logs.set(id, [...(this.logs.get(id) ?? []), ...structuredClone(entries)]) }
  rewriteLog(id: string, entries: LogEntry[]): void { this.logs.set(id, structuredClone(entries)) }
  loadAll(): { meta: RoomMeta; log: LogEntry[] }[] {
    return [...this.metas.values()].map((meta) => ({ meta: structuredClone(meta), log: structuredClone(this.logs.get(meta.id) ?? []) }))
  }
  remove(id: string): void { this.metas.delete(id); this.logs.delete(id) }
}

/** `<dir>/<id>.json`(메타)와 `<dir>/<id>.log`(한 줄에 행동 하나) */
export class FileStore implements Store {
  private dir: string

  constructor(dir: string) {
    this.dir = dir
    mkdirSync(dir, { recursive: true })
  }
  private path(id: string, ext: string): string { return join(this.dir, `${id}.${ext}`) }

  saveMeta(meta: RoomMeta): void {
    const tmp = this.path(meta.id, 'json.tmp')
    writeFileSync(tmp, JSON.stringify(meta))
    renameSync(tmp, this.path(meta.id, 'json')) // 쓰다 죽어도 반쪽짜리 파일이 남지 않게
  }
  appendLog(id: string, entries: LogEntry[]): void {
    if (entries.length) appendFileSync(this.path(id, 'log'), entries.map((e) => JSON.stringify(e) + '\n').join(''))
  }
  rewriteLog(id: string, entries: LogEntry[]): void {
    const tmp = this.path(id, 'log.tmp')
    writeFileSync(tmp, entries.map((e) => JSON.stringify(e) + '\n').join(''))
    renameSync(tmp, this.path(id, 'log'))
  }
  loadAll(): { meta: RoomMeta; log: LogEntry[] }[] {
    const out: { meta: RoomMeta; log: LogEntry[] }[] = []
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue
      const id = f.slice(0, -5)
      const meta = JSON.parse(readFileSync(this.path(id, 'json'), 'utf8')) as RoomMeta
      const logFile = this.path(id, 'log')
      const lines = existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : []
      out.push({ meta, log: lines.map((l) => JSON.parse(l) as LogEntry) })
    }
    return out
  }
  remove(id: string): void {
    for (const ext of ['json', 'log', 'json.tmp', 'log.tmp']) rmSync(this.path(id, ext), { force: true })
  }
}
