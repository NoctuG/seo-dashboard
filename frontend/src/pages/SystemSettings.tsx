import { useEffect, useState } from 'react';
import { getSystemSettings, updateSystemSettings, type SystemSettingsPayload } from '../api';

const initialState: SystemSettingsPayload = {
  smtp: { host: '', port: 587, user: '', password: '', from: '', use_tls: true },
  analytics: {
    provider: 'sample',
    ga4_property_id: '',
    ga4_access_token: '',
    matomo_base_url: '',
    matomo_site_id: '',
    matomo_token_auth: '',
  },
  ai: { base_url: '', api_key: '', model: 'gpt-4o-mini' },
  crawler: { default_max_pages: 50 },
};

export default function SystemSettings() {
  const [form, setForm] = useState<SystemSettingsPayload>(initialState);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSystemSettings();
      setForm({
        smtp: {
          host: data.smtp.host,
          port: data.smtp.port,
          user: data.smtp.user,
          password: data.smtp.password,
          from: data.smtp.from,
          use_tls: data.smtp.use_tls,
        },
        analytics: data.analytics,
        ai: data.ai,
        crawler: data.crawler,
      });
    } catch {
      setError('加载系统设置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await updateSystemSettings(form);
      setForm(updated);
      setMessage('设置已保存');
    } catch {
      setError('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">系统设置</h1>
      <p className="text-sm text-gray-500">敏感字段会脱敏展示，保持为 ******** 则代表不修改原值。</p>

      {loading ? (
        <p>加载中...</p>
      ) : (
        <form onSubmit={save} className="space-y-6">
          <section className="bg-white rounded shadow p-5 space-y-3">
            <h2 className="text-lg font-semibold">SMTP</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <input className="border rounded px-3 py-2" placeholder="Host" value={form.smtp.host} onChange={(e) => setForm({ ...form, smtp: { ...form.smtp, host: e.target.value } })} />
              <input className="border rounded px-3 py-2" type="number" placeholder="Port" value={form.smtp.port} onChange={(e) => setForm({ ...form, smtp: { ...form.smtp, port: Number(e.target.value) } })} />
              <input className="border rounded px-3 py-2" placeholder="User" value={form.smtp.user} onChange={(e) => setForm({ ...form, smtp: { ...form.smtp, user: e.target.value } })} />
              <input className="border rounded px-3 py-2" type="password" placeholder="Password" value={form.smtp.password} onChange={(e) => setForm({ ...form, smtp: { ...form.smtp, password: e.target.value } })} />
              <input className="border rounded px-3 py-2 md:col-span-2" placeholder="From" value={form.smtp.from} onChange={(e) => setForm({ ...form, smtp: { ...form.smtp, from: e.target.value } })} />
            </div>
          </section>

          <section className="bg-white rounded shadow p-5 space-y-3">
            <h2 className="text-lg font-semibold">分析服务</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <select className="border rounded px-3 py-2" value={form.analytics.provider} onChange={(e) => setForm({ ...form, analytics: { ...form.analytics, provider: e.target.value } })}>
                <option value="sample">sample</option>
                <option value="ga4">ga4</option>
                <option value="matomo">matomo</option>
              </select>
              <input className="border rounded px-3 py-2" placeholder="GA4 Property ID" value={form.analytics.ga4_property_id} onChange={(e) => setForm({ ...form, analytics: { ...form.analytics, ga4_property_id: e.target.value } })} />
              <input className="border rounded px-3 py-2" type="password" placeholder="GA4 Access Token" value={form.analytics.ga4_access_token} onChange={(e) => setForm({ ...form, analytics: { ...form.analytics, ga4_access_token: e.target.value } })} />
              <input className="border rounded px-3 py-2" placeholder="Matomo Base URL" value={form.analytics.matomo_base_url} onChange={(e) => setForm({ ...form, analytics: { ...form.analytics, matomo_base_url: e.target.value } })} />
              <input className="border rounded px-3 py-2" placeholder="Matomo Site ID" value={form.analytics.matomo_site_id} onChange={(e) => setForm({ ...form, analytics: { ...form.analytics, matomo_site_id: e.target.value } })} />
              <input className="border rounded px-3 py-2" type="password" placeholder="Matomo Token" value={form.analytics.matomo_token_auth} onChange={(e) => setForm({ ...form, analytics: { ...form.analytics, matomo_token_auth: e.target.value } })} />
            </div>
          </section>

          <section className="bg-white rounded shadow p-5 space-y-3">
            <h2 className="text-lg font-semibold">AI 配置</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <input className="border rounded px-3 py-2" placeholder="Base URL" value={form.ai.base_url} onChange={(e) => setForm({ ...form, ai: { ...form.ai, base_url: e.target.value } })} />
              <input className="border rounded px-3 py-2" placeholder="Model" value={form.ai.model} onChange={(e) => setForm({ ...form, ai: { ...form.ai, model: e.target.value } })} />
              <input className="border rounded px-3 py-2 md:col-span-2" type="password" placeholder="API Key" value={form.ai.api_key} onChange={(e) => setForm({ ...form, ai: { ...form.ai, api_key: e.target.value } })} />
            </div>
          </section>

          <section className="bg-white rounded shadow p-5 space-y-3">
            <h2 className="text-lg font-semibold">默认爬虫参数</h2>
            <input className="border rounded px-3 py-2 w-full md:w-72" type="number" min={1} value={form.crawler.default_max_pages} onChange={(e) => setForm({ ...form, crawler: { default_max_pages: Number(e.target.value) } })} />
          </section>

          <button disabled={saving} className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50" type="submit">
            {saving ? '保存中...' : '保存设置'}
          </button>
        </form>
      )}

      {message && <p className="text-green-600 text-sm">{message}</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
