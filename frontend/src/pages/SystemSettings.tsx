import { useEffect, useState } from 'react';
import {
  createWebhookConfig,
  deleteWebhookConfig,
  listWebhookConfigs,
  listWebhookEvents,
  updateWebhookConfig,
  type WebhookConfig,
} from '../api';

export default function SystemSettings() {
  const [configs, setConfigs] = useState<WebhookConfig[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [webhookEvents, webhookConfigs] = await Promise.all([listWebhookEvents(), listWebhookConfigs()]);
      setEvents(webhookEvents);
      setConfigs(webhookConfigs);
    } catch (err: any) {
      setError(err?.response?.data?.detail || '加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) => (prev.includes(event) ? prev.filter((item) => item !== event) : [...prev, event]));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createWebhookConfig({ url, secret, subscribed_events: selectedEvents, enabled: true });
    setUrl('');
    setSecret('');
    setSelectedEvents([]);
    await load();
  };

  const handleToggleEnabled = async (config: WebhookConfig) => {
    await updateWebhookConfig(config.id, { enabled: !config.enabled });
    await load();
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确认删除该 webhook 配置？')) return;
    await deleteWebhookConfig(id);
    await load();
  };

  if (loading) return <div>加载中...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">系统设置 / Webhook 通知</h1>
      {error && <div className="p-3 rounded border border-red-200 bg-red-50 text-red-700">{error}</div>}

      <form onSubmit={handleCreate} className="space-y-4 border rounded bg-white p-4">
        <h2 className="text-lg font-semibold">新增 Webhook</h2>
        <input className="w-full border rounded p-2" placeholder="Webhook URL" value={url} onChange={(e) => setUrl(e.target.value)} required />
        <input className="w-full border rounded p-2" placeholder="Secret" value={secret} onChange={(e) => setSecret(e.target.value)} required />
        <div>
          <div className="text-sm text-gray-600 mb-2">订阅事件</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {events.map((event) => (
              <label key={event} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selectedEvents.includes(event)} onChange={() => toggleEvent(event)} />
                <span>{event}</span>
              </label>
            ))}
          </div>
        </div>
        <button className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700" type="submit">
          保存配置
        </button>
      </form>

      <div className="border rounded bg-white p-4">
        <h2 className="text-lg font-semibold mb-3">现有配置</h2>
        <div className="space-y-3">
          {configs.map((config) => (
            <div key={config.id} className="border rounded p-3">
              <div className="font-medium">{config.url}</div>
              <div className="text-sm text-gray-600">事件: {config.subscribed_events.join(', ') || '-'}</div>
              <div className="text-xs text-gray-500 mt-1">secret: {config.secret}</div>
              <div className="mt-3 flex gap-2">
                <button
                  className="px-3 py-1 rounded border hover:bg-gray-50"
                  onClick={() => handleToggleEnabled(config)}
                  type="button"
                >
                  {config.enabled ? '禁用' : '启用'}
                </button>
                <button className="px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50" onClick={() => handleDelete(config.id)} type="button">
                  删除
                </button>
              </div>
            </div>
          ))}
          {!configs.length && <div className="text-sm text-gray-500">暂无 webhook 配置。</div>}
        </div>
      </div>
    </div>
  );
}
