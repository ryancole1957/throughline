import { lazy, Suspense } from 'react';
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';

import { AppErrorBoundary } from './components/AppErrorBoundary';
import { BrandMark, Wordmark } from './components/GlobalHeader';
import { Button } from './components/ui';
import { useAuth } from './lib/auth';
import { describeError } from './lib/api';
import { useI18n } from './lib/i18n';
import { JoinPage } from './pages/JoinPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProjectShell } from './pages/ProjectShell';
import { ProjectsPage } from './pages/ProjectsPage';
import { RegisterPage } from './pages/RegisterPage';
import { TeamPage } from './pages/TeamPage';
import { TeamsPage } from './pages/TeamsPage';

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
);
const ItemsPage = lazy(() =>
  import('./pages/ItemsPage').then((module) => ({ default: module.ItemsPage })),
);
const VerificationPage = lazy(() =>
  import('./pages/VerificationPage').then((module) => ({ default: module.VerificationPage })),
);
const GraphPage = lazy(() =>
  import('./pages/GraphPage').then((module) => ({ default: module.GraphPage })),
);
const AssetsPage = lazy(() =>
  import('./pages/AssetsPage').then((module) => ({ default: module.AssetsPage })),
);
const RisksPage = lazy(() =>
  import('./pages/RisksPage').then((module) => ({ default: module.RisksPage })),
);
const ReportPage = lazy(() =>
  import('./pages/ReportPage').then((module) => ({ default: module.ReportPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);
const AdminUsersPage = lazy(() =>
  import('./pages/AdminUsersPage').then((module) => ({ default: module.AdminUsersPage })),
);
const AccountPage = lazy(() =>
  import('./pages/AccountPage').then((module) => ({ default: module.AccountPage })),
);

function AppSplash() {
  return (
    <div className="standalone-center">
      <div className="login-brand">
        <BrandMark />
        <Wordmark />
      </div>
    </div>
  );
}

function RootRedirect() {
  const { session, isLoading } = useAuth();
  if (isLoading) return <AppSplash />;
  return <Navigate to={session ? '/teams' : '/login'} replace />;
}

function ProtectedLayout() {
  const { t } = useI18n();
  const { session, isLoading, isError, error, refetchSession } = useAuth();
  const location = useLocation();

  if (isLoading) return <AppSplash />;
  if (isError && !session) {
    return (
      <div className="standalone-center">
        <div className="message-card">
          <BrandMark />
          <h1>{t('Unable to connect to the service')}</h1>
          <p>{describeError(error)}</p>
          <div className="message-actions">
            <Button variant="primary" onClick={refetchSession}>
              {t('Try again')}
            </Button>
          </div>
        </div>
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

function AdminOnly() {
  const { user } = useAuth();
  if (user?.systemRole !== 'admin') return <Navigate to="/teams" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <Suspense fallback={<AppSplash />}>
        <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/join/:code" element={<JoinPage />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/teams/:teamId" element={<TeamPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectShell />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="items" element={<ItemsPage />} />
            <Route path="verification" element={<VerificationPage />} />
            <Route path="graph" element={<GraphPage />} />
            <Route path="assets" element={<AssetsPage />} />
            <Route path="risks" element={<RisksPage />} />
            <Route path="report" element={<ReportPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="/account" element={<AccountPage />} />
          <Route element={<AdminOnly />}>
            <Route path="/admin/users" element={<AdminUsersPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  );
}
