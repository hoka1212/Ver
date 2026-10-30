import { Chess } from 'chess.js'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { Arrow } from 'react-chessboard'
import { useNavigate } from 'react-router'
import { ChessBoard, type BoardMove } from '../components/ChessBoard'
import { BotIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, FlipIcon, PlayIcon, RotateIcon } from '../components/icons'
import { MoveList } from '../components/MoveList'
import { Badge, Button, ButtonLink, Card, ConfirmButton, PageHeader, ProgressBar } from '../components/ui'
import { botGameInProgress, startBotGame } from '../lib/botGame'
import { sideToColor } from '../lib/courses'
import { moveLabel, ruSan } from '../lib/pgn'
import { lineStatus, markStudied } from '../lib/srs'
import { useStore } from '../lib/storage'
import { branchTitle, buildTree, describeNode, pluralRu, trainBase, turnAt, type TrainLine, type TrainSource, type TreeNode } from '../lib/tree'
import { botGameStore, logActivity, progressStore, settingsStore } from '../store'

const USER_ARROW = 'rgba(129, 182, 76, 0.9)'
const OPPONENT_ARROW = 'rgba(232, 178, 58, 0.55)'
const OPPONENT_ARROW_HOVER = 'rgba(232, 178, 58, 0.95)'

/**
 * Изучение дебюта деревом: все варианты курса (или всего репертуара) в одном месте.
 * На ходу соперника видно, как он может сыграть, к какому варианту это ведёт и что отвечать;
 * название дебюта и вариации обновляется сразу после каждого хода. Ходы можно листать и менять.
 */
export function TreeTrainer({ source, focusKey }: { source: TrainSource; focusKey: string | null }) {
  const tree = useMemo(() => buildTree(source.lines), [source])
  const progress = useStore(progressStore)
  const settings = useStore(settingsStore)
  const botGame = useStore(botGameStore)
  const navigate = useNavigate()
  const multi = !source.course
  const userColor = sideToColor(source.side)

  const [path, setPath] = useState<TreeNode[]>(() => [tree])
  const [ply, setPly] = useState(0)
  // Линия, по которой соперник ходит сам (выбранная на странице курса или «следующая новая»).
  const [focus, setFocus] = useState<TrainLine | undefined>(() => source.lines.find((l) => l.key === focusKey))
  const [orientation, setOrientation] = useState<'white' | 'black'>(source.side)
  const [notice, setNotice] = useState<{ ply: number; text: string } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [hover, setHover] = useState<TreeNode | null>(null)

  const node = path[ply]
  const label = describeNode(node)
  const userTurn = turnAt(node) === userColor
  const options = node.children
  const atLive = ply === path.length - 1
  const isNew = (l: TrainLine) => lineStatus(progress[l.key]) === 'new'
  const studied = source.lines.filter((l) => !isNew(l)).length
  const activeNotice = notice && notice.ply === ply ? notice : null

  const go = (child: TreeNode) => {
    setPath(path[ply + 1] === child ? path : [...path.slice(0, ply + 1), child])
    setPly(ply + 1)
    setNotice(null)
    setHover(null)
    if (child.children.length === 0) {
      // Линия пройдена до конца — отмечаем её изученной.
      const finished = child.lines.filter((l) => l.moves.length === child.ply)
      const fresh = finished.filter((l) => isNew(l))
      if (finished.length) {
        progressStore.set((p) => {
          const next = { ...p }
          for (const l of finished) next[l.key] = markStudied(p[l.key])
          return next
        })
      }
      if (fresh.length) logActivity('lines', fresh.length)
    }
  }

  // Соперник ходит сам, если вариант один или линия выбрана заранее; на развилке — ждём выбора.
  useEffect(() => {
    if (!atLive || userTurn || !options.length) return
    const choice = (focus && options.find((c) => c.lines.includes(focus))) || (options.length === 1 ? options[0] : undefined)
    if (!choice) return
    const t = window.setTimeout(() => go(choice), settings.opponentDelay + (ply === 0 ? 300 : 0))
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, atLive, focus])

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 500)
    return () => window.clearTimeout(t)
  }, [flash])

  // Листание ходов стрелками клавиатуры.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1))
      else if (e.key === 'ArrowRight') setPly((p) => Math.min(path.length - 1, p + 1))
      else if (e.key === 'Home') setPly(0)
      else if (e.key === 'End') setPly(path.length - 1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [path.length])

  const handleMove = (m: BoardMove): boolean => {
    if (!options.length) return false
    let san: string
    try {
      san = new Chess(node.fen).move({ from: m.from, to: m.to, promotion: m.promotion }).san
    } catch {
      return false
    }
    const child = options.find((c) => c.move!.san === san)
    if (child) {
      go(child)
      return true
    }
    setFlash(m.to)
    const known = options.map((o) => moveLabel(ply, o.move!.san)).join(', ')
    setNotice({
      ply,
      text: userTurn ? `${ruSan(san)} — этого хода нет в курсе. Здесь играют: ${known}.` : `${ruSan(san)} — такой ответ соперника в курсе не разбирается. Варианты: ${known}.`,
    })
    return false
  }

  /** Случайный ответ соперника: сначала ветки с ещё не изученными линиями. */
  const randomReply = () => {
    const fresh = options.filter((c) => c.lines.some(isNew))
    const pool = fresh.length ? fresh : options
    go(pool[Math.floor(Math.random() * pool.length)])
  }

  /** Ближайшая развилка позади (где у кого-то было несколько ходов). */
  const forkPly = (() => {
    for (let p = ply - 1; p >= 0; p--) if (path[p].children.length > 1) return p
    return 0
  })()

  /** Следующая неизученная линия: возвращаемся к развилке, откуда она начинается, и соперник ведёт по ней. */
  const nextNew = source.lines.find(isNew)
  const goToNextNew = () => {
    if (!nextNew) return
    let common = 0
    while (common + 1 < path.length && common < nextNew.moves.length && path[common + 1].move!.san === nextNew.moves[common].san) common++
    setPath(path.slice(0, common + 1))
    setPly(common)
    setFocus(nextNew)
    setNotice(null)
  }

  const arrows: Arrow[] = useMemo(() => {
    if (!options.length) return []
    if (userTurn) return options.map((c) => ({ startSquare: c.move!.from, endSquare: c.move!.to, color: USER_ARROW }))
    if (options.length > 6 && !hover) return []
    return options
      .filter((c) => options.length <= 6 || c === hover)
      .map((c) => ({ startSquare: c.move!.from, endSquare: c.move!.to, color: c === hover ? OPPONENT_ARROW_HOVER : OPPONENT_ARROW }))
  }, [options, userTurn, hover])

  const highlights = useMemo(() => {
    const h: Record<string, CSSProperties> = {}
    if (flash) h[flash] = { backgroundColor: 'rgba(226, 87, 76, 0.75)' }
    return h
  }, [flash])

  const playBot = () => {
    startBotGame(source.id, userColor)
    navigate('/play')
  }

  const last = node.move
  const finishedHere = options.length === 0 ? node.lines.filter((l) => l.moves.length === node.ply) : []
  const heading = label.opening ?? (ply === 0 ? source.name : 'Дебют ещё не определился')
  const subheading = label.opening
    ? (label.variation ?? `${label.lineCount} ${pluralRu(label.lineCount, 'линия', 'линии', 'линий')} впереди`)
    : `Возможно: ${label.openings.slice(0, 4).join(', ')}${label.openings.length > 4 ? ` и ещё ${label.openings.length - 4}` : ''}`

  const status = options.length === 0 ? 'Линия пройдена' : userTurn ? 'Ваш ход по курсу' : 'Соперник может сыграть'

  return (
    <div className="mx-auto max-w-6xl">
      <div className="hidden lg:block">
        <PageHeader
          back={source.home}
          title={source.name}
          subtitle={
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone="info">Дерево вариантов</Badge>
              <Badge tone={source.side}>Вы за {source.side === 'white' ? 'белых' : 'чёрных'}</Badge>
            </span>
          }
          actions={
            <>
              <ButtonLink size="sm" to={`${trainBase(source)}?mode=practice`}>
                <PlayIcon size={16} /> Тренировать
              </ButtonLink>
              <ConfirmButton size="sm" onConfirm={playBot} skipConfirm={!botGameInProgress(botGame)} confirmLabel="Прервать текущую партию?">
                <BotIcon size={16} /> Играть с ботом
              </ConfirmButton>
            </>
          }
        />
      </div>
      {/* Телефон: над доской — где мы в дебюте и что делать. */}
      <div className="lg:hidden">
        <h1 className="sr-only">{source.name}</h1>
        <div className="mb-2 flex h-[4.25rem] flex-col justify-center rounded-xl border border-line bg-surface px-3">
          <div className="truncate text-sm font-semibold">{heading}</div>
          <div className="truncate text-xs text-muted">{subheading}</div>
          <div className={`truncate text-xs font-semibold ${options.length === 0 ? 'text-accent' : userTurn ? 'text-accent' : 'text-warn'}`}>
            {status}
            {options.length > 0 && `: ${options.map((o) => moveLabel(ply, o.move!.san)).join(userTurn ? ' или ' : ', ')}`}
            {!userTurn && options.length > 1 && ' — выберите ниже или на доске'}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <ChessBoard
            id="tree"
            fen={node.fen}
            orientation={orientation}
            interactive={options.length > 0}
            movableColor={turnAt(node)}
            onMove={handleMove}
            lastMove={last ? { from: last.from, to: last.to } : null}
            arrows={arrows}
            highlights={highlights}
            showMaterial
            materialLabels={orientation === source.side ? { top: 'Соперник', bottom: 'Вы' } : { top: 'Вы', bottom: 'Соперник' }}
            columnClassName="board-column board-column-play"
          />
          <div className="mt-2 flex items-center justify-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPly(0)} disabled={ply === 0}>
              В начало
            </Button>
            <Button size="sm" onClick={() => setPly(ply - 1)} disabled={ply === 0} aria-label="Ход назад">
              <ChevronLeftIcon size={18} />
            </Button>
            <Button size="sm" onClick={() => setPly(ply + 1)} disabled={atLive} aria-label="Ход вперёд">
              <ChevronRightIcon size={18} />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPly(path.length - 1)} disabled={atLive}>
              В конец
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} aria-label="Перевернуть доску">
              <FlipIcon size={16} />
            </Button>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          <Card className="hidden p-4 lg:block">
            <div className="text-xs uppercase tracking-wider text-faint">{label.opening ? 'Дебют' : 'Позиция'}</div>
            <div className="truncate text-lg font-semibold leading-snug" title={heading}>
              {heading}
            </div>
            <div className="line-clamp-2 min-h-10 text-sm text-muted">{subheading}</div>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>Изучено линий</span>
                <span className="tabular">
                  {studied} из {source.lines.length}
                </span>
              </div>
              <ProgressBar value={studied / Math.max(1, source.lines.length)} />
            </div>
          </Card>

          <Card className="flex flex-col p-4">
            <div className="flex items-center gap-2 font-semibold">
              <span className={`size-2.5 shrink-0 rounded-full ${options.length === 0 ? 'bg-accent' : userTurn ? 'bg-accent' : 'bg-warn'}`} />
              {status}
            </div>
            {/* Фиксированная высота: смена вариантов не двигает остальное. */}
            <div className="scrollbar-thin mt-2 flex h-[17rem] flex-col gap-2 overflow-y-auto overscroll-contain pr-1" aria-live="polite">
              {last?.comment && (
                <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm leading-relaxed text-fg/90">
                  <span className="font-semibold">{moveLabel(ply - 1, last.san)}</span> — {last.comment}
                </p>
              )}
              {activeNotice && <p className="rounded-lg bg-danger/12 px-3 py-2 text-sm leading-relaxed text-[#f08a80]">{activeNotice.text}</p>}

              {options.length === 0 ? (
                <div className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-fg/90">
                  <div className="flex items-center gap-2 font-semibold text-accent-strong">
                    <CheckIcon size={16} /> {finishedHere.map((l) => l.name).join(' · ') || 'Конец линии'}
                  </div>
                  <p className="mt-1 text-muted">Линия отмечена изученной. Вернитесь к развилке и посмотрите другой вариант соперника.</p>
                </div>
              ) : (
                options.map((child) => (
                  <OptionRow
                    key={child.move!.san}
                    child={child}
                    ply={ply}
                    userTurn={userTurn}
                    multi={multi}
                    hasNew={child.lines.some(isNew)}
                    onPick={() => go(child)}
                    onHover={setHover}
                  />
                ))
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-3">
              {!userTurn && options.length > 1 && (
                <Button size="sm" onClick={randomReply}>
                  <RotateIcon size={16} /> Случайный ответ
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setPly(forkPly)} disabled={ply === 0}>
                К развилке
              </Button>
              {nextNew ? (
                <Button size="sm" variant={options.length === 0 ? 'primary' : 'ghost'} onClick={goToNextNew}>
                  Следующая новая линия
                </Button>
              ) : (
                <ButtonLink size="sm" variant={options.length === 0 ? 'primary' : 'ghost'} to={`${trainBase(source)}?mode=practice`}>
                  <PlayIcon size={16} /> Все линии изучены — тренировать
                </ButtonLink>
              )}
            </div>
          </Card>

          <Card className="p-2">
            <MoveList moves={path.slice(1).map((n) => ({ san: n.move!.san, color: turnAt(n.parent!) }))} ply={ply} onSelect={setPly} className="h-40" />
            {!atLive && <p className="border-t border-line px-2 pt-2 text-xs text-faint">Сделайте другой ход здесь, чтобы перейти в другую ветку.</p>}
          </Card>

          <div className="flex flex-wrap gap-2 lg:hidden">
            <ButtonLink size="sm" to={source.home}>
              Назад
            </ButtonLink>
            <ButtonLink size="sm" to={`${trainBase(source)}?mode=practice`}>
              <PlayIcon size={16} /> Тренировать
            </ButtonLink>
            <ConfirmButton size="sm" onConfirm={playBot} skipConfirm={!botGameInProgress(botGame)} confirmLabel="Прервать текущую партию?">
              <BotIcon size={16} /> Играть с ботом
            </ConfirmButton>
          </div>
        </aside>
      </div>
    </div>
  )
}

function OptionRow({
  child,
  ply,
  userTurn,
  multi,
  hasNew,
  onPick,
  onHover,
}: {
  child: TreeNode
  ply: number
  userTurn: boolean
  multi: boolean
  hasNew: boolean
  onPick: () => void
  onHover: (n: TreeNode | null) => void
}) {
  const { title, detail } = branchTitle(child, multi)
  const answers = child.children.map((c) => moveLabel(ply + 1, c.move!.san))
  return (
    <button
      type="button"
      onClick={onPick}
      onPointerEnter={() => onHover(child)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(child)}
      onBlur={() => onHover(null)}
      className={`group flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
        userTurn ? 'border-accent/40 bg-accent/8 hover:bg-accent/15' : 'border-line bg-surface-2 hover:bg-surface-3'
      }`}
    >
      <span className={`w-16 shrink-0 font-mono text-[15px] font-bold ${userTurn ? 'text-accent-strong' : 'text-warn'}`}>{moveLabel(ply, child.move!.san)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{title}</span>
          {hasNew && <Badge tone="info">новое</Badge>}
        </span>
        {!userTurn && answers.length > 0 && <span className="block text-xs text-accent-strong">ответ: {answers.join(' или ')}</span>}
        {userTurn && child.move!.comment && <span className="line-clamp-2 text-xs text-muted">{child.move!.comment}</span>}
        {detail && <span className="line-clamp-1 text-xs text-faint">{detail}</span>}
      </span>
    </button>
  )
}
