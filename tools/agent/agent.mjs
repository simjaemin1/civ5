#!/usr/bin/env node
// 문명 보드게임 작업 도우미: 내 컴퓨터에서 Claude에게 이 저장소 일을 시킨다 (Claude Agent SDK, Anthropic API 크레딧 사용).
// 실행: 저장소 폴더에서 .\agent.bat (윈도우) 또는 ./agent.sh (맥·리눅스). 뒤에 할 일을 바로 적어도 된다: .\agent.bat "규칙서 7장 문구 고쳐 줘"
// 환경 변수 (선택):
//   ANTHROPIC_API_KEY      API 키. 없으면 처음 한 번 묻고 홈 폴더의 .civ5-agent-key 에 저장한다
//   CIV5_AGENT_MODEL       모델 (기본 claude-opus-5-5, 싸게 쓰려면 claude-sonnet-5-5)
//   CIV5_AGENT_BUDGET      요청 한 번에 쓸 최대 금액(달러, 기본 5)
//   CIV5_AGENT_ALLOW_ALL=1 명령 실행을 묻지 않고 모두 허용
import { query } from '@anthropic-ai/claude-agent-sdk'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const keyFile = path.join(os.homedir(), '.civ5-agent-key')
const model = process.env.CIV5_AGENT_MODEL || 'claude-opus-5-5'
const budget = Number(process.env.CIV5_AGENT_BUDGET || 5)
let allowAll = process.env.CIV5_AGENT_ALLOW_ALL === '1'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const gray = (s) => `\x1b[90m${s}\x1b[0m`
const cyan = (s) => `\x1b[36m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`

/** API 키: 환경 변수 → 저장한 파일 → 물어보고 저장 */
async function ensureApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return
  try {
    const saved = fs.readFileSync(keyFile, 'utf8').trim()
    if (saved) {
      process.env.ANTHROPIC_API_KEY = saved
      return
    }
  } catch {
    // 저장한 키가 없다
  }
  console.log('Anthropic API 키가 필요합니다. https://console.anthropic.com/settings/keys 에서 만들 수 있습니다.')
  const key = (await rl.question('API 키를 붙여 넣으세요 (한 번만 묻고 이 컴퓨터에 저장합니다): ')).trim()
  if (!key.startsWith('sk-ant-')) {
    console.log('API 키 모양이 아닙니다 (sk-ant- 로 시작해야 합니다).')
    process.exit(1)
  }
  fs.writeFileSync(keyFile, key + '\n', { mode: 0o600 })
  console.log(gray(`저장함: ${keyFile} (지우면 다음에 다시 묻습니다)`))
  process.env.ANTHROPIC_API_KEY = key
}

// 이 저장소의 CLAUDE.md(작업 규칙)는 settingSources: ['project']로 읽힌다. 아래는 '내 컴퓨터에서 돈다'는 차이만 알려 준다.
const localNotes = `
# 실행 환경 (내 컴퓨터, Claude Agent SDK)
- 이 세션은 사용자의 컴퓨터(${process.platform})에서 Claude Agent SDK로 돈다. 클라우드 세션이 아니다.
- GitHub MCP 도구는 없다. git 명령으로 일하고, PR·병합은 \`gh\` CLI가 있으면(\`gh auth status\`로 확인) \`gh pr create\` → \`gh pr merge --merge\`로 한다.
  gh가 없거나 로그인이 안 돼 있으면 main에서 커밋하고 \`git push origin main\`으로 올린 뒤 그렇게 했다고 알린다.
- 작업 전에 \`git status\`로 사용자가 고친 파일이 있는지 보고, 있으면 건드리지 말고 먼저 알린다.
- 규칙서 PDF 빌드(docs/rulebook/source/build.cjs)에는 playwright(chromium), poppler(pdfinfo·pdftoppm), python fonttools가 필요하다.
  없으면 설치 방법을 알려 주고, 사용자가 원할 때만 설치한다.
- 돈(API 크레딧)이 드는 일이므로 시뮬레이션처럼 오래 걸리는 작업은 시작 전에 대략 얼마나 걸릴지 말한다.
`

/** 명령 실행 등 자동 허용되지 않은 도구를 쓸지 묻는다 (파일 수정은 acceptEdits로 자동 허용) */
async function canUseTool(toolName, input) {
  if (allowAll) return { behavior: 'allow', updatedInput: input }
  const what = toolName === 'Bash' ? String(input.command ?? '') : JSON.stringify(input).slice(0, 300)
  console.log(yellow(`\n[${toolName}] ${what}`))
  const answer = (await rl.question('실행할까요? y=예 / n=아니오 / a=이번 실행 동안 모두 허용 > ')).trim().toLowerCase()
  if (answer === 'a') {
    allowAll = true
    return { behavior: 'allow', updatedInput: input }
  }
  if (answer === 'y' || answer === '') return { behavior: 'allow', updatedInput: input }
  const why = (await rl.question('하지 말아야 할 이유나 대신 할 일 (비워도 됨) > ')).trim()
  return { behavior: 'deny', message: why || '사용자가 거절했습니다.' }
}

/** 도구 호출을 한 줄로 보여 준다 */
function describeTool(block) {
  const i = block.input ?? {}
  if (block.name === 'Bash') return `$ ${i.command}`
  if (i.file_path) return `${block.name} ${path.relative(repo, String(i.file_path))}`
  if (i.pattern) return `${block.name} ${i.pattern}`
  return block.name
}

async function run(prompt, sessionId) {
  let next = sessionId
  const q = query({
    prompt,
    options: {
      cwd: repo,
      model,
      settingSources: ['project'],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: localNotes },
      permissionMode: 'acceptEdits',
      canUseTool,
      maxBudgetUsd: budget,
      ...(sessionId ? { resume: sessionId } : {}),
    },
  })
  for await (const m of q) {
    if (m.type === 'system' && m.subtype === 'init') next = m.session_id
    else if (m.type === 'assistant' && !m.parent_tool_use_id) {
      for (const b of m.message.content) {
        if (b.type === 'text' && b.text.trim()) console.log('\n' + b.text)
        else if (b.type === 'tool_use') console.log(gray(`  · ${describeTool(b)}`))
      }
    } else if (m.type === 'result') {
      next = m.session_id
      const cost = `$${(m.total_cost_usd ?? 0).toFixed(2)}`
      if (m.subtype === 'success') console.log(gray(`\n(끝: ${m.num_turns}턴, 이번 요청 약 ${cost})`))
      else if (m.subtype === 'error_max_budget_usd') console.log(yellow(`\n예산 $${budget}에 닿아 멈췄습니다 (${cost}). "계속"이라고 하면 이어서 합니다.`))
      else console.log(yellow(`\n멈춤 (${m.subtype}, ${cost}): ${(m.errors ?? []).join(' / ')}`))
    }
  }
  return next
}

async function main() {
  await ensureApiKey()
  console.log(cyan(`문명 보드게임 작업 도우미 — 모델 ${model}, 요청당 예산 $${budget}`))
  console.log(gray(`저장소: ${repo}`))
  console.log(gray('할 일을 적고 Enter. 같은 대화로 이어집니다. 새 대화: /new, 끝내기: /exit 또는 Ctrl+C'))
  let sessionId
  let first = process.argv.slice(2).join(' ').trim() // agent.bat "할 일" 처럼 바로 줄 수도 있다
  let closed = false
  rl.on('close', () => (closed = true))
  for (;;) {
    if (closed) break
    const prompt = first || (await rl.question(cyan('\n> ')).catch(() => '/exit')).trim()
    first = ''
    if (!prompt) continue
    if (prompt === '/exit' || prompt === '/quit') break
    if (prompt === '/new') {
      sessionId = undefined
      console.log(gray('새 대화를 시작합니다.'))
      continue
    }
    try {
      sessionId = await run(prompt, sessionId)
    } catch (e) {
      console.log(yellow(`오류: ${e instanceof Error ? e.message : String(e)}`))
    }
  }
  rl.close()
}

main()
