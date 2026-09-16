import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { PatientsPage } from './pages/PatientsPage'
import { AgendaPage } from './pages/AgendaPage'
import { PatientFormPage } from './pages/PatientFormPage'
import { PatientDetailPage } from './pages/PatientDetailPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import type { ReactNode } from 'react'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-state">Carregando…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/pacientes" element={<PatientsPage />} />
            <Route path="/pacientes/novo" element={<PatientFormPage />} />
            <Route path="/pacientes/:id" element={<PatientDetailPage />} />
            <Route path="/pacientes/:id/editar" element={<PatientFormPage />} />
            <Route path="/agenda" element={<AgendaPage />} />
            <Route path="/agenda/:id" element={<PlaceholderPage title="Atendimento" task="T-017" />} />
            <Route path="/financeiro" element={<PlaceholderPage title="Financeiro" task="T-018" />} />
            <Route path="/tributos" element={<PlaceholderPage title="Tributos" task="T-019" />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
