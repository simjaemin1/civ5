# 문명 보드게임 프로토타입

보드게임 규칙 검증용 프로토타입 (TypeScript, 핫시트). 규칙서 원문은 [`docs/rules.md`](docs/rules.md).

## 구조
- `src/engine/` — UI와 무관한 순수 규칙 엔진 (`createGame`, `apply(state, action)`).
  - `data/*.json` — 문명·지형·자원·자연경관·기술 트리(52장)·군사 카드 데이터 (나중에 Java 등으로 옮길 때 그대로 재사용)
  - `placeholderDeck.ts` — **임시** 타일 덱 160장 (실제 카드 목록 없음)
- `src/App.tsx` — UI (아직 자리표시)

## 명령
```
npm install
npm test        # 규칙 테스트
npm run dev     # 개발 서버
```

## 진행 상황
- [x] 1단계: 준비, 일꾼 배치, 산출, 식량 정산, 기술 연구
- [ ] 2단계: 불가사의, 정책, 두 번째 도시
- [ ] 3단계: 군사 카드 생산·승급, 전쟁·전투
- [ ] 4단계: 문명 능력·고유 유닛, 승패 판정
- [ ] 5단계: 핫시트 UI, (선택) AI

규칙서에서 애매하거나 데이터가 빠진 부분은 [`docs/open-questions.md`](docs/open-questions.md)에 모아둠.
