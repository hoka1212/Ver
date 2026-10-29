import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Arrow } from 'react-chessboard'
import { ChessBoard, type BoardMove } from '../components/ChessBoard'
import { FlagIcon, FlipIcon, LightbulbIcon, PlayIcon, RotateIcon, SettingsIcon, UndoIcon } from '../components/icons'
import { MoveList, MoveMarkLegend, type MoveMark } from '../components/MoveList'
import { Badge, Button, ButtonLink, Card, ConfirmButton, PageHeader, Segmented } from '../components/ui'
import { useCourses } from '../data'
import { askBot } from '../engine/client'
import { BOT_LEVELS, type BotLevel } from '../engine/levels'
import { buildBook, chooseBookMove, type BookEntry } from '../lib/book'
import { BEHAVIOURS, gameResult, moveColor, replay, START_FEN, startBotGame, theorySummary, uciToSan } from '../lib/botGame'
import { positionKey, sideToColor, type Course } from '../lib/courses'
import { moveLabel, ruSan } from '../lib/pgn'
import { useStore } from '../lib/storage'
import {
  botGameStore,
  botPrefsStore,
  botStatsStore,
  recordBotGame,
  settingsStore,
  type BotBehaviour,
  type BotGame,
  type MoveTag,
} from '../store'

const HINT_ARROW = 'rgba(90, 166, 224, 0.95)'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function recordResult(game: BotGame) {
  if (!game.result) return
  const outcome = game.result.winner === null ? 'draw' : game.result.winner === game.color ? 'win' : 'loss'
  recordBotGame(game.courseId, outcome)
}

/** Добавляет ход в партию, если она не изменилась с момента расчёта. Возвращает новую партию. */
function commitMove(gameId: number, ply: number, uci: string, tag: MoveTag, expected?: string[]): BotGame | null {
  let committed = null as BotGame | null
  botGameStore.set((g) => {
    if (!g || g.id !== gameId || g.moves.length !== ply || g.result) return g
    const chess = replay(g.moves)
    let san: string
    try {
      san = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
    } catch {
      return g
    }
    committed = { ...g, moves: [...g.moves, { uci, san, tag, ...(expected ? { expected } : {}) }], result: gameResult(chess) }
    return committed
  })
  if (committed?.result) recordResult(committed)
  return committed
}

export function PlayPage() {
  const game = useStore(botGameStore)
  const [setupOpen, setSetupOpen] = useState(false)
  if (!game || setupOpen) return <PlaySetup canReturn={!!game} onClose={() => setSetupOpen(false)} />
  return <GameView key={game.id} game={game} onSetup={() => setSetupOpen(true)} />
}

// ---------- Настройка партии ----------

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-muted">{label}</div>
      {children}
    </div>
  )
}

function PlaySetup({ canReturn, onClose }: { canReturn: boolean; onClose: () => void }) {
  const courses = useCourses()
  const prefs = useStore(botPrefsStore)
  const stats = useStore(botStatsStore)
  const [courseId, setCourseId] = useState(() => (courses.some((c) => c.id === prefs.courseId) ? prefs.courseId! : ''))
  const course = courses.find((c) => c.id === courseId)
  const record = stats._all

  const start = () => {
    const color = course
      ? sideToColor(course.side)
      : prefs.freeColor === 'random'
        ? Math.random() < 0.5
          ? 'w'
          : 'b'
        : prefs.freeColor
    startBotGame(course?.id ?? null, color)
    onClose()
  }
  const group = (side: 'white' | 'black') =>
    courses
      .filter((c) => c.side === side && c.lines.length > 0)
      .map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Игра с ботом"
        subtitle="Применяйте дебюты в партии: бот отвечает по теории курса, иногда сворачивает с неё, а дальше играет сам."
      />
      <Card className="flex flex-col gap-6">
        <Field label="Дебют">
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="h-11 w-full rounded-lg border border-line bg-surface-2 px-3 text-[15px] text-fg outline-none focus:border-accent"
          >
            <option value="">Без дебюта — свободная партия</option>
            <optgroup label="За белых">{group('white')}</optgroup>
            <optgroup label="За чёрных">{group('black')}</optgroup>
          </select>
          <p className="mt-2 min-h-10 text-sm leading-relaxed text-muted">
            {course ? course.summary : 'Обычная партия с начальной позиции — бот играет без подсказок курса.'}
          </p>
        </Field>

        <Field label="Ваш цвет">
          {course ? (
            <Segmented
              value={course.side}
              disabled
              onChange={() => {}}
              options={[
                { value: 'white', label: 'Белые' },
                { value: 'black', label: 'Чёрные' },
              ]}
            />
          ) : (
            <Segmented
              value={prefs.freeColor}
              onChange={(v) => botPrefsStore.set((p) => ({ ...p, freeColor: v }))}
              options={[
                { value: 'w', label: 'Белые' },
                { value: 'b', label: 'Чёрные' },
                { value: 'random', label: 'Случайно' },
              ]}
            />
          )}
          <p className="mt-2 text-sm text-faint">{course ? 'Цвет задаёт курс.' : 'В свободной партии цвет выбираете вы.'}</p>
        </Field>

        <Field label="Сила бота">
          <Segmented
            value={prefs.level}
            onChange={(v) => botPrefsStore.set((p) => ({ ...p, level: v }))}
            className="grid grid-cols-2 sm:inline-grid sm:grid-cols-4"
            options={([1, 2, 3, 4] as BotLevel[]).map((l) => ({ value: l, label: BOT_LEVELS[l].name }))}
          />
          <p className="mt-2 text-sm text-faint">{BOT_LEVELS[prefs.level].description}</p>
        </Field>

        <Field label="Поведение соперника в дебюте">
          <Segmented
            value={prefs.behaviour}
            disabled={!course}
            onChange={(v) => botPrefsStore.set((p) => ({ ...p, behaviour: v }))}
            className="grid grid-cols-1 sm:inline-grid sm:grid-cols-3"
            options={(Object.keys(BEHAVIOURS) as BotBehaviour[]).map((b) => ({ value: b, label: BEHAVIOURS[b].name }))}
          />
          <p className="mt-2 min-h-10 text-sm leading-relaxed text-faint">
            {course ? BEHAVIOURS[prefs.behaviour].description : 'Доступно, когда выбран дебют.'}
          </p>
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="lg" onClick={start}>
            <PlayIcon size={18} /> Начать партию
          </Button>
          {canReturn && (
            <Button size="lg" variant="ghost" onClick={onClose}>
              Вернуться к партии
            </Button>
          )}
        </div>
      </Card>
      {record && (
        <p className="mt-4 text-sm text-muted">
          Ваш счёт против бота: <span className="text-fg tabular">{record.wins}</span> побед ·{' '}
          <span className="text-fg tabular">{record.draws}</span> ничьих · <span className="text-fg tabular">{record.losses}</span> поражений
        </p>
      )}
    </div>
  )
}

// ---------- Партия ----------

interface Notice {
  tone: 'ok' | 'bad' | 'warn' | 'info'
  text: string
  /** Показать кнопку «Взять ход назад». */
  undo?: boolean
}

const NOTICE_TONE: Record<Notice['tone'], string> = {
  ok: 'bg-accent/12 text-accent-strong',
  bad: 'bg-danger/12 text-[#f08a80]',
  warn: 'bg-warn/12 text-warn',
  info: 'bg-surface-2 text-fg/90',
}

const MARK: Partial<Record<MoveTag, MoveMark>> = { book: 'book', mistake: 'mistake', deviation: 'deviation' }

function GameView({ game, onSetup }: { game: BotGame; onSetup: () => void }) {
  const courses = useCourses()
  const settings = useStore(settingsStore)
  const course: Course | null = (game.courseId && courses.find((c) => c.id === game.courseId)) || null
  const book = useMemo(() => (course ? buildBook(course) : null), [course])
  const chess = useMemo(() => replay(game.moves), [game.moves])
  const fen = chess.fen()
  const ply = game.moves.length
  const over = !!game.result
  const userTurn = !over && chess.turn() === game.color
  const entry: BookEntry | undefined = book?.get(positionKey(fen))
  const ucis = game.moves.map((m) => m.uci)

  const [orientation, setOrientation] = useState<'white' | 'black'>(game.color === 'w' ? 'white' : 'black')
  const [userNotice, setUserNotice] = useState<Notice | null>(null)
  const [botNotice, setBotNotice] = useState<Notice | null>(null)
  const [hint, setHint] = useState<{ ply: number; uci: string; text: string } | null>(null)
  const [hintBusy, setHintBusy] = useState(false)
  const [engineError, setEngineError] = useState(false)
  const activeHint = hint && hint.ply === ply && userTurn ? hint : null

  // Ход бота: из книги курса, отклонение от теории или ход движка.
  useEffect(() => {
    if (over || chess.turn() === game.color) return
    let cancelled = false
    const started = performance.now()
    const botMovesSoFar = game.moves.filter((_, i) => moveColor(i) !== game.color).length
    const legalUcis = new Set(chess.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? '')))
    const bookMoves = (entry?.opponent ?? []).filter((m) => legalUcis.has(m.uci))
    const hadBook = game.moves.some((m) => m.tag === 'book')
    const hadFreeBot = game.moves.some((m, i) => m.tag === 'free' && moveColor(i) !== game.color)

    const run = async () => {
      let uci: string | null = null
      let tag: MoveTag = 'free'
      let expected: string[] | undefined
      try {
        if (bookMoves.length) {
          // Первый ход бота всегда по курсу, иначе дебют может просто не возникнуть.
          if (botMovesSoFar > 0 && Math.random() < BEHAVIOURS[game.behaviour].chance) {
            const res = await askBot({ kind: 'deviate', startFen: START_FEN, moves: ucis, level: game.level, exclude: bookMoves.map((m) => m.uci) })
            if (res.move) {
              uci = res.move
              tag = 'deviation'
              expected = bookMoves.map((m) => m.san)
            }
          }
          if (!uci) {
            uci = chooseBookMove(bookMoves, game.level).uci
            tag = 'book'
          }
        } else {
          uci = (await askBot({ kind: 'move', startFen: START_FEN, moves: ucis, level: game.level })).move
        }
      } catch {
        if (!cancelled) setEngineError(true)
        return
      }
      const wait = settings.opponentDelay + 200 - (performance.now() - started)
      if (wait > 0) await sleep(wait)
      if (cancelled || !uci) return
      const next = commitMove(game.id, ply, uci, tag, expected)
      if (!next) return
      setEngineError(false)
      const san = next.moves[ply].san
      const label = moveLabel(ply, san)
      if (tag === 'deviation') {
        setBotNotice({
          tone: 'warn',
          text: `Соперник свернул с теории: ${label}. В курсе здесь разбирается ${expected!.map((s) => moveLabel(ply, s)).join(' или ')}. Дальше думайте сами — применяйте идеи дебюта.`,
        })
      } else if (tag === 'book') {
        const comment = bookMoves.find((m) => m.uci === uci)?.comment
        const nextEntry = book?.get(positionKey(replay(next.moves).fen()))
        const lineOver = !next.result && !nextEntry?.user.length
        setBotNotice(
          comment || lineOver
            ? {
                tone: lineOver ? 'ok' : 'info',
                text: `${comment ? `${label} — ${comment}` : label}${lineOver ? ' Линия курса закончилась — дальше играйте сами.' : ''}`,
              }
            : null,
        )
      } else if (hadBook && !hadFreeBot) {
        setBotNotice({ tone: 'info', text: `${label}. Позиция вне курса — играйте по идеям дебюта.` })
      } else {
        setBotNotice(null)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
    // Перезапуск только при новом ходе или новой партии.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, ply, over])

  const handleMove = (m: BoardMove): boolean => {
    if (!userTurn) return false
    let san: string
    let uci: string
    try {
      const mv = replay(game.moves).move({ from: m.from, to: m.to, promotion: m.promotion })
      san = mv.san
      uci = mv.from + mv.to + (mv.promotion ?? '')
    } catch {
      return false
    }
    const userBook = entry?.user ?? []
    let tag: MoveTag = 'free'
    let expected: string[] | undefined
    if (userBook.length) {
      if (userBook.some((b) => b.san === san)) tag = 'book'
      else {
        tag = 'mistake'
        expected = userBook.map((b) => b.san)
      }
    }
    const next = commitMove(game.id, ply, uci, tag, expected)
    if (!next) return false
    setHint(null)
    setBotNotice(null)
    if (tag === 'mistake') {
      setUserNotice({
        tone: 'bad',
        text: `По курсу здесь играют ${expected!.map((s) => moveLabel(ply, s)).join(' или ')}. Ваш ход ${ruSan(san)} уводит из теории.`,
        undo: !next.result,
      })
    } else if (tag === 'book') {
      const comment = userBook.find((b) => b.san === san)?.comment
      const nextEntry = book?.get(positionKey(replay(next.moves).fen()))
      const lineOver = !next.result && !nextEntry?.opponent.length
      setUserNotice({
        tone: 'ok',
        text: `Верно, это ход из курса.${comment ? ` ${comment}` : ''}${lineOver ? ' Линия курса закончилась — дальше играйте сами.' : ''}`,
      })
    } else {
      setUserNotice(null)
    }
    return true
  }

  const hasUserMove = game.moves.some((_, i) => moveColor(i) === game.color)

  const undo = () => {
    botGameStore.set((g) => {
      if (!g || g.id !== game.id || g.result) return g
      const moves = [...g.moves]
      while (moves.length && moveColor(moves.length - 1) !== g.color) moves.pop()
      moves.pop()
      return { ...g, moves }
    })
    setUserNotice(null)
    setBotNotice(null)
    setHint(null)
  }

  const resign = () => {
    let done = null as BotGame | null
    botGameStore.set((g) => {
      if (!g || g.id !== game.id || g.result) return g
      done = { ...g, result: { winner: g.color === 'w' ? 'b' : 'w', reason: 'Вы сдались' } }
      return done
    })
    if (done) recordResult(done)
  }

  const newGame = () => botGameStore.set({ ...game, id: Date.now(), moves: [], hints: 0, result: null })

  const showHint = async () => {
    if (!userTurn || hintBusy) return
    botGameStore.set((g) => (g && g.id === game.id ? { ...g, hints: g.hints + 1 } : g))
    const fromBook = entry?.user[0]
    if (fromBook) {
      setHint({ ply, uci: fromBook.uci, text: `По курсу: ${moveLabel(ply, fromBook.san)}${fromBook.comment ? ` — ${fromBook.comment}` : ''}` })
      return
    }
    setHintBusy(true)
    try {
      const res = await askBot({ kind: 'best', startFen: START_FEN, moves: ucis, timeMs: 900 })
      const san = res.move ? uciToSan(fen, res.move) : null
      if (res.move && san && botGameStore.get()?.moves.length === ply) setHint({ ply, uci: res.move, text: `Движок советует: ${moveLabel(ply, san)}` })
    } catch {
      setEngineError(true)
    } finally {
      setHintBusy(false)
    }
  }

  const arrows: Arrow[] = activeHint ? [{ startSquare: activeHint.uci.slice(0, 2), endSquare: activeHint.uci.slice(2, 4), color: HINT_ARROW }] : []
  const last = game.moves[ply - 1]
  const summary = theorySummary(game)
  const botName = `Бот · ${BOT_LEVELS[game.level].name}`
  const userIsBottom = orientation === (game.color === 'w' ? 'white' : 'black')

  let status: ReactNode
  if (game.result) {
    const won = game.result.winner === game.color
    status = (
      <span className={game.result.winner === null ? 'text-fg' : won ? 'text-accent' : 'text-danger'}>
        {game.result.winner === null ? 'Ничья' : won ? 'Победа!' : 'Поражение'}
        <span className="font-normal text-muted"> · {game.result.reason}</span>
      </span>
    )
  } else if (userTurn) {
    status = entry?.user.length ? 'Ваш ход — позиция из курса' : 'Ваш ход'
  } else status = 'Бот думает…'

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Игра с ботом"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="info">{course ? course.name : game.courseId ? 'Курс удалён' : 'Свободная партия'}</Badge>
            <Badge tone={game.color === 'w' ? 'white' : 'black'}>Вы за {game.color === 'w' ? 'белых' : 'чёрных'}</Badge>
            <Badge>{BOT_LEVELS[game.level].name}</Badge>
            {course && <span className="text-sm text-faint">{BEHAVIOURS[game.behaviour].name.toLowerCase()}</span>}
          </span>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <ChessBoard
            id="bot-game"
            fen={fen}
            orientation={orientation}
            interactive={userTurn}
            movableColor={game.color}
            onMove={handleMove}
            lastMove={last ? { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) } : null}
            arrows={arrows}
            showMaterial
            materialLabels={userIsBottom ? { top: botName, bottom: 'Вы' } : { top: 'Вы', bottom: botName }}
          />
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          <Card className="flex min-h-[15.5rem] flex-col p-4">
            <div className="flex items-center gap-2 font-semibold">
              <span className={`size-2.5 shrink-0 rounded-full ${over ? 'bg-faint' : userTurn ? 'bg-accent' : 'animate-pulse bg-faint'}`} />
              {status}
            </div>
            {course && (
              <p className="mt-1 text-sm text-muted tabular">
                По теории: {summary.bookMoves} {summary.mistakes.length > 0 && <span className="text-danger">· ошибок: {summary.mistakes.length}</span>}
                {game.hints > 0 && <span className="text-faint"> · подсказок: {game.hints}</span>}
              </p>
            )}

            <div className="mt-2 flex flex-col gap-2">
              {game.result ? (
                <GameReport game={game} course={course} />
              ) : (
                <>
                  {activeHint && <p className="rounded-lg bg-info/12 px-3 py-2 text-sm leading-relaxed text-info">{activeHint.text}</p>}
                  {userNotice && (
                    <div className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${NOTICE_TONE[userNotice.tone]}`}>
                      {userNotice.text}
                      {userNotice.undo && hasUserMove && (
                        <button type="button" onClick={undo} className="ml-1 font-semibold underline underline-offset-2 hover:no-underline">
                          Взять ход назад
                        </button>
                      )}
                    </div>
                  )}
                  {botNotice && <p className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${NOTICE_TONE[botNotice.tone]}`}>{botNotice.text}</p>}
                  {engineError && (
                    <p className="rounded-lg bg-danger/12 px-3 py-2 text-sm text-[#f08a80]">Движок не ответил. Возьмите ход назад или начните новую партию.</p>
                  )}
                </>
              )}
            </div>

            <div className="mt-auto flex flex-wrap gap-2 pt-3">
              {game.result ? (
                <>
                  <Button size="sm" variant="primary" onClick={newGame}>
                    <RotateIcon size={16} /> Ещё партия
                  </Button>
                  {course && (
                    <ButtonLink size="sm" to={`/openings/${course.id}`}>
                      К курсу
                    </ButtonLink>
                  )}
                </>
              ) : (
                <>
                  <Button size="sm" onClick={showHint} disabled={!userTurn || hintBusy || !!activeHint}>
                    <LightbulbIcon size={16} /> {hintBusy ? 'Думаю…' : 'Подсказка'}
                  </Button>
                  <Button size="sm" onClick={undo} disabled={!hasUserMove}>
                    <UndoIcon size={16} /> Ход назад
                  </Button>
                  <ConfirmButton size="sm" variant="ghost" onConfirm={resign} disabled={!hasUserMove} confirmLabel="Сдаться?">
                    <FlagIcon size={16} /> Сдаться
                  </ConfirmButton>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} aria-label="Перевернуть доску">
                <FlipIcon size={16} />
              </Button>
              <Button size="sm" variant="ghost" onClick={onSetup} aria-label="Новая партия с другими настройками" title="Новая партия с другими настройками">
                <SettingsIcon size={16} />
              </Button>
            </div>
          </Card>

          <Card className="p-2">
            <MoveList
              moves={game.moves.map((m, i) => ({ san: m.san, color: moveColor(i), mark: MARK[m.tag] }))}
              ply={ply}
              className="h-56"
            />
            {course && (
              <div className="border-t border-line pt-2">
                <MoveMarkLegend marks={['book', 'mistake', 'deviation']} />
              </div>
            )}
          </Card>

          {course?.ideas && course.ideas.length > 0 && (
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <LightbulbIcon size={16} className="text-warn" /> Идеи дебюта
              </div>
              <ul className="space-y-1.5">
                {course.ideas.map((idea) => (
                  <li key={idea} className="flex gap-2 text-sm text-muted">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-faint" />
                    {idea}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  )
}

/** Итог партии по теории курса. */
function GameReport({ game, course }: { game: BotGame; course: Course | null }) {
  if (!course) return <p className="text-sm text-muted">Сыграйте ещё одну партию или выберите дебют, чтобы потренировать теорию.</p>
  const s = theorySummary(game)
  const items: ReactNode[] = [
    <>
      Ходов по теории: <span className="text-fg tabular">{s.bookMoves}</span>
    </>,
  ]
  for (const { index, move } of s.mistakes.slice(0, 3)) {
    items.push(
      <span className="text-[#f08a80]">
        {moveLabel(index, move.san)} — в курсе {move.expected?.map((x) => ruSan(x)).join(' или ')}
      </span>,
    )
  }
  if (s.deviation >= 0) items.push(<>Соперник свернул с теории ходом {moveLabel(s.deviation, game.moves[s.deviation].san)}</>)
  else if (s.lastBook >= 0) items.push(<>Теория курса закончилась после хода {moveLabel(s.lastBook, game.moves[s.lastBook].san)}</>)
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      {s.mistakes.length > 0 && <p className="mt-2 text-faint">Повторите эти линии в режиме тренировки курса.</p>}
    </div>
  )
}
