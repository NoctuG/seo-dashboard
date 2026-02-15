import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createUser,
  deleteUser,
  getUsers,
  updateUser,
  type CreateUserPayload,
  type ManagedUser,
} from '../api';

const initialForm: CreateUserPayload = {
  email: '',
  full_name: '',
  password: '',
  is_active: true,
  is_superuser: false,
};

export default function Users() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [form, setForm] = useState<CreateUserPayload>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch {
      setError(t('users.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createUser(form);
      setForm(initialForm);
      await fetchUsers();
    } catch {
      setError(t('users.errors.createFailed'));
    }
  };

  const handleToggle = async (user: ManagedUser, field: 'is_active' | 'is_superuser') => {
    setError(null);
    try {
      await updateUser(user.id, { [field]: !user[field] });
      await fetchUsers();
    } catch {
      setError(t('users.errors.updateFailed'));
    }
  };

  const handleDelete = async (id: number) => {
    setError(null);
    try {
      await deleteUser(id);
      await fetchUsers();
    } catch {
      setError(t('users.errors.deleteFailed'));
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('users.title')}</h1>

      <form onSubmit={handleCreate} className="bg-white p-6 rounded shadow max-w-2xl">
        <h2 className="text-lg font-semibold mb-4">{t('users.createUser')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm">
            {t('users.email')}
            <input className="mt-1 w-full border rounded px-3 py-2" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label className="text-sm">
            {t('users.fullName')}
            <input className="mt-1 w-full border rounded px-3 py-2" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </label>
          <label className="text-sm">
            {t('users.password')}
            <input className="mt-1 w-full border rounded px-3 py-2" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </label>
          <div className="flex items-center gap-6 pt-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              {t('users.active')}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!form.is_superuser} onChange={(e) => setForm({ ...form, is_superuser: e.target.checked })} />
              {t('users.superuser')}
            </label>
          </div>
        </div>
        <button className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700" type="submit">{t('common.create')}</button>
      </form>

      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}

      <div className="bg-white dark:bg-slate-900 rounded shadow border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="p-3 text-left">{t('users.email')}</th>
              <th className="p-3 text-left">{t('users.name')}</th>
              <th className="p-3 text-left">{t('users.active')}</th>
              <th className="p-3 text-left">{t('users.superuser')}</th>
              <th className="p-3 text-left">{t('users.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                <td className="p-3">{user.email}</td>
                <td className="p-3">{user.full_name || '-'}</td>
                <td className="p-3">{user.is_active ? t('common.yes') : t('common.no')}</td>
                <td className="p-3">{user.is_superuser ? t('common.yes') : t('common.no')}</td>
                <td className="p-3 space-x-2">
                  <button className="border rounded px-2 py-1 hover:bg-gray-100" onClick={() => handleToggle(user, 'is_active')}>{t('users.toggleActive')}</button>
                  <button className="border rounded px-2 py-1 hover:bg-gray-100" onClick={() => handleToggle(user, 'is_superuser')}>{t('users.toggleAdmin')}</button>
                  <button className="border rounded px-2 py-1 text-red-600 hover:bg-red-50" onClick={() => handleDelete(user.id)}>{t('common.delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && users.length === 0 && <p className="p-4 text-sm text-gray-500">{t('users.empty')}</p>}
      </div>
    </div>
  );
}
