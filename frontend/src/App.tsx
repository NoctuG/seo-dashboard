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
import Login from './pages/Login';
import Users from './pages/Users';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ChangePassword from './pages/ChangePassword';
import { useAuth } from './auth';
import ErrorBoundary from './components/ErrorBoundary';
import { useTranslation } from 'react-i18next';

function Protected({ children }: { children: ReactElement }) {
  const { isAuthenticated, loading } = useAuth();
  const { t } = useTranslation();
  if (loading) return <div className="p-8">{t('app.loading')}</div>;
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
        <Route path="/login" element={withRouteBoundary('login-route', <Login />)} />
        <Route
          path="/forgot-password"
          element={withRouteBoundary('forgot-password-route', <ForgotPassword />)}
        />
        <Route
          path="/reset-password"
          element={withRouteBoundary('reset-password-route', <ResetPassword />)}
        />
        <Route
          path="/"
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route index element={withRouteBoundary('projects-route', <Projects />)} />
          <Route
            path="projects/:id"
            element={withRouteBoundary('project-dashboard-route', <ProjectDashboard />)}
          />
          <Route
            path="projects/:id/pages"
            element={withRouteBoundary('project-pages-route', <ProjectPages />)}
          />
          <Route
            path="projects/:id/issues"
            element={withRouteBoundary('project-issues-route', <ProjectIssues />)}
          />
          <Route
            path="projects/:id/keywords"
            element={withRouteBoundary('project-keywords-route', <ProjectKeywords />)}
          />
          <Route
            path="projects/:id/reports"
            element={withRouteBoundary('project-reports-route', <ProjectReports />)}
          />
          <Route path="ai" element={withRouteBoundary('ai-route', <AiAssistant />)} />
          <Route path="users" element={withRouteBoundary('users-route', <Users />)} />
          <Route
            path="change-password"
            element={withRouteBoundary('change-password-route', <ChangePassword />)}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
