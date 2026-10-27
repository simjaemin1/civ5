# 문명 보드게임 (civ5) — 작업 안내

사용자가 만든 문명풍 보드게임(규칙서: `docs/rules.md`)을 구현한 TypeScript 프로토타입. 지금은 **온라인 전환 단계**다. 먼저 `docs/online-plan.md`를 읽을 것. 규칙 작업은 모두 `main`에 병합되어 있고, 온라인 작업은 `main`에서 `online/server` 브랜치를 따서 시작한다.

## 사용자와 일하는 방식
- 사용자는 한국어를 쓴다. 답변도 한국어로 한다.
- **작업이 끝날 때마다 실행 명령을 함께 준다** (사용자의 상시 요청). `npm test`는 넣지 않는다. 저장소의 `civ5.bat`(→ `scripts/run.ps1`)가 최신 코드 받기 → 패키지가 바뀐 때만 `npm install` → 실행을 한 번에 한다:
  ```powershell
  cd ~/civ5
  .\civ5.bat                 # 핫시트 (http://localhost:5173, 브라우저가 열림)
  .\civ5.bat online          # 온라인 서버 (http://localhost:8787)
  .\civ5.bat share           # 온라인 + 인터넷 공개 주소 (cloudflared 터널)
  .\civ5.bat dev <브랜치>     # main이 아닌 브랜치로 받아서 실행
  ```
- 게임 데이터(카드·기술·불가사의)는 사용자가 이미지나 표로 준다. 이미지는 직접 읽고, 데이터 파일에 옮기고, 테스트로 검증한다. **사용자가 정한 숫자와 규칙은 임의로 바꾸지 않는다.** 애매하면 `docs/open-questions.md`에 적고 물어본다.
- 밸런스를 바꾸자는 얘기가 나오면 AI 시뮬레이션으로 근거 수치를 먼저 보여 준다. 표본이 작으면(예: 30판) 그렇다고 말한다.
- PR·병합은 사용자가 요청할 때만 한다 (기존 PR #1, #2는 초안 상태로 둠).

## 구조
- `src/engine/` — 순수 규칙 엔진. `createGame`, `apply(state, action)`(새 상태 반환, 규칙 위반은 `RuleError`), `actorOf`, `aiStep`. 상태는 순수 JSON, 난수는 상태 안의 시드(결정적).
- `src/engine/data/*.json` — 문명·기술·군사 카드·불가사의·정책·타일 160장. 나중에 Java 등으로 옮길 때 그대로 쓴다.
- `src/engine/ai.ts` — 규칙 검증용 휴리스틱 AI. 튜닝값은 `AI_TUNE`. 한 판 최대 180라운드(`MAX_ROUNDS`).
- `src/ui/` — React 핫시트 화면.
- `src/engine/__tests__/` — 엔진 테스트(Vitest). 비용·수치를 하드코딩한 테스트가 있으니 데이터를 바꾸면 같이 고친다.

## 검증 (작업마다)
```
npx tsc -b
npx oxlint
npx vitest run
npm run build:single    # 오프라인 단일 HTML (dist-single/civ5.html)
```

## 알아 둘 점
- 커밋에는 모델 이름을 넣지 않는다. 커밋·PR 끝에 붙일 줄은 세션이 알려 주는 것을 따른다.
- `pkill -f vite`를 쓰지 말 것 (셸이 같이 죽는다). 개발 서버는 `ps -eo pid,args | awk '$2 ~ /node/ && /vite/ {print $1}'`로 찾아 끈다.
- 시뮬레이션은 임시 테스트 파일(`src/engine/__tests__/tmp.test.ts`)로 돌리고, 끝나면 **지우고 커밋하지 않는다.** 결과는 `/tmp` 파일에 `appendFileSync`로 쓴다 (vitest가 console을 가린다).
- UI 확인은 Playwright(`/opt/pw-browsers/chromium`, `playwright-core`는 스크래치패드에 설치)로 한다. 핫시트 전투 UI는 저장 상태를 `localStorage['civ5-save-v1']`에 넣고 "이어하기"로 불러와 재현한다.
- 비공개 정보(손에 든 타일, 군사 카드 방향, 전투 배치)는 핫시트에서는 가림막으로 가리고, 온라인에서는 서버가 걸러 보내야 한다 (`docs/online-plan.md` 3.2).
