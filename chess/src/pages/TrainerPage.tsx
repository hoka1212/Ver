import { Chess, type Square } from 'chess.js'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Arrow } from 'react-chessboard'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ChessBoard, type BoardMove } from '../components/ChessBoard'
import { BotIcon, CheckIcon, EyeIcon, FlipIcon, LightbulbIcon, PlayIcon, RotateIcon, XIcon } from '../components/icons'
import { MoveList } from '../components/MoveList'
import { Badge, Button, ButtonLink, Card, ConfirmButton, PageHeader } from '../components/ui'
import { useCourse } from '../data'
import { repertoireMoves, sideToColor, type Course, type CourseLine } from '../lib/courses'
import { moveLabel, ruSan } from '../lib/pgn'
import { formatDue, markStudied, practiceOrder, reviewLine, type LineProgress } from '../lib/srs'
import { useStore } from '../lib/storage'
import { botGameStore, logActivity, progressStore, settingsStore } from '../store'
import { botGameInProgress, startBotGame } from '../lib/botGame'

type Mode = 'learn' | 'practice'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const PIECE_INSTR: Record<string, string> = { p: 'пешкой', n: 'конём', b: 'слоном', r: 'ладьёй', q: 'ферзём', k: 'королём' }
const LEARN_ARROW = 'rgba(129, 182, 76, 0.9)'
const HINT_ARROW = 'rgba(90, 166, 224, 0.95)'

interface LineResult {
  line: CourseLine
  mistakes: number
  progress: LineProgress
}

function buildQueue(course: Course, mode: Mode, lineId: string | null, progress: Record<string, LineProgress>): CourseLine[] {
  if (lineId) {
    const line = course.lines.find((l) => l.id === lineId)
    return line ? [line] : []
  }
  if (mode === 'learn') {
    const fresh = course.lines.filter((l) => !progress[l.key] || progress[l.key].level === 0)
    return fresh.length ? fresh : course.lines
  }
  return practiceOrder(course.lines, progress)
}

export function TrainerPage() {
  const { courseId } = useParams()
  const [params] = useSearchParams()
  const mode: Mode = params.get('mode') === 'learn' ? 'learn' : 'practice'
  const lineId = params.get('line')
  const course = useCourse(courseId)
  const [restart, setRestart] = useState(0)

  if (!course) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Курс не найден" back="/openings" />
      </div>
    )
  }
  if (course.lines.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={course.name} back={`/openings/${course.id}`} subtitle="В курсе пока нет линий." />
      </div>
    )
  }
  return <Session key={`${course.id}|${mode}|${lineId}|${restart}`} course={course} mode={mode} lineId={lineId} onRestart={() => setRestart((r) => r + 1)} />
}

function Session({ course, mode, lineId, onRestart }: { course: Course; mode: Mode; lineId: string | null; onRestart: () => void }) {
  // Очередь фиксируется в начале сессии.
  const [queue] = useState(() => buildQueue(course, mode, lineId, progressStore.get()))
  const [index, setIndex] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [results, setResults] = useState<LineResult[]>([])
  const finished = index >= queue.length
  const navigate = useNavigate()
  const botGame = useStore(botGameStore)
  const playBot = () => {
    startBotGame(course.id, sideToColor(course.side))
    navigate('/play')
  }

  const complete = (line: CourseLine, mistakes: number) => {
    const prev = progressStore.get()[line.key]
    const next = mode === 'learn' ? markStudied(prev) : reviewLine(prev, mistakes)
    progressStore.set((p) => ({ ...p, [line.key]: next }))
    logActivity('lines')
    setResults((r) => [...r, { line, mistakes, progress: next }])
    return next
  }

  if (finished) {
    const perfect = results.filter((r) => r.mistakes === 0).length
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader back={`/openings/${course.id}`} title="Сессия завершена" subtitle={course.name} />
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
                <span className="flex items-center gap-2">
                  {r.mistakes === 0 ? <CheckIcon size={16} className="text-accent" /> : <XIcon size={16} className="text-danger" />}
                  {r.line.name}
                </span>
                <span className="shrink-0 text-faint">
                  {mode === 'practice' ? `ошибок: ${r.mistakes} · повтор: ${formatDue(r.progress.due)}` : 'изучено'}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            {mode === 'learn' ? (
              <ButtonLink to={`/openings/${course.id}/train?mode=practice`} variant="primary">
                <PlayIcon size={16} /> Закрепить в тренировке
              </ButtonLink>
            ) : (
              <Button variant="primary" onClick={onRestart}>
                <RotateIcon size={16} /> Ещё сессия
              </Button>
            )}
            <ConfirmButton onConfirm={playBot} skipConfirm={!botGameInProgress(botGame)} confirmLabel="Прервать текущую партию?">
              <BotIcon size={16} /> Применить в партии с ботом
            </ConfirmButton>
            <ButtonLink to={`/openings/${course.id}`}>К курсу</ButtonLink>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <LineTrainer
      key={`${queue[index].key}#${attempt}`}
      course={course}
      target={queue[index]}
      mode={mode}
      position={{ index, total: queue.length }}
      revealName={mode === 'learn' || !!lineId || course.kind === 'traps'}
      onComplete={complete}
      onNext={() => setIndex((i) => i + 1)}
      onRetry={() => setAttempt((a) => a + 1)}
    />
  )
}

interface LineTrainerProps {
  course: Course
  target: CourseLine
  mode: Mode
  position: { index: number; total: number }
  revealName: boolean
  onComplete: (line: CourseLine, mistakes: number) => LineProgress
  onNext: () => void
  onRetry: () => void
}

function LineTrainer({ course, target, mode, position, revealName, onComplete, onNext, onRetry }: LineTrainerProps) {
  const settings = useStore(settingsStore)
  const userColor = sideToColor(course.side)
  const [line, setLine] = useState(target)
  const [ply, setPly] = useState(0)
  const [errorPlies, setErrorPlies] = useState<Set<number>>(() => new Set())
  const [hintLevel, setHintLevel] = useState(0)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'bad' | 'info'; text: string } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [orientation, setOrientation] = useState<'white' | 'black'>(course.side)
  const [outcome, setOutcome] = useState<LineProgress | null>(null)
  const reported = useRef(false)

  const fen = ply === 0 ? START_FEN : line.moves[ply - 1].fenAfter
  const expected = line.moves[ply]
  const done = ply >= line.moves.length
  const userTurn = !!expected && expected.color === userColor
  const lastMove = ply > 0 ? line.moves[ply - 1] : null
  const userMovesDone = line.moves.slice(0, ply).filter((m) => m.color === userColor).length

  // Ход «компьютера» из базы.
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

  const markError = () => setErrorPlies((s) => (s.has(ply) ? s : new Set(s).add(ply)))

  const handleMove = (m: BoardMove): boolean => {
    if (!userTurn || !expected) return false
    const chess = new Chess(fen)
    let san: string
    try {
      san = chess.move({ from: m.from, to: m.to, promotion: m.promotion }).san
    } catch {
      return false
    }

    let nextLine: CourseLine | null = null
    if (san === expected.san) nextLine = line
    else if (mode === 'practice' && course.kind !== 'traps') {
      // Другой ход из репертуара (например, при противоречивом импорте) тоже засчитываем.
      // В сборниках ловушек линии намеренно расходятся, поэтому там ждём ход именно этой линии.
      const alts = repertoireMoves(
        course,
        line.moves.slice(0, ply).map((x) => x.san),
      ).get(san)
      if (alts?.length) nextLine = alts[0]
    }

    if (nextLine) {
      const played = nextLine.moves[ply]
      if (nextLine !== line) setLine(nextLine)
      setPly(ply + 1)
      setHintLevel(0)
      const comment = settings.showComments && mode === 'practice' ? played.comment : undefined
      setFeedback({
        tone: 'ok',
        text: nextLine !== line ? `Верно! Переходим в линию «${nextLine.name}».` : comment ? `Верно! ${comment}` : 'Верно!',
      })
      return true
    }

    // Неверный ход: фигура вернётся назад, показываем подсказку.
    markError()
    setFlash(m.to)
    const level = mode === 'learn' ? 2 : Math.min(2, hintLevel + 1)
    setHintLevel(level)
    const piece = new Chess(fen).get(expected.from as Square)
    const pieceHint = expected.san.startsWith('O-O') ? 'нужна рокировка' : `ходите ${PIECE_INSTR[piece?.type ?? 'p']} с поля ${expected.from}`
    setFeedback({
      tone: 'bad',
      text:
        mode === 'learn'
          ? `${ruSan(san)} — не тот ход. Сыграйте ход, показанный стрелкой.`
          : level === 1
            ? `${ruSan(san)} — в этой линии так не играют. Подсказка: ${pieceHint}.`
            : `${ruSan(san)} — снова мимо. Правильный ход показан стрелкой.`,
    })
    return false
  }

  const showHint = () => {
    if (!userTurn) return
    markError()
    setHintLevel((h) => Math.min(2, h + 1))
  }

  const arrows: Arrow[] = useMemo(() => {
    if (!userTurn || !expected) return []
    if (mode === 'learn') return [{ startSquare: expected.from, endSquare: expected.to, color: LEARN_ARROW }]
    if (hintLevel >= 2) return [{ startSquare: expected.from, endSquare: expected.to, color: HINT_ARROW }]
    return []
  }, [userTurn, expected, mode, hintLevel])

  const highlights = useMemo(() => {
    const h: Record<string, CSSProperties> = {}
    if (userTurn && expected && mode === 'practice' && hintLevel === 1) {
      h[expected.from] = { boxShadow: 'inset 0 0 0 4px rgba(90, 166, 224, 0.95)', backgroundColor: 'rgba(90, 166, 224, 0.25)' }
    }
    if (flash) h[flash] = { backgroundColor: 'rgba(226, 87, 76, 0.75)' }
    return h
  }, [userTurn, expected, mode, hintLevel, flash])

  const mistakes = errorPlies.size
  const totalUserMoves = line.moves.filter((m) => m.color === userColor).length

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={`/openings/${course.id}`}
        title={course.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={mode === 'learn' ? 'info' : 'accent'}>{mode === 'learn' ? 'Изучение' : 'Тренировка'}</Badge>
            <Badge tone={course.side}>Вы за {course.side === 'white' ? 'белых' : 'чёрных'}</Badge>
            {position.total > 1 && (
              <span className="text-sm text-faint">
                линия {position.index + 1} из {position.total}
              </span>
            )}
          </span>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <ChessBoard
            id="trainer"
            fen={fen}
            orientation={orientation}
            interactive={userTurn && !done}
            movableColor={userColor}
            onMove={handleMove}
            lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
            arrows={arrows}
            highlights={highlights}
            showMaterial
            materialLabels={
              orientation === course.side ? { top: 'Соперник', bottom: 'Вы' } : { top: 'Вы', bottom: 'Соперник' }
            }
          />
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          <Card className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wider text-faint">Линия</div>
                <div className="line-clamp-2 min-h-11 font-semibold leading-snug">{revealName || done ? line.name : 'скрыта до конца линии'}</div>
              </div>
              {line.trap && (revealName || done) && <Badge tone="danger">Ловушка</Badge>}
            </div>
            <div className="mt-3 flex items-center gap-3 text-sm">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(userMovesDone / Math.max(1, totalUserMoves)) * 100}%` }} />
              </div>
              <span className="text-muted tabular">
                {userMovesDone}/{totalUserMoves}
              </span>
              {mode === 'practice' && (
                <span className={`tabular ${mistakes ? 'text-danger' : 'text-muted'}`}>
                  ошибок: {mistakes}
                </span>
              )}
            </div>
          </Card>

          {done && outcome ? (
            <Card className="flex min-h-[15rem] flex-col border-accent/40 p-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <CheckIcon size={22} className="text-accent" />
                {mode === 'learn' ? 'Линия изучена!' : mistakes === 0 ? 'Идеально!' : 'Линия пройдена'}
              </div>
              <p className="mt-1 text-sm text-muted">
                {mode === 'learn'
                  ? 'Теперь закрепите её в режиме тренировки — без стрелок.'
                  : mistakes === 0
                    ? `Без единой ошибки. Следующее повторение ${formatDue(outcome.due)}.`
                    : outcome.due <= Date.now() + 60_000
                      ? `Ошибок: ${mistakes}. Линия остаётся в очереди — повторите её ещё раз.`
                      : `Ошибок: ${mistakes}. Линия вернётся на повторение ${formatDue(outcome.due)}.`}
              </p>
              {line.moves[line.moves.length - 1]?.comment && (
                <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg/90">{line.moves[line.moves.length - 1].comment}</p>
              )}
              <div className="mt-auto flex flex-wrap gap-2 pt-3">
                {position.index + 1 < position.total ? (
                  <Button variant="primary" onClick={onNext}>
                    Следующая линия
                  </Button>
                ) : (
                  <Button variant="primary" onClick={onNext}>
                    Итоги сессии
                  </Button>
                )}
                <Button onClick={onRetry}>
                  <RotateIcon size={16} /> Ещё раз
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="flex min-h-[15rem] flex-col p-4">
              <StatusBox
                mode={mode}
                userTurn={userTurn}
                feedback={feedback}
                expectedLabel={expected ? moveLabel(ply, expected.san) : ''}
                learnComment={mode === 'learn' && userTurn ? expected?.comment : undefined}
              />
              {settings.showComments && lastMove?.comment && (mode === 'learn' || lastMove.color !== userColor) && (
                <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm leading-relaxed text-fg/90">
                  <span className="font-semibold">{moveLabel(ply - 1, lastMove.san)}</span> — {lastMove.comment}
                </p>
              )}
              <div className="mt-auto flex flex-wrap gap-2 pt-3">
                {mode === 'practice' && (
                  <>
                    <Button size="sm" onClick={showHint} disabled={!userTurn || hintLevel >= 1}>
                      <LightbulbIcon size={16} /> Подсказка
                    </Button>
                    <Button size="sm" onClick={() => {
                        markError()
                        setHintLevel(2)
                      }} disabled={!userTurn || hintLevel >= 2}>
                      <EyeIcon size={16} /> Показать ход
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={onRetry}>
                  <RotateIcon size={16} /> Заново
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} aria-label="Перевернуть доску">
                  <FlipIcon size={16} />
                </Button>
              </div>
            </Card>
          )}

          <Card className="p-2">
            <MoveList moves={line.moves} ply={ply} hideFuture={!done} className="h-64" />
          </Card>
        </aside>
      </div>
    </div>
  )
}

function StatusBox({
  mode,
  userTurn,
  feedback,
  expectedLabel,
  learnComment,
}: {
  mode: Mode
  userTurn: boolean
  feedback: { tone: 'ok' | 'bad' | 'info'; text: string } | null
  expectedLabel: string
  learnComment?: string
}) {
  const turnText = userTurn
    ? mode === 'learn'
      ? `Ваш ход: ${expectedLabel}`
      : 'Ваш ход — вспомните продолжение'
    : 'Соперник думает…'
  return (
    <div>
      <div className="flex items-center gap-2 font-semibold">
        <span className={`size-2.5 rounded-full ${userTurn ? 'bg-accent' : 'animate-pulse bg-faint'}`} />
        {turnText}
      </div>
      {/* Отклик на ход — сразу под строкой статуса: появление комментария ниже его не сдвигает. */}
      {feedback && (
        <p
          key={feedback.text}
          className={`mt-2 rounded-lg px-3 py-2 text-sm leading-relaxed ${
            feedback.tone === 'ok' ? 'bg-accent/12 text-accent-strong' : feedback.tone === 'bad' ? 'bg-danger/12 text-[#f08a80]' : 'bg-info/12 text-info'
          }`}
        >
          {feedback.text}
        </p>
      )}
      {learnComment && <p className="mt-1.5 text-sm leading-relaxed text-muted">{learnComment}</p>}
    </div>
  )
}
