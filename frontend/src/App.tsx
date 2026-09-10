/*
 * App — the route tree. One AppShell layout, guarded by role.
 *
 * Shared pages (PatientsPage, ConsultationsPage, ConsultationDetailPage,
 * AlertsPage) are mounted under several role paths and adapt their actions to
 * the signed-in role, rather than being duplicated per role.
 *
 * Two routes deliberately sit OUTSIDE AppShell:
 *   - /login, which has its own full-page composition;
 *   - the live consultation room, which takes the whole viewport because during
 *     a call the room is the work and the navigation chrome is a distraction.
 */

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireRole } from './auth/RequireRole'
import { AppShell } from './components/AppShell'

import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { ForbiddenPage } from './pages/ForbiddenPage'
import { NotFoundPage } from './pages/NotFoundPage'

import { DoctorsPage } from './pages/DoctorsPage'
import { PatientsPage } from './pages/PatientsPage'
import { ConsultationsPage } from './pages/ConsultationsPage'
import { ConsultationDetailPage } from './pages/ConsultationDetailPage'
import { AlertsPage } from './pages/AlertsPage'

import { AdminDashboard } from './pages/admin/AdminDashboard'
import { UsersPage } from './pages/admin/UsersPage'
import { ClinicsPage } from './pages/admin/ClinicsPage'
import { DoctorWorkspace } from './pages/doctor/DoctorWorkspace'
import { LiveConsultationPage } from './pages/doctor/LiveConsultationPage'
import { PatientDashboard } from './pages/patient/PatientDashboard'
import { FindDoctorPage } from './pages/patient/FindDoctorPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/403" element={<ForbiddenPage />} />

          {/* Full-viewport call room: no shell, no navigation. */}
          <Route element={<RequireRole allow={['DOCTOR', 'PATIENT']} />}>
            <Route
              path="/doctor/consultations/:id/live"
              element={<LiveConsultationPage />}
            />
            <Route
              path="/patient/consultations/:id/live"
              element={<LiveConsultationPage />}
            />
          </Route>

          {/* Shared authenticated routes (any signed-in role). */}
          <Route element={<RequireRole allow={['ADMIN', 'DOCTOR', 'PATIENT']} />}>
            <Route element={<AppShell />}>
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
          </Route>

          {/* ADMIN */}
          <Route element={<RequireRole allow={['ADMIN']} />}>
            <Route element={<AppShell />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/users" element={<UsersPage />} />
              <Route path="/admin/doctors" element={<DoctorsPage />} />
              <Route path="/admin/patients" element={<PatientsPage />} />
              <Route path="/admin/clinics" element={<ClinicsPage />} />
              <Route path="/admin/consultations" element={<ConsultationsPage />} />
              <Route
                path="/admin/consultations/:id"
                element={<ConsultationDetailPage />}
              />
              <Route path="/admin/alerts" element={<AlertsPage />} />
            </Route>
          </Route>

          {/* DOCTOR */}
          <Route element={<RequireRole allow={['DOCTOR']} />}>
            <Route element={<AppShell />}>
              <Route path="/doctor" element={<DoctorWorkspace />} />
              <Route path="/doctor/patients" element={<PatientsPage />} />
              <Route path="/doctor/consultations" element={<ConsultationsPage />} />
              <Route
                path="/doctor/consultations/:id"
                element={<ConsultationDetailPage />}
              />
              <Route path="/doctor/alerts" element={<AlertsPage />} />
              <Route path="/doctors" element={<DoctorsPage />} />
            </Route>
          </Route>

          {/* PATIENT */}
          <Route element={<RequireRole allow={['PATIENT']} />}>
            <Route element={<AppShell />}>
              <Route path="/patient" element={<PatientDashboard />} />
              <Route path="/patient/consultations" element={<ConsultationsPage />} />
              <Route
                path="/patient/consultations/:id"
                element={<ConsultationDetailPage />}
              />
              <Route path="/patient/doctors" element={<FindDoctorPage />} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
