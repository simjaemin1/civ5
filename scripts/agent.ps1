# 문명 보드게임 작업 도우미: 내 PC에서 Claude에게 이 저장소 일을 시킨다 (Claude Agent SDK, Anthropic API 크레딧 사용)
#   .\agent.bat                 대화로 할 일을 적는다
#   .\agent.bat "할 일"          바로 시작
# 처음 한 번 API 키를 묻고 홈 폴더의 .civ5-agent-key 에 저장한다 (https://console.anthropic.com/settings/keys)
Set-Location (Split-Path -Parent $PSScriptRoot)   # 저장소 폴더 (scripts의 위)

function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "Node.js가 필요합니다 (https://nodejs.org)" -ForegroundColor Red; exit 1 }

# 1. 최신 코드 받기 (고친 파일이 없을 때만)
Step "최신 코드 받기 (main)"
$dirty = git status --porcelain --untracked-files=no
if ($dirty) {
  Write-Host "내 PC에서 고친 파일이 있어 받기를 건너뜁니다:" -ForegroundColor Yellow
  Write-Host $dirty
} else {
  git checkout main
  git pull --ff-only origin main
  if ($LASTEXITCODE -ne 0) { Write-Host "받기 실패. 지금 있는 코드로 시작합니다." -ForegroundColor Yellow }
}

# 2. 도우미 패키지 설치: tools/agent/package-lock.json이 바뀌었을 때만
$lockHash = (Get-FileHash tools\agent\package-lock.json -Algorithm SHA256).Hash
$stamp = 'tools\agent\node_modules\.civ5-lock-hash'
if (-not (Test-Path tools\agent\node_modules) -or -not (Test-Path $stamp) -or ((Get-Content $stamp -Raw).Trim() -ne $lockHash)) {
  Step "도우미 패키지 설치 (처음 한 번, 1~2분)"
  npm install --prefix tools\agent --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Write-Host "npm install 실패" -ForegroundColor Red; exit 1 }
  Set-Content -Path $stamp -Value $lockHash
}

# 3. 실행 (끝내기: /exit 또는 Ctrl+C)
node tools\agent\agent.mjs @args
