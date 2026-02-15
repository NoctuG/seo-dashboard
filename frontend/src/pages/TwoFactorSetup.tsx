import { useState } from 'react';
import { bindTwoFactor, enableTwoFactor } from '../api';

export default function TwoFactorSetup() {
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const startBind = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await bindTwoFactor();
      setSecret(data.secret);
      setOtpauthUrl(data.otpauth_url);
      setMessage('请扫描二维码，并输入一次验证码完成绑定。');
      setBackupCodes([]);
    } catch {
      setError('无法创建 2FA 绑定，请稍后再试。');
    } finally {
      setLoading(false);
    }
  };

  const enable = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await enableTwoFactor(code);
      setBackupCodes(data.backup_codes);
      setMessage(data.message);
    } catch {
      setError('验证码无效，启用失败。');
    } finally {
      setLoading(false);
    }
  };

  const qrUrl = otpauthUrl ? `https://quickchart.io/qr?text=${encodeURIComponent(otpauthUrl)}` : null;

  return (
    <div className="max-w-2xl mx-auto bg-white rounded shadow p-6">
      <h1 className="text-xl font-semibold mb-2">双重认证（2FA）</h1>
      <p className="text-sm text-gray-600 mb-4">为账号绑定认证器，提升登录安全性。</p>

      {!secret && (
        <button onClick={startBind} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
          {loading ? '生成中...' : '开始绑定'}
        </button>
      )}

      {secret && (
        <div className="space-y-4">
          {qrUrl && <img src={qrUrl} alt="2FA QR Code" className="w-48 h-48 border rounded" />}
          <p className="text-sm">手动密钥：<span className="font-mono">{secret}</span></p>
          <form onSubmit={enable} className="space-y-3">
            <input
              className="w-full border p-2 rounded"
              placeholder="输入认证器 6 位验证码"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button type="submit" disabled={loading} className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50">
              {loading ? '启用中...' : '启用 2FA'}
            </button>
          </form>
        </div>
      )}

      {message && <p className="text-sm text-green-700 mt-4">{message}</p>}
      {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

      {backupCodes.length > 0 && (
        <div className="mt-6 p-4 bg-yellow-50 border rounded">
          <p className="text-sm font-medium mb-2">请保存备份码（仅显示一次）：</p>
          <ul className="grid grid-cols-2 gap-2 text-sm font-mono">
            {backupCodes.map((backupCode) => (
              <li key={backupCode}>{backupCode}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
