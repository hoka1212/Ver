import { useState } from 'react'
import { dayKey } from '../lib/storage'
import type { DayActivity } from '../store'

const DAYS = 14
const BAR_COLOR = '#72a543' // проверено валидатором палитры для тёмной поверхности
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

interface Point {
  key: string
  date: Date
  coords: number
  lines: number
  total: number
}

/** Столбчатая диаграмма тренировок за последние две недели (одна серия). */
export function ActivityChart({ activity, now }: { activity: Record<string, DayActivity>; now: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const points: Point[] = []
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = new Date(now)
    date.setHours(12, 0, 0, 0)
    date.setDate(date.getDate() - i)
    const key = dayKey(date.getTime())
    const d = activity[key] ?? { coords: 0, lines: 0 }
    points.push({ key, date, coords: d.coords, lines: d.lines, total: d.coords + d.lines })
  }
  const max = Math.max(4, ...points.map((p) => p.total))
  const niceMax = Math.ceil(max / 2) * 2
  const ticks = [0, niceMax / 2, niceMax]

  const W = 560
  const H = 170
  const padL = 26
  const padB = 22
  const padT = 8
  const plotW = W - padL
  const plotH = H - padB - padT
  const band = plotW / DAYS
  const barW = Math.min(24, band - 6)
  const y = (v: number) => padT + plotH - (v / niceMax) * plotH
  const hovered = hover !== null ? points[hover] : null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Тренировки за последние 14 дней">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="#34312d" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#6f6b65">
              {t}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = padL + i * band + (band - barW) / 2
          const h = (p.total / niceMax) * plotH
          const r = Math.min(4, h)
          const top = y(p.total)
          const base = padT + plotH
          const isToday = i === DAYS - 1
          return (
            <g
              key={p.key}
              tabIndex={0}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover((v) => (v === i ? null : v))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${p.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}: ${p.total} тренировок`}
              className="outline-none"
            >
              <rect x={padL + i * band} y={padT} width={band} height={plotH} fill="transparent" />
              {p.total > 0 && (
                <path
                  d={`M${x},${base} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + barW - r},${top} Q${x + barW},${top} ${x + barW},${top + r} L${x + barW},${base} Z`}
                  fill={BAR_COLOR}
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              )}
              <text
                x={padL + i * band + band / 2}
                y={H - 6}
                textAnchor="middle"
                fontSize={11}
                fill={isToday ? '#e8e6e3' : '#6f6b65'}
                fontWeight={isToday ? 600 : 400}
              >
                {p.date.getDate()}
              </text>
            </g>
          )
        })}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs shadow-xl"
          style={{ left: `${((padL + (hover! + 0.5) * band) / W) * 100}%` }}
        >
          <div className="font-semibold text-fg">
            {WEEKDAYS[hovered.date.getDay()]}, {hovered.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
          </div>
          <div className="mt-1 text-muted">
            Раунды координат: <span className="text-fg tabular">{hovered.coords}</span>
          </div>
          <div className="text-muted">
            Линии дебютов: <span className="text-fg tabular">{hovered.lines}</span>
          </div>
        </div>
      )}
      <table className="sr-only">
        <caption>Тренировки по дням</caption>
        <thead>
          <tr>
            <th>Дата</th>
            <th>Координаты</th>
            <th>Дебюты</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <td>{p.key}</td>
              <td>{p.coords}</td>
              <td>{p.lines}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
