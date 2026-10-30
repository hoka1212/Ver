import { positionKey, sideToColor, type CourseLine, type Side } from './courses'

/** Ход из дебютной книги курса. */
export interface BookMove {
  san: string
  uci: string
  /** Линии курса, в которых встречается этот ход в этой позиции. */
  lines: CourseLine[]
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

/** Книга курса или всего репертуара (нужны только сторона и линии). */
export function buildBook(course: { side: Side; lines: CourseLine[] }): Book {
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
        move = { san: m.san, uci: m.from + m.to + (m.promotion ?? ''), lines: [] }
        list.push(move)
      }
      if (!move.lines.includes(line)) move.lines.push(line)
      if (!move.comment && m.comment) move.comment = m.comment
    }
  }
  return book
}

/**
 * Выбор ответа соперника из книги. Вес — корень из числа линий:
 * главные продолжения встречаются чаще, но и редкие боковые линии выпадают регулярно.
 * Ловушки курса бот любого уровня играет так же охотно — ради них курс и проходят.
 */
export function chooseBookMove(moves: BookMove[], random: () => number = Math.random): BookMove {
  const weights = moves.map((m) => Math.sqrt(m.lines.length))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = random() * total
  for (let i = 0; i < moves.length; i++) {
    r -= weights[i]
    if (r <= 0) return moves[i]
  }
  return moves[moves.length - 1]
}
