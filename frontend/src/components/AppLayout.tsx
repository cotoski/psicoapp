import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/pacientes', label: 'Pacientes' },
  { to: '/agenda', label: 'Agenda' },
  { to: '/financeiro', label: 'Financeiro' },
  { to: '/tributos', label: 'Tributos' },
  { to: '/empresa', label: 'Empresa' },
]

export function AppLayout() {
  const { user, logout } = useAuth()
  return (
    <div className="app-wrapper">
      <aside className="sidebar">
        <div className="sidebar-title">PsicoApp</div>
        <nav>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main-content">
        <header className="header">
          <span className="header-title">PsicoApp</span>
          <div className="user-info">
            <span>{user?.nome}</span>
            <button className="btn btn-secondary btn-small" onClick={() => void logout()}>
              Sair
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
