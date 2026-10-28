import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { PlusIcon, SearchIcon } from '../components/icons'
import { Badge, ButtonLink, PageHeader, ProgressBar, Segmented } from '../components/ui'
import { useCourses } from '../data'
import { KIND_LABEL, LEVEL_LABEL, SIDE_LABEL, type Course, type CourseKind, type Side } from '../lib/courses'
import { useStore } from '../lib/storage'
import { isDue, lineMastery } from '../lib/srs'
import { progressStore } from '../store'

export function OpeningsPage() {
  const courses = useCourses()
  const progress = useStore(progressStore)
  const [side, setSide] = useState<Side | 'all'>('all')
  const [kind, setKind] = useState<CourseKind | 'all'>('all')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return courses.filter(
      (c) =>
        (side === 'all' || c.side === side) &&
        (kind === 'all' || c.kind === kind) &&
        (!q || `${c.name} ${c.nameEn ?? ''} ${c.eco ?? ''} ${c.summary}`.toLowerCase().includes(q)),
    )
  }, [courses, side, kind, query])

  const builtIn = filtered.filter((c) => !c.custom)
  const custom = filtered.filter((c) => c.custom)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Дебюты и гамбиты"
        subtitle="Выберите курс: изучите линии с подсказками, а затем закрепите их в режиме тренировки."
        actions={
          <ButtonLink to="/openings/new" variant="primary">
            <PlusIcon size={18} /> Свой курс / импорт PGN
          </ButtonLink>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented<Side | 'all'>
          value={side}
          onChange={setSide}
          options={[
            { value: 'all', label: 'Все' },
            { value: 'white', label: 'За белых' },
            { value: 'black', label: 'За чёрных' },
          ]}
        />
        <Segmented<CourseKind | 'all'>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'Всё' },
            { value: 'gambit', label: 'Гамбиты' },
            { value: 'opening', label: 'Дебюты' },
          ]}
        />
        <label className="relative min-w-48 flex-1 sm:max-w-xs">
          <SearchIcon size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск: название или ECO"
            className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[15px] outline-none placeholder:text-faint focus:border-accent"
          />
        </label>
      </div>

      {custom.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Мой репертуар</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {custom.map((c) => (
              <CourseCard key={c.id} course={c} progress={progress} />
            ))}
          </div>
        </section>
      )}

      <section>
        {custom.length > 0 && <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">База курсов</h2>}
        {builtIn.length === 0 ? (
          <p className="text-muted">Ничего не найдено.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {builtIn.map((c) => (
              <CourseCard key={c.id} course={c} progress={progress} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function CourseCard({ course, progress }: { course: Course; progress: ReturnType<typeof progressStore.get> }) {
  const mastery = course.lines.length ? course.lines.reduce((s, l) => s + lineMastery(progress[l.key]), 0) / course.lines.length : 0
  const due = course.lines.filter((l) => isDue(progress[l.key])).length
  const traps = course.lines.filter((l) => l.trap).length
  return (
    <Link
      to={`/openings/${course.id}`}
      className="group flex flex-col rounded-xl border border-line bg-surface p-4 transition hover:border-accent/50 hover:bg-surface-2"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={course.side}>{SIDE_LABEL[course.side]}</Badge>
        <Badge tone={course.kind === 'gambit' ? 'accent' : 'info'}>{KIND_LABEL[course.kind]}</Badge>
        {course.custom ? <Badge>Мой</Badge> : <Badge>{LEVEL_LABEL[course.level]}</Badge>}
        {due > 0 && <Badge tone="warn">{due} к повтору</Badge>}
      </div>
      <h3 className="mt-2.5 text-lg font-semibold leading-snug group-hover:text-accent-strong">{course.name}</h3>
      <div className="text-xs text-faint">
        {course.nameEn}
        {course.eco ? ` · ${course.eco}` : ''}
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-muted">{course.summary}</p>
      <div className="mt-auto pt-4">
        <div className="mb-1.5 flex justify-between text-xs text-muted">
          <span>
            {course.lines.length} лин.{traps ? ` · ${traps} ловуш.` : ''}
          </span>
          <span className="tabular">{Math.round(mastery * 100)}%</span>
        </div>
        <ProgressBar value={mastery} />
      </div>
    </Link>
  )
}
