/**
 * Простое интервальное повторение (система Лейтнера) для дебютных линий.
 * Уровень 0 — линия ещё не изучалась, 6 — выучена надолго.
 */
export interface LineProgress {
  level: number
  /** Когда повторить (мс). */
  due: number
  runs: number
  perfectRuns: number
  mistakes: number
  last: number
}

export const MAX_LEVEL = 6
const HOUR = 3600_000
/** Интервал до следующего повторения для каждого уровня. */
const INTERVALS = [0, 0, 20 * HOUR, 3 * 24 * HOUR, 7 * 24 * HOUR, 16 * 24 * HOUR, 35 * 24 * HOUR]

export type LineStatus = 'new' | 'learning' | 'review' | 'mastered'

export const STATUS_LABEL: Record<LineStatus, string> = {
  new: 'Новая',
  learning: 'Изучается',
  review: 'Закрепляется',
  mastered: 'Выучена',
}

export function lineStatus(p: LineProgress | undefined): LineStatus {
  if (!p || p.level === 0) return 'new'
  if (p.level <= 2) return 'learning'
  if (p.level <= 4) return 'review'
  return 'mastered'
}

export function isDue(p: LineProgress | undefined, now = Date.now()): boolean {
  return !!p && p.level > 0 && p.due <= now
}

/** Результат тренировки без подсказок. */
export function reviewLine(prev: LineProgress | undefined, mistakes: number, now = Date.now()): LineProgress {
  const level = prev?.level ?? 0
  let next: number
  // Безошибочный проход сразу отправляет линию хотя бы на следующий день.
  if (mistakes === 0) next = Math.min(Math.max(level + 1, 2), MAX_LEVEL)
  else if (mistakes === 1) next = Math.max(1, level - 1)
  else next = 1
  return {
    level: next,
    due: now + INTERVALS[next],
    runs: (prev?.runs ?? 0) + 1,
    perfectRuns: (prev?.perfectRuns ?? 0) + (mistakes === 0 ? 1 : 0),
    mistakes: (prev?.mistakes ?? 0) + mistakes,
    last: now,
  }
}

/** Линия пройдена в режиме изучения (с подсказками) — только отмечаем знакомство. */
export function markStudied(prev: LineProgress | undefined, now = Date.now()): LineProgress {
  return {
    level: Math.max(prev?.level ?? 0, 1),
    due: prev && prev.level > 1 ? prev.due : now,
    runs: prev?.runs ?? 0,
    perfectRuns: prev?.perfectRuns ?? 0,
    mistakes: prev?.mistakes ?? 0,
    last: now,
  }
}

/** Доля освоения линии 0..1 */
export function lineMastery(p: LineProgress | undefined): number {
  return Math.min(p?.level ?? 0, 5) / 5
}

/** Порядок линий для тренировки: сначала просроченные, затем новые, затем ближайшие. */
export function practiceOrder<T extends { key: string }>(lines: T[], progress: Record<string, LineProgress>, now = Date.now()): T[] {
  const score = (l: T) => {
    const p = progress[l.key]
    if (!p || p.level === 0) return 1e15 // новые — после просроченных
    if (p.due <= now) return p.due - 1e15 + p.level * HOUR // просроченные: слабые и старые первыми
    return 2e15 + p.due
  }
  return [...lines].sort((a, b) => score(a) - score(b))
}

export function formatDue(due: number, now = Date.now()): string {
  const diff = due - now
  if (diff <= 0) return 'сейчас'
  const h = Math.round(diff / HOUR)
  if (h < 1) return 'меньше часа'
  if (h < 24) return `через ${h} ч`
  const d = Math.round(h / 24)
  return `через ${d} дн`
}
