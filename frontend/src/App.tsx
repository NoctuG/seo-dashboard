import type { ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './Layout';
import Projects from './pages/Projects';
import ProjectDashboard from './pages/ProjectDashboard';
import ProjectPages from './pages/ProjectPages';
import ProjectIssues from './pages/ProjectIssues';
import ProjectKeywords from './pages/ProjectKeywords';
import AiAssistant from './pages/AiAssistant';
import ProjectReports from './pages/ProjectReports';
import ProjectApiKeys from './pages/ProjectApiKeys';
import Login from './pages/Login';
import Users from './pages/Users';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ChangePassword from './pages/ChangePassword';
import SystemSettings from './pages/SystemSettings';
import TwoFactorSetup from './pages/TwoFactorSetup';
import TwoFactorVerify from './pages/TwoFactorVerify';
import { useAuth } from './auth';
import ErrorBoundary from './components/ErrorBoundary';
import { useTranslation } from 'react-i18next';

function Protected({ children }: { children: ReactElement }) {
  const { isAuthenticated, loading } = useAuth();
  const { t } = useTranslation();
  if (loading) return <div className="p-8">{t("app.loading")}</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function withRouteBoundary(routeScope: string, element: ReactElement) {
  return <ErrorBoundary scope={routeScope}>{element}</ErrorBoundary>;
}

function App() {
  return (
    <BrowserRouter>
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
          <Route path="projects/:id/pages" element={<ProjectPages />} />
          <Route path="projects/:id/issues" element={<ProjectIssues />} />
          <Route path="projects/:id/keywords" element={<ProjectKeywords />} />
          <Route path="projects/:id/reports" element={<ProjectReports />} />
          <Route path="projects/:id/api-keys" element={<ProjectApiKeys />} />
          <Route path="ai" element={<AiAssistant />} />
          <Route path="users" element={<Users />} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="settings" element={<SystemSettings />} />
          <Route path="security/2fa" element={<TwoFactorSetup />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
