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

## 불가사의 카드 (16장 모두 등록됨, 가로형)
- 위치: `src/assets/cards/wonder/<불가사의 id>.webp` (예: pyramids, temple_of_artemis, statue_of_zeus …). id는 `src/engine/data/wonderCards.json`.
- 카드의 최소 망치와 진척도(검은 원 개수 + 기술 아이콘 1개)는 데이터와 같아야 한다.

## 정책 카드 (8장 모두 등록됨)
- 위치: `src/assets/cards/policy/<정책 id>.webp` (tradition, aesthetics, despotism, regime, liberty, rationalism, equality, diplomacy).

## 문명 카드 (24장 모두 등록됨, 가로형)
- 위치: `src/assets/cards/civ/<문명 id>.webp` (korea, germany …).

## 군사 카드 (방향마다 한 장씩)
군사 카드는 전투력 마크의 **방향**마다 그림이 다르다 (별이 왼쪽/가운데/오른쪽에 있다). 파일 이름에 방향을 붙인다.
- 고유 유닛: `src/assets/cards/unique/<유닛 id>.<방향>.webp` — 유닛 id는 `src/engine/data/civs.json`의 각 고유 유닛 `id`
  (예: `jaguar.L.webp`, `jaguar.C.webp`, `jaguar.R.webp`)
- 일반 군사 카드: `src/assets/cards/unit/<카드 id>.<방향>.webp` — 카드 id는 `militaryCards.json`의 `id` (예: `warrior.C.webp`)
- 방향 표기: `L`(왼쪽) `C`(가운데) `R`(오른쪽). 전투력 마크가 둘인 카드(연노병)는 `LC` `LR` `CR`. 방향이 없는 카드(대상을 고르는 카드, 공성추 등)는 `x` 한 장.
- 한 판에 세 장이 같은 카드(`x`)도 그림은 한 장만 있으면 된다.
- 한 장에 여러 장이 4×2로 모여 있는 판 이미지도 그대로 보내면 잘라서 등록한다. 별 위치로 방향을 구분한다.

## 화면 사용처
- 기술 트리 탭: 52장 카드가 비용 열별로 나열된다. 테두리 초록 = 보유, 주황 = 지금 연구 가능, 흐림 = 선행 기술이 모자람. 누르면 크게 보인다.
- 기술 연구 화면: 연구할 수 있는 카드를 눌러 바로 연구한다.
- 고유 유닛 탭, 내 군사 카드 목록, 전투 카드 배치, 전투 결과 창에 군사 카드가 나온다. 그림이 없는 카드는 능력치로 그린다 (전투력 별의 위치 = 공격 방향).
- 정책 탭, 정책을 고를 때, 문명 현황의 시행 중인 정책에 정책 카드가 나온다.
- 시작 화면의 자리마다, 문명 현황(CivInspector)에 문명 카드가 나온다.
- 불가사의 탭: 16장 카드와 주인·진척도. 생산 화면의 불가사의 투자에도 카드가 나온다.

## 다른 카드(군사·불가사의·정책·문명 등)
같은 방식으로 `src/assets/cards/<종류>/<id>.webp`를 두고, `src/ui/cards/cardImages.ts`의 `CardKind`에 종류를 추가하고 화면 컴포넌트를 만든다 (기술 카드 `TechCard.tsx`를 본뜬다).
