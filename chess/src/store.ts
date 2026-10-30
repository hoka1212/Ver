import type { BotLevel } from './engine/levels'
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

// ---------- Игра с ботом ----------

/** Как часто бот сворачивает с теории курса. */
export type BotBehaviour = 'book' | 'mixed' | 'surprise'

export interface BotPrefs {
  level: BotLevel
  behaviour: BotBehaviour
  /** Последний выбранный курс; null — свободная партия. */
  courseId: string | null
  /** Цвет в свободной партии. */
  freeColor: 'w' | 'b' | 'random'
}

const DEFAULT_BOT_PREFS: BotPrefs = { level: 2, behaviour: 'mixed', courseId: null, freeColor: 'w' }

export const botPrefsStore = createStore('bot-prefs', DEFAULT_BOT_PREFS, withDefaults(DEFAULT_BOT_PREFS))

/**
 * Пометка хода в партии с ботом: по теории курса, ошибка в теории (у ученика),
 * отклонение бота от теории или свободная игра вне курса.
 */
export type MoveTag = 'book' | 'mistake' | 'deviation' | 'free'

export interface BotGameMove {
  uci: string
  san: string
  tag: MoveTag
  /** Ходы курса, которые ожидались вместо ошибочного или отклонения. */
  expected?: string[]
}

export interface BotGameResult {
  /** Победитель; null — ничья. */
  winner: 'w' | 'b' | null
  reason: string
}

export interface BotGame {
  id: number
  courseId: string | null
  color: 'w' | 'b'
  level: BotLevel
  behaviour: BotBehaviour
  moves: BotGameMove[]
  hints: number
  result: BotGameResult | null
}

export const botGameStore = createStore<BotGame | null>('bot-game', null, (raw) => {
  const g = raw as BotGame | null
  return g && typeof g === 'object' && Array.isArray(g.moves) ? g : null
})

export interface BotRecord {
  games: number
  wins: number
  draws: number
  losses: number
}

/** Счёт партий с ботом: по курсам (id), «_free» — без дебюта, «_all» — всего. */
export const botStatsStore = createStore<Record<string, BotRecord>>('bot-stats', {})

export function recordBotGame(courseId: string | null, outcome: 'win' | 'draw' | 'loss') {
  const field = outcome === 'win' ? 'wins' : outcome === 'draw' ? 'draws' : 'losses'
  const bump = (r: BotRecord | undefined): BotRecord => {
    const base = r ?? { games: 0, wins: 0, draws: 0, losses: 0 }
    return { ...base, games: base.games + 1, [field]: base[field] + 1 }
  }
  botStatsStore.set((prev) => ({ ...prev, [courseId ?? '_free']: bump(prev[courseId ?? '_free']), _all: bump(prev._all) }))
  logActivity('games')
}

// ---------- Активность ----------

export interface DayActivity {
  coords: number
  lines: number
  /** Партии с ботом (поле появилось позже — в старых данных его нет). */
  games?: number
}

export const activityStore = createStore<Record<string, DayActivity>>('activity', {})

export function logActivity(kind: keyof DayActivity, amount = 1) {
  const key = dayKey()
  activityStore.set((prev) => {
    const day = prev[key] ?? { coords: 0, lines: 0 }
    return { ...prev, [key]: { ...day, [kind]: (day[kind] ?? 0) + amount } }
  })
}

/** Всего занятий за день. */
export function dayTotal(d: DayActivity | undefined): number {
  return d ? d.coords + d.lines + (d.games ?? 0) : 0
}

/** Сколько дней подряд (включая сегодня или вчера) были тренировки. */
export function currentStreak(activity: Record<string, DayActivity>, now = Date.now()): number {
  const active = (ts: number) => dayTotal(activity[dayKey(ts)]) > 0
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

export const ALL_STORES = [settingsStore, coordStore, progressStore, repertoireStore, activityStore, botPrefsStore, botGameStore, botStatsStore]
