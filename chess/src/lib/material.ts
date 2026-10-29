/** Стоимость фигур в «очках» — классическая шкала. */
export const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 } as const

export type MaterialPiece = keyof typeof PIECE_VALUE
export type PieceColor = 'w' | 'b'

const START: Record<MaterialPiece, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 }
const ORDER: MaterialPiece[] = ['p', 'n', 'b', 'r', 'q']

export interface SideMaterial {
  /** Очки фигур этой стороны на доске (без короля). */
  points: number
  /** Фигуры соперника, которые взяла эта сторона, по возрастанию ценности. */
  captured: MaterialPiece[]
}

export interface Material {
  w: SideMaterial
  b: SideMaterial
  /** Перевес белых в очках (отрицательный — перевес чёрных). */
  balance: number
}

function countPieces(fen: string): Record<PieceColor, Record<MaterialPiece, number>> {
  const counts = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0 },
  }
  for (const ch of fen.split(' ')[0]) {
    const lower = ch.toLowerCase() as MaterialPiece
    if (!(lower in PIECE_VALUE)) continue
    counts[ch === lower ? 'b' : 'w'][lower]++
  }
  return counts
}

/** Какие фигуры потеряла сторона (с учётом превращения пешек). */
function lostPieces(counts: Record<MaterialPiece, number>): MaterialPiece[] {
  // Лишние фигуры сверх начального набора появились из превратившихся пешек.
  const promoted = ORDER.filter((t) => t !== 'p').reduce((s, t) => s + Math.max(0, counts[t] - START[t]), 0)
  const lost: MaterialPiece[] = []
  for (const t of ORDER) {
    const missing = t === 'p' ? START.p - counts.p - promoted : START[t] - counts[t]
    for (let i = 0; i < missing; i++) lost.push(t)
  }
  return lost
}

/** Материал по FEN: очки каждой стороны, взятые фигуры и перевес. */
export function materialFromFen(fen: string): Material {
  const counts = countPieces(fen)
  const points = (c: PieceColor) => ORDER.reduce((s, t) => s + counts[c][t] * PIECE_VALUE[t], 0)
  const w = points('w')
  const b = points('b')
  return {
    // Белые взяли то, что потеряли чёрные, и наоборот.
    w: { points: w, captured: lostPieces(counts.b) },
    b: { points: b, captured: lostPieces(counts.w) },
    balance: w - b,
  }
}
