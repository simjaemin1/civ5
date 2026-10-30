import { useMemo, useState } from 'react'
import { createGame } from '../../engine'
import { TileView } from '../TileView'
import { HAND_SIZE, newTileDraw, redrawTiles } from './tileLab'

const newSeed = () => Math.floor(Math.random() * 1_000_000)

/** 타일 뽑기 랩: 실제 타일 덱에서 4장을 뽑고, 고른 장수만큼 다시 뽑아 본다. 게임에는 영향이 없다. */
export function TileLab({ onBack }: { onBack: () => void }) {
  const [draw, setDraw] = useState(() => newTileDraw(newSeed()))
  const [picked, setPicked] = useState<number[]>([])
  // 산출 표시용 빈 문명 (기술·문명 효과 없음)
  const viewer = useMemo(() => createGame({ seed: 1, civIds: ['korea', 'russia'] }).players[0], [])
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const fresh = () => {
    setDraw(newTileDraw(newSeed()))
    setPicked([])
  }
  const redraw = () => {
    setDraw(redrawTiles(draw, picked))
    setPicked([])
  }

  return (
    <div className="lab">
      <div className="lab-bar">
        <button onClick={onBack}>← 처음 화면</button>
        <b>🃏 타일 뽑기 랩</b>
        <span className="muted">실제 타일 덱 160장에서 {HAND_SIZE}장을 뽑고, 고른 장수만큼 다시 뽑아 봅니다. 게임에는 영향이 없습니다.</span>
      </div>
      <p className="muted">다시 뽑을 타일을 눌러 고르세요. 고른 타일은 덱에 돌려넣고 섞은 뒤 같은 장수를 뽑으므로, 버린 타일이 다시 나올 수도 있습니다.</p>
      <div className="hand tile-lab-hand">
        {draw.hand.map((card) => (
          <div key={card.id} style={{ width: 150 }}>
            <TileView card={card} player={viewer} selected={picked.includes(card.id)} onClick={() => toggle(card.id)} />
          </div>
        ))}
      </div>
      <p className="row">
        <button className="primary" disabled={!picked.length} onClick={redraw}>
          🔄 고른 {picked.length}장 다시 뽑기
        </button>
        <button onClick={fresh}>🆕 새로 {HAND_SIZE}장 뽑기</button>
        <span className="muted">
          덱 {draw.deck.length}장 남음 · 이번 판 다시 뽑기 {draw.redraws}번 ({draw.redrawn}장)
        </span>
      </p>
    </div>
  )
}
