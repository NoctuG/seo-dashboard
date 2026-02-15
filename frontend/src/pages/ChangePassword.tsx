import { useState } from 'react';
import { changePassword } from '../api';

export default function ChangePassword() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致。');
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
      setError('修改密码失败，请检查旧密码。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold mb-4">修改密码</h1>
      <form className="bg-white rounded border p-6" onSubmit={onSubmit}>
        <input type="password" className="w-full border p-2 mb-3 rounded" placeholder="旧密码" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
        <input type="password" className="w-full border p-2 mb-3 rounded" placeholder="新密码" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <input type="password" className="w-full border p-2 mb-3 rounded" placeholder="确认新密码" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {message && <p className="text-sm text-green-600 mb-3">{message}</p>}
        <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
          {loading ? '提交中...' : '更新密码'}
        </button>
      </form>
    </div>
  );
}
