import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Chessboard, type SquareHandlerArgs } from 'react-chessboard'
import { CheckIcon, ClockIcon, PlayIcon, RotateIcon, TargetIcon, XIcon } from '../components/icons'
import { Badge, Button, Card, PageHeader, Segmented, StatTile, Toggle } from '../components/ui'
import { useStore } from '../lib/storage'
import {
  BOARD_THEMES,
  coordBestKey,
  coordStore,
  logActivity,
  settingsStore,
  type CoordMode,
  type CoordPrefs,
  type CoordSession,
  type CoordSide,
} from '../store'

type Phase = 'idle' | 'running' | 'finished'

interface Attempt {
  target: string
  clicked: string | null
  ok: boolean
  ms: number
}

interface Flash {
  id: number
  square: string
  ok: boolean
  correct: string
}

const FILES = 'abcdefgh'

function randomSquare(exclude?: string): string {
  let sq: string
  do {
    sq = FILES[Math.floor(Math.random() * 8)] + (Math.floor(Math.random() * 8) + 1)
  } while (sq === exclude)
  return sq
}

function modeParam(p: CoordPrefs) {
  return p.mode === 'sprint' ? p.sprintSeconds : p.perSquareSeconds
}

function describeMode(mode: CoordMode, param: number, length?: number) {
  return mode === 'sprint' ? `На время · ${param} с` : `Серия${length ? ` из ${length}` : ''} · ${param} с на клетку`
}

export function CoordinatesPage() {
  const data = useStore(coordStore)
  const settings = useStore(settingsStore)
  const prefs = data.prefs
  const theme = BOARD_THEMES[settings.boardTheme]

  const [phase, setPhase] = useState<Phase>('idle')
  const [orientation, setOrientation] = useState<'white' | 'black'>(prefs.side === 'black' ? 'black' : 'white')
  const [target, setTarget] = useState('e4')
  const [next, setNext] = useState('d5')
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [deadline, setDeadline] = useState(0)
  const [roundEnd, setRoundEnd] = useState(0)
  const [questionStart, setQuestionStart] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [flash, setFlash] = useState<Flash | null>(null)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [result, setResult] = useState<{ session: CoordSession; attempts: Attempt[]; record: boolean; prevBest?: number } | null>(null)
  const flashId = useRef(0)

  const setPrefs = (patch: Partial<CoordPrefs>) => coordStore.set((d) => ({ ...d, prefs: { ...d.prefs, ...patch } }))

  // Пока не идёт раунд — ориентация следует настройке.
  useEffect(() => {
    if (phase === 'idle' && prefs.side !== 'random') setOrientation(prefs.side)
  }, [prefs.side, phase])

  const start = () => {
    const side: 'white' | 'black' = prefs.side === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : prefs.side
    const t = Date.now()
    const first = randomSquare()
    setOrientation(side)
    setTarget(first)
    setNext(randomSquare(first))
    setAttempts([])
    setFlash(null)
    setResult(null)
    setShowHeatmap(false)
    setQuestionStart(t)
    setNow(t)
    if (prefs.mode === 'sprint') {
      setRoundEnd(t + prefs.sprintSeconds * 1000)
      setDeadline(t + prefs.sprintSeconds * 1000)
    } else {
      setRoundEnd(0)
      setDeadline(t + prefs.perSquareSeconds * 1000)
    }
    setPhase('running')
  }

  const finish = (list: Attempt[]) => {
    const correct = list.filter((a) => a.ok).length
    const okTimes = list.filter((a) => a.ok).map((a) => a.ms)
    const session: CoordSession = {
      at: Date.now(),
      mode: prefs.mode,
      param: modeParam(prefs),
      side: orientation,
      correct,
      wrong: list.length - correct,
      avgMs: okTimes.length ? Math.round(okTimes.reduce((s, x) => s + x, 0) / okTimes.length) : 0,
    }
    const key = coordBestKey(session.mode, session.param)
    const prevBest = data.best[key]
    const record = correct > 0 && (prevBest === undefined || correct > prevBest)
    coordStore.set((d) => {
      const squares = { ...d.squares }
      for (const a of list) {
        const s = squares[a.target] ?? { ok: 0, miss: 0 }
        squares[a.target] = a.ok ? { ...s, ok: s.ok + 1 } : { ...s, miss: s.miss + 1 }
      }
      return {
        ...d,
        sessions: [...d.sessions, session].slice(-200),
        best: record ? { ...d.best, [key]: correct } : d.best,
        squares,
      }
    })
    if (list.length > 0) logActivity('coords')
    setResult({ session, attempts: list, record, prevBest })
    setPhase('finished')
  }

  const answer = (clicked: string | null) => {
    const t = Date.now()
    const ok = clicked === target
    const attempt: Attempt = { target, clicked, ok, ms: t - questionStart }
    const list = [...attempts, attempt]
    setAttempts(list)
    flashId.current += 1
    setFlash({ id: flashId.current, square: clicked ?? target, ok, correct: target })
    if (prefs.mode === 'series' && list.length >= prefs.seriesLength) {
      finish(list)
      return
    }
    setTarget(next)
    setNext(randomSquare(next))
    setQuestionStart(t)
    if (prefs.mode === 'series') setDeadline(t + prefs.perSquareSeconds * 1000)
  }

  // Таймер
  useEffect(() => {
    if (phase !== 'running') return
    const id = window.setInterval(() => setNow(Date.now()), 50)
    return () => window.clearInterval(id)
  }, [phase])

  useEffect(() => {
    if (phase !== 'running' || now < deadline) return
    if (prefs.mode === 'sprint') finish(attempts)
    else answer(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now])

  // Вспышка гаснет сама
  useEffect(() => {
    if (!flash) return
    const id = window.setTimeout(() => setFlash((f) => (f?.id === flash.id ? null : f)), 450)
    return () => window.clearTimeout(id)
  }, [flash])

  const onSquareClick = ({ square }: SquareHandlerArgs) => {
    if (phase === 'running') answer(square)
  }

  const correct = attempts.filter((a) => a.ok).length
  const wrong = attempts.length - correct
  const remaining = Math.max(0, deadline - now)
  const totalMs = prefs.mode === 'sprint' ? prefs.sprintSeconds * 1000 : prefs.perSquareSeconds * 1000
  const timeShare = phase === 'running' ? remaining / totalMs : 1
  const roundRemaining = prefs.mode === 'sprint' ? Math.max(0, roundEnd - now) : remaining

  // Карта ошибок
  const heat = useMemo(() => {
    const styles: Record<string, CSSProperties> = {}
    for (const [sq, s] of Object.entries(data.squares)) {
      const total = s.ok + s.miss
      if (!total) continue
      const rate = s.miss / total
      styles[sq] =
        rate === 0
          ? { backgroundColor: 'rgba(129, 182, 76, 0.35)' }
          : { backgroundColor: `rgba(226, 87, 76, ${0.25 + rate * 0.6})` }
    }
    return styles
  }, [data.squares])

  const hardest = useMemo(
    () =>
      Object.entries(data.squares)
        .map(([sq, s]) => ({ sq, total: s.ok + s.miss, rate: s.miss / Math.max(1, s.ok + s.miss) }))
        .filter((x) => x.total >= 2 && x.rate > 0)
        .sort((a, b) => b.rate - a.rate || b.total - a.total)
        .slice(0, 6),
    [data.squares],
  )

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = phase !== 'running' && showHeatmap ? { ...heat } : {}
    if (flash) {
      if (flash.ok) styles[flash.square] = { backgroundColor: 'rgba(129, 182, 76, 0.85)' }
      else {
        styles[flash.square] = { backgroundColor: 'rgba(226, 87, 76, 0.85)' }
        styles[flash.correct] = { ...styles[flash.correct], boxShadow: 'inset 0 0 0 5px rgba(129, 182, 76, 0.95)' }
      }
    }
    return styles
  }, [flash, heat, showHeatmap, phase])

  const bestKey = coordBestKey(prefs.mode, modeParam(prefs))
  const best = data.best[bestKey]
  const recent = data.sessions.slice(-8).reverse()
  const running = phase === 'running'

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Тренажёр координат" subtitle="Найдите на доске названную клетку как можно быстрее." />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="board-frame relative">
            <Chessboard
              options={{
                id: 'coords',
                position: {},
                boardOrientation: orientation,
                allowDragging: false,
                allowDrawingArrows: false,
                showNotation: prefs.showNotation,
                onSquareClick,
                squareStyles,
                darkSquareStyle: { backgroundColor: theme.dark, cursor: running ? 'pointer' : 'default' },
                lightSquareStyle: { backgroundColor: theme.light, cursor: running ? 'pointer' : 'default' },
                darkSquareNotationStyle: { color: theme.light, fontWeight: 600 },
                lightSquareNotationStyle: { color: theme.dark, fontWeight: 600 },
                boardStyle: { borderRadius: 6, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.45)' },
              }}
            />
            {running && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span
                  key={target + attempts.length}
                  className="animate-pop font-mono text-[min(22vw,9rem)] font-black leading-none text-white/85 [text-shadow:0_4px_24px_rgba(0,0,0,0.65)]"
                >
                  {target}
                </span>
              </div>
            )}
            {!running && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                {phase === 'idle' && !showHeatmap && (
                  <span className="rounded-full bg-black/55 px-4 py-1.5 text-sm text-white/90 backdrop-blur">
                    Белые {orientation === 'white' ? 'снизу' : 'сверху'}
                  </span>
                )}
              </div>
            )}
          </div>
          {/* Полоса времени есть всегда (вне раунда — невидима), чтобы старт раунда ничего не сдвигал. */}
          <div
            className={`mx-auto mt-3 h-2 w-full max-w-[min(100%,calc(100svh-9rem))] overflow-hidden rounded-full bg-surface-3 ${running ? '' : 'invisible'}`}
          >
            <div
              className={`h-full rounded-full ${timeShare < 0.25 ? 'bg-danger' : 'bg-accent'}`}
              style={{ width: `${running ? timeShare * 100 : 100}%`, transition: 'width 50ms linear' }}
            />
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          {running ? (
            <Card>
              <div className="flex items-center justify-between">
                <Badge tone={orientation === 'white' ? 'white' : 'black'}>{orientation === 'white' ? 'Белые снизу' : 'Чёрные снизу'}</Badge>
                <span className="flex items-center gap-1.5 font-mono text-lg font-bold tabular">
                  <ClockIcon size={18} className="text-muted" />
                  {(roundRemaining / 1000).toFixed(1)}
                </span>
              </div>
              <div className="mt-4 text-center">
                <div className="text-sm text-muted">Найдите клетку</div>
                <div className="font-mono text-6xl font-black tracking-tight">{target}</div>
                <div className="mt-1 text-sm text-faint">
                  следующая: <span className="font-mono text-muted">{next}</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-accent/10 py-2">
                  <div className="text-2xl font-bold text-accent tabular">{correct}</div>
                  <div className="text-xs text-muted">верно</div>
                </div>
                <div className="rounded-lg bg-danger/10 py-2">
                  <div className="text-2xl font-bold text-danger tabular">{wrong}</div>
                  <div className="text-xs text-muted">ошибок</div>
                </div>
              </div>
              {prefs.mode === 'series' && (
                <div className="mt-3 text-center text-sm text-muted">
                  Клетка {Math.min(attempts.length + 1, prefs.seriesLength)} из {prefs.seriesLength}
                </div>
              )}
              <Button className="mt-4 w-full" variant="ghost" onClick={() => finish(attempts)}>
                Завершить раунд
              </Button>
            </Card>
          ) : (
            <>
              {phase === 'finished' && result && <ResultCard result={result} />}
              <Card>
                <h2 className="mb-3 font-semibold">Настройки раунда</h2>
                <div className="space-y-4">
                  <div>
                    <div className="mb-1.5 text-sm text-muted">Сторона снизу</div>
                    <Segmented<CoordSide>
                      value={prefs.side}
                      onChange={(side) => setPrefs({ side })}
                      options={[
                        { value: 'white', label: 'Белые' },
                        { value: 'black', label: 'Чёрные' },
                        { value: 'random', label: 'Случайно' },
                      ]}
                    />
                  </div>
                  <div>
                    <div className="mb-1.5 text-sm text-muted">Режим</div>
                    <Segmented<CoordMode>
                      value={prefs.mode}
                      onChange={(mode) => setPrefs({ mode })}
                      options={[
                        { value: 'sprint', label: 'На время' },
                        { value: 'series', label: 'Серия' },
                      ]}
                    />
                    <p className="mt-1.5 text-xs text-faint">
                      {prefs.mode === 'sprint'
                        ? 'Найдите как можно больше клеток, пока не кончится время.'
                        : 'Фиксированное число клеток, на каждую — ограниченное время. Не успели — ошибка.'}
                    </p>
                  </div>
                  {prefs.mode === 'sprint' ? (
                    <div>
                      <div className="mb-1.5 text-sm text-muted">Длительность</div>
                      <Segmented<number>
                        value={prefs.sprintSeconds}
                        onChange={(sprintSeconds) => setPrefs({ sprintSeconds })}
                        options={[30, 60, 120].map((s) => ({ value: s, label: `${s} с` }))}
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <div className="mb-1.5 text-sm text-muted">Время на клетку</div>
                        <Segmented<number>
                          value={prefs.perSquareSeconds}
                          onChange={(perSquareSeconds) => setPrefs({ perSquareSeconds })}
                          options={[2, 3, 5, 10].map((s) => ({ value: s, label: `${s} с` }))}
                        />
                      </div>
                      <div>
                        <div className="mb-1.5 text-sm text-muted">Клеток в серии</div>
                        <Segmented<number>
                          value={prefs.seriesLength}
                          onChange={(seriesLength) => setPrefs({ seriesLength })}
                          options={[10, 20, 40].map((s) => ({ value: s, label: String(s) }))}
                        />
                      </div>
                    </div>
                  )}
                  <Toggle checked={prefs.showNotation} onChange={(showNotation) => setPrefs({ showNotation })} label="Подписи на доске (подсказка)" />
                </div>
                <Button variant="primary" size="lg" className="mt-5 w-full" onClick={start}>
                  {phase === 'finished' ? <RotateIcon size={18} /> : <PlayIcon size={18} />}
                  {phase === 'finished' ? 'Ещё раунд' : 'Начать'}
                </Button>
                <p className="mt-2 text-center text-xs text-faint">
                  Рекорд ({describeMode(prefs.mode, modeParam(prefs))}): <span className="font-semibold text-muted">{best ?? '—'}</span>
                </p>
              </Card>

              <Card>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-semibold">Карта ошибок</h2>
                  <Toggle checked={showHeatmap} onChange={setShowHeatmap} label={<span className="text-sm text-muted">на доске</span>} />
                </div>
                {showHeatmap && (
                  <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span className="flex items-center gap-1.5">
                      <span className="size-3 rounded-sm bg-[rgba(129,182,76,0.6)]" /> без ошибок
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-3 rounded-sm bg-[rgba(226,87,76,0.85)]" /> чем ярче, тем чаще ошибки
                    </span>
                  </p>
                )}
                {Object.keys(data.squares).length === 0 ? (
                  <p className="text-sm text-muted">Пока нет данных — сыграйте пару раундов.</p>
                ) : hardest.length === 0 ? (
                  <p className="text-sm text-muted">Явных проблемных клеток нет — так держать!</p>
                ) : (
                  <>
                    <p className="mb-2 text-sm text-muted">Клетки, где вы ошибаетесь чаще всего:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {hardest.map((h) => (
                        <span key={h.sq} className="rounded-md bg-danger/15 px-2 py-1 font-mono text-sm font-semibold text-danger">
                          {h.sq} <span className="font-sans text-xs opacity-80">{Math.round(h.rate * 100)}%</span>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </Card>

              {recent.length > 0 && (
                <Card>
                  <h2 className="mb-2 font-semibold">Последние раунды</h2>
                  <ul className="divide-y divide-line text-sm">
                    {recent.map((s) => (
                      <li key={s.at} className="flex items-center justify-between gap-2 py-2">
                        <span className="text-muted">{describeMode(s.mode, s.param)}</span>
                        <span className="flex items-center gap-3 tabular">
                          <span className="text-accent">{s.correct}</span>
                          <span className="text-danger">{s.wrong}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

function ResultCard({ result }: { result: { session: CoordSession; attempts: Attempt[]; record: boolean; prevBest?: number } }) {
  const { session, attempts, record, prevBest } = result
  const total = session.correct + session.wrong
  const accuracy = total ? Math.round((session.correct / total) * 100) : 0
  const misses = attempts.filter((a) => !a.ok)
  return (
    <Card className="animate-fade-in border-accent/40">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <TargetIcon size={18} className="text-accent" /> Итоги раунда
        </h2>
        {record && <Badge tone="warn">Новый рекорд!</Badge>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatTile label="Верно" value={<span className="text-accent">{session.correct}</span>} icon={<CheckIcon size={16} />} />
        <StatTile label="Ошибок" value={<span className="text-danger">{session.wrong}</span>} icon={<XIcon size={16} />} />
        <StatTile label="Точность" value={`${accuracy}%`} />
        <StatTile label="Среднее время" value={session.avgMs ? `${(session.avgMs / 1000).toFixed(2)} с` : '—'} />
      </div>
      {prevBest !== undefined && !record && <p className="mt-2 text-sm text-muted">Ваш рекорд в этом режиме: {prevBest}</p>}
      {misses.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-sm text-muted">Ошибки</div>
          <div className="flex flex-wrap gap-1.5">
            {misses.map((m, i) => (
              <span key={i} className="rounded-md bg-surface-2 px-2 py-1 font-mono text-xs">
                <span className="text-accent">{m.target}</span>
                <span className="text-faint"> → </span>
                <span className="text-danger">{m.clicked ?? 'время'}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
