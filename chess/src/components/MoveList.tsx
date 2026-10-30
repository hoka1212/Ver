import { useEffect, useRef } from 'react'
import { Figurine } from './ui'

/** Пометка хода: по теории, ошибка в теории, соперник свернул с теории. */
export type MoveMark = 'book' | 'mistake' | 'deviation'

const MARK_STYLE: Record<MoveMark, { className: string; title: string }> = {
  book: { className: 'bg-accent', title: 'По теории курса' },
  mistake: { className: 'bg-danger', title: 'Ошибка: в курсе здесь другой ход' },
  deviation: { className: 'bg-warn', title: 'Соперник свернул с теории' },
}

interface MoveListProps {
  moves: { san: string; color: 'w' | 'b'; comment?: string; mark?: MoveMark }[]
  /** Сколько ходов уже сыграно (подсвечивается последний). */
  ply: number
  /** Ходы с этого номера скрыты (тренировка: будущие ходы линии). */
  hideFrom?: number
  onSelect?: (ply: number) => void
  className?: string
}

/** Список ходов парами, как на шахматных сайтах. */
export function MoveList({ moves, ply, hideFrom, onSelect, className = '' }: MoveListProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Прокручиваем только сам список: scrollIntoView сдвинул бы всю страницу.
    const box = ref.current
    const el = box?.querySelector<HTMLElement>('[data-current="true"]')
    if (!box || !el) return
    const boxRect = box.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    if (elRect.top < boxRect.top) box.scrollTop -= boxRect.top - elRect.top
    else if (elRect.bottom > boxRect.bottom) box.scrollTop += elRect.bottom - boxRect.bottom
  }, [ply, moves.length])

  const rows: { num: number; white?: number; black?: number }[] = []
  moves.forEach((m, i) => {
    const num = Math.floor(i / 2) + 1
    if (m.color === 'w') rows.push({ num, white: i })
    else if (rows.length && rows[rows.length - 1].num === num && rows[rows.length - 1].black === undefined) rows[rows.length - 1].black = i
    else rows.push({ num, black: i })
  })

  const cell = (i: number | undefined) => {
    if (i === undefined) return <span className="px-2 py-1 text-faint">…</span>
    const hidden = hideFrom !== undefined && i >= hideFrom
    const current = i === ply - 1
    const mark = moves[i].mark
    return (
      <button
        type="button"
        data-current={current}
        disabled={!onSelect || hidden}
        onClick={() => onSelect?.(i + 1)}
        className={`flex items-center gap-1 rounded px-2 py-1 text-left font-medium transition-colors ${
          current ? 'bg-accent/25 text-fg' : hidden ? 'text-transparent' : 'text-fg/90 hover:bg-surface-3 disabled:hover:bg-transparent'
        }`}
      >
        {hidden ? <span className="text-faint">?</span> : <Figurine san={moves[i].san} />}
        {!hidden && moves[i].comment && <span className="size-1.5 rounded-full bg-info/70" title="Есть комментарий" />}
        {!hidden && mark && <span className={`size-1.5 rounded-full ${MARK_STYLE[mark].className}`} title={MARK_STYLE[mark].title} />}
      </button>
    )
  }

  return (
    <div ref={ref} className={`scrollbar-thin overflow-y-auto overscroll-contain text-[15px] ${className}`}>
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

/** Подписи к цветным точкам в списке ходов. */
export function MoveMarkLegend({ marks }: { marks: MoveMark[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 px-2 text-xs text-faint">
      {marks.map((m) => (
        <span key={m} className="flex items-center gap-1.5">
          <span className={`size-1.5 rounded-full ${MARK_STYLE[m].className}`} />
          {m === 'book' ? 'по теории' : m === 'mistake' ? 'ошибка в теории' : 'соперник свернул'}
        </span>
      ))}
    </div>
  )
}
