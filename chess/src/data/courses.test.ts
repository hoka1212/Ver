import { describe, expect, it } from 'vitest'
import { compileCourse, findConflicts, sideToColor } from '../lib/courses'
import { BUILT_IN_COURSES } from './courses'

describe('встроенная база дебютов', () => {
  const compiled = BUILT_IN_COURSES.map(compileCourse)

  it('id курсов уникальны', () => {
    const ids = BUILT_IN_COURSES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  for (const course of compiled) {
    describe(course.name, () => {
      it('все ходы легальны', () => {
        expect(course.errors).toEqual([])
        expect(course.lines.length).toBe(BUILT_IN_COURSES.find((c) => c.id === course.id)!.lines.length)
      })

      it('id линий уникальны', () => {
        const ids = course.lines.map((l) => l.id)
        expect(new Set(ids).size).toBe(ids.length)
      })

      it('репертуар согласован: в одной позиции ученик всегда делает один ход', () => {
        expect(findConflicts(course)).toEqual([])
      })

      it('в каждой линии ученик делает хотя бы два хода', () => {
        for (const line of course.lines) expect(line.userMoves, line.name).toBeGreaterThanOrEqual(2)
      })

      it('нет двух одинаковых линий', () => {
        const seqs = course.lines.map((l) => l.moves.map((m) => m.san).join(' '))
        expect(new Set(seqs).size).toBe(seqs.length)
      })

      it('комментарии привязаны к ходам', () => {
        const comments = course.lines.flatMap((l) => l.moves.filter((m) => m.comment))
        expect(comments.length).toBeGreaterThan(0)
      })

      it('линии ловушек заканчиваются ходом ученика или матом', () => {
        const color = sideToColor(course.side)
        for (const line of course.lines.filter((l) => l.trap)) {
          const last = line.moves[line.moves.length - 1]
          expect(last.color === color || last.san.endsWith('#'), line.name).toBe(true)
        }
      })
    })
  }
})
