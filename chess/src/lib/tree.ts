import { sideToColor, type Course, type CourseKind, type CourseLine, type Side } from './courses'
import type { LineMove } from './pgn'

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** Линия с указанием курса, из которого она взята (в общем репертуаре линии разных курсов вместе). */
export interface TrainLine extends CourseLine {
  courseId: string
  courseName: string
  courseKind: CourseKind
}

/** Что тренируем: один курс или весь репертуар за белых/чёрных. */
export interface TrainSource {
  /** id курса или repertoire-white / repertoire-black. */
  id: string
  name: string
  side: Side
  /** Курс, если источник — один курс. */
  course?: Course
  lines: TrainLine[]
  /** Страница, куда ведёт «Назад». */
  home: string
}

export const REPERTOIRE_IDS: Record<Side, string> = { white: 'repertoire-white', black: 'repertoire-black' }
export const REPERTOIRE_NAMES: Record<Side, string> = { white: 'Весь репертуар за белых', black: 'Весь репертуар за чёрных' }

function trainLines(course: Course): TrainLine[] {
  return course.lines.map((l) => ({ ...l, courseId: course.id, courseName: course.name, courseKind: course.kind }))
}

export function courseSource(course: Course): TrainSource {
  return { id: course.id, name: course.name, side: course.side, course, lines: trainLines(course), home: `/openings/${course.id}` }
}

/** Все дебюты, гамбиты и защиты одной стороны — одним деревом. */
export function repertoireSource(courses: Course[], side: Side): TrainSource {
  return {
    id: REPERTOIRE_IDS[side],
    name: REPERTOIRE_NAMES[side],
    side,
    lines: courses.filter((c) => c.side === side).flatMap(trainLines),
    home: '/openings',
  }
}

/** Адрес тренажёра для источника (курс или общий репертуар). */
export function trainBase(source: TrainSource): string {
  return source.course ? `/openings/${source.id}/train` : `/repertoire/${source.side}/train`
}

/** Источник по id: курс или общий репертуар. */
export function resolveSource(id: string | null | undefined, courses: Course[]): TrainSource | null {
  if (!id) return null
  if (id === REPERTOIRE_IDS.white) return repertoireSource(courses, 'white')
  if (id === REPERTOIRE_IDS.black) return repertoireSource(courses, 'black')
  const course = courses.find((c) => c.id === id)
  return course ? courseSource(course) : null
}

// ---------- Дерево вариантов ----------

export interface TreeNode {
  /** Сколько полуходов сделано до этой позиции. */
  ply: number
  fen: string
  /** Ход, который привёл в эту позицию (у корня — null). */
  move: LineMove | null
  parent: TreeNode | null
  /** Продолжения: самые разобранные (больше линий) — первыми. */
  children: TreeNode[]
  /** Линии, которые проходят через эту позицию. */
  lines: TrainLine[]
}

/** Дерево по последовательности ходов: общие начала линий сливаются, на развилках — несколько продолжений. */
export function buildTree(lines: TrainLine[]): TreeNode {
  const root: TreeNode = { ply: 0, fen: START_FEN, move: null, parent: null, children: [], lines: [] }
  for (const line of lines) {
    let node = root
    node.lines.push(line)
    for (const m of line.moves) {
      let child = node.children.find((c) => c.move!.san === m.san)
      if (!child) {
        child = { ply: node.ply + 1, fen: m.fenAfter, move: m, parent: node, children: [], lines: [] }
        node.children.push(child)
      }
      child.lines.push(line)
      if (!child.move!.comment && m.comment) child.move = { ...child.move!, comment: m.comment }
      node = child
    }
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => b.lines.length - a.lines.length)
    n.children.forEach(sort)
  }
  sort(root)
  return root
}

/** Узлы по пути из ходов (SAN) от корня; null, если такого пути в дереве нет. */
export function walkTree(root: TreeNode, sans: string[]): TreeNode[] | null {
  const path = [root]
  for (const san of sans) {
    const next = path[path.length - 1].children.find((c) => c.move!.san === san)
    if (!next) return null
    path.push(next)
  }
  return path
}

/** Самый глубокий узел, до которого партия шла по дереву. */
export function deepestNode(root: TreeNode, sans: string[]): TreeNode {
  let node = root
  for (const san of sans) {
    const next = node.children.find((c) => c.move!.san === san)
    if (!next) break
    node = next
  }
  return node
}

/** «Семейство» линии — часть названия до двоеточия: «Защита Тейхмана: 6...Сh5» → «Защита Тейхмана». */
export function lineFamily(name: string): string {
  const i = name.indexOf(':')
  return (i > 0 ? name.slice(0, i) : name).trim()
}

function unique<T>(list: T[]): T[] {
  return [...new Set(list)]
}

export function pluralRu(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export interface NodeLabel {
  /** Дебют (курс), если он уже определился. */
  opening: string | null
  /** Вариация или линия внутри дебюта, если определилась. */
  variation: string | null
  /** Возможные дебюты, пока дебют не определился. */
  openings: string[]
  /** Сколько линий ещё возможно. */
  lineCount: number
}

/** Какой это дебют и какая вариация — по линиям, которые проходят через позицию. */
export function describeNode(node: TreeNode): NodeLabel {
  const openings = unique(node.lines.map((l) => l.courseName))
  const lineCount = node.lines.length
  if (openings.length !== 1) return { opening: null, variation: null, openings, lineCount }
  if (lineCount === 1) return { opening: openings[0], variation: node.lines[0].name, openings, lineCount }
  const families = unique(node.lines.map((l) => lineFamily(l.name)))
  return { opening: openings[0], variation: families.length === 1 ? families[0] : null, openings, lineCount }
}

/** Короткая подпись ветки для списка продолжений: куда ведёт ход. */
export function branchTitle(node: TreeNode, multiCourse: boolean): { title: string; detail: string } {
  const d = describeNode(node)
  if (!d.opening) return { title: d.openings.slice(0, 3).join(', ') + (d.openings.length > 3 ? ` и ещё ${d.openings.length - 3}` : ''), detail: '' }
  const count = `${d.lineCount} ${pluralRu(d.lineCount, 'линия', 'линии', 'линий')}`
  const variation = d.variation ?? count
  const detail = d.lineCount > 1 ? unique(node.lines.map((l) => l.name)).join(' · ') : ''
  return { title: multiCourse ? `${d.opening}${d.variation ? ` — ${variation}` : ''}` : variation, detail: multiCourse && !d.variation ? count : detail }
}

/** Цвет стороны, которая ходит в узле. */
export function turnAt(node: TreeNode): 'w' | 'b' {
  return node.ply % 2 === 0 ? 'w' : 'b'
}

export function isUserNode(node: TreeNode, side: Side): boolean {
  return turnAt(node) === sideToColor(side)
}
