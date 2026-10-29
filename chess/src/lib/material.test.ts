import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { materialFromFen } from './material'

function after(moves: string) {
  const chess = new Chess()
  for (const san of moves.split(' ')) chess.move(san)
  return materialFromFen(chess.fen())
}

describe('материал', () => {
  it('в начальной позиции по 39 очков и равенство', () => {
    const m = materialFromFen(new Chess().fen())
    expect(m.w.points).toBe(39)
    expect(m.b.points).toBe(39)
    expect(m.balance).toBe(0)
    expect(m.w.captured).toEqual([])
  })

  it('после принятого гамбита у чёрных лишняя пешка', () => {
    const m = after('e4 e5 f4 exf4')
    expect(m.b.captured).toEqual(['p'])
    expect(m.balance).toBe(-1)
  })

  it('мат Легаля: чёрные взяли ферзя, белые — слона и две пешки', () => {
    const m = after('e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7')
    expect(m.b.captured).toEqual(['q'])
    expect(m.w.captured).toEqual(['p', 'p'])
    expect(m.balance).toBe(-7)
  })

  it('превращение пешки не считается взятой пешкой', () => {
    // Ловушка Ласкера: пешка чёрных превращается в коня на g1.
    const m = after('d4 d5 c4 e5 dxe5 d4 e3 Bb4+ Bd2 dxe3 Bxb4 exf2+ Ke2 fxg1=N+')
    expect(m.w.captured).toEqual(['p', 'b'])
    expect(m.b.captured).toEqual(['p', 'p', 'n'])
    // Белые: 39 − 2 пешки − конь = 34; чёрные: 39 − пешка e5 − слон − пешка + конь = 37.
    expect(m.w.points).toBe(34)
    expect(m.b.points).toBe(37)
  })
})
