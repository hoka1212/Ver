import { useState } from 'react'
import { Link } from 'react-router'
import { ActivityChart } from '../components/ActivityChart'
import { BookIcon, BotIcon, ChevronRightIcon, FlameIcon, PlayIcon, TargetIcon } from '../components/icons'
import { Badge, ButtonLink, Card, ProgressBar, StatTile } from '../components/ui'
import { useCourses } from '../data'
import { SIDE_LABEL } from '../lib/courses'
import { dayKey, useStore } from '../lib/storage'
import { isDue, lineMastery, lineStatus } from '../lib/srs'
import { activityStore, botGameStore, botStatsStore, coordBestKey, coordStore, currentStreak, dayTotal, progressStore } from '../store'

function pluralRu(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export function DashboardPage() {
  const courses = useCourses()
  const progress = useStore(progressStore)
  const coords = useStore(coordStore)
  const activity = useStore(activityStore)
  const botGame = useStore(botGameStore)
  const botRecord = useStore(botStatsStore)._all

  // Время фиксируем при открытии страницы — рендер остаётся чистым.
  const [now] = useState(() => Date.now())
  const allLines = courses.flatMap((c) => c.lines.map((l) => ({ course: c, line: l })))
  const learned = allLines.filter(({ line }) => {
    const s = lineStatus(progress[line.key])
    return s === 'review' || s === 'mastered'
  }).length
  const started = allLines.filter(({ line }) => (progress[line.key]?.level ?? 0) > 0).length
  const dueTotal = allLines.filter(({ line }) => isDue(progress[line.key], now)).length

  const courseStats = courses.map((c) => {
    const due = c.lines.filter((l) => isDue(progress[l.key], now)).length
    const mastery = c.lines.length ? c.lines.reduce((s, l) => s + lineMastery(progress[l.key]), 0) / c.lines.length : 0
    const touched = c.lines.some((l) => progress[l.key])
    return { course: c, due, mastery, touched }
  })
  const dueCourses = courseStats.filter((s) => s.due > 0).sort((a, b) => b.due - a.due)
  const inProgress = courseStats.filter((s) => s.touched && s.mastery < 1).sort((a, b) => b.mastery - a.mastery)
  const suggestions = courseStats.filter((s) => !s.touched && s.course.level === 'beginner').slice(0, 3)

  const streak = currentStreak(activity, now)
  const today = activity[dayKey(now)] ?? { coords: 0, lines: 0 }
  const sessions = coords.sessions
  const last = sessions[sessions.length - 1]
  const best30 = coords.best[coordBestKey('sprint', 30)]
  const totalAnswers = sessions.reduce((s, x) => s + x.correct + x.wrong, 0)
  const accuracy = totalAnswers ? Math.round((sessions.reduce((s, x) => s + x.correct, 0) / totalAnswers) * 100) : null

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Добро пожаловать!</h1>
          <p className="mt-1 text-muted">Тренируйте видение доски и заучивайте дебюты с интервальными повторениями.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5">
          <FlameIcon size={22} className={streak > 0 ? 'text-warn' : 'text-faint'} />
          <div className="leading-tight">
            <div className="text-lg font-bold tabular">
              {streak} {pluralRu(streak, 'день', 'дня', 'дней')}
            </div>
            <div className="text-xs text-muted">подряд с тренировками</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold">
                <TargetIcon size={22} className="text-accent" /> Тренажёр координат
              </div>
              <p className="mt-1 text-sm text-muted">Найдите названную клетку на пустой доске за отведённое время.</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <StatTile label="Рекорд 30 с" value={best30 ?? '—'} />
            <StatTile label="Точность" value={accuracy !== null ? `${accuracy}%` : '—'} />
            <StatTile label="Раундов" value={sessions.length} />
          </div>
          {last && (
            <p className="mt-3 text-sm text-muted">
              Последний раунд: <span className="text-fg">{last.correct}</span> верно, <span className="text-fg">{last.wrong}</span>{' '}
              {pluralRu(last.wrong, 'ошибка', 'ошибки', 'ошибок')}
            </p>
          )}
          <div className="mt-auto pt-4">
            <ButtonLink to="/coordinates" variant="primary" className="w-full sm:w-auto">
              <PlayIcon size={16} /> Тренировать координаты
            </ButtonLink>
          </div>
        </Card>

        <Card className="flex flex-col">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <BookIcon size={22} className="text-accent" /> Дебютный тренажёр
          </div>
          <p className="mt-1 text-sm text-muted">
            {courses.length} {pluralRu(courses.length, 'курс', 'курса', 'курсов')} · {allLines.length}{' '}
            {pluralRu(allLines.length, 'линия', 'линии', 'линий')}: гамбиты и дебюты за белых и чёрных.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <StatTile label="Выучено" value={learned} hint={`из ${allLines.length}`} />
            <StatTile label="Начато" value={started} />
            <StatTile label="К повтору" value={<span className={dueTotal ? 'text-warn' : ''}>{dueTotal}</span>} />
          </div>
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            {dueCourses[0] ? (
              <ButtonLink to={`/openings/${dueCourses[0].course.id}/train?mode=practice`} variant="primary">
                <PlayIcon size={16} /> Повторить: {dueCourses[0].course.name}
              </ButtonLink>
            ) : (
              <ButtonLink to="/openings" variant="primary">
                <PlayIcon size={16} /> Выбрать дебют
              </ButtonLink>
            )}
            <ButtonLink to="/openings">Все дебюты</ButtonLink>
          </div>
        </Card>
      </div>

      <Card className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-56 flex-1">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <BotIcon size={22} className="text-accent" /> Игра с ботом
          </div>
          <p className="mt-1 text-sm text-muted">
            Применяйте выученные дебюты в партии: бот отвечает по теории курса, иногда сворачивает с неё, а дальше играет сам.
          </p>
        </div>
        <div className="flex gap-5 text-center">
          <div>
            <div className="text-xl font-bold tabular">{botRecord?.games ?? 0}</div>
            <div className="text-xs text-muted">партий</div>
          </div>
          <div>
            <div className="text-xl font-bold text-accent tabular">{botRecord?.wins ?? 0}</div>
            <div className="text-xs text-muted">побед</div>
          </div>
          <div>
            <div className="text-xl font-bold tabular">{botRecord?.draws ?? 0}</div>
            <div className="text-xs text-muted">ничьих</div>
          </div>
        </div>
        <ButtonLink to="/play" variant="primary">
          <PlayIcon size={16} /> {botGame && !botGame.result && botGame.moves.length > 0 ? 'Продолжить партию' : 'Играть с ботом'}
        </ButtonLink>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="font-semibold">Тренировки за две недели</h2>
            <span className="text-xs text-muted">
              сегодня: {dayTotal(today)}
            </span>
          </div>
          <p className="mb-2 text-xs text-faint">Раунды координат, линии дебютов и партии с ботом по дням</p>
          <ActivityChart activity={activity} now={now} />
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">{dueCourses.length ? 'Пора повторить' : inProgress.length ? 'Продолжить изучение' : 'С чего начать'}</h2>
          <ul className="flex flex-col gap-2">
            {(dueCourses.length ? dueCourses : inProgress.length ? inProgress : suggestions).slice(0, 5).map(({ course, due, mastery }) => (
              <li key={course.id}>
                <Link
                  to={due ? `/openings/${course.id}/train?mode=practice` : `/openings/${course.id}`}
                  className="group flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5 transition hover:bg-surface-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{course.name}</span>
                      <Badge tone={course.side}>{SIDE_LABEL[course.side]}</Badge>
                    </div>
                    <ProgressBar value={mastery} className="mt-2" />
                  </div>
                  {due > 0 && <Badge tone="warn">{due} к повтору</Badge>}
                  <ChevronRightIcon size={18} className="text-faint group-hover:text-fg" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
