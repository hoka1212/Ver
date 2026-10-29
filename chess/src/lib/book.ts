import type { BotLevel } from '../engine/levels'
import { positionKey, sideToColor, type Course, type CourseLine } from './courses'

/** Ход из дебютной книги курса. */
export interface BookMove {
  san: string
  uci: string
  /** Линии курса, в которых встречается этот ход в этой позиции. */
  lines: CourseLine[]
  /** Ход есть только в линиях-ловушках (для соперника это ошибка, в которую он попадает). */
  trapOnly: boolean
  /** Комментарий курса к ходу (первый найденный). */
  comment?: string
}

export interface BookEntry {
  /** Ходы ученика в этой позиции. */
  user: BookMove[]
  /** Ответы соперника, которые разбираются в курсе. */
  opponent: BookMove[]
}

/** Позиция (без счётчиков ходов) → ходы курса. Переходы из разных линий сливаются. */
export type Book = Map<string, BookEntry>

export function buildBook(course: Course): Book {
  const book: Book = new Map()
  const userColor = sideToColor(course.side)
  for (const line of course.lines) {
    for (const m of line.moves) {
      const key = positionKey(m.fenBefore)
      let entry = book.get(key)
      if (!entry) {
        entry = { user: [], opponent: [] }
        book.set(key, entry)
      }
      const list = m.color === userColor ? entry.user : entry.opponent
      let move = list.find((x) => x.san === m.san)
      if (!move) {
        move = { san: m.san, uci: m.from + m.to + (m.promotion ?? ''), lines: [], trapOnly: true }
        list.push(move)
      }
      if (!move.lines.includes(line)) move.lines.push(line)
      if (!line.trap) move.trapOnly = false
      if (!move.comment && m.comment) move.comment = m.comment
    }
  }
  return book
}

/** Слабый бот чаще попадает в ловушки курса, сильный — почти никогда. */
const TRAP_WEIGHT: Record<BotLevel, number> = { 1: 1.5, 2: 1, 3: 0.5, 4: 0.2 }

/**
 * Выбор ответа соперника из книги. Вес — корень из числа линий:
 * главные продолжения встречаются чаще, но и редкие боковые линии выпадают регулярно.
 */
export function chooseBookMove(moves: BookMove[], level: BotLevel, random: () => number = Math.random): BookMove {
  const weights = moves.map((m) => Math.sqrt(m.lines.length) * (m.trapOnly ? TRAP_WEIGHT[level] : 1))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = random() * total
  for (let i = 0; i < moves.length; i++) {
    r -= weights[i]
    if (r <= 0) return moves[i]
  }
  return moves[moves.length - 1]
}
