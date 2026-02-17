import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { forgotPassword } from '../api';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await forgotPassword(email);
      setMessage(res.message);
    } catch {
      setError(t('forgotPassword.errors.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>{t('forgotPassword.title')}</h1>
        <input
          className="app-input mb-3 w-full animate-fade-slide-up animate-stagger-1"
          placeholder={t('forgotPassword.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
          className="app-btn app-btn-primary w-full animate-fade-slide-up animate-stagger-2 py-2.5"
        >
          {loading ? t('forgotPassword.loading') : t('forgotPassword.submit')}
        </button>
        <p className="mt-4 text-center md-body-medium animate-fade-in animate-stagger-3">
          <Link className="text-[color:var(--md-sys-color-primary)] hover:underline" to="/login">
            {t('forgotPassword.backToLogin')}
          </Link>
        </p>
      </form>
    </div>
  );
}
