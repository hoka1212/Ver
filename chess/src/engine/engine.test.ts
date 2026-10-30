import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { moveToUci, Position } from './board'
import { pickMove, runBot } from './bot'
import { MATE, Searcher } from './search'

// Эталонные числа perft: https://www.chessprogramming.org/Perft_Results
const PERFT: [string, string, number[]][] = [
  ['начальная позиция', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['Kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['позиция 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['позиция 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['позиция 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['позиция 6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]],
]

describe('генерация ходов (perft)', () => {
  for (const [name, fen, counts] of PERFT) {
    it(name, () => {
      const pos = new Position(fen)
      counts.forEach((n, i) => expect(pos.perft(i + 1)).toBe(n))
      // После всех ходов и отмен позиция не изменилась.
      expect(pos.toFen()).toBe(new Position(fen).toFen())
    })
  }
})

describe('позиция', () => {
  it('легальные ходы совпадают с chess.js, хэш и оценка обновляются верно', () => {
    // Псевдослучайная партия: на каждом шаге сверяем ходы с chess.js.
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    for (let game = 0; game < 20; game++) {
      const pos = new Position()
      const chess = new Chess()
      for (let ply = 0; ply < 120 && !chess.isGameOver(); ply++) {
        const ours = pos.legalMoves().map(moveToUci).sort()
        const theirs = chess
          .moves({ verbose: true })
          .map((m) => m.from + m.to + (m.promotion ?? ''))
          .sort()
        expect(ours).toEqual(theirs)
        const uci = theirs[Math.floor(rnd() * theirs.length)]
        pos.make(pos.parseUci(uci))
        chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
        const fresh = new Position(pos.toFen())
        expect(pos.hashLo).toBe(fresh.hashLo)
        expect(pos.hashHi).toBe(fresh.hashHi)
        expect([...pos.mg, ...pos.eg, pos.phase]).toEqual([...fresh.mg, ...fresh.eg, fresh.phase])
        expect(pos.toFen().split(' ').slice(0, 3)).toEqual(chess.fen().split(' ').slice(0, 3))
      }
    }
  })

  it('видит повторение позиции', () => {
    const pos = new Position()
    for (const uci of ['g1f3', 'g8f6', 'f3g1', 'f6g8']) pos.make(pos.parseUci(uci))
    expect(pos.isRepetition()).toBe(true)
    expect(pos.repetitionCount()).toBe(1)
  })
})

describe('поиск', () => {
  it('находит мат в один ход', () => {
    const s = new Searcher(new Position('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'))
    const res = s.think(6, 2000)
    expect(moveToUci(res.move)).toBe('a1a8')
    expect(res.score).toBeGreaterThan(MATE - 10)
  })

  it('находит мат в два хода', () => {
    // 1.Крg6 Крg8 2.Лa8# (или 1.Крf7 Крh7 2.Лh1#).
    const s = new Searcher(new Position('7k/8/5K2/8/8/8/8/R7 w - - 0 1'))
    const res = s.think(6, 3000)
    expect(res.score).toBeGreaterThan(MATE - 10)
  })

  it('забирает незащищённого ферзя', () => {
    const s = new Searcher(new Position('rnb1kbnr/pppp1ppp/8/4p1q1/4P3/3P4/PPP2PPP/RNBQKBNR w KQkq - 0 1'))
    const res = s.think(4, 2000)
    expect(moveToUci(res.move)).toBe('c1g5')
  })

  it('не ставит пат при большом перевесе', () => {
    // Чёрный король на h8 заперт; ход Фg6 — пат, движок должен его избежать.
    const s = new Searcher(new Position('7k/8/5Q2/8/8/8/8/6K1 w - - 0 1'))
    const res = s.think(5, 2000)
    const pos = new Position('7k/8/5Q2/8/8/8/8/6K1 w - - 0 1')
    pos.make(res.move)
    expect(pos.legalMoves().length > 0 || pos.inCheck()).toBe(true)
  })
})

describe('бот', () => {
  it('отвечает легальным ходом на любом уровне', () => {
    for (const level of [1, 2, 3, 4] as const) {
      const res = runBot({ kind: 'move', startFen: new Chess().fen(), moves: ['e2e4', 'e7e5', 'g1f3'], level })
      const chess = new Chess()
      for (const m of ['e4', 'e5', 'Nf3']) chess.move(m)
      expect(res.move).toBeTruthy()
      expect(() => chess.move({ from: res.move!.slice(0, 2), to: res.move!.slice(2, 4), promotion: res.move![4] })).not.toThrow()
    }
  })

  it('сворачивает с теории только на разумный ход', () => {
    const res = runBot({
      kind: 'deviate',
      startFen: new Chess().fen(),
      moves: ['e2e4', 'e7e5', 'g1f3'],
      level: 3,
      exclude: ['b8c6'],
    })
    expect(res.move).not.toBe('b8c6')
    // Не отдаёт пешку e5 даром и не зевает фигуры.
    expect(res.score).toBeGreaterThan(-150)
  })

  it('выбор с температурой 0 — всегда лучший ход', () => {
    const list = [
      { move: 1, score: 10 },
      { move: 2, score: 50 },
      { move: 3, score: -40 },
    ]
    expect(pickMove(list, 0).move).toBe(2)
    expect(pickMove(list, 30, () => 0).move).toBe(1)
    expect(pickMove(list, 30, () => 0.9999).move).toBe(3)
  })
})
