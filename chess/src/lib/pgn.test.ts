import { describe, expect, it } from 'vitest'
import { importPgn, linesToPgn, parsePgn } from './pgn'

describe('PGN', () => {
  it('разбирает ходы, номера, комментарии и оценки', () => {
    const [game] = parsePgn('1. e4 {центр} e5!? 2.Nf3 $1 Nc6 3...a6? *')
    expect(game.root.children[0].san).toBe('e4')
    expect(game.root.children[0].comment).toBe('центр')
    const r = importPgn('1. e4 e5 2.Nf3 Nc6 3.Bb5 a6 *')
    expect(r.errors).toEqual([])
    expect(r.lines[0].moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'])
  })

  it('раскладывает варианты в отдельные линии', () => {
    const r = importPgn('1.e4 e5 (1...c5 2.Nf3 (2.c3 d5) d6) 2.Nf3 Nc6 *')
    expect(r.errors).toEqual([])
    expect(r.lines.map((l) => l.moves.map((m) => m.san).join(' '))).toEqual([
      'e4 e5 Nf3 Nc6',
      'e4 c5 Nf3 d6',
      'e4 c5 c3 d5',
    ])
    expect(r.lines[1].name).toContain('1...c5')
  })

  it('читает несколько партий и заголовки', () => {
    const r = importPgn(`[Event "Study: Глава 1"]\n\n1.d4 d5 *\n\n[Event "Study: Глава 2"]\n\n1.e4 e5 0-1`)
    expect(r.lines.map((l) => l.name)).toEqual(['Глава 1', 'Глава 2'])
  })

  it('сообщает о нелегальных ходах', () => {
    const r = importPgn('1.e4 e5 2.Ke3 *')
    expect(r.errors[0]).toContain('2.Крe3')
  })

  it('понимает рокировку нулями и превращение', () => {
    const r = importPgn('1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.0-0 Nf6 *')
    expect(r.lines[0].moves[6].san).toBe('O-O')
  })

  it('экспорт обратно читается', () => {
    const r = importPgn('1.e4 {а} e5 2.Nf3 Nc6 {б} 3.Bb5 *')
    const text = linesToPgn('Курс', [{ name: 'Линия', moves: r.lines[0].moves }])
    const again = importPgn(text)
    expect(again.lines[0].moves.map((m) => [m.san, m.comment])).toEqual(r.lines[0].moves.map((m) => [m.san, m.comment]))
  })
})

describe('ruSan', () => {
  it('переводит фигуры в русскую нотацию', async () => {
    const { ruSan } = await import('./pgn')
    expect(ruSan('Nf3')).toBe('Кf3')
    expect(ruSan('Kxe2')).toBe('Крxe2')
    expect(ruSan('fxg1=N+')).toBe('fxg1=К+')
    expect(ruSan('O-O')).toBe('O-O')
  })
})
