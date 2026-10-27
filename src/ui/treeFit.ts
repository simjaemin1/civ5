/** 기술표 창(맨 위에서 겹쳐 뜨는 창) 안에서 표 전체가 스크롤 없이 들어가는 넓이·높이: 창 위치(위 72px)·여백·테두리·제목 줄을 뺀 값 */
export function treeFitBox(): { width: number; height: number } {
  return { width: window.innerWidth - 24 - 24, height: window.innerHeight - 72 - 12 - 24 - 44 }
}
