import { Chess, type Square } from 'chess.js'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Arrow } from 'react-chessboard'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ChessBoard, type BoardMove } from '../components/ChessBoard'
import { BotIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, EyeIcon, FlipIcon, LightbulbIcon, RotateIcon, XIcon } from '../components/icons'
import { MoveList } from '../components/MoveList'
import { Badge, Button, ButtonLink, Card, ConfirmButton, PageHeader } from '../components/ui'
import { useCourses } from '../data'
import { botGameInProgress, startBotGame } from '../lib/botGame'
import { sideToColor, type Side } from '../lib/courses'
import { moveLabel, ruSan } from '../lib/pgn'
import { formatDue, practiceOrder, reviewLine, type LineProgress } from '../lib/srs'
import { useStore } from '../lib/storage'
import { buildTree, deepestNode, describeNode, pluralRu, REPERTOIRE_IDS, resolveSource, START_FEN, trainBase, type TrainLine, type TrainSource, type TreeNode } from '../lib/tree'
import { botGameStore, logActivity, progressStore, settingsStore } from '../store'
import { TreeTrainer } from './TreeTrainer'

const PIECE_INSTR: Record<string, string> = { p: 'пешкой', n: 'конём', b: 'слоном', r: 'ладьёй', q: 'ферзём', k: 'королём' }
const HINT_ARROW = 'rgba(90, 166, 224, 0.95)'
/** Сколько линий в одной сессии тренировки. */
const SESSION_SIZE = 12

interface LineResult {
  line: TrainLine
  mistakes: number
  progress: LineProgress
}

/** /openings/:courseId/train и /repertoire/:side/train: изучение деревом или тренировка линий. */
export function TrainerPage() {
  const { courseId, side } = useParams()
  const [params] = useSearchParams()
  const learn = params.get('mode') === 'learn'
  const lineId = params.get('line')
  const courses = useCourses()
  const sourceId = side === 'white' || side === 'black' ? REPERTOIRE_IDS[side as Side] : courseId
  const source = useMemo(() => resolveSource(sourceId, courses), [sourceId, courses])
  const [restart, setRestart] = useState(0)

  if (!source) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Курс не найден" back="/openings" />
      </div>
    )
  }
  if (source.lines.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={source.name} back={source.home} subtitle="Здесь пока нет линий." />
      </div>
    )
  }
  const lineKey = lineId && source.course ? `${source.id}/${lineId}` : null
  if (learn) return <TreeTrainer key={`${source.id}|${lineKey}`} source={source} focusKey={lineKey} />
  return <Session key={`${source.id}|${lineKey}|${restart}`} source={source} lineKey={lineKey} onRestart={() => setRestart((r) => r + 1)} />
}

function Session({ source, lineKey, onRestart }: { source: TrainSource; lineKey: string | null; onRestart: () => void }) {
  const tree = useMemo(() => buildTree(source.lines), [source])
  // Очередь фиксируется в начале сессии: сначала просроченные линии, потом новые.
  const [queue] = useState(() =>
    lineKey ? source.lines.filter((l) => l.key === lineKey) : practiceOrder(source.lines, progressStore.get()).slice(0, SESSION_SIZE),
  )
  const [index, setIndex] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [results, setResults] = useState<LineResult[]>([])
  const finished = index >= queue.length
  const navigate = useNavigate()
  const botGame = useStore(botGameStore)
  const playBot = () => {
    startBotGame(source.id, sideToColor(source.side))
    navigate('/play')
  }

  const complete = (line: TrainLine, mistakes: number) => {
    const next = reviewLine(progressStore.get()[line.key], mistakes)
    progressStore.set((p) => ({ ...p, [line.key]: next }))
    logActivity('lines')
    setResults((r) => [...r, { line, mistakes, progress: next }])
    return next
  }

  if (finished) {
    const perfect = results.filter((r) => r.mistakes === 0).length
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader back={source.home} title="Сессия завершена" subtitle={source.name} />
        <Card>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-lg bg-surface-2 py-3">
              <div className="text-3xl font-bold tabular">{results.length}</div>
              <div className="text-sm text-muted">линий пройдено</div>
            </div>
            <div className="rounded-lg bg-accent/10 py-3">
              <div className="text-3xl font-bold text-accent tabular">{perfect}</div>
              <div className="text-sm text-muted">без ошибок</div>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-line">
            {results.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  {r.mistakes === 0 ? <CheckIcon size={16} className="shrink-0 text-accent" /> : <XIcon size={16} className="shrink-0 text-danger" />}
                  <span className="min-w-0">
                    {r.line.name}
                    {!source.course && <span className="block text-xs text-faint">{r.line.courseName}</span>}
                  </span>
                </span>
                <span className="shrink-0 text-faint">
                  ошибок: {r.mistakes} · повтор: {formatDue(r.progress.due)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" onClick={onRestart}>
              <RotateIcon size={16} /> Ещё сессия
            </Button>
            <ConfirmButton onConfirm={playBot} skipConfirm={!botGameInProgress(botGame)} confirmLabel="Прервать текущую партию?">
              <BotIcon size={16} /> Применить в партии с ботом
            </ConfirmButton>
            <ButtonLink to={`${trainBase(source)}?mode=learn`}>Дерево вариантов</ButtonLink>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <LineTrainer
      key={`${queue[index].key}#${attempt}`}
      source={source}
      tree={tree}
      target={queue[index]}
      position={{ index, total: queue.length }}
      onComplete={complete}
      onNext={() => setIndex((i) => i + 1)}
      onRetry={() => setAttempt((a) => a + 1)}
    />
  )
}

interface LineTrainerProps {
  source: TrainSource
  tree: TreeNode
  target: TrainLine
  position: { index: number; total: number }
  onComplete: (line: TrainLine, mistakes: number) => LineProgress
  onNext: () => void
  onRetry: () => void
}

/** Другие линии источника, которые идут теми же ходами и продолжаются ходом san. */
function alternatives(lines: TrainLine[], history: string[], san: string): TrainLine | undefined {
  return lines.find((l) => l.moves.length > history.length && l.moves[history.length].san === san && history.every((h, i) => l.moves[i].san === h))
}

function LineTrainer({ source, tree, target, position, onComplete, onNext, onRetry }: LineTrainerProps) {
  const settings = useStore(settingsStore)
  const userColor = sideToColor(source.side)
  const [line, setLine] = useState(target)
  const [ply, setPly] = useState(0)
  // Просмотр уже сыгранного хода (null — текущая позиция).
  const [view, setView] = useState<number | null>(null)
  const [errorPlies, setErrorPlies] = useState<Set<number>>(() => new Set())
  const [hintLevel, setHintLevel] = useState(0)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'bad' | 'info'; text: string } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [orientation, setOrientation] = useState<'white' | 'black'>(source.side)
  const [outcome, setOutcome] = useState<LineProgress | null>(null)
  const reported = useRef(false)

  const fenAt = (p: number) => (p === 0 ? START_FEN : line.moves[p - 1].fenAfter)
  const fen = fenAt(ply)
  const expected = line.moves[ply]
  const done = ply >= line.moves.length
  const userTurn = !!expected && expected.color === userColor
  const viewing = view !== null && view < ply
  const shownPly = viewing ? view : ply
  const lastMove = shownPly > 0 ? line.moves[shownPly - 1] : null
  const userMovesDone = line.moves.slice(0, ply).filter((m) => m.color === userColor).length
  // Какой это дебют и вариант — сразу по сыгранным ходам.
  const label = describeNode(deepestNode(tree, line.moves.slice(0, ply).map((m) => m.san)))

  // Ход соперника из базы.
  useEffect(() => {
    if (done || !expected || expected.color === userColor) return
    const t = window.setTimeout(() => setPly((p) => p + 1), settings.opponentDelay + (ply === 0 ? 350 : 0))
    return () => window.clearTimeout(t)
  }, [ply, line, done, expected, userColor, settings.opponentDelay])

  // Линия пройдена — записываем результат один раз.
  useEffect(() => {
    if (!done || reported.current) return
    reported.current = true
    setOutcome(onComplete(line, errorPlies.size))
    setFeedback(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 500)
    return () => window.clearTimeout(t)
  }, [flash])

  // Листание сыгранных ходов стрелками клавиатуры.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft') setView((v) => Math.max(0, (v ?? ply) - 1))
      else if (e.key === 'ArrowRight') setView((v) => (v === null || v + 1 >= ply ? null : v + 1))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ply])

  const markError = () => setErrorPlies((s) => (s.has(ply) ? s : new Set(s).add(ply)))

  const handleMove = (m: BoardMove): boolean => {
    if (!userTurn || !expected || viewing) return false
    let san: string
    try {
      san = new Chess(fen).move({ from: m.from, to: m.to, promotion: m.promotion }).san
    } catch {
      return false
    }

    let nextLine: TrainLine | undefined
    if (san === expected.san) nextLine = line
    else if (source.course?.kind !== 'traps') {
      // Любой другой ход из курса (репертуара) тоже верный — продолжаем по его линии.
      // В отдельном сборнике ловушек ждём ход именно этой ловушки.
      nextLine = alternatives(
        source.lines,
        line.moves.slice(0, ply).map((x) => x.san),
        san,
      )
    }

    if (nextLine) {
      const played = nextLine.moves[ply]
      if (nextLine !== line) setLine(nextLine)
      setPly(ply + 1)
      setHintLevel(0)
      const comment = settings.showComments ? played.comment : undefined
      setFeedback({
        tone: 'ok',
        text: nextLine !== line ? `Верно! Это тоже ход из ${source.course ? 'курса' : 'репертуара'}: продолжаем по линии «${nextLine.name}».` : comment ? `Верно! ${comment}` : 'Верно!',
      })
      return true
    }

    // Неверный ход: фигура вернётся назад, показываем подсказку.
    markError()
    setFlash(m.to)
    const level = Math.min(2, hintLevel + 1)
    setHintLevel(level)
    const piece = new Chess(fen).get(expected.from as Square)
    const pieceHint = expected.san.startsWith('O-O') ? 'нужна рокировка' : `ходите ${PIECE_INSTR[piece?.type ?? 'p']} с поля ${expected.from}`
    setFeedback({
      tone: 'bad',
      text: level === 1 ? `${ruSan(san)} — в этой линии так не играют. Подсказка: ${pieceHint}.` : `${ruSan(san)} — снова мимо. Правильный ход показан стрелкой.`,
    })
    return false
  }

  const showHint = () => {
    if (!userTurn) return
    markError()
    setHintLevel((h) => Math.min(2, h + 1))
  }

  const arrows: Arrow[] = useMemo(() => {
    if (viewing || !userTurn || !expected || hintLevel < 2) return []
    return [{ startSquare: expected.from, endSquare: expected.to, color: HINT_ARROW }]
  }, [viewing, userTurn, expected, hintLevel])

  const highlights = useMemo(() => {
    const h: Record<string, CSSProperties> = {}
    if (!viewing && userTurn && expected && hintLevel === 1) {
      h[expected.from] = { boxShadow: 'inset 0 0 0 4px rgba(90, 166, 224, 0.95)', backgroundColor: 'rgba(90, 166, 224, 0.25)' }
    }
    if (flash) h[flash] = { backgroundColor: 'rgba(226, 87, 76, 0.75)' }
    return h
  }, [viewing, userTurn, expected, hintLevel, flash])

  const mistakes = errorPlies.size
  const totalUserMoves = line.moves.filter((m) => m.color === userColor).length
  const heading = done ? line.name : (label.variation ?? (label.opening ? `${label.lineCount} ${pluralRu(label.lineCount, 'вариант', 'варианта', 'вариантов')} впереди` : 'Дебют ещё не определился'))
  const openingName = done ? line.courseName : (label.opening ?? `возможно: ${label.openings.slice(0, 3).join(', ')}${label.openings.length > 3 ? '…' : ''}`)

  const navButtons = (
    <div className="mt-2 flex items-center justify-center gap-2">
      <Button size="sm" onClick={() => setView(Math.max(0, shownPly - 1))} disabled={shownPly === 0} aria-label="Ход назад">
        <ChevronLeftIcon size={18} />
      </Button>
      <Button size="sm" onClick={() => setView(shownPly + 1 >= ply ? null : shownPly + 1)} disabled={!viewing} aria-label="Ход вперёд">
        <ChevronRightIcon size={18} />
      </Button>
      <Button size="sm" variant={viewing ? 'primary' : 'ghost'} onClick={() => setView(null)} disabled={!viewing}>
        К текущей позиции
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} aria-label="Перевернуть доску">
        <FlipIcon size={16} />
      </Button>
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl">
      <div className="hidden lg:block">
        <PageHeader
          back={source.home}
          title={source.name}
          subtitle={
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">Тренировка</Badge>
              <Badge tone={source.side}>Вы за {source.side === 'white' ? 'белых' : 'чёрных'}</Badge>
              {position.total > 1 && (
                <span className="text-sm text-faint">
                  линия {position.index + 1} из {position.total}
                </span>
              )}
            </span>
          }
        />
      </div>
      {/* Телефон: над доской — дебют, вариант и чей ход. */}
      <div className="lg:hidden">
        <h1 className="sr-only">{source.name}: тренировка</h1>
        <div className="mb-2 flex h-[4.25rem] flex-col justify-center rounded-xl border border-line bg-surface px-3">
          <div className="truncate text-xs text-muted">{openingName}</div>
          <div className="truncate text-sm font-semibold">{heading}</div>
          <div className={`truncate text-xs font-semibold ${feedback?.tone === 'bad' ? 'text-[#f08a80]' : userTurn ? 'text-accent' : 'text-muted'}`}>
            {done ? 'Линия пройдена' : viewing ? 'Просмотр сыгранного хода' : feedback?.tone === 'bad' ? feedback.text : userTurn ? 'Ваш ход — вспомните продолжение' : 'Соперник думает…'}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <ChessBoard
            id="trainer"
            fen={viewing ? fenAt(shownPly) : fen}
            orientation={orientation}
            interactive={userTurn && !done && !viewing}
            movableColor={userColor}
            onMove={handleMove}
            lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
            arrows={arrows}
            highlights={highlights}
            showMaterial
            materialLabels={orientation === source.side ? { top: 'Соперник', bottom: 'Вы' } : { top: 'Вы', bottom: 'Соперник' }}
            columnClassName="board-column board-column-play"
          />
          {navButtons}
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          <Card className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-xs uppercase tracking-wider text-faint">{openingName}</div>
                <div className="line-clamp-2 min-h-11 font-semibold leading-snug">{heading}</div>
              </div>
              {line.trap && done && <Badge tone="danger">Ловушка</Badge>}
            </div>
            <div className="mt-3 flex items-center gap-3 text-sm">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(userMovesDone / Math.max(1, totalUserMoves)) * 100}%` }} />
              </div>
              <span className="text-muted tabular">
                {userMovesDone}/{totalUserMoves}
              </span>
              <span className={`tabular ${mistakes ? 'text-danger' : 'text-muted'}`}>ошибок: {mistakes}</span>
            </div>
          </Card>

          {done && outcome ? (
            <Card className="flex min-h-[15rem] flex-col border-accent/40 p-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <CheckIcon size={22} className="text-accent" />
                {mistakes === 0 ? 'Идеально!' : 'Линия пройдена'}
              </div>
              <p className="mt-1 text-sm text-muted">
                {mistakes === 0
                  ? `Без единой ошибки. Следующее повторение ${formatDue(outcome.due)}.`
                  : outcome.due <= Date.now() + 60_000
                    ? `Ошибок: ${mistakes}. Линия остаётся в очереди — повторите её ещё раз.`
                    : `Ошибок: ${mistakes}. Линия вернётся на повторение ${formatDue(outcome.due)}.`}
              </p>
              {line.moves[line.moves.length - 1]?.comment && (
                <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg/90">{line.moves[line.moves.length - 1].comment}</p>
              )}
              <div className="mt-auto flex flex-wrap gap-2 pt-3">
                <Button variant="primary" onClick={onNext}>
                  {position.index + 1 < position.total ? 'Следующая линия' : 'Итоги сессии'}
                </Button>
                <Button onClick={onRetry}>
                  <RotateIcon size={16} /> Ещё раз
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="flex min-h-[15rem] flex-col p-4">
              <div className="flex items-center gap-2 font-semibold">
                <span className={`size-2.5 rounded-full ${userTurn && !viewing ? 'bg-accent' : 'animate-pulse bg-faint'}`} />
                {viewing ? `Просмотр: позиция после ${shownPly > 0 ? moveLabel(shownPly - 1, line.moves[shownPly - 1].san) : 'начала'}` : userTurn ? 'Ваш ход — вспомните продолжение' : 'Соперник думает…'}
              </div>
              {feedback && !viewing && (
                <p
                  className={`mt-2 rounded-lg px-3 py-2 text-sm leading-relaxed ${
                    feedback.tone === 'ok' ? 'bg-accent/12 text-accent-strong' : feedback.tone === 'bad' ? 'bg-danger/12 text-[#f08a80]' : 'bg-info/12 text-info'
                  }`}
                >
                  {feedback.text}
                </p>
              )}
              {settings.showComments && lastMove?.comment && (viewing || lastMove.color !== userColor) && (
                <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm leading-relaxed text-fg/90">
                  <span className="font-semibold">{moveLabel(shownPly - 1, lastMove.san)}</span> — {lastMove.comment}
                </p>
              )}
              <div className="mt-auto flex flex-wrap gap-2 pt-3">
                <Button size="sm" onClick={showHint} disabled={!userTurn || viewing || hintLevel >= 1}>
                  <LightbulbIcon size={16} /> Подсказка
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    markError()
                    setHintLevel(2)
                  }}
                  disabled={!userTurn || viewing || hintLevel >= 2}
                >
                  <EyeIcon size={16} /> Показать ход
                </Button>
                <Button size="sm" variant="ghost" onClick={onRetry}>
                  <RotateIcon size={16} /> Заново
                </Button>
              </div>
            </Card>
          )}

          <Card className="p-2">
            <MoveList
              moves={line.moves}
              ply={shownPly}
              hideFrom={done ? undefined : ply}
              onSelect={(p) => setView(p >= ply ? null : p)}
              className="h-64"
            />
          </Card>
        </aside>
      </div>
    </div>
  )
}
