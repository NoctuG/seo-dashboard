import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changePassword } from '../api';

export default function ChangePassword() {
  const { t } = useTranslation();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError(t('changePassword.errors.passwordMismatch'));
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await changePassword(oldPassword, newPassword);
      setMessage(res.message);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setError(t('changePassword.errors.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold mb-4">{t('changePassword.title')}</h1>
      <form className="bg-white rounded border p-6" onSubmit={onSubmit}>
        <input type="password" className="w-full border p-2 mb-3 rounded" placeholder={t('changePassword.oldPassword')} value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
        <input type="password" className="w-full border p-2 mb-3 rounded" placeholder={t('changePassword.newPassword')} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <input type="password" className="w-full border p-2 mb-3 rounded" placeholder={t('changePassword.confirmPassword')} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {message && <p className="text-sm text-green-600 mb-3">{message}</p>}
        <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
          {loading ? t('changePassword.loading') : t('changePassword.submit')}
        </button>
      </form>
    </div>
  );
}
