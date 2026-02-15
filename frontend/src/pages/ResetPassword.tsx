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
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form className="bg-white rounded shadow p-8 w-full max-w-sm" onSubmit={onSubmit}>
        <h1 className="text-xl font-semibold mb-4">{t('resetPassword.title')}</h1>
        <input className="w-full border p-2 mb-3 rounded" placeholder={t('resetPassword.token')} value={token} onChange={(e) => setToken(e.target.value)} />
        <input type="password" className="w-full border p-2 mb-3 rounded" placeholder={t('resetPassword.newPassword')} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <input type="password" className="w-full border p-2 mb-3 rounded" placeholder={t('resetPassword.confirmPassword')} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {message && <p className="text-sm text-green-600 mb-3">{message}</p>}
        <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50">
          {loading ? t('resetPassword.loading') : t('resetPassword.submit')}
        </button>
        <p className="mt-4 text-sm text-center">
          <Link className="text-blue-600 hover:underline" to="/login">{t('resetPassword.backToLogin')}</Link>
        </p>
      </form>
    </div>
  );
}
