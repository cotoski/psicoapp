import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Brain,
  Building2,
  Calculator,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { cn } from '../lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/pacientes', label: 'Pacientes', icon: Users },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet },
  { to: '/tributos', label: 'Tributos', icon: Calculator },
  { to: '/empresa', label: 'Empresa', icon: Building2 },
  { to: '/conta', label: 'Minha conta', icon: UserRound },
]

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Brain className="size-5" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold">PsicoApp</div>
        <div className="text-xs text-muted-foreground">Gestão de consultório</div>
      </div>
    </div>
  )
}

function navItemClass(isActive: boolean) {
  return cn(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground',
    isActive && 'bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground',
  )
}

function Avatar({ url, initials, className }: { url: string | null; initials: string; className?: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={cn('shrink-0 rounded-full object-cover', className)}
      />
    )
  }
  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-accent font-semibold text-accent-foreground',
        className,
      )}
    >
      {initials}
    </div>
  )
}

export function AppLayout() {
  const { user, logout, avatarUrl } = useAuth()
  const { pathname } = useLocation()
  const current =
    NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))?.label ?? 'PsicoApp'
  const initials = (user?.nome ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center border-b px-5">
          <Brand />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => navItemClass(isActive)}
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-3">
          <div className="flex items-center gap-1">
            <Link
              to="/conta"
              title="Minha conta"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/60"
            >
              <Avatar url={avatarUrl} initials={initials} className="h-8 w-8 text-xs" />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-medium">{user?.nome}</div>
                <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
              </div>
            </Link>
            <button
              onClick={() => void logout()}
              aria-label="Sair"
              title="Sair"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-card/80 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            <div className="md:hidden">
              <Brand />
            </div>
            <h1 className="hidden text-sm font-medium md:block">{current}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Avatar url={avatarUrl} initials={initials} className="h-8 w-8 text-xs md:hidden" />
            <button
              onClick={() => void logout()}
              aria-label="Sair"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </header>

        {/* Nav — mobile */}
        <nav className="flex gap-1 overflow-x-auto border-b bg-card px-2 py-2 md:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground',
                  isActive && 'bg-accent font-medium text-accent-foreground',
                )
              }
            >
              <item.icon className="size-3.5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
