import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../api';

export default function ResetPassword() {
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
      setError('缺少重置令牌。');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致。');
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
      setError('重置密码失败，令牌可能已失效。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form className="bg-white rounded shadow p-8 w-full max-w-sm" onSubmit={onSubmit}>
        <h1 className="text-xl font-semibold mb-4">重置密码</h1>
        <input className="w-full border p-2 mb-3 rounded" placeholder="Reset Token" value={token} onChange={(e) => setToken(e.target.value)} />
        <input type="password" className="w-full border p-2 mb-3 rounded" placeholder="新密码" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <input type="password" className="w-full border p-2 mb-3 rounded" placeholder="确认新密码" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {message && <p className="text-sm text-green-600 mb-3">{message}</p>}
        <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50">
          {loading ? '提交中...' : '重置密码'}
        </button>
        <p className="mt-4 text-sm text-center">
          <Link className="text-blue-600 hover:underline" to="/login">返回登录</Link>
        </p>
      </form>
    </div>
  );
}
