import { useMemo } from 'react'
import { defaultPieces } from 'react-chessboard'
import { materialFromFen, PIECE_VALUE, type MaterialPiece, type PieceColor } from '../lib/material'

const PIECE_NAME: Record<MaterialPiece, string> = { p: 'пешка', n: 'конь', b: 'слон', r: 'ладья', q: 'ферзь' }
// Взятые фигуры рисуем силуэтами: светлые — белые, серые — чёрные (чёрный контур не виден на тёмном фоне).
const FILL: Record<PieceColor, string> = { w: '#ecebe8', b: '#6b6762' }

/** Полоса над/под доской: взятые этой стороной фигуры, перевес и очки материала. */
export function MaterialBar({ fen, color, label }: { fen: string; color: PieceColor; label?: string }) {
  const material = useMemo(() => materialFromFen(fen), [fen])
  const side = material[color]
  const lead = color === 'w' ? material.balance : -material.balance
  const victim: PieceColor = color === 'w' ? 'b' : 'w'

  const groups: MaterialPiece[][] = []
  for (const p of side.captured) {
    const last = groups[groups.length - 1]
    if (last && last[0] === p) last.push(p)
    else groups.push([p])
  }
  const description = side.captured.length
    ? `Взято: ${side.captured.map((p) => PIECE_NAME[p]).join(', ')}`
    : 'Пока ничего не взято'

  return (
    <div className="flex h-8 min-w-0 items-center gap-2 px-0.5 text-sm" title={description}>
      <span
        className={`size-3 shrink-0 rounded-sm ${color === 'w' ? 'bg-[#eeeeea]' : 'bg-[#0d0c0b] ring-1 ring-faint'}`}
        aria-hidden="true"
      />
      {label && <span className="shrink-0 font-semibold text-fg/90">{label}</span>}
      <span className="flex min-w-0 items-center gap-1 overflow-hidden" aria-label={description}>
        {groups.map((g, i) => (
          <span key={i} className="flex">
            {g.map((p, j) => (
              <span key={j} className={`size-[18px] shrink-0 ${j > 0 ? '-ml-2.5' : ''}`}>
                {defaultPieces[`w${p.toUpperCase()}`]?.({ fill: FILL[victim] })}
              </span>
            ))}
          </span>
        ))}
      </span>
      {lead > 0 && <span className="shrink-0 font-bold text-fg tabular">+{lead}</span>}
      <span
        className="ml-auto shrink-0 text-xs text-faint tabular"
        title={`Очки материала (пешка ${PIECE_VALUE.p}, конь и слон ${PIECE_VALUE.n}, ладья ${PIECE_VALUE.r}, ферзь ${PIECE_VALUE.q})`}
      >
        {side.points} очк.
      </span>
    </div>
  )
}
