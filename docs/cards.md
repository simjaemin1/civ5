# 카드 그림 등록 방법

화면의 카드는 **그림 파일이 있으면 그 그림**을, 없으면 데이터로 그린 대체 카드를 보여 준다.
그림만 넣으면 코드를 고칠 필요가 없다.

## 기술 카드 (52장 모두 등록됨)
- 위치: `src/assets/cards/tech/<기술 id>.webp` (png, jpg도 됨)
- 예: 농업 → `src/assets/cards/tech/agriculture.webp`
- 기술 id는 `src/engine/data/techs.json`의 `id`다. 등록 현황과 빠진 카드는 아래 명령으로 본다.
  ```
  npm run cards:status
  ```
- 파일 이름이 기술 id와 맞지 않으면 현황에서 경고가 나온다.
- 용량: 카드 한 장이 20~30KB 정도(webp)면 단일 HTML 빌드(`npm run build:single`)에도 문제없이 들어간다.
  (그림은 단일 HTML 안에 같이 들어간다.)

## 화면 사용처
- 기술 트리 탭: 52장 카드가 비용 열별로 나열된다. 테두리 초록 = 보유, 주황 = 지금 연구 가능, 흐림 = 선행 기술이 모자람. 누르면 크게 보인다.
- 기술 연구 화면: 연구할 수 있는 카드를 눌러 바로 연구한다.

## 다른 카드(군사·불가사의·정책·문명 등)
같은 방식으로 `src/assets/cards/<종류>/<id>.webp`를 두고, `src/ui/cards/cardImages.ts`의 `CardKind`에 종류를 추가하고 화면 컴포넌트를 만든다 (기술 카드 `TechCard.tsx`를 본뜬다).
