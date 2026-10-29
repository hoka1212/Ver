import { extractLines, parsePgn, type LineMove } from './pgn'

export type Side = 'white' | 'black'
export type CourseKind = 'gambit' | 'opening' | 'traps'
export type Level = 'beginner' | 'intermediate' | 'advanced'

/** Линия в исходном виде: PGN-ходы с комментариями в фигурных скобках. */
export interface LineDef {
  id: string
  name: string
  pgn: string
  /** Линия демонстрирует ловушку (ошибку соперника). */
  trap?: boolean
}

export interface CourseDef {
  id: string
  name: string
  nameEn?: string
  eco?: string
  side: Side
  kind: CourseKind
  level: Level
  /** Короткое описание для карточки. */
  summary: string
  description?: string
  ideas?: string[]
  lines: LineDef[]
  custom?: boolean
  createdAt?: number
}

export interface CourseLine {
  id: string
  /** Уникальный ключ для прогресса: courseId/lineId */
  key: string
  name: string
  trap?: boolean
  moves: LineMove[]
  /** Сколько ходов в линии делает ученик. */
  userMoves: number
}

export interface Course extends Omit<CourseDef, 'lines'> {
  lines: CourseLine[]
  errors: string[]
}

export const SIDE_LABEL: Record<Side, string> = { white: 'Белые', black: 'Чёрные' }
export const KIND_LABEL: Record<CourseKind, string> = { gambit: 'Гамбит', opening: 'Дебют', traps: 'Ловушки' }

/** Цвет бейджа типа курса. */
export const KIND_TONE: Record<CourseKind, 'accent' | 'info' | 'danger'> = { gambit: 'accent', opening: 'info', traps: 'danger' }
export const LEVEL_LABEL: Record<Level, string> = {
  beginner: 'Начальный',
  intermediate: 'Средний',
  advanced: 'Продвинутый',
}

export function sideToColor(side: Side): 'w' | 'b' {
  return side === 'white' ? 'w' : 'b'
}

export function compileCourse(def: CourseDef): Course {
  const errors: string[] = []
  const color = sideToColor(def.side)
  const lines: CourseLine[] = []
  for (const l of def.lines) {
    const games = parsePgn(l.pgn)
    if (games.length === 0) {
      errors.push(`«${l.name}»: нет ходов`)
      continue
    }
    const res = extractLines(games[0], l.name)
    errors.push(...res.errors)
    // Если в линии есть варианты — берём главную (первую) ветку.
    const main = res.lines[0]
    if (!main || res.errors.length) continue
    lines.push({
      id: l.id,
      key: `${def.id}/${l.id}`,
      name: l.name,
      trap: l.trap,
      moves: main.moves,
      userMoves: main.moves.filter((m) => m.color === color).length,
    })
  }
  return { ...def, lines, errors }
}

/** Ходы ученика, допустимые после данной последовательности (по всем линиям курса). */
export function repertoireMoves(course: Course, history: string[]): Map<string, CourseLine[]> {
  const result = new Map<string, CourseLine[]>()
  for (const line of course.lines) {
    if (line.moves.length <= history.length) continue
    let ok = true
    for (let i = 0; i < history.length; i++) {
      if (line.moves[i].san !== history[i]) {
        ok = false
        break
      }
    }
    if (!ok) continue
    const san = line.moves[history.length].san
    const list = result.get(san) ?? []
    list.push(line)
    result.set(san, list)
  }
  return result
}

/** Позиция без счётчиков ходов — для сравнения переходов. */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ')
}

/**
 * Проверка согласованности репертуара: в одной позиции ученик всегда
 * должен делать один и тот же ход (иначе тренировка будет противоречивой).
 */
export function findConflicts(course: Course): string[] {
  const color = sideToColor(course.side)
  const seen = new Map<string, { san: string; line: string }>()
  const conflicts: string[] = []
  for (const line of course.lines) {
    for (const m of line.moves) {
      if (m.color !== color) continue
      const key = positionKey(m.fenBefore)
      const prev = seen.get(key)
      if (prev && prev.san !== m.san) {
        conflicts.push(`В «${line.name}» ход ${m.san}, а в «${prev.line}» в той же позиции — ${prev.san}`)
      } else if (!prev) {
        seen.set(key, { san: m.san, line: line.name })
      }
    }
  }
  return conflicts
}
