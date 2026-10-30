import {
  BISHOP,
  FLAG_CAPTURE,
  FLAG_CASTLE,
  KING,
  KNIGHT,
  moveFrom,
  moveTo,
  moveToUci,
  PAWN,
  Position,
  QUEEN,
  ROOK,
  WHITE,
} from './board'
import type { BotLevel } from './levels'
import { Searcher, type ScoredMove } from './search'

export type { BotLevel }

export type BotRequest =
  /** Обычный ход бота выбранной силы. */
  | { kind: 'move'; startFen: string; moves: string[]; level: BotLevel }
  /** Разумный ход не из списка exclude (бот сворачивает с теории); null — достойной альтернативы нет. */
  | { kind: 'deviate'; startFen: string; moves: string[]; level: BotLevel; exclude: string[] }
  /** Лучший ход движка (подсказка). */
  | { kind: 'best'; startFen: string; moves: string[]; timeMs: number }

export interface BotReply {
  /** Ход в формате UCI (e2e4, e7e8q). */
  move: string | null
  /** Оценка в сантипешках с точки зрения бота. */
  score: number
}

/**
 * Сила уровней: глубина расчёта, из скольких лучших ходов выбирать и «температура» выбора
 * (чем выше, тем чаще не самый лучший из них). blunder — шанс сыграть любой из десяти лучших ходов,
 * как невнимательный новичок. Выбор только среди лучших ходов, поэтому даже слабый бот берёт
 * незащищённые фигуры и не играет совсем случайно.
 */
const PLAY: Record<BotLevel, { depth: number; timeMs: number; topK: number; temperature: number; blunder: number }> = {
  1: { depth: 2, timeMs: 400, topK: 5, temperature: 90, blunder: 0.1 },
  2: { depth: 3, timeMs: 600, topK: 4, temperature: 50, blunder: 0.04 },
  3: { depth: 4, timeMs: 900, topK: 3, temperature: 22, blunder: 0 },
  4: { depth: 32, timeMs: 1500, topK: 1, temperature: 0, blunder: 0 },
}

/** Насколько (в сантипешках) ход «не по теории» может уступать лучшему — и с какой «температурой» выбирать. */
const DEVIATION: Record<BotLevel, { margin: number; temperature: number }> = {
  1: { margin: 180, temperature: 60 },
  2: { margin: 130, temperature: 45 },
  3: { margin: 90, temperature: 30 },
  4: { margin: 60, temperature: 20 },
}

/** Пока идёт дебют, бот выбирает «человеческие» ходы (если они не сильно хуже). */
const OPENING_MOVES = 12
const NATURAL_TOLERANCE = 80

let searcher: Searcher | null = null

function setup(startFen: string, moves: string[]): Searcher {
  const pos = new Position(startFen)
  for (const uci of moves) {
    const m = pos.parseUci(uci)
    if (!m) throw new Error(`Нелегальный ход ${uci}`)
    pos.make(m)
  }
  if (!searcher) searcher = new Searcher(pos)
  searcher.pos = pos
  return searcher
}

/**
 * Похож ли ход на дебютный ход человека: без прогулок королём и ладьёй до рокировки,
 * без коней на край, отступлений на первую горизонталь, ранних вылазок ферзя,
 * слона перед неподвинутой центральной пешкой и ходов крайними пешками.
 */
export function isNaturalOpeningMove(pos: Position, m: number): boolean {
  if (m & (FLAG_CAPTURE | FLAG_CASTLE)) return true
  const from = moveFrom(m)
  const to = moveTo(m)
  const us = pos.side
  const type = pos.board[from] & 7
  const homeRank = us === WHITE ? 0 : 7
  const rights = us === WHITE ? pos.castling & 3 : (pos.castling >> 2) & 3
  switch (type) {
    case KING:
      return rights === 0
    case ROOK: {
      const file = from & 7
      const corner = from >> 4 === homeRank && ((file === 7 && rights & 1) || (file === 0 && rights & 2))
      return !corner
    }
    case QUEEN:
      return pos.fullmove > 8
    case KNIGHT:
      return (to & 7) !== 0 && (to & 7) !== 7 && to >> 4 !== homeRank
    case BISHOP: {
      if (to >> 4 === homeRank) return false
      const pawn = us === WHITE ? PAWN : 8 | PAWN
      for (const file of [3, 4]) {
        const pawnSq = (us === WHITE ? 1 : 6) * 16 + file
        if (pos.board[pawnSq] === pawn && to === pawnSq + (us === WHITE ? 16 : -16)) return false
      }
      return true
    }
    case PAWN:
      return (from & 7) !== 0 && (from & 7) !== 7
    default:
      return true
  }
}

/** Случайный выбор с весами exp((оценка − лучшая) / T). Маты ограничиваем, чтобы они всегда перевешивали. */
export function pickMove(list: ScoredMove[], temperature: number, random: () => number = Math.random): ScoredMove {
  const clamp = (s: number) => Math.max(-3000, Math.min(3000, s))
  const best = Math.max(...list.map((x) => clamp(x.score)))
  if (temperature <= 0) return list.find((x) => clamp(x.score) === best) ?? list[0]
  const weights = list.map((x) => Math.exp((clamp(x.score) - best) / temperature))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = random() * total
  for (let i = 0; i < list.length; i++) {
    r -= weights[i]
    if (r <= 0) return list[i]
  }
  return list[list.length - 1]
}

/** В дебюте оставляем «человеческие» ходы, если лучший из них не сильно уступает лучшему вообще. */
function preferNatural(pos: Position, scored: ScoredMove[]): ScoredMove[] {
  if (pos.fullmove > OPENING_MOVES || !scored.length) return scored
  const natural = scored.filter((x) => isNaturalOpeningMove(pos, x.move))
  return natural.length && natural[0].score >= scored[0].score - NATURAL_TOLERANCE ? natural : scored
}

function reply(choice: ScoredMove | undefined): BotReply {
  return choice ? { move: moveToUci(choice.move), score: choice.score } : { move: null, score: 0 }
}

export function runBot(req: BotRequest, random: () => number = Math.random): BotReply {
  const s = setup(req.startFen, req.moves)
  const pos = s.pos

  if (req.kind === 'best') {
    const res = s.think(32, req.timeMs)
    return { move: res.move ? moveToUci(res.move) : null, score: res.score }
  }

  if (req.kind === 'deviate') {
    // Быстрый отбор кандидатов, затем проверка глубоким расчётом, чтобы бот не зевал материал.
    const exclude = new Set(req.exclude)
    const shallow = s.rootScores(2, 200)
    const natural = shallow.filter((x) => !exclude.has(moveToUci(x.move)) && isNaturalOpeningMove(pos, x.move)).slice(0, 8)
    if (!natural.length) return { move: null, score: 0 }
    const reference = shallow.filter((x) => exclude.has(moveToUci(x.move))).slice(0, 4)
    const best = shallow[0]
    const subset = [...new Set([best.move, ...reference.map((x) => x.move), ...natural.map((x) => x.move)])]
    const deep = s.rootScores(7, 900, subset)
    const top = deep[0].score
    const { margin, temperature } = DEVIATION[req.level]
    const candidates = deep.filter((x) => !exclude.has(moveToUci(x.move)) && isNaturalOpeningMove(pos, x.move) && x.score >= top - margin)
    if (!candidates.length) return { move: null, score: top }
    return reply(pickMove(candidates.slice(0, 4), temperature, random))
  }

  const cfg = PLAY[req.level]
  if (cfg.temperature <= 0) {
    // «Мастер» в самом начале свободной партии немного варьирует дебют, дальше — лучший ход.
    if (req.moves.length < 6) {
      const scored = preferNatural(pos, s.rootScores(5, cfg.timeMs))
      return reply(pickMove(scored.slice(0, 3), 12, random))
    }
    const res = s.think(cfg.depth, cfg.timeMs)
    return { move: res.move ? moveToUci(res.move) : null, score: res.score }
  }
  const scored = preferNatural(pos, s.rootScores(cfg.depth, cfg.timeMs))
  if (!scored.length) return { move: null, score: 0 }
  if (cfg.blunder > 0 && random() < cfg.blunder) {
    const pool = scored.slice(0, 10)
    return reply(pool[Math.floor(random() * pool.length)])
  }
  return reply(pickMove(scored.slice(0, cfg.topK), cfg.temperature, random))
}
