import { useEffect, useRef } from 'react'
import { Figurine } from './ui'

interface MoveListProps {
  moves: { san: string; color: 'w' | 'b'; comment?: string }[]
  /** Сколько ходов уже сыграно (подсвечивается последний). */
  ply: number
  /** Ходы после ply скрыты (режим тренировки). */
  hideFuture?: boolean
  onSelect?: (ply: number) => void
  className?: string
}

/** Список ходов парами, как на шахматных сайтах. */
export function MoveList({ moves, ply, hideFuture, onSelect, className = '' }: MoveListProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current?.querySelector('[data-current="true"]')
    if (el && 'scrollIntoView' in el) (el as HTMLElement).scrollIntoView({ block: 'nearest' })
  }, [ply])

  const rows: { num: number; white?: number; black?: number }[] = []
  moves.forEach((m, i) => {
    const num = Math.floor(i / 2) + 1
    if (m.color === 'w') rows.push({ num, white: i })
    else if (rows.length && rows[rows.length - 1].num === num && rows[rows.length - 1].black === undefined) rows[rows.length - 1].black = i
    else rows.push({ num, black: i })
  })

  const cell = (i: number | undefined) => {
    if (i === undefined) return <span className="px-2 py-1 text-faint">…</span>
    const hidden = hideFuture && i >= ply
    const current = i === ply - 1
    return (
      <button
        type="button"
        data-current={current}
        disabled={!onSelect || hidden}
        onClick={() => onSelect?.(i + 1)}
        className={`flex items-center gap-1 rounded px-2 py-1 text-left font-medium transition ${
          current ? 'bg-accent/25 text-fg' : hidden ? 'text-transparent' : 'text-fg/90 hover:bg-surface-3 disabled:hover:bg-transparent'
        }`}
      >
        {hidden ? <span className="text-faint">?</span> : <Figurine san={moves[i].san} />}
        {!hidden && moves[i].comment && <span className="size-1.5 rounded-full bg-info/70" title="Есть комментарий" />}
      </button>
    )
  }

  return (
    <div ref={ref} className={`scrollbar-thin overflow-y-auto text-[15px] ${className}`}>
      {rows.length === 0 && <p className="px-2 py-1 text-sm text-faint">Ходов пока нет</p>}
      {rows.map((r) => (
        <div key={r.num} className="grid grid-cols-[2.25rem_1fr_1fr] items-center odd:bg-surface-2/40">
          <span className="pl-2 text-sm text-faint tabular">{r.num}.</span>
          {cell(r.white)}
          {cell(r.black)}
        </div>
      ))}
    </div>
  )
}
