import { useEffect, useState } from 'react';
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
      setError('Failed to load users');
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
      setError('Failed to create user');
    }
  };

  const handleToggle = async (user: ManagedUser, field: 'is_active' | 'is_superuser') => {
    setError(null);
    try {
      await updateUser(user.id, { [field]: !user[field] });
      await fetchUsers();
    } catch {
      setError('Failed to update user');
    }
  };

  const handleDelete = async (id: number) => {
    setError(null);
    try {
      await deleteUser(id);
      await fetchUsers();
    } catch {
      setError('Failed to delete user');
    }
  };

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      <h1 className="text-2xl font-bold">User Management</h1>

      <form onSubmit={handleCreate} className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-700 max-w-2xl">
        <h2 className="text-lg font-semibold mb-4">Create User</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm">
            Email
            <input
              className="mt-1 w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            Full Name
            <input
              className="mt-1 w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Password
            <input
              className="mt-1 w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </label>
          <div className="flex items-center gap-6 pt-6 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Active
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.is_superuser}
                onChange={(e) => setForm({ ...form, is_superuser: e.target.checked })}
              />
              Superuser
            </label>
          </div>
        </div>
        <button className="mt-4 bg-blue-700 dark:bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-800 dark:hover:bg-blue-500" type="submit">
          Create
        </button>
      </form>

      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}

      <div className="bg-white dark:bg-slate-900 rounded shadow border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Active</th>
              <th className="p-3 text-left">Superuser</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                <td className="p-3">{user.email}</td>
                <td className="p-3">{user.full_name || '-'}</td>
                <td className="p-3">{user.is_active ? 'Yes' : 'No'}</td>
                <td className="p-3">{user.is_superuser ? 'Yes' : 'No'}</td>
                <td className="p-3 space-x-2">
                  <button
                    className="border border-slate-300 dark:border-slate-600 rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => handleToggle(user, 'is_active')}
                  >
                    Toggle Active
                  </button>
                  <button
                    className="border border-slate-300 dark:border-slate-600 rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => handleToggle(user, 'is_superuser')}
                  >
                    Toggle Admin
                  </button>
                  <button
                    className="border border-red-300 dark:border-red-700 rounded px-2 py-1 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
                    onClick={() => handleDelete(user.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && users.length === 0 && <p className="p-4 text-sm text-slate-600 dark:text-slate-300">No users yet.</p>}
      </div>
    </div>
  );
}
