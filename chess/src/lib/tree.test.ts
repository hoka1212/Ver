import { describe, expect, it } from 'vitest'
import { BUILT_IN_COURSES } from '../data/courses'
import { compileCourse } from './courses'
import { branchTitle, buildTree, deepestNode, describeNode, lineFamily, REPERTOIRE_IDS, resolveSource, walkTree } from './tree'

const courses = BUILT_IN_COURSES.map(compileCourse)

describe('дерево вариантов', () => {
  it('каждая линия курса — путь от корня до листа', () => {
    for (const course of courses) {
      const source = resolveSource(course.id, courses)!
      const tree = buildTree(source.lines)
      expect(tree.lines.length).toBe(course.lines.length)
      for (const line of source.lines) {
        const path = walkTree(
          tree,
          line.moves.map((m) => m.san),
        )
        expect(path, `${course.id}/${line.id}`).not.toBeNull()
        expect(path!.at(-1)!.lines).toContain(line)
      }
    }
  })

  it('название дебюта и вариации появляется по ходам', () => {
    const tree = buildTree(resolveSource('italian', courses)!.lines)
    expect(describeNode(tree).opening).toBe('Итальянская партия')
    const giuoco = deepestNode(tree, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'])
    expect(describeNode(giuoco).variation).toBe('Джуоко пьяно')
    const twoKnights = deepestNode(tree, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'])
    expect(describeNode(twoKnights).variation).toBe('Защита двух коней')
  })

  it('весь репертуар: дебют определяется ответом соперника', () => {
    const black = resolveSource(REPERTOIRE_IDS.black, courses)!
    expect(black.lines.length).toBe(courses.filter((c) => c.side === 'black').reduce((s, c) => s + c.lines.length, 0))
    const tree = buildTree(black.lines)
    // После 1.e4 возможны разные защиты, после 1.e4 c6 — только Каро — Канн.
    expect(describeNode(deepestNode(tree, ['e4'])).opening).toBeNull()
    expect(describeNode(deepestNode(tree, ['e4', 'c6'])).opening).toBe('Защита Каро — Канн')
    const afterD4 = deepestNode(tree, ['d4'])
    expect(afterD4.children.length).toBeGreaterThan(2)
    expect(branchTitle(afterD4.children[0], true).title.length).toBeGreaterThan(0)
  })

  it('семейство линии — часть названия до двоеточия', () => {
    expect(lineFamily('Защита Тейхмана: 6...Сh5')).toBe('Защита Тейхмана')
    expect(lineFamily('4.Сf4')).toBe('4.Сf4')
  })
})
