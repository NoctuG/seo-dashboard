import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { resetPassword } from '../api';

export default function ResetPassword() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const tokenFromQuery = searchParams.get('token') || '';
  const [token, setToken] = useState(tokenFromQuery);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError(t('resetPassword.errors.missingToken'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('resetPassword.errors.passwordMismatch'));
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await resetPassword(token, newPassword);
      setMessage(res.message);
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setError(t('resetPassword.errors.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>{t('resetPassword.title')}</h1>
        <input
          className="app-input mb-3 w-full animate-fade-slide-up animate-stagger-1"
          placeholder={t('resetPassword.token')}
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <input
          type="password"
          className="app-input mb-3 w-full animate-fade-slide-up animate-stagger-2"
          placeholder={t('resetPassword.newPassword')}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <input
          type="password"
          className="app-input mb-3 w-full animate-fade-slide-up animate-stagger-3"
          placeholder={t('resetPassword.confirmPassword')}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        {error && (
          <p className="animate-fade-slide-down md-body-medium mb-3 text-[color:var(--md-sys-color-error)]">{error}</p>
        )}
        {message && (
          <p className="animate-fade-slide-down md-body-medium mb-3 text-[color:#16a34a]">{message}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="app-btn app-btn-primary w-full animate-fade-slide-up animate-stagger-4 py-2.5"
        >
          {loading ? t('resetPassword.loading') : t('resetPassword.submit')}
        </button>
        <p className="mt-4 text-center md-body-medium animate-fade-in animate-stagger-5">
          <Link className="text-[color:var(--md-sys-color-primary)] hover:underline" to="/login">
            {t('resetPassword.backToLogin')}
          </Link>
        </p>
      </form>
    </div>
  );
}
