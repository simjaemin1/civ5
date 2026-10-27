# 문명 보드게임: 최신 코드로 받아서 바로 실행 (테스트는 하지 않는다)
#   .\civ5.bat              핫시트 (http://localhost:5173, 브라우저가 열림)
#   .\civ5.bat online       온라인 서버 (빌드 후 http://localhost:8787, 같은 와이파이 친구 주소도 화면에 나옴)
#   .\civ5.bat share        온라인 + 인터넷 공개 주소 (cloudflared 터널)
#   .\civ5.bat dev <브랜치>  다른 브랜치로 받아서 실행 (기본 main)
param(
  [ValidateSet('dev', 'online', 'share')][string]$Mode = 'dev',
  [string]$Branch = 'main'
)

Set-Location (Split-Path -Parent $PSScriptRoot)   # 저장소 폴더 (scripts의 위)

function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }

# 1. 최신 코드 받기
Step "최신 코드 받기 ($Branch)"
$dirty = git status --porcelain --untracked-files=no
if ($dirty) {
  Write-Host "내 PC에서 고친 파일이 있어 받기를 건너뜁니다 (지금 있는 코드로 실행):" -ForegroundColor Yellow
  Write-Host $dirty
} else {
  git fetch origin
  if ($LASTEXITCODE -ne 0) { Write-Host "받기 실패 (인터넷 연결 확인). 지금 있는 코드로 실행합니다." -ForegroundColor Yellow }
  else {
    git checkout $Branch
    if ($LASTEXITCODE -ne 0) { Write-Host "브랜치 $Branch 로 바꾸지 못했습니다." -ForegroundColor Red; exit 1 }
    git pull --ff-only origin $Branch
    if ($LASTEXITCODE -ne 0) { Write-Host "pull 실패: 내 PC 쪽 커밋과 갈라졌습니다. 지금 있는 코드로 실행합니다." -ForegroundColor Yellow }
  }
}
git log -1 --format="   지금 코드: %h %s (%cr)"

# 2. 패키지 설치: package-lock.json이 바뀌었을 때만 (매번 하면 느리다)
$lockHash = (Get-FileHash package-lock.json -Algorithm SHA256).Hash
$stamp = 'node_modules\.civ5-lock-hash'
if (-not (Test-Path node_modules) -or -not (Test-Path $stamp) -or ((Get-Content $stamp -Raw).Trim() -ne $lockHash)) {
  Step "패키지 설치 (npm install)"
  npm install
  if ($LASTEXITCODE -ne 0) { Write-Host "npm install 실패" -ForegroundColor Red; exit 1 }
  Set-Content -Path $stamp -Value $lockHash
} else {
  Write-Host "   패키지 변경 없음 (npm install 건너뜀)"
}

# 3. 실행 (끄려면 Ctrl+C)
switch ($Mode) {
  'dev' {
    Step "핫시트 실행: http://localhost:5173"
    npm run dev -- --open
  }
  'online' {
    Step "온라인 서버: 빌드 후 실행"
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Host "빌드 실패" -ForegroundColor Red; exit 1 }
    npm run server
  }
  'share' {
    Step "온라인 서버 + 인터넷 공개 주소 (터널)"
    npm run share
  }
}
