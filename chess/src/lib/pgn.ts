import { Chess } from 'chess.js'

/** Узел дерева ходов, полученного из PGN (с вариантами). */
export interface PgnNode {
  san: string
  comment?: string
  children: PgnNode[]
  parent?: PgnNode
}

export interface PgnGame {
  headers: Record<string, string>
  /** Фиктивный корень: san === '' — начальная позиция. */
  root: PgnNode
  /** Комментарий перед первым ходом. */
  intro?: string
}

/** Ход линии, проверенный chess.js. */
export interface LineMove {
  san: string
  from: string
  to: string
  promotion?: string
  color: 'w' | 'b'
  comment?: string
  fenBefore: string
  fenAfter: string
}

export interface ExtractedLine {
  name: string
  moves: LineMove[]
}

export interface ExtractResult {
  lines: ExtractedLine[]
  errors: string[]
}

type Token =
  | { t: 'header'; key: string; value: string }
  | { t: 'comment'; text: string }
  | { t: 'open' }
  | { t: 'close' }
  | { t: 'move'; san: string }
  | { t: 'result' }

const RESULT_RE = /^(1-0|0-1|1\/2-1\/2|½-½|\*)$/
const EVAL_RE = /^(\+\/-|-\/\+|\+\/=|=\/\+|=|∞|\+-|-\+|±|∓|⩲|⩱|N|D|TN|RR)$/
const STOP_CHARS = new Set(['{', '}', '(', ')', ';', '[', ']'])

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = src.length
  while (i < n) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === '[') {
      const end = src.indexOf(']', i)
      const raw = src.slice(i, end === -1 ? n : end + 1)
      const m = /^\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]$/.exec(raw)
      if (m) tokens.push({ t: 'header', key: m[1], value: m[2].replace(/\\(.)/g, '$1') })
      i = end === -1 ? n : end + 1
      continue
    }
    if (ch === '{') {
      const end = src.indexOf('}', i)
      const text = src.slice(i + 1, end === -1 ? n : end)
      tokens.push({ t: 'comment', text })
      i = end === -1 ? n : end + 1
      continue
    }
    if (ch === ';') {
      const end = src.indexOf('\n', i)
      tokens.push({ t: 'comment', text: src.slice(i + 1, end === -1 ? n : end) })
      i = end === -1 ? n : end + 1
      continue
    }
    if (ch === '%' && (i === 0 || src[i - 1] === '\n')) {
      const end = src.indexOf('\n', i)
      i = end === -1 ? n : end + 1
      continue
    }
    if (ch === '(') {
      tokens.push({ t: 'open' })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ t: 'close' })
      i++
      continue
    }
    if (ch === '$') {
      i++
      while (i < n && /\d/.test(src[i])) i++
      continue
    }
    let j = i
    while (j < n && !/\s/.test(src[j]) && !STOP_CHARS.has(src[j])) j++
    let word = src.slice(i, j)
    i = j === i ? i + 1 : j
    if (RESULT_RE.test(word)) {
      tokens.push({ t: 'result' })
      continue
    }
    // Номера ходов: "1.", "1...", "12.e4", "3…"
    word = word.replace(/^\d+\s*(\.+|…)/, '')
    // Оценочные знаки и мусор: "e4!?", "Nf3+/-"
    word = word.replace(/[!?]+$/, '')
    if (EVAL_RE.test(word)) continue
    word = word.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O')
    if (!word || /^\.+$/.test(word) || word === 'e.p.') continue
    tokens.push({ t: 'move', san: word })
  }
  return tokens
}

/** Разбирает текст PGN (одна или несколько партий, варианты, комментарии). */
export function parsePgn(text: string): PgnGame[] {
  const games: PgnGame[] = []
  let game = null as (PgnGame & { hasMoves: boolean }) | null
  let cur: PgnNode | null = null
  let stack: PgnNode[] = []

  const ensureGame = () => {
    if (!game) {
      game = { headers: {}, root: { san: '', children: [] }, hasMoves: false }
      games.push(game)
      cur = game.root
      stack = []
    }
    return game
  }

  for (const tok of tokenize(text)) {
    switch (tok.t) {
      case 'header': {
        if (game && game.hasMoves) game = null
        ensureGame().headers[tok.key] = tok.value
        break
      }
      case 'comment': {
        const g = ensureGame()
        const clean = tok.text.replace(/\[%[^\]]*\]/g, '').replace(/\s+/g, ' ').trim()
        if (!clean) break
        if (cur === g.root) g.intro = g.intro ? `${g.intro} ${clean}` : clean
        else if (cur) cur.comment = cur.comment ? `${cur.comment} ${clean}` : clean
        break
      }
      case 'open': {
        ensureGame()
        if (cur) {
          stack.push(cur)
          cur = cur.parent ?? cur
        }
        break
      }
      case 'close': {
        if (stack.length) cur = stack.pop()!
        break
      }
      case 'move': {
        const g = ensureGame()
        const node: PgnNode = { san: tok.san, children: [], parent: cur ?? g.root }
        node.parent!.children.push(node)
        cur = node
        g.hasMoves = true
        break
      }
      case 'result': {
        if (stack.length === 0) game = null
        break
      }
    }
  }
  return games.filter((g) => g.root.children.length > 0)
}

const RU_PIECES: Record<string, string> = { K: 'Кр', Q: 'Ф', R: 'Л', B: 'С', N: 'К' }

/** Русская нотация хода: Nf3 → Кf3, Qxd8+ → Фxd8+, e8=Q → e8=Ф. */
export function ruSan(san: string): string {
  return san.replace(/^[KQRBN]/, (p) => RU_PIECES[p]).replace(/=([QRBN])/, (_, p: string) => `=${RU_PIECES[p]}`)
}

/** Подпись хода для людей в русской нотации: "5.Кf3" или "5...Кc6". ply — индекс полухода с нуля. */
export function moveLabel(ply: number, san: string): string {
  const num = Math.floor(ply / 2) + 1
  const ru = ruSan(san)
  return ply % 2 === 0 ? `${num}.${ru}` : `${num}...${ru}`
}

/**
 * Превращает дерево партии в набор линий (все пути от корня до листьев),
 * проверяя каждый ход через chess.js.
 */
export function extractLines(game: PgnGame, baseName: string): ExtractResult {
  const lines: ExtractedLine[] = []
  const errors: string[] = []
  if (game.headers.SetUp === '1' || game.headers.FEN) {
    errors.push(`«${baseName}»: партии с начальной позицией из FEN не поддерживаются.`)
    return { lines, errors }
  }

  const walk = (node: PgnNode, chess: Chess, path: LineMove[], divergence: string | null) => {
    if (node.children.length === 0) {
      if (path.length) lines.push({ name: divergence ? `${baseName} (${divergence})` : baseName, moves: [...path] })
      return
    }
    node.children.forEach((child, idx) => {
      const ply = path.length
      const fenBefore = chess.fen()
      let move
      try {
        move = chess.move(child.san, { strict: false })
      } catch {
        errors.push(`«${baseName}»: недопустимый ход ${moveLabel(ply, child.san)}`)
        return
      }
      const lm: LineMove = {
        san: move.san,
        from: move.from,
        to: move.to,
        promotion: move.promotion,
        color: move.color,
        comment: child.comment,
        fenBefore,
        fenAfter: chess.fen(),
      }
      path.push(lm)
      walk(child, chess, path, divergence ?? (idx > 0 ? moveLabel(ply, move.san) : null))
      path.pop()
      chess.undo()
    })
  }

  walk(game.root, new Chess(), [], null)
  return { lines, errors }
}

/** Имя партии из заголовков PGN (учитывает экспорт студий Lichess). */
export function gameTitle(game: PgnGame, fallback: string): string {
  const h = game.headers
  if (h.ChapterName) return h.ChapterName
  if (h.Event && h.Event !== '?' && !/^casual/i.test(h.Event)) {
    const parts = h.Event.split(': ')
    return parts.length > 1 ? parts.slice(1).join(': ') : h.Event
  }
  if (h.Opening) return h.Variation ? `${h.Opening}: ${h.Variation}` : h.Opening
  if (h.White && h.Black && h.White !== '?' && h.Black !== '?') return `${h.White} — ${h.Black}`
  return fallback
}

/** Удобная функция: PGN-текст → линии с понятными именами. */
export function importPgn(text: string): ExtractResult {
  const games = parsePgn(text)
  const result: ExtractResult = { lines: [], errors: [] }
  if (games.length === 0) {
    result.errors.push('Не найдено ни одного хода. Проверьте текст PGN.')
    return result
  }
  games.forEach((g, i) => {
    const r = extractLines(g, gameTitle(g, games.length > 1 ? `Линия ${i + 1}` : 'Линия'))
    result.lines.push(...r.lines)
    result.errors.push(...r.errors)
  })
  return result
}

function escapeComment(text: string) {
  return text.replace(/[{}]/g, '')
}

/** Сериализует линию в PGN movetext. */
export function movesToPgn(moves: Pick<LineMove, 'san' | 'comment'>[]): string {
  const parts: string[] = []
  moves.forEach((m, ply) => {
    if (ply % 2 === 0) parts.push(`${ply / 2 + 1}.${m.san}`)
    else if (moves[ply - 1].comment) parts.push(`${Math.floor(ply / 2) + 1}...${m.san}`)
    else parts.push(m.san)
    if (m.comment) parts.push(`{${escapeComment(m.comment)}}`)
  })
  return parts.join(' ')
}

/** Полный PGN для экспорта набора линий (каждая линия — отдельная «партия»). */
export function linesToPgn(event: string, lines: { name: string; moves: Pick<LineMove, 'san' | 'comment'>[] }[]): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return lines
    .map(
      (l) =>
        `[Event "${esc(event)}: ${esc(l.name)}"]\n[Site "Шахматный тренажёр"]\n[Result "*"]\n\n${movesToPgn(l.moves)} *\n`,
    )
    .join('\n')
}
