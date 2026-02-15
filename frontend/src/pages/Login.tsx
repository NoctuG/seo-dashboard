import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth';

export default function Login() {
  const { signIn } = useAuth();
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
      await signIn(email, password);
      navigate('/');
    } catch {
      setError(t('login.errors.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form className="bg-white rounded shadow p-8 w-full max-w-sm" onSubmit={onSubmit}>
        <h1 className="text-xl font-semibold mb-4">{t('login.title')}</h1>
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
