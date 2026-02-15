import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import App from './App.tsx';
import { AuthProvider } from './auth';
import ErrorBoundary from './components/ErrorBoundary';
import { applyThemePreference, getStoredThemePreference } from './theme';

applyThemePreference(getStoredThemePreference());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ErrorBoundary scope="root">
        <App />
      </ErrorBoundary>
    </AuthProvider>
  </StrictMode>
);
