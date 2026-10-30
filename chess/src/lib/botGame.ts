import { Chess } from 'chess.js'
import { botGameStore, botPrefsStore, type BotBehaviour, type BotGame, type BotGameMove, type BotGameResult } from '../store'

export const BEHAVIOURS: Record<BotBehaviour, { name: string; description: string; chance: number }> = {
  book: {
    name: 'По теории',
    description: 'Бот отвечает ходами из курса, пока они есть, и выбирает разные линии.',
    chance: 0,
  },
  mixed: {
    name: 'Иногда сворачивает',
    description: 'Примерно каждый пятый ход бот уходит от теории — проверьте, как вы применяете идеи дебюта.',
    chance: 0.2,
  },
  surprise: {
    name: 'Часто сворачивает',
    description: 'Бот часто играет разумные ходы не из курса — готовьтесь к сюрпризам.',
    chance: 0.45,
  },
}

/** Есть ли незаконченная партия, в которой ученик уже сделал ход (её не стоит молча затирать). */
export function botGameInProgress(game: BotGame | null): boolean {
  return !!game && !game.result && game.moves.some((_, i) => moveColor(i) === game.color)
}

/** Начинает новую партию с ботом с сохранёнными силой и поведением. */
export function startBotGame(courseId: string | null, color: 'w' | 'b') {
  const prefs = botPrefsStore.get()
  botPrefsStore.set({ ...prefs, courseId })
  botGameStore.set({ id: Date.now(), courseId, color, level: prefs.level, behaviour: prefs.behaviour, moves: [], hints: 0, result: null })
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** Чей ход с номером i (партии с ботом всегда начинаются с начальной позиции). */
export function moveColor(index: number): 'w' | 'b' {
  return index % 2 === 0 ? 'w' : 'b'
}

/** Восстанавливает партию по ходам (с историей — нужна для троекратного повторения). */
export function replay(moves: { uci: string }[]): Chess {
  const chess = new Chess()
  for (const m of moves) chess.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] })
  return chess
}

/** Итог партии по позиции или null, если партия продолжается. */
export function gameResult(chess: Chess): BotGameResult | null {
  if (chess.isCheckmate()) return { winner: chess.turn() === 'w' ? 'b' : 'w', reason: 'Мат' }
  if (chess.isStalemate()) return { winner: null, reason: 'Пат' }
  if (chess.isThreefoldRepetition()) return { winner: null, reason: 'Троекратное повторение позиции' }
  if (chess.isInsufficientMaterial()) return { winner: null, reason: 'Недостаточно материала для мата' }
  if (chess.isDrawByFiftyMoves()) return { winner: null, reason: 'Правило 50 ходов' }
  return null
}

/** Ход в формате UCI → SAN в данной позиции (null, если ход нелегален). */
export function uciToSan(fen: string, uci: string): string | null {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
  } catch {
    return null
  }
}

export interface TheorySummary {
  /** Ходов ученика по теории курса. */
  bookMoves: number
  /** Ошибки ученика в теории: номер хода в партии и ожидаемые ходы. */
  mistakes: { index: number; move: BotGameMove }[]
  /** Индекс хода, которым бот свернул с теории (или -1). */
  deviation: number
  /** Индекс последнего хода по теории (или -1). */
  lastBook: number
}

export function theorySummary(game: BotGame): TheorySummary {
  const mistakes: TheorySummary['mistakes'] = []
  let bookMoves = 0
  let deviation = -1
  let lastBook = -1
  game.moves.forEach((m, i) => {
    if (m.tag === 'book') lastBook = i
    if (moveColor(i) === game.color) {
      if (m.tag === 'book') bookMoves++
      if (m.tag === 'mistake') mistakes.push({ index: i, move: m })
    } else if (m.tag === 'deviation' && deviation === -1) deviation = i
  })
  return { bookMoves, mistakes, deviation, lastBook }
}
