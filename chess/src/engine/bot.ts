import { moveToUci, Position } from './board'
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

// Чем выше «температура», тем чаще бот выбирает не лучший ход.
const PLAY: Record<BotLevel, { depth: number; temperature: number; timeMs: number }> = {
  1: { depth: 1, temperature: 220, timeMs: 400 },
  2: { depth: 2, temperature: 80, timeMs: 700 },
  3: { depth: 4, temperature: 18, timeMs: 1200 },
  4: { depth: 32, temperature: 0, timeMs: 1500 },
}

/** Насколько (в сантипешках) ход «не по теории» может уступать лучшему. */
const DEVIATION_MARGIN: Record<BotLevel, number> = { 1: 260, 2: 170, 3: 100, 4: 60 }

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

export function runBot(req: BotRequest, random: () => number = Math.random): BotReply {
  const s = setup(req.startFen, req.moves)

  if (req.kind === 'best') {
    const res = s.think(32, req.timeMs)
    return { move: res.move ? moveToUci(res.move) : null, score: res.score }
  }

  if (req.kind === 'deviate') {
    const scored = s.rootScores(req.level >= 3 ? 3 : 2, 900)
    if (!scored.length) return { move: null, score: 0 }
    const best = scored[0].score
    const exclude = new Set(req.exclude)
    const candidates = scored.filter((x) => !exclude.has(moveToUci(x.move)) && x.score >= best - DEVIATION_MARGIN[req.level])
    if (!candidates.length) return { move: null, score: best }
    const choice = pickMove(candidates, 45, random)
    return { move: moveToUci(choice.move), score: choice.score }
  }

  const cfg = PLAY[req.level]
  // В самом начале свободной партии даже сильный бот немного варьирует ходы.
  if (cfg.temperature <= 0 && req.moves.length < 6) {
    const scored = s.rootScores(4, cfg.timeMs)
    if (!scored.length) return { move: null, score: 0 }
    const choice = pickMove(scored, 12, random)
    return { move: moveToUci(choice.move), score: choice.score }
  }
  if (cfg.temperature <= 0) {
    const res = s.think(cfg.depth, cfg.timeMs)
    return { move: res.move ? moveToUci(res.move) : null, score: res.score }
  }
  const scored = s.rootScores(cfg.depth, cfg.timeMs)
  if (!scored.length) return { move: null, score: 0 }
  const choice = pickMove(scored, cfg.temperature, random)
  return { move: moveToUci(choice.move), score: choice.score }
}
