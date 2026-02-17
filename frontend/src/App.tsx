import { lazy, Suspense, type ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import ErrorBoundary from './components/ErrorBoundary';
import { useTranslation } from 'react-i18next';

const Layout = lazy(() => import('./Layout'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDashboard = lazy(() => import('./pages/ProjectDashboard'));
const SiteAuditOverview = lazy(() => import('./pages/SiteAuditOverview'));
const ProjectPages = lazy(() => import('./pages/ProjectPages'));
const ProjectIssues = lazy(() => import('./pages/ProjectIssues'));
const ProjectKeywords = lazy(() => import('./pages/ProjectKeywords'));
const ProjectKeywordResearch = lazy(() => import('./pages/ProjectKeywordResearch'));
const AiAssistant = lazy(() => import('./pages/AiAssistant'));
const AiContentGeneration = lazy(() => import('./pages/AiContentGeneration'));
const ProjectReports = lazy(() => import('./pages/ProjectReports'));
const ProjectApiKeys = lazy(() => import('./pages/ProjectApiKeys'));
const ProjectBacklinkRefDomains = lazy(() => import('./pages/ProjectBacklinkRefDomains'));
const ProjectBacklinkRefDomainDetail = lazy(() => import('./pages/ProjectBacklinkRefDomainDetail'));
const Login = lazy(() => import('./pages/Login'));
const Users = lazy(() => import('./pages/Users'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const SystemSettings = lazy(() => import('./pages/SystemSettings'));
const TwoFactorSetup = lazy(() => import('./pages/TwoFactorSetup'));
const TwoFactorVerify = lazy(() => import('./pages/TwoFactorVerify'));

function SuspenseLoader() {
  const { t } = useTranslation();
  return (
    <div className="suspense-loader">
      <div className="loading-spinner" />
      <span>{t('common.loading')}</span>
    </div>
  );
}

function Protected({ children }: { children: ReactElement }) {
  const { isAuthenticated, loading, backendUnavailable } = useAuth();
  const { t } = useTranslation();
  if (loading) {
    return <SuspenseLoader />;
  }
  if (backendUnavailable) {
    return (
      <div className="auth-page">
        <div className="auth-card max-w-xl">
          <h1>{t('backendUnavailable.title')}</h1>
          <p className="md-body-large text-[color:var(--md-sys-color-on-surface-variant)]">
            {t('backendUnavailable.description')}
          </p>
        </div>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function withRouteBoundary(routeScope: string, element: ReactElement) {
  return <ErrorBoundary scope={routeScope}>{element}</ErrorBoundary>;
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<SuspenseLoader />}>
        <Routes>
          <Route
            path="/login"
            element={withRouteBoundary("login-route", <Login />)}
          />
          <Route
            path="/forgot-password"
            element={withRouteBoundary(
              "forgot-password-route",
              <ForgotPassword />,
            )}
          />
          <Route
            path="/two-factor/verify"
            element={withRouteBoundary('two-factor-verify-route', <TwoFactorVerify />)}
          />
          <Route
            path="/reset-password"
            element={withRouteBoundary("reset-password-route", <ResetPassword />)}
          />
          <Route
            path="/"
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route index element={<Projects />} />
            <Route path="projects/:id" element={<ProjectDashboard />} />
            <Route path="projects/:id/site-audit" element={<SiteAuditOverview />} />
            <Route path="projects/:id/pages" element={<ProjectPages />} />
            <Route path="projects/:id/issues" element={<ProjectIssues />} />
            <Route path="projects/:id/keywords" element={<ProjectKeywords />} />
            <Route path="projects/:id/keyword-research" element={<ProjectKeywordResearch />} />
            <Route path="projects/:id/reports" element={<ProjectReports />} />
            <Route path="projects/:id/api-keys" element={<ProjectApiKeys />} />
            <Route path="projects/:id/backlinks/ref-domains" element={<ProjectBacklinkRefDomains />} />
            <Route path="projects/:id/backlinks/ref-domains/:domain" element={<ProjectBacklinkRefDomainDetail />} />
            <Route path="ai" element={<AiAssistant />} />
            <Route path="ai/content" element={<AiContentGeneration />} />
            <Route path="users" element={<Users />} />
            <Route path="change-password" element={<ChangePassword />} />
            <Route path="settings" element={<SystemSettings />} />
            <Route path="security/2fa" element={<TwoFactorSetup />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
