#!/bin/bash
# 문명 보드게임: 최신 코드로 받아서 바로 실행 (테스트는 하지 않는다). 맥·리눅스용 (윈도우는 civ5.bat)
#   ./civ5.sh               핫시트 (http://localhost:5173, 브라우저가 열림)
#   ./civ5.sh online        온라인 서버 (빌드 후 http://localhost:8787, 같은 와이파이 친구 주소도 화면에 나옴)
#   ./civ5.sh share         온라인 + 인터넷 공개 주소 (cloudflared 터널, 맥: brew install cloudflared)
#   ./civ5.sh dev <브랜치>   다른 브랜치로 받아서 실행 (기본 main)
# macOS 기본 bash 3.2에서도 돌도록 bash 4 기능은 쓰지 않는다.

MODE="${1:-dev}"
BRANCH="${2:-main}"
case "$MODE" in
  dev|online|share) ;;
  *) echo "사용법: ./civ5.sh [dev|online|share] [브랜치]"; exit 1 ;;
esac

cd "$(dirname "$0")" || exit 1   # 저장소 폴더
step() { printf '\n\033[36m== %s\033[0m\n' "$1"; }
warn() { printf '\033[33m%s\033[0m\n' "$1"; }

# 1. 최신 코드 받기
step "최신 코드 받기 ($BRANCH)"
DIRTY="$(git status --porcelain --untracked-files=no)"
if [ -n "$DIRTY" ]; then
  warn "내 컴퓨터에서 고친 파일이 있어 받기를 건너뜁니다 (지금 있는 코드로 실행):"
  echo "$DIRTY"
elif ! git fetch origin; then
  warn "받기 실패 (인터넷 연결 확인). 지금 있는 코드로 실행합니다."
else
  git checkout "$BRANCH" || { echo "브랜치 $BRANCH 로 바꾸지 못했습니다."; exit 1; }
  git pull --ff-only origin "$BRANCH" || warn "pull 실패: 내 컴퓨터 쪽 커밋과 갈라졌습니다. 지금 있는 코드로 실행합니다."
fi
git log -1 --format="   지금 코드: %h %s (%cr)"

# 2. 패키지 설치: package-lock.json이 바뀌었을 때만 (매번 하면 느리다)
if command -v shasum >/dev/null 2>&1; then LOCK_HASH="$(shasum -a 256 package-lock.json | cut -d' ' -f1)"
else LOCK_HASH="$(sha256sum package-lock.json | cut -d' ' -f1)"; fi
STAMP="node_modules/.civ5-lock-hash"
if [ ! -d node_modules ] || [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$LOCK_HASH" ]; then
  step "패키지 설치 (npm install)"
  npm install || { echo "npm install 실패"; exit 1; }
  echo "$LOCK_HASH" > "$STAMP"
else
  echo "   패키지 변경 없음 (npm install 건너뜀)"
fi

# 3. 실행 (끄려면 Ctrl+C)
case "$MODE" in
  dev)
    step "핫시트 실행: http://localhost:5173"
    exec npm run dev -- --open ;;
  online)
    step "온라인 서버: 빌드 후 실행"
    npm run build || { echo "빌드 실패"; exit 1; }
    exec npm run server ;;
  share)
    step "온라인 서버 + 인터넷 공개 주소 (터널)"
    exec npm run share ;;
esac
