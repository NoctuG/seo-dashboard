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
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form className="bg-white rounded shadow p-8 w-full max-w-sm" onSubmit={onSubmit}>
        <h1 className="text-xl font-semibold mb-4">{t('login.title')}</h1>
        {backendUnavailable && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-3">{t('login.errors.backendUnavailable')}</p>}
        <input className="w-full border p-2 mb-3 rounded" placeholder={t('login.email')} value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" className="w-full border p-2 mb-3 rounded" placeholder={t('login.password')} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50">
          {loading ? t('login.loading') : t('login.submit')}
        </button>
        <p className="mt-4 text-sm text-center">
          <Link className="text-blue-600 hover:underline" to="/forgot-password">{t('login.forgotPassword')}</Link>
        </p>
      </form>
    </div>
  );
}
