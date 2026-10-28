import type { CourseDef } from './lib/courses'
import type { LineProgress } from './lib/srs'
import { createStore, dayKey, withDefaults } from './lib/storage'

// ---------- Настройки ----------

export type BoardTheme = 'green' | 'brown' | 'blue' | 'gray'

export const BOARD_THEMES: Record<BoardTheme, { name: string; light: string; dark: string }> = {
  green: { name: 'Зелёная', light: '#ebecd0', dark: '#739552' },
  brown: { name: 'Коричневая', light: '#f0d9b5', dark: '#b58863' },
  blue: { name: 'Синяя', light: '#dee3e6', dark: '#8ca2ad' },
  gray: { name: 'Графит', light: '#c9c9c4', dark: '#7d7b77' },
}

export interface Settings {
  boardTheme: BoardTheme
  /** Подписи a–h / 1–8 на доске в дебютном тренажёре. */
  showNotation: boolean
  animations: boolean
  /** Задержка ответа «компьютера» в мс. */
  opponentDelay: number
  /** Показывать комментарии к ходам во время тренировки. */
  showComments: boolean
}

const DEFAULT_SETTINGS: Settings = {
  boardTheme: 'green',
  showNotation: true,
  animations: true,
  opponentDelay: 450,
  showComments: true,
}

export const settingsStore = createStore('settings', DEFAULT_SETTINGS, withDefaults(DEFAULT_SETTINGS))

// ---------- Тренажёр координат ----------

export type CoordMode = 'sprint' | 'series'
export type CoordSide = 'white' | 'black' | 'random'

export interface CoordPrefs {
  mode: CoordMode
  /** Длительность раунда «на время», сек. */
  sprintSeconds: number
  /** Сколько клеток в серии. */
  seriesLength: number
  /** Лимит на одну клетку в серии, сек. */
  perSquareSeconds: number
  side: CoordSide
  showNotation: boolean
}

export interface CoordSession {
  at: number
  mode: CoordMode
  /** sprintSeconds или perSquareSeconds — параметр режима. */
  param: number
  side: 'white' | 'black'
  correct: number
  wrong: number
  avgMs: number
}

export interface SquareStat {
  ok: number
  miss: number
}

export interface CoordData {
  prefs: CoordPrefs
  sessions: CoordSession[]
  best: Record<string, number>
  squares: Record<string, SquareStat>
}

const DEFAULT_COORD: CoordData = {
  prefs: { mode: 'sprint', sprintSeconds: 30, seriesLength: 20, perSquareSeconds: 5, side: 'white', showNotation: false },
  sessions: [],
  best: {},
  squares: {},
}

export const coordStore = createStore<CoordData>('coordinates', DEFAULT_COORD, (raw) => {
  const r = (raw ?? {}) as Partial<CoordData>
  return {
    prefs: { ...DEFAULT_COORD.prefs, ...(r.prefs ?? {}) },
    sessions: Array.isArray(r.sessions) ? r.sessions : [],
    best: r.best ?? {},
    squares: r.squares ?? {},
  }
})

export function coordBestKey(mode: CoordMode, param: number) {
  return `${mode}-${param}`
}

// ---------- Дебюты ----------

export const progressStore = createStore<Record<string, LineProgress>>('opening-progress', {}, (raw) =>
  raw && typeof raw === 'object' ? (raw as Record<string, LineProgress>) : {},
)

/** Пользовательские курсы (импорт PGN / ручной ввод). */
export const repertoireStore = createStore<CourseDef[]>('repertoire', [], (raw) => (Array.isArray(raw) ? (raw as CourseDef[]) : []))

// ---------- Активность ----------

export interface DayActivity {
  coords: number
  lines: number
}

export const activityStore = createStore<Record<string, DayActivity>>('activity', {})

export function logActivity(kind: keyof DayActivity, amount = 1) {
  const key = dayKey()
  activityStore.set((prev) => {
    const day = prev[key] ?? { coords: 0, lines: 0 }
    return { ...prev, [key]: { ...day, [kind]: day[kind] + amount } }
  })
}

/** Сколько дней подряд (включая сегодня или вчера) были тренировки. */
export function currentStreak(activity: Record<string, DayActivity>, now = Date.now()): number {
  const active = (ts: number) => {
    const d = activity[dayKey(ts)]
    return !!d && d.coords + d.lines > 0
  }
  const DAY = 86400_000
  let ts = now
  if (!active(ts)) ts -= DAY
  let streak = 0
  while (active(ts)) {
    streak++
    ts -= DAY
  }
  return streak
}

export const ALL_STORES = [settingsStore, coordStore, progressStore, repertoireStore, activityStore]
