import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { BUILT_IN_COURSES } from '../data/courses'
import { buildBook, chooseBookMove } from './book'
import { gameResult, replay, theorySummary } from './botGame'
import { compileCourse, positionKey } from './courses'

const courses = BUILT_IN_COURSES.map(compileCourse)

describe('дебютная книга', () => {
  for (const course of courses) {
    it(`${course.name}: ходы книги легальны и сходятся с линиями`, () => {
      const book = buildBook(course)
      const userColor = course.side === 'white' ? 'w' : 'b'
      for (const [key, entry] of book) {
        for (const list of [entry.user, entry.opponent]) {
          for (const move of list) {
            const fen = move.lines[0].moves.find((m) => positionKey(m.fenBefore) === key && m.san === move.san)!.fenBefore
            const chess = new Chess(fen)
            expect(chess.turn()).toBe(list === entry.user ? userColor : userColor === 'w' ? 'b' : 'w')
            const played = chess.move({ from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), promotion: move.uci[4] })
            expect(played.san).toBe(move.san)
          }
        }
      }
    })
  }

  it('первый ход бота за чёрный курс — из книги', () => {
    const kid = courses.find((c) => c.id === 'kings-indian')!
    const entry = buildBook(kid).get(positionKey(new Chess().fen()))!
    expect(entry.opponent.map((m) => m.san)).toEqual(['d4'])
  })

  it('выбор ответа учитывает все варианты', () => {
    const italian = courses.find((c) => c.id === 'italian')!
    const book = buildBook(italian)
    const chess = new Chess()
    chess.move('e4')
    const replies = book.get(positionKey(chess.fen()))!.opponent
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(chooseBookMove(replies, () => i / 200).san)
    expect(seen.size).toBe(replies.length)
  })
})

describe('партия с ботом', () => {
  it('итоги: мат, пат и ничья', () => {
    expect(gameResult(replay(['f2f3', 'e7e5', 'g2g4', 'd8h4'].map((uci) => ({ uci }))))).toEqual({ winner: 'b', reason: 'Мат' })
    expect(gameResult(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))?.winner).toBeNull()
    expect(gameResult(new Chess())).toBeNull()
  })

  it('сводка по теории', () => {
    const summary = theorySummary({
      id: 1,
      courseId: 'italian',
      color: 'w',
      level: 2,
      behaviour: 'mixed',
      hints: 0,
      result: null,
      moves: [
        { uci: 'e2e4', san: 'e4', tag: 'book' },
        { uci: 'e7e5', san: 'e5', tag: 'book' },
        { uci: 'b1c3', san: 'Nc3', tag: 'mistake', expected: ['Nf3'] },
        { uci: 'g8f6', san: 'Nf6', tag: 'free' },
      ],
    })
    expect(summary.bookMoves).toBe(1)
    expect(summary.mistakes.map((m) => m.index)).toEqual([2])
    expect(summary.lastBook).toBe(1)
    expect(summary.deviation).toBe(-1)
  })
})
