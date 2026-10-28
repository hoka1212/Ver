import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeftIcon } from './icons'

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
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link to={back} className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
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
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg bg-surface-2 p-1">
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
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-sm text-muted">
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
