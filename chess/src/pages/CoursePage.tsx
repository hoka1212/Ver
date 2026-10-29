import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ChessBoard } from '../components/ChessBoard'
import { BotIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, EditIcon, EyeIcon, LightbulbIcon, PlayIcon, TrashIcon } from '../components/icons'
import { MoveList } from '../components/MoveList'
import { Badge, Button, ButtonLink, Card, ConfirmButton, PageHeader, ProgressBar, Sheet } from '../components/ui'
import { useCourse } from '../data'
import { findConflicts, KIND_LABEL, KIND_TONE, LEVEL_LABEL, sideToColor, type CourseLine } from '../lib/courses'
import { linesToPgn, moveLabel, ruSan } from '../lib/pgn'
import { formatDue, isDue, lineMastery, lineStatus, STATUS_LABEL, type LineStatus } from '../lib/srs'
import { useStore } from '../lib/storage'
import { useMediaQuery } from '../lib/useMediaQuery'
import { progressStore, repertoireStore } from '../store'
import { startBotGame } from '../lib/botGame'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const STATUS_TONE: Record<LineStatus, 'neutral' | 'info' | 'warn' | 'accent'> = {
  new: 'neutral',
  learning: 'info',
  review: 'warn',
  mastered: 'accent',
}

function download(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/x-chess-pgn' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function CoursePage() {
  const { courseId } = useParams()
  const course = useCourse(courseId)
  const progress = useStore(progressStore)
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<{ lineId: string; ply: number } | null>(null)
  // На телефоне линия открывается в нижней панели поверх списка — страница не прыгает к доске.
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [sheetOpen, setSheetOpen] = useState(false)
  const closeSheet = useCallback(() => setSheetOpen(false), [])

  const selected: CourseLine | undefined = course?.lines.find((l) => l.id === selectedId) ?? course?.lines[0]
  // По умолчанию показываем конечную позицию выбранной линии.
  const ply = selected ? (view?.lineId === selected.id ? view.ply : selected.moves.length) : 0
  const setPly = (next: number | ((p: number) => number)) => {
    if (!selected) return
    setView({ lineId: selected.id, ply: typeof next === 'function' ? next(ply) : next })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1))
      if (e.key === 'ArrowRight') setPly((p) => Math.min(selected.moves.length, p + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const conflicts = useMemo(() => (course?.custom ? findConflicts(course) : []), [course])

  if (!course) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Курс не найден" back="/openings" />
        <ButtonLink to="/openings">К списку дебютов</ButtonLink>
      </div>
    )
  }

  const mastery = course.lines.length ? course.lines.reduce((s, l) => s + lineMastery(progress[l.key]), 0) / course.lines.length : 0
  const due = course.lines.filter((l) => isDue(progress[l.key])).length
  const newCount = course.lines.filter((l) => lineStatus(progress[l.key]) === 'new').length
  const fen = selected && ply > 0 ? selected.moves[ply - 1].fenAfter : START_FEN
  const lastMove = selected && ply > 0 ? selected.moves[ply - 1] : null
  const comment = lastMove?.comment

  const remove = () => {
    repertoireStore.set((list) => list.filter((c) => c.id !== course.id))
    progressStore.set((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith(`${course.id}/`))))
    navigate('/openings')
  }

  const preview = selected && (
    <>
      <ChessBoard
        id="preview"
        fen={fen}
        orientation={course.side}
        interactive={false}
        lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
        showMaterial
        materialLabels={{ top: 'Соперник', bottom: 'Вы' }}
      />
      <div className="mt-3 flex items-center justify-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => setPly(0)} disabled={ply === 0}>
          В начало
        </Button>
        <Button size="sm" onClick={() => setPly((p) => Math.max(0, p - 1))} disabled={ply === 0} aria-label="Ход назад">
          <ChevronLeftIcon size={18} />
        </Button>
        <Button size="sm" onClick={() => setPly((p) => Math.min(selected.moves.length, p + 1))} disabled={ply >= selected.moves.length} aria-label="Ход вперёд">
          <ChevronRightIcon size={18} />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPly(selected.moves.length)} disabled={ply >= selected.moves.length}>
          В конец
        </Button>
      </div>
      <div className="scrollbar-thin mt-3 h-[6.75rem] overflow-y-auto rounded-lg bg-surface-2 px-3 py-2 text-sm leading-relaxed text-fg/90">
        {comment ? (
          <>
            <span className="font-semibold">{moveLabel(ply - 1, lastMove!.san)}</span> — {comment}
          </>
        ) : (
          <span className="text-faint">{ply === 0 ? 'Начальная позиция. Листайте ходы стрелками.' : 'Без комментария.'}</span>
        )}
      </div>
      <MoveList moves={selected.moves} ply={ply} onSelect={setPly} className="mt-3 h-56" />
    </>
  )

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back="/openings"
        title={course.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={course.side}>Играем за {course.side === 'white' ? 'белых' : 'чёрных'}</Badge>
            <Badge tone={KIND_TONE[course.kind]}>{KIND_LABEL[course.kind]}</Badge>
            {!course.custom && <Badge>{LEVEL_LABEL[course.level]}</Badge>}
            {course.eco && <span className="text-sm text-faint">ECO {course.eco}</span>}
          </span>
        }
        actions={
          <>
            {!course.custom && (
              <ButtonLink to={`/openings/new?from=${course.id}`} size="sm">
                <EditIcon size={16} /> Копия для правки
              </ButtonLink>
            )}
            {course.custom && (
              <>
                <ButtonLink to={`/openings/${course.id}/edit`} size="sm">
                  <EditIcon size={16} /> Изменить
                </ButtonLink>
                <ConfirmButton size="sm" variant="danger" onConfirm={remove} confirmLabel="Удалить курс навсегда?">
                  <TrashIcon size={16} /> Удалить
                </ConfirmButton>
              </>
            )}
            <Button size="sm" onClick={() => download(`${course.id}.pgn`, linesToPgn(course.name, course.lines))}>
              <DownloadIcon size={16} /> PGN
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            {course.description && <p className="text-[15px] leading-relaxed text-fg/90">{course.description}</p>}
            {course.ideas && course.ideas.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {course.ideas.map((idea) => (
                  <li key={idea} className="flex gap-2 text-sm text-muted">
                    <LightbulbIcon size={16} className="mt-0.5 shrink-0 text-warn" />
                    {idea}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-40 flex-1">
                <div className="mb-1 flex justify-between text-xs text-muted">
                  <span>Освоение курса</span>
                  <span className="tabular">{Math.round(mastery * 100)}%</span>
                </div>
                <ProgressBar value={mastery} />
              </div>
              <div className="flex flex-wrap gap-2">
                <ButtonLink to={`/openings/${course.id}/train?mode=learn`} variant={newCount ? 'primary' : 'secondary'}>
                  <EyeIcon size={16} /> Изучать{newCount ? ` (${newCount} нов.)` : ''}
                </ButtonLink>
                <ButtonLink to={`/openings/${course.id}/train?mode=practice`} variant={newCount ? 'secondary' : 'primary'}>
                  <PlayIcon size={16} /> Тренировать{due ? ` (${due})` : ''}
                </ButtonLink>
                <Button
                  onClick={() => {
                    startBotGame(course.id, sideToColor(course.side))
                    navigate('/play')
                  }}
                >
                  <BotIcon size={16} /> Играть с ботом
                </Button>
              </div>
            </div>
          </Card>

          {course.errors.length > 0 && (
            <Card className="border-danger/40">
              <h3 className="font-semibold text-danger">Ошибки в линиях</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                {course.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Card>
          )}
          {conflicts.length > 0 && (
            <Card className="border-warn/40">
              <h3 className="font-semibold text-warn">Противоречия в репертуаре</h3>
              <p className="text-sm text-muted">В одной и той же позиции у вас записаны разные ходы — тренировка примет любой из них.</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                {conflicts.slice(0, 5).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-0 sm:p-0">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-semibold">Линии ({course.lines.length})</h2>
              <span className="text-xs text-faint">нажмите на линию, чтобы посмотреть</span>
            </div>
            <ul className="divide-y divide-line">
              {course.lines.map((line) => {
                const p = progress[line.key]
                const status = lineStatus(p)
                const active = selected?.id === line.id
                return (
                  <li key={line.id} className={`flex items-center gap-3 px-4 py-3 transition ${active ? 'bg-surface-2' : 'hover:bg-surface-2/60'}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(line.id)
                        if (!isDesktop) setSheetOpen(true)
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-medium ${active ? 'text-accent-strong' : ''}`}>{line.name}</span>
                        {line.trap && <Badge tone="danger">Ловушка</Badge>}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-xs text-faint">
                        {line.moves
                          .slice(0, 12)
                          .map((m, i) => (i % 2 === 0 ? moveLabel(i, m.san) : ruSan(m.san)))
                          .join(' ')}
                        {line.moves.length > 12 ? ' …' : ''}
                      </div>
                    </button>
                    <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                      <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                      {p && p.level > 0 && <span className="text-[11px] text-faint">повтор {formatDue(p.due)}</span>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Link
                        to={`/openings/${course.id}/train?mode=learn&line=${line.id}`}
                        className="rounded-lg p-2 text-muted transition hover:bg-surface-3 hover:text-fg"
                        title="Изучать с подсказками"
                      >
                        <EyeIcon size={18} />
                      </Link>
                      <Link
                        to={`/openings/${course.id}/train?mode=practice&line=${line.id}`}
                        className="rounded-lg p-2 text-accent transition hover:bg-surface-3"
                        title="Тренировать"
                      >
                        <PlayIcon size={18} />
                      </Link>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>

        {selected && isDesktop && (
          <div className="sticky top-6 self-start">
            <Card className="p-3 sm:p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="truncate font-semibold">{selected.name}</h3>
                <span className="shrink-0 text-xs text-faint">просмотр</span>
              </div>
              {preview}
            </Card>
          </div>
        )}
        {selected && !isDesktop && sheetOpen && (
          <Sheet title={selected.name} onClose={closeSheet}>
            {preview}
          </Sheet>
        )}
      </div>
    </div>
  )
}
