import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import i18n from '../i18n';

type ErrorBoundaryProps = {
  children: ReactNode;
  scope?: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
};

const reportError = async (error: Error, errorInfo: ErrorInfo, scope: string) => {
  console.error(`[ErrorBoundary:${scope}]`, error, errorInfo);

  const reportUrl = import.meta.env.VITE_ERROR_REPORT_URL;
  if (!reportUrl) {
    return;
  }

  try {
    await fetch(reportUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scope,
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        userAgent: navigator.userAgent,
        occurredAt: new Date().toISOString(),
      }),
    });
  } catch (reportingError) {
    console.error('[ErrorBoundary] failed to report error', reportingError);
  }
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: undefined,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const scope = this.props.scope ?? 'app';
    void reportError(error, errorInfo, scope);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto flex min-h-[40vh] w-full max-w-2xl flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 p-8 text-center shadow-sm">
          <h2 className="text-2xl font-semibold text-red-700">{i18n.t('errorBoundary.title')}</h2>
          <p className="mt-2 text-sm text-red-600">{i18n.t('errorBoundary.description')}</p>
          {this.state.error?.message ? (
            <p className="mt-3 break-all rounded-md bg-white px-3 py-2 text-xs text-red-500">
              {this.state.error.message}
            </p>
          ) : null}
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
              onClick={this.handleRetry}
            >
              {i18n.t('errorBoundary.retry')}
            </button>
            <button
              type="button"
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
              onClick={this.handleGoHome}
            >
              {i18n.t('errorBoundary.goHome')}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
