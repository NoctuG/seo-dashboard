import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function TwoFactorVerify() {
  const { completeTwoFactorSignIn } = useAuth();
  const navigate = useNavigate();
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
      setError('验证码无效，请重试。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form className="bg-white rounded shadow p-8 w-full max-w-sm" onSubmit={onSubmit}>
        <h1 className="text-xl font-semibold mb-2">两步验证</h1>
        <p className="text-sm text-gray-500 mb-4">请输入认证器中的 6 位验证码或备份码。</p>
        <input
          className="w-full border p-2 mb-3 rounded"
          placeholder="123456 或 ABCD-1234"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50">
          {loading ? '验证中...' : '验证并登录'}
        </button>
      </form>
    </div>
  );
}
