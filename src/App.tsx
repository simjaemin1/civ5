import { CIVS, TECHS } from './engine'

export default function App() {
  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>문명 보드게임 프로토타입</h1>
      <p>
        규칙 엔진 1단계(준비·일꾼 배치·산출·식량 정산·기술 연구) 구현됨. UI는 아직 없음.
        문명 {CIVS.length}개, 기술 {TECHS.length}개 로드됨.
      </p>
    </main>
  )
}
