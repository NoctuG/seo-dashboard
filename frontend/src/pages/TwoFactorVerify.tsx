import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth';

export default function TwoFactorVerify() {
  const { completeTwoFactorSignIn } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await completeTwoFactorSignIn(code);
      navigate('/');
    } catch {
      setError(t('twoFactorVerify.errors.invalidCode'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>{t('twoFactorVerify.title')}</h1>
        <p className="md-body-medium mb-4 text-[color:var(--md-sys-color-on-surface-variant)] animate-fade-in">
          {t('twoFactorVerify.description')}
        </p>
        <input
          className="app-input mb-3 w-full animate-fade-slide-up animate-stagger-1"
          placeholder={t('twoFactorVerify.placeholder')}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {error && (
          <p className="animate-fade-slide-down md-body-medium mb-3 text-[color:var(--md-sys-color-error)]">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="app-btn app-btn-primary w-full animate-fade-slide-up animate-stagger-2 py-2.5"
        >
          {loading ? t('twoFactorVerify.loading') : t('twoFactorVerify.submit')}
        </button>
      </form>
    </div>
  );
}
