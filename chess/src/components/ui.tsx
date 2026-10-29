import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeftIcon, XIcon } from './icons'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-strong shadow-[0_3px_0_#5d8a32] active:translate-y-px active:shadow-none',
  secondary: 'bg-surface-3 text-fg hover:bg-[#403c38]',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-8 px-3 text-sm gap-1.5', md: 'h-10 px-4 text-[15px] gap-2', lg: 'h-12 px-6 text-base gap-2' }
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-lg font-semibold transition disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${sizes[size]} ${className}`}
      {...rest}
    />
  )
}

/** Кнопка опасного действия: первое нажатие просит подтвердить, второе — выполняет. */
export function ConfirmButton({
  onConfirm,
  confirmLabel = 'Точно? Нажмите ещё раз',
  skipConfirm = false,
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  onConfirm: () => void
  confirmLabel?: ReactNode
  /** Подтверждение не нужно — действие выполняется с первого нажатия. */
  skipConfirm?: boolean
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 3000)
    return () => window.clearTimeout(t)
  }, [armed])
  return (
    <Button
      {...rest}
      onClick={() => {
        if (!armed && !skipConfirm) return setArmed(true)
        setArmed(false)
        onConfirm()
      }}
    >
      {skipConfirm ? (
        children
      ) : (
        // Обе надписи в одной ячейке: ширина кнопки не меняется, соседние кнопки не прыгают.
        <span className="grid">
          <span className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 ${armed ? 'invisible' : ''}`}>{children}</span>
          <span className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 ${armed ? '' : 'invisible'}`}>{confirmLabel}</span>
        </span>
      )}
    </Button>
  )
}

export function ButtonLink({
  to,
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
}: {
  to: string
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  className?: string
  children: ReactNode
}) {
  const sizes = { sm: 'h-8 px-3 text-sm gap-1.5', md: 'h-10 px-4 text-[15px] gap-2', lg: 'h-12 px-6 text-base gap-2' }
  return (
    <Link to={to} className={`inline-flex items-center justify-center rounded-lg font-semibold transition ${VARIANTS[variant]} ${sizes[size]} ${className}`}>
      {children}
    </Link>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface p-4 sm:p-5 ${className}`}>{children}</div>
}

export function PageHeader({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: string; actions?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link
            to={back}
            onClick={(e) => {
              // Если пришли с другой страницы приложения — возвращаемся по истории: список останется на том же месте.
              if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) {
                e.preventDefault()
                navigate(-1)
              }
            }}
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
          >
            <ArrowLeftIcon size={16} /> Назад
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function ProgressBar({ value, className = '', color = 'bg-accent' }: { value: number; className?: string; color?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-surface-3 ${className}`}>
      <div className={`h-full rounded-full ${color} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'info' | 'white' | 'black' }) {
  const tones = {
    neutral: 'bg-surface-3 text-muted',
    accent: 'bg-accent/15 text-accent',
    warn: 'bg-warn/15 text-warn',
    danger: 'bg-danger/15 text-danger',
    info: 'bg-info/15 text-info',
    white: 'bg-[#eeeeea] text-[#1b1a18]',
    black: 'bg-[#0d0c0b] text-[#e8e6e3] ring-1 ring-line',
  }
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  className = 'inline-flex flex-wrap',
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  disabled?: boolean
  /** Раскладка кнопок (по умолчанию — в строку с переносом). */
  className?: string
}) {
  return (
    <div className={`rounded-lg bg-surface-2 p-1 ${className}`}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
            o.value === value ? 'bg-surface-3 text-fg shadow' : 'text-muted hover:text-fg'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span className="text-[15px]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-accent' : 'bg-surface-3'}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  )
}

export function StatTile({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-3 sm:p-4">
      <div className="flex items-center gap-2 text-xs text-muted sm:text-sm">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
    </div>
  )
}

/** Фигурная нотация: Nf3 → ♞f3 (вид фигуры понятен без знания букв). */
export function Figurine({ san }: { san: string }) {
  const map: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞' }
  const glyph = map[san[0]]
  const promo = /=([QRBN])/.exec(san)
  let rest = glyph ? san.slice(1) : san
  if (promo) rest = rest.replace(/=[QRBN]/, '=')
  return (
    <span className="whitespace-nowrap">
      {glyph && <span className="figurine mr-px">{glyph}</span>}
      {rest}
      {promo && <span className="figurine">{map[promo[1]]}</span>}
    </span>
  )
}

/** Нижняя панель поверх страницы (на телефоне) — страница под ней не прокручивается и не сдвигается. */
export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const root = document.documentElement
    const prevOverflow = root.style.overflow
    const prevFocus = document.activeElement as HTMLElement | null
    root.style.overflow = 'hidden'
    closeButton.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      // Фокус не уходит из панели на страницу под ней.
      if (e.key === 'Tab' && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')
        if (!items.length) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      root.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      prevFocus?.focus({ preventScroll: true })
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div aria-hidden="true" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={panel}
        className="absolute inset-x-0 bottom-0 flex max-h-[94svh] flex-col rounded-t-2xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h3 id={titleId} className="min-w-0 flex-1 truncate font-semibold">
            {title}
          </h3>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-3 hover:text-fg"
            aria-label="Закрыть просмотр"
          >
            <XIcon size={20} />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain p-3">{children}</div>
      </div>
    </div>
  )
}
