import { NavLink, Outlet, useLocation } from 'react-router'
import { useEffect } from 'react'
import { BookIcon, HomeIcon, KnightLogo, SettingsIcon, TargetIcon } from './icons'

const NAV = [
  { to: '/', label: 'Главная', icon: HomeIcon, end: true },
  { to: '/coordinates', label: 'Координаты', icon: TargetIcon, end: false },
  { to: '/openings', label: 'Дебюты', icon: BookIcon, end: false },
  { to: '/settings', label: 'Настройки', icon: SettingsIcon, end: false },
]

export function Layout() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="min-h-dvh lg:flex">
      {/* Боковая панель (десктоп) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <NavLink to="/" className="flex items-center gap-3 px-5 py-5">
          <KnightLogo size={34} />
          <div className="leading-tight">
            <div className="font-semibold">Шахматный</div>
            <div className="text-sm text-muted">тренажёр</div>
          </div>
        </NavLink>
        <nav className="flex flex-col gap-1 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition ${
                  isActive ? 'bg-surface-3 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} className={isActive ? 'text-accent' : ''} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-5 py-4 text-xs text-faint">Прогресс хранится в этом браузере.</div>
      </aside>

      {/* Верхняя панель (мобильные) */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <KnightLogo size={28} />
        <span className="font-semibold">Шахматный тренажёр</span>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-24 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-6">
        <Outlet />
      </main>

      {/* Нижняя навигация (мобильные) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2 text-[11px] font-medium ${isActive ? 'text-accent' : 'text-muted'}`
            }
          >
            <Icon size={22} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
