#!/bin/bash
# 문명 보드게임 작업 도우미: 내 컴퓨터에서 Claude에게 이 저장소 일을 시킨다 (Claude Agent SDK, Anthropic API 크레딧 사용). 맥·리눅스용 (윈도우는 agent.bat)
#   ./agent.sh                대화로 할 일을 적는다
#   ./agent.sh "할 일"         바로 시작
# 처음 한 번 API 키를 묻고 홈 폴더의 .civ5-agent-key 에 저장한다 (https://console.anthropic.com/settings/keys)
cd "$(dirname "$0")" || exit 1   # 저장소 폴더
step() { printf '\n\033[36m== %s\033[0m\n' "$1"; }
warn() { printf '\033[33m%s\033[0m\n' "$1"; }

command -v node >/dev/null 2>&1 || { echo "Node.js가 필요합니다 (https://nodejs.org)"; exit 1; }

# 1. 최신 코드 받기 (고친 파일이 없을 때만)
step "최신 코드 받기 (main)"
DIRTY="$(git status --porcelain --untracked-files=no)"
if [ -n "$DIRTY" ]; then
  warn "내 컴퓨터에서 고친 파일이 있어 받기를 건너뜁니다:"
  echo "$DIRTY"
else
  git checkout main && git pull --ff-only origin main || warn "받기 실패. 지금 있는 코드로 시작합니다."
fi

# 2. 도우미 패키지 설치: tools/agent/package-lock.json이 바뀌었을 때만
if command -v shasum >/dev/null 2>&1; then LOCK_HASH="$(shasum -a 256 tools/agent/package-lock.json | cut -d' ' -f1)"
else LOCK_HASH="$(sha256sum tools/agent/package-lock.json | cut -d' ' -f1)"; fi
STAMP="tools/agent/node_modules/.civ5-lock-hash"
if [ ! -d tools/agent/node_modules ] || [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$LOCK_HASH" ]; then
  step "도우미 패키지 설치 (처음 한 번, 1~2분)"
  npm install --prefix tools/agent --no-audit --no-fund || { echo "npm install 실패"; exit 1; }
  echo "$LOCK_HASH" > "$STAMP"
fi

# 3. 실행 (끝내기: /exit 또는 Ctrl+C)
exec node tools/agent/agent.mjs "$@"
