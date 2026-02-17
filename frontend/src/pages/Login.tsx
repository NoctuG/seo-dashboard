import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useAuth } from '../auth';

export default function Login() {
  const { signIn, backendUnavailable } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await signIn(email, password);
      navigate(result === '2fa_required' ? '/two-factor/verify' : '/');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const isNetworkIssue = !error.response || error.code === 'ECONNABORTED' || status === 502 || status === 503 || status === 504;
        setError(t(isNetworkIssue ? 'login.errors.backendUnavailable' : 'login.errors.failed'));
      } else {
        setError(t('login.errors.failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>{t('login.title')}</h1>
        {backendUnavailable && (
          <p className="animate-fade-slide-down md-body-medium mb-4 rounded-[var(--shape-small)] border border-[color:color-mix(in_srgb,var(--md-sys-color-error)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--md-sys-color-error)_8%,transparent)] p-3 text-[color:var(--md-sys-color-error)]">
            {t('login.errors.backendUnavailable')}
          </p>
        )}
        <input
          className="app-input mb-3 w-full animate-fade-slide-up animate-stagger-1"
          placeholder={t('login.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          className="app-input mb-3 w-full animate-fade-slide-up animate-stagger-2"
          placeholder={t('login.password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="animate-fade-slide-down md-body-medium mb-3 text-[color:var(--md-sys-color-error)]">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="app-btn app-btn-primary w-full animate-fade-slide-up animate-stagger-3 py-2.5"
        >
          {loading ? t('login.loading') : t('login.submit')}
        </button>
        <p className="mt-4 text-center md-body-medium animate-fade-in animate-stagger-4">
          <Link className="text-[color:var(--md-sys-color-primary)] hover:underline" to="/forgot-password">
            {t('login.forgotPassword')}
          </Link>
        </p>
      </form>
    </div>
  );
}
