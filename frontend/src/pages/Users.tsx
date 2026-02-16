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
      <h1 className="md-headline-large">{t('users.title')}</h1>

      <form onSubmit={handleCreate} className="app-card max-w-2xl p-6">
        <h2 className="mb-4 md-title-large">{t('users.createUser')}</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="md-label-large">
            {t('users.email')}
            <input className="app-input mt-2 w-full" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label className="md-label-large">
            {t('users.fullName')}
            <input className="app-input mt-2 w-full" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </label>
          <label className="md-label-large">
            {t('users.password')}
            <input className="app-input mt-2 w-full" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </label>
          <div className="flex items-center gap-6 pt-6 md-label-large">
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
        <button className="app-btn app-btn-primary mt-4" type="submit">{t('common.create')}</button>
      </form>

      {error && <p className="md-body-medium text-[color:var(--md-sys-color-error)]">{error}</p>}

      <div className="app-card overflow-hidden">
        <table className="w-full md-body-medium">
          <thead className="border-b border-[color:var(--md-sys-color-outline)] bg-[color:var(--md-sys-color-surface-variant)]">
            <tr>
              <th className="p-4 text-left md-label-large">{t('users.email')}</th>
              <th className="p-4 text-left md-label-large">{t('users.name')}</th>
              <th className="p-4 text-left md-label-large">{t('users.active')}</th>
              <th className="p-4 text-left md-label-large">{t('users.superuser')}</th>
              <th className="p-4 text-left md-label-large">{t('users.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-[color:var(--md-sys-color-outline)] last:border-b-0">
                <td className="p-4">{user.email}</td>
                <td className="p-4">{user.full_name || '-'}</td>
                <td className="p-4">{user.is_active ? t('common.yes') : t('common.no')}</td>
                <td className="p-4">{user.is_superuser ? t('common.yes') : t('common.no')}</td>
                <td className="space-x-2 p-4">
                  <button className="app-btn app-btn-outline py-2" onClick={() => handleToggle(user, 'is_active')}>{t('users.toggleActive')}</button>
                  <button className="app-btn app-btn-outline py-2" onClick={() => handleToggle(user, 'is_superuser')}>{t('users.toggleAdmin')}</button>
                  <button className="app-btn app-btn-danger py-2" onClick={() => handleDelete(user.id)}>{t('common.delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && users.length === 0 && <p className="p-4 md-body-medium text-[color:var(--md-sys-color-on-surface-variant)]">{t('users.empty')}</p>}
      </div>
    </div>
  );
}
