import { Chess, type Square } from 'chess.js'
import { useMemo, useState, type CSSProperties } from 'react'
import { Chessboard, defaultPieces, type Arrow, type PieceDropHandlerArgs, type SquareHandlerArgs } from 'react-chessboard'
import { BOARD_THEMES, settingsStore } from '../store'
import { MaterialBar } from './MaterialBar'
import { useStore } from '../lib/storage'

export interface BoardMove {
  from: string
  to: string
  promotion?: string
}

interface ChessBoardProps {
  id: string
  fen: string
  orientation: 'white' | 'black'
  /** Можно ли двигать фигуры. */
  interactive?: boolean
  /** Чьими фигурами можно ходить (по умолчанию — тот, чей ход в FEN). */
  movableColor?: 'w' | 'b'
  /** Вернуть false, чтобы отклонить ход (фигура вернётся на место). */
  onMove?: (move: BoardMove) => boolean
  lastMove?: { from: string; to: string } | null
  arrows?: Arrow[]
  /** Дополнительная подсветка клеток (поверх стандартной). */
  highlights?: Record<string, CSSProperties>
  showNotation?: boolean
  /** Показывать взятые фигуры и счёт материала над и под доской. */
  showMaterial?: boolean
  /** Подписи сторон для полос материала: сверху и снизу доски. */
  materialLabels?: { top?: string; bottom?: string }
}

const LAST_MOVE = 'rgba(255, 214, 10, 0.38)'
const SELECTED = 'rgba(255, 214, 10, 0.55)'

function isPromotion(chess: Chess, from: string, to: string): boolean {
  const piece = chess.get(from as Square)
  if (!piece || piece.type !== 'p') return false
  return (piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1')
}

export function ChessBoard({
  id,
  fen,
  orientation,
  interactive = true,
  movableColor,
  onMove,
  lastMove,
  arrows,
  highlights,
  showNotation,
  showMaterial,
  materialLabels,
}: ChessBoardProps) {
  const settings = useStore(settingsStore)
  const theme = BOARD_THEMES[settings.boardTheme]
  const chess = useMemo(() => {
    try {
      return new Chess(fen)
    } catch {
      return new Chess()
    }
  }, [fen])
  const turn = chess.turn()
  const canMoveColor = movableColor ?? turn
  // Выделение и выбор превращения привязаны к позиции: новая позиция их сбрасывает.
  const [selection, setSelection] = useState<{ fen: string; square: string } | null>(null)
  const [promotion, setPromotion] = useState<{ fen: string; from: string; to: string } | null>(null)
  const selected = selection?.fen === fen ? selection.square : null
  const pendingPromotion = promotion?.fen === fen ? promotion : null
  const setSelected = (square: string | null) => setSelection(square ? { fen, square } : null)
  const setPendingPromotion = (p: { from: string; to: string } | null) => setPromotion(p ? { fen, ...p } : null)

  const targets = useMemo(() => {
    if (!selected) return []
    return chess.moves({ square: selected as Square, verbose: true }).map((m) => m.to as string)
  }, [chess, selected])

  const tryMove = (from: string, to: string): boolean => {
    if (!onMove) return false
    const legal = chess.moves({ square: from as Square, verbose: true }).some((m) => m.to === to)
    if (legal && isPromotion(chess, from, to)) {
      setPendingPromotion({ from, to })
      return false
    }
    setSelected(null)
    return onMove({ from, to })
  }

  const ownPiece = (pieceType: string | undefined) => !!pieceType && pieceType[0] === canMoveColor && turn === canMoveColor

  const handleSquareClick = ({ piece, square }: SquareHandlerArgs) => {
    if (!interactive || pendingPromotion) return
    if (selected && selected !== square && !ownPiece(piece?.pieceType)) {
      tryMove(selected, square)
      setSelected(null)
      return
    }
    if (ownPiece(piece?.pieceType)) setSelected(selected === square ? null : square)
    else setSelected(null)
  }

  const handleDrop = ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
    if (!interactive || !targetSquare || sourceSquare === targetSquare) return false
    return tryMove(sourceSquare, targetSquare)
  }

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {}
    const add = (sq: string, style: CSSProperties) => {
      styles[sq] = { ...styles[sq], ...style }
    }
    if (lastMove) {
      add(lastMove.from, { backgroundColor: LAST_MOVE })
      add(lastMove.to, { backgroundColor: LAST_MOVE })
    }
    if (chess.inCheck()) {
      const king = chess
        .board()
        .flat()
        .find((p) => p && p.type === 'k' && p.color === turn)
      if (king) add(king.square, { background: 'radial-gradient(circle, rgba(255,40,40,0.9) 0%, rgba(230,30,30,0.55) 35%, rgba(200,0,0,0) 70%)' })
    }
    if (selected) {
      add(selected, { backgroundColor: SELECTED })
      for (const t of targets) {
        const occupied = !!chess.get(t as Square)
        add(t, {
          background: occupied
            ? 'radial-gradient(circle, transparent 58%, rgba(20, 30, 20, 0.35) 60%)'
            : 'radial-gradient(circle, rgba(20, 30, 20, 0.32) 24%, transparent 26%)',
          cursor: 'pointer',
        })
      }
    }
    if (highlights) for (const [sq, st] of Object.entries(highlights)) add(sq, st)
    return styles
  }, [lastMove, chess, turn, selected, targets, highlights])

  const promoColor = pendingPromotion ? chess.get(pendingPromotion.from as Square)?.color ?? 'w' : 'w'

  const board = (
    <div className={`relative select-none ${showMaterial ? 'aspect-square w-full' : 'board-frame'}`}>
      <Chessboard
        options={{
          id,
          position: fen,
          boardOrientation: orientation,
          allowDragging: interactive && !!onMove,
          canDragPiece: ({ piece }) => interactive && ownPiece(piece.pieceType),
          onPieceDrop: handleDrop,
          onSquareClick: handleSquareClick,
          onPieceDrag: ({ square }) => square && setSelected(square),
          squareStyles,
          arrows: arrows ?? [],
          allowDrawingArrows: true,
          showNotation: showNotation ?? settings.showNotation,
          animationDurationInMs: settings.animations ? 220 : 0,
          showAnimations: settings.animations,
          darkSquareStyle: { backgroundColor: theme.dark },
          lightSquareStyle: { backgroundColor: theme.light },
          darkSquareNotationStyle: { color: theme.light, fontWeight: 600 },
          lightSquareNotationStyle: { color: theme.dark, fontWeight: 600 },
          boardStyle: { borderRadius: 6, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.45)' },
          dropSquareStyle: { boxShadow: 'inset 0 0 0 4px rgba(255,255,255,0.6)' },
        }}
      />
      {pendingPromotion && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-md bg-black/60 animate-fade-in">
          <div className="rounded-xl bg-surface-2 p-3 shadow-2xl">
            <p className="mb-2 text-center text-sm text-muted">Превращение пешки</p>
            <div className="flex gap-2">
              {(['q', 'r', 'b', 'n'] as const).map((p) => {
                const key = `${promoColor}${p.toUpperCase()}`
                const render = defaultPieces[key]
                return (
                  <button
                    key={p}
                    type="button"
                    className="size-16 rounded-lg bg-surface-3 p-1 transition hover:bg-accent/30"
                    onClick={() => {
                      const move = { from: pendingPromotion.from, to: pendingPromotion.to, promotion: p }
                      setPendingPromotion(null)
                      setSelected(null)
                      onMove?.(move)
                    }}
                  >
                    {render?.()}
                  </button>
                )
              })}
            </div>
            <button type="button" className="mt-2 w-full text-sm text-muted hover:text-fg" onClick={() => setPendingPromotion(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  )

  if (!showMaterial) return board
  const bottom = orientation === 'white' ? 'w' : 'b'
  const top = bottom === 'w' ? 'b' : 'w'
  return (
    <div className="board-column">
      <MaterialBar fen={fen} color={top} label={materialLabels?.top} />
      {board}
      <MaterialBar fen={fen} color={bottom} label={materialLabels?.bottom} />
    </div>
  )
}
