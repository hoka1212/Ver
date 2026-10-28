import { Chess } from 'chess.js'
import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ChessBoard, type BoardMove } from '../components/ChessBoard'
import { FlipIcon, PlusIcon, RotateIcon, TrashIcon, UndoIcon, UploadIcon } from '../components/icons'
import { MoveList } from '../components/MoveList'
import { Badge, Button, Card, ConfirmButton, PageHeader, Segmented } from '../components/ui'
import { useCourses } from '../data'
import { compileCourse, findConflicts, type CourseDef, type CourseKind, type Side } from '../lib/courses'
import { importPgn, moveLabel, movesToPgn, ruSan } from '../lib/pgn'
import { progressStore, repertoireStore } from '../store'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

interface DraftMove {
  san: string
  comment?: string
}

interface DraftLine {
  id: string
  name: string
  moves: DraftMove[]
}

let uid = 0
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(uid++).toString(36)}`

/** Позиции после каждого хода — для доски и подписи ходов. */
function replay(moves: DraftMove[]) {
  const chess = new Chess()
  const out: { san: string; color: 'w' | 'b'; from: string; to: string; fenAfter: string; comment?: string }[] = []
  for (const m of moves) {
    const r = chess.move(m.san)
    out.push({ san: r.san, color: r.color, from: r.from, to: r.to, fenAfter: chess.fen(), comment: m.comment })
  }
  return out
}

export function EditorPage() {
  const { courseId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const courses = useCourses()
  const editing = courseId ? courses.find((c) => c.id === courseId && c.custom) : undefined
  const template = !editing && params.get('from') ? courses.find((c) => c.id === params.get('from')) : undefined
  const source = editing ?? template

  const [name, setName] = useState(() => (editing ? editing.name : template ? `${template.name} (мой)` : ''))
  const [side, setSide] = useState<Side>(source?.side ?? 'white')
  const [kind, setKind] = useState<CourseKind>(source?.kind ?? 'gambit')
  const [description, setDescription] = useState(source?.description ?? '')
  const [lines, setLines] = useState<DraftLine[]>(
    () =>
      source?.lines.map((l) => ({
        id: editing ? l.id : newId('l'),
        name: l.name,
        moves: l.moves.map((m) => ({ san: m.san, comment: m.comment })),
      })) ?? [],
  )
  const [tab, setTab] = useState<'board' | 'pgn'>('board')
  const [saveError, setSaveError] = useState<string | null>(null)

  const conflicts = useMemo(() => {
    const def = toDef()
    return def.lines.length ? findConflicts(compileCourse(def)) : []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, side])

  function toDef(): CourseDef {
    const first = description.split(/(?<=[.!?])\s/)[0]
    return {
      id: editing?.id ?? newId('custom'),
      name: name.trim(),
      side,
      kind,
      level: 'intermediate',
      summary: first || `Мой курс: ${lines.length} лин.`,
      description: description.trim() || undefined,
      lines: lines.map((l) => ({ id: l.id, name: l.name.trim() || 'Линия', pgn: movesToPgn(l.moves) })),
      custom: true,
      createdAt: editing?.createdAt ?? Date.now(),
    }
  }

  const addLines = (incoming: { name: string; moves: DraftMove[] }[]) => {
    setLines((prev) => {
      const existing = new Set(prev.map((l) => l.moves.map((m) => m.san).join(' ')))
      const fresh = incoming
        .filter((l) => l.moves.length && !existing.has(l.moves.map((m) => m.san).join(' ')))
        .map((l) => ({ id: newId('l'), name: l.name, moves: l.moves }))
      return [...prev, ...fresh]
    })
  }

  const save = () => {
    if (!name.trim()) return setSaveError('Введите название курса.')
    if (lines.length === 0) return setSaveError('Добавьте хотя бы одну линию.')
    const def = toDef()
    repertoireStore.set((list) => (editing ? list.map((c) => (c.id === def.id ? def : c)) : [...list, def]))
    if (editing) {
      // Удаляем прогресс линий, которых больше нет.
      const keep = new Set(def.lines.map((l) => `${def.id}/${l.id}`))
      progressStore.set((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith(`${def.id}/`) || keep.has(k))))
    }
    navigate(`/openings/${def.id}`)
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={editing ? `/openings/${editing.id}` : '/openings'}
        title={editing ? 'Редактирование курса' : 'Новый курс'}
        subtitle="Импортируйте PGN (варианты станут отдельными линиями) или введите ходы на доске."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-sm text-muted">Название</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Например: Мой гамбит Эванса"
                  className="h-10 w-full rounded-lg border border-line bg-surface-2 px-3 outline-none placeholder:text-faint focus:border-accent"
                />
              </label>
              <div>
                <span className="mb-1.5 block text-sm text-muted">Я играю за</span>
                <Segmented<Side>
                  value={side}
                  onChange={setSide}
                  options={[
                    { value: 'white', label: 'Белых' },
                    { value: 'black', label: 'Чёрных' },
                  ]}
                />
              </div>
              <div>
                <span className="mb-1.5 block text-sm text-muted">Тип</span>
                <Segmented<CourseKind>
                  value={kind}
                  onChange={setKind}
                  options={[
                    { value: 'gambit', label: 'Гамбит' },
                    { value: 'opening', label: 'Дебют' },
                  ]}
                />
              </div>
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-sm text-muted">Описание (необязательно)</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 outline-none focus:border-accent"
                />
              </label>
            </div>
          </Card>

          <Card className="p-0 sm:p-0">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-semibold">Линии ({lines.length})</h2>
              {lines.length > 0 && (
                <ConfirmButton size="sm" variant="ghost" onConfirm={() => setLines([])} confirmLabel="Удалить все линии?">
                  Очистить
                </ConfirmButton>
              )}
            </div>
            {lines.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Пока пусто — добавьте линии справа.</p>
            ) : (
              <ul className="divide-y divide-line">
                {lines.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <input
                        value={l.name}
                        onChange={(e) => setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)))}
                        className="w-full rounded bg-transparent px-1 py-0.5 font-medium outline-none hover:bg-surface-2 focus:bg-surface-2"
                      />
                      <div className="truncate px-1 font-mono text-xs text-faint">
                        {l.moves.map((m, i) => (i % 2 === 0 ? moveLabel(i, m.san) : ruSan(m.san))).join(' ')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((x) => x.id !== l.id))}
                      className="rounded-lg p-2 text-muted hover:bg-danger/15 hover:text-danger"
                      aria-label="Удалить линию"
                    >
                      <TrashIcon size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {conflicts.length > 0 && (
            <Card className="border-warn/40">
              <h3 className="font-semibold text-warn">Противоречия в репертуаре</h3>
              <p className="text-sm text-muted">В одной позиции записаны разные ваши ходы. Тренировка примет любой из них, но лучше выбрать один.</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                {conflicts.slice(0, 4).map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" onClick={save}>
              Сохранить курс
            </Button>
            {saveError && <span className="text-sm text-danger">{saveError}</span>}
          </div>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card className="p-3 sm:p-4">
            <div className="mb-3">
              <Segmented<'board' | 'pgn'>
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'board', label: 'Ввод на доске' },
                  { value: 'pgn', label: 'Импорт PGN' },
                ]}
              />
            </div>
            {tab === 'board' ? <BoardInput side={side} onAdd={(l) => addLines([l])} nextIndex={lines.length + 1} /> : <PgnImport onAdd={addLines} />}
          </Card>
        </div>
      </div>
    </div>
  )
}

function BoardInput({ side, onAdd, nextIndex }: { side: Side; onAdd: (line: { name: string; moves: DraftMove[] }) => void; nextIndex: number }) {
  const [moves, setMoves] = useState<DraftMove[]>([])
  const [ply, setPly] = useState(0)
  const [lineName, setLineName] = useState('')
  const [orientation, setOrientation] = useState<'white' | 'black' | null>(null)
  const [added, setAdded] = useState(false)
  const played = useMemo(() => replay(moves), [moves])
  const fen = ply === 0 ? START_FEN : played[ply - 1].fenAfter
  const last = ply > 0 ? played[ply - 1] : null

  const onMove = (m: BoardMove) => {
    const chess = new Chess(fen)
    let san: string
    try {
      san = chess.move({ from: m.from, to: m.to, promotion: m.promotion }).san
    } catch {
      return false
    }
    // Если ход совпадает с уже записанным — просто идём вперёд, иначе обрезаем хвост.
    if (moves[ply]?.san === san) setPly(ply + 1)
    else {
      setMoves([...moves.slice(0, ply), { san }])
      setPly(ply + 1)
    }
    setAdded(false)
    return true
  }

  const setComment = (text: string) => {
    if (ply === 0) return
    setMoves((prev) => prev.map((m, i) => (i === ply - 1 ? { ...m, comment: text || undefined } : m)))
  }

  const save = () => {
    const sequence = moves.slice(0, ply)
    if (!sequence.length) return
    const label = sequence.length > 0 ? moveLabel(sequence.length - 1, sequence[sequence.length - 1].san) : ''
    onAdd({ name: lineName.trim() || `Линия ${nextIndex} (${label})`, moves: sequence })
    setLineName('')
    setAdded(true)
  }

  return (
    <div>
      <ChessBoard
        id="editor"
        fen={fen}
        orientation={orientation ?? side}
        lastMove={last ? { from: last.from, to: last.to } : null}
        onMove={onMove}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setPly((p) => Math.max(0, p - 1))} disabled={ply === 0}>
          <UndoIcon size={16} /> Назад
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setMoves([])
            setPly(0)
            setAdded(false)
          }}
          disabled={moves.length === 0}
        >
          <RotateIcon size={16} /> Сначала
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOrientation((o) => ((o ?? side) === 'white' ? 'black' : 'white'))} aria-label="Перевернуть доску">
          <FlipIcon size={16} />
        </Button>
      </div>
      <MoveList moves={played} ply={ply} onSelect={setPly} className="mt-3 max-h-40 rounded-lg bg-surface-2/50" />
      <label className="mt-3 block">
        <span className="mb-1 block text-xs text-muted">{last ? `Комментарий к ходу ${moveLabel(ply - 1, last.san)}` : 'Сделайте ход, чтобы добавить комментарий'}</span>
        <input
          value={last?.comment ?? ''}
          disabled={!last}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Идея хода (необязательно)"
          className="h-9 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm outline-none placeholder:text-faint focus:border-accent disabled:opacity-50"
        />
      </label>
      <div className="mt-3 flex gap-2">
        <input
          value={lineName}
          onChange={(e) => setLineName(e.target.value)}
          placeholder="Название линии"
          className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 text-sm outline-none placeholder:text-faint focus:border-accent"
        />
        <Button variant="primary" onClick={save} disabled={ply === 0}>
          <PlusIcon size={16} /> Линия
        </Button>
      </div>
      <p className="mt-2 text-xs text-faint">
        {added
          ? 'Линия добавлена. Вернитесь на нужный ход и введите следующее ответвление.'
          : 'Ходите за обе стороны. В линию попадут ходы до текущей позиции — так удобно записывать ответвления.'}
      </p>
    </div>
  )
}

function PgnImport({ onAdd }: { onAdd: (lines: { name: string; moves: DraftMove[] }[]) => void }) {
  const [text, setText] = useState('')
  const [report, setReport] = useState<{ added: number; errors: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const run = (source: string) => {
    const r = importPgn(source)
    onAdd(r.lines.map((l) => ({ name: l.name, moves: l.moves.map((m) => ({ san: m.san, comment: m.comment })) })))
    setReport({ added: r.lines.length, errors: r.errors })
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        spellCheck={false}
        placeholder={'[Event "Мой гамбит"]\n\n1.e4 e5 2.f4 exf4 3.Nf3 {комментарий} g5 (3...d5 4.exd5) 4.h4 *'}
        className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-sm outline-none placeholder:text-faint focus:border-accent"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => run(text)} disabled={!text.trim()}>
          Импортировать
        </Button>
        <Button onClick={() => fileRef.current?.click()}>
          <UploadIcon size={16} /> Файл .pgn
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".pgn,.txt,application/x-chess-pgn,text/plain"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const content = await file.text()
            setText(content)
            run(content)
            e.target.value = ''
          }}
        />
      </div>
      {report && (
        <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <Badge tone={report.added ? 'accent' : 'danger'}>{report.added ? `Найдено линий: ${report.added}` : 'Линии не найдены'}</Badge>
            <span className="text-xs text-faint">повторы пропускаются</span>
          </div>
          {report.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-danger">
              {report.errors.slice(0, 6).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-faint">
        Поддерживаются несколько партий в одном файле (например, экспорт студии Lichess), варианты в скобках, комментарии в фигурных скобках и
        оценочные знаки. Каждый вариант станет отдельной линией.
      </p>
    </div>
  )
}
