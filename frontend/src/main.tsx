import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import './i18n';
import App from './App.tsx';
import { AuthProvider } from './auth';
import ErrorBoundary from './components/ErrorBoundary';
import { applyThemePreference, getStoredThemePreference } from './theme';
import { queryClient } from './queryClient';

applyThemePreference(getStoredThemePreference());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed — offline caching won't be available.
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ErrorBoundary scope="root">
          <App />
        </ErrorBoundary>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
