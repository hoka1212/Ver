import {
  BLACK,
  FLAG_CAPTURE,
  moveFrom,
  movePromo,
  moveTo,
  PAWN,
  Position,
  WHITE,
} from './board'

export const MATE = 30000
const INF = 32000
const MAX_PLY = 64
const TT_BITS = 18
const TT_SIZE = 1 << TT_BITS
const TT_MASK = TT_SIZE - 1
const TT_EXACT = 1
const TT_LOWER = 2
const TT_UPPER = 3
const TEMPO = 10

export interface ThinkResult {
  move: number
  score: number
  depth: number
  nodes: number
}

export interface ScoredMove {
  move: number
  score: number
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** Расстояние от центра (0–6) — для дожимания голого короля в эндшпиле. */
function centerDistance(sq: number) {
  const file = sq & 7
  const rank = sq >> 4
  return Math.max(3 - file, file - 4) + Math.max(3 - rank, rank - 4)
}

/** Поиск: итеративное углубление, альфа-бета с PVS, нулевой ход, форсированный поиск взятий. */
export class Searcher {
  pos: Position
  nodes = 0
  private stopped = false
  private deadline = Infinity
  private ttKey = new Int32Array(TT_SIZE)
  private ttMove = new Int32Array(TT_SIZE)
  private ttScore = new Int32Array(TT_SIZE)
  private ttDepth = new Int8Array(TT_SIZE)
  private ttFlag = new Uint8Array(TT_SIZE)
  private killers = new Int32Array(MAX_PLY * 2)
  private history = new Int32Array(16 * 128)
  private moves = new Int32Array(MAX_PLY * 256)
  private scores = new Int32Array(MAX_PLY * 256)

  constructor(pos: Position) {
    this.pos = pos
  }

  /** Оценка с точки зрения стороны, которая ходит. */
  evaluate(): number {
    const pos = this.pos
    const phase = Math.min(pos.phase, 24)
    const mg = pos.mg[WHITE] - pos.mg[BLACK]
    const eg = pos.eg[WHITE] - pos.eg[BLACK]
    let score = ((mg * phase + eg * (24 - phase)) / 24) | 0
    if (pos.bishops[WHITE] >= 2) score += 30
    if (pos.bishops[BLACK] >= 2) score -= 30

    // Дожимание: у слабой стороны нет пешек — гоним её короля к краю и подводим своего.
    if (phase <= 8) {
      const strong = eg > 0 ? WHITE : BLACK
      const weak = strong ^ 1
      if (pos.pawns[weak] === 0 && Math.abs(eg) >= 400) {
        const wk = pos.kingSq[weak]
        const sk = pos.kingSq[strong]
        const dist = Math.abs((wk & 7) - (sk & 7)) + Math.abs((wk >> 4) - (sk >> 4))
        const bonus = 10 * centerDistance(wk) + 4 * (14 - dist)
        score += strong === WHITE ? bonus : -bonus
      }
    }
    return (pos.side === WHITE ? score : -score) + TEMPO
  }

  private timeUp(): boolean {
    if ((this.nodes & 1023) === 0 && now() > this.deadline) this.stopped = true
    return this.stopped
  }

  private scoreMoves(start: number, end: number, ttMove: number, ply: number) {
    const b = this.pos.board
    for (let i = start; i < end; i++) {
      const m = this.moves[i]
      let s: number
      if (m === ttMove) s = 2_000_000
      else if (m & FLAG_CAPTURE) {
        const victim = b[moveTo(m)] & 7 || PAWN
        s = 1_000_000 + victim * 10 - (b[moveFrom(m)] & 7)
      } else if (movePromo(m)) s = 900_000 + movePromo(m)
      else if (m === this.killers[ply * 2]) s = 800_000
      else if (m === this.killers[ply * 2 + 1]) s = 790_000
      else s = this.history[b[moveFrom(m)] * 128 + moveTo(m)]
      this.scores[i] = s
    }
  }

  private pickNext(i: number, end: number) {
    let best = i
    for (let j = i + 1; j < end; j++) if (this.scores[j] > this.scores[best]) best = j
    if (best !== i) {
      const m = this.moves[i]
      this.moves[i] = this.moves[best]
      this.moves[best] = m
      const s = this.scores[i]
      this.scores[i] = this.scores[best]
      this.scores[best] = s
    }
  }

  private quiesce(alpha: number, beta: number, ply: number): number {
    this.nodes++
    if (this.timeUp()) return 0
    const pos = this.pos
    if (ply >= MAX_PLY - 1) return this.evaluate()
    const inCheck = pos.inCheck()
    let best = -INF
    if (!inCheck) {
      const stand = this.evaluate()
      if (stand >= beta) return stand
      if (stand > alpha) alpha = stand
      best = stand
    }
    const start = ply * 256
    const end = pos.generate(this.moves, start, !inCheck)
    this.scoreMoves(start, end, 0, ply)
    let legal = 0
    for (let i = start; i < end; i++) {
      this.pickNext(i, end)
      const m = this.moves[i]
      if (!pos.make(m)) continue
      legal++
      const score = -this.quiesce(-beta, -alpha, ply + 1)
      pos.unmake()
      if (this.stopped) return 0
      if (score > best) {
        best = score
        if (score > alpha) {
          alpha = score
          if (score >= beta) break
        }
      }
    }
    if (inCheck && legal === 0) return -MATE + ply
    return best
  }

  private search(depth: number, alpha: number, beta: number, ply: number, allowNull: boolean): number {
    this.nodes++
    if (this.timeUp()) return 0
    const pos = this.pos

    if (pos.halfmove >= 100 || pos.isRepetition() || pos.insufficientMaterial()) return 0
    // Мат быстрее уже найденного не улучшить.
    alpha = Math.max(alpha, -MATE + ply)
    beta = Math.min(beta, MATE - ply - 1)
    if (alpha >= beta) return alpha

    const inCheck = pos.inCheck()
    if (inCheck) depth++
    if (depth <= 0) return this.quiesce(alpha, beta, ply)
    if (ply >= MAX_PLY - 1) return this.evaluate()

    const idx = pos.hashLo & TT_MASK
    let ttMove = 0
    if (this.ttKey[idx] === pos.hashHi && this.ttFlag[idx]) {
      ttMove = this.ttMove[idx]
      if (this.ttDepth[idx] >= depth) {
        let s = this.ttScore[idx]
        if (s > MATE - 1000) s -= ply
        else if (s < -MATE + 1000) s += ply
        const flag = this.ttFlag[idx]
        if (flag === TT_EXACT || (flag === TT_LOWER && s >= beta) || (flag === TT_UPPER && s <= alpha)) return s
      }
    }

    const pvNode = beta - alpha > 1
    if (allowNull && !inCheck && !pvNode && depth >= 3 && pos.pieceWeight[pos.side] > 0 && this.evaluate() >= beta) {
      pos.makeNull()
      const s = -this.search(depth - 3, -beta, -beta + 1, ply + 1, false)
      pos.unmakeNull()
      if (this.stopped) return 0
      if (s >= beta) return beta
    }

    const start = ply * 256
    const end = pos.generate(this.moves, start, false)
    this.scoreMoves(start, end, ttMove, ply)
    const origAlpha = alpha
    let best = -INF
    let bestMove = 0
    let legal = 0
    for (let i = start; i < end; i++) {
      this.pickNext(i, end)
      const m = this.moves[i]
      if (!pos.make(m)) continue
      legal++
      const quiet = !(m & FLAG_CAPTURE) && !movePromo(m)
      let score: number
      if (legal === 1) {
        score = -this.search(depth - 1, -beta, -alpha, ply + 1, true)
      } else {
        // Поздние тихие ходы сначала смотрим на меньшую глубину.
        const reduction = depth >= 3 && legal > 3 && quiet && !inCheck && !pos.inCheck() ? (legal > 8 ? 2 : 1) : 0
        score = -this.search(depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true)
        if (score > alpha && reduction > 0) score = -this.search(depth - 1, -alpha - 1, -alpha, ply + 1, true)
        if (score > alpha && score < beta) score = -this.search(depth - 1, -beta, -alpha, ply + 1, true)
      }
      pos.unmake()
      if (this.stopped) return 0
      if (score > best) {
        best = score
        bestMove = m
        if (score > alpha) {
          alpha = score
          if (score >= beta) {
            if (quiet) {
              if (this.killers[ply * 2] !== m) {
                this.killers[ply * 2 + 1] = this.killers[ply * 2]
                this.killers[ply * 2] = m
              }
              this.history[pos.board[moveFrom(m)] * 128 + moveTo(m)] += depth * depth
            }
            break
          }
        }
      }
    }
    if (legal === 0) return inCheck ? -MATE + ply : 0

    let stored = best
    if (stored > MATE - 1000) stored += ply
    else if (stored < -MATE + 1000) stored -= ply
    this.ttKey[idx] = pos.hashHi
    this.ttMove[idx] = bestMove
    this.ttScore[idx] = stored
    this.ttDepth[idx] = depth
    this.ttFlag[idx] = best >= beta ? TT_LOWER : best > origAlpha ? TT_EXACT : TT_UPPER
    return best
  }

  private prepare(timeMs: number) {
    this.nodes = 0
    this.stopped = false
    this.deadline = now() + timeMs
    this.killers.fill(0)
    for (let i = 0; i < this.history.length; i++) this.history[i] >>= 3
  }

  /** Лучший ход: итеративное углубление до maxDepth или пока не выйдет время. */
  think(maxDepth: number, timeMs: number): ThinkResult {
    this.prepare(timeMs)
    const startTime = now()
    const pos = this.pos
    const root = pos.legalMoves()
    if (root.length === 0) return { move: 0, score: pos.inCheck() ? -MATE : 0, depth: 0, nodes: 0 }

    let bestMove = root[0]
    let bestScore = -INF
    let completed = 0
    for (let depth = 1; depth <= maxDepth; depth++) {
      // Лучший ход прошлой итерации — первым.
      const ordered = [bestMove, ...root.filter((m) => m !== bestMove)]
      let alpha = -INF
      let iterBest = 0
      let iterScore = -INF
      for (let i = 0; i < ordered.length; i++) {
        const m = ordered[i]
        pos.make(m)
        let score: number
        if (i === 0) score = -this.search(depth - 1, -INF, -alpha, 1, true)
        else {
          score = -this.search(depth - 1, -alpha - 1, -alpha, 1, true)
          if (score > alpha && !this.stopped) score = -this.search(depth - 1, -INF, -alpha, 1, true)
        }
        pos.unmake()
        if (this.stopped) break
        if (score > iterScore) {
          iterScore = score
          iterBest = m
        }
        if (score > alpha) alpha = score
      }
      if (this.stopped) {
        // Незаконченная итерация: берём её ход, только если он уже оказался лучше прежнего.
        if (completed === 0 && iterBest) {
          bestMove = iterBest
          bestScore = iterScore
        } else if (iterBest && iterBest !== bestMove && iterScore > bestScore) {
          bestMove = iterBest
          bestScore = iterScore
        }
        break
      }
      bestMove = iterBest
      bestScore = iterScore
      completed = depth
      if (Math.abs(bestScore) > MATE - 100) break
      if (now() - startTime > timeMs * 0.45) break
    }
    return { move: bestMove, score: bestScore, depth: completed, nodes: this.nodes }
  }

  /** Оценка каждого легального хода (полное окно) — для «живого» выбора хода ботом. */
  rootScores(depth: number, timeMs: number): ScoredMove[] {
    this.prepare(timeMs)
    const pos = this.pos
    const root = pos.legalMoves()
    let result: ScoredMove[] = root.map((move) => ({ move, score: 0 }))
    for (let d = 1; d <= depth; d++) {
      const iteration: ScoredMove[] = []
      for (const m of root) {
        pos.make(m)
        const score = -this.search(d - 1, -INF, INF, 1, true)
        pos.unmake()
        if (this.stopped) break
        iteration.push({ move: m, score })
      }
      if (this.stopped) break
      result = iteration
    }
    return result.sort((a, b) => b.score - a.score)
  }
}
