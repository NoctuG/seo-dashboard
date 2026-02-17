import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createWebhookConfig,
  deleteWebhookConfig,
  listWebhookConfigs,
  listWebhookEvents,
  updateWebhookConfig,
  type WebhookConfig,
} from '../api';
import { runWithUiState } from '../utils/asyncAction';
import { getErrorMessage } from '../utils/error';

export default function SystemSettings() {
  const { t } = useTranslation();
  const [configs, setConfigs] = useState<WebhookConfig[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const load = async () => {
    await runWithUiState(async () => {
      const [webhookEvents, webhookConfigs] = await Promise.all([listWebhookEvents(), listWebhookConfigs()]);
      setEvents(webhookEvents);
      setConfigs(webhookConfigs);
    }, {
      setLoading,
      setError,
      clearErrorValue: null,
      formatError: (error: unknown) => getErrorMessage(error, t('systemSettings.errors.loadFailed')),
    });
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
    if (!window.confirm(t('systemSettings.confirmDelete'))) return;
    await deleteWebhookConfig(id);
    await load();
  };

  if (loading) return <div>{t('common.loading')}</div>;

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="md-headline-large">{t('systemSettings.title')}</h1>
      {error && <div className="shape-small border border-[color:var(--md-sys-color-error)] bg-[color:color-mix(in_srgb,var(--md-sys-color-error)_14%,transparent)] p-4 text-[color:var(--md-sys-color-error)]">{error}</div>}

      <form onSubmit={handleCreate} className="app-card space-y-4 p-4">
        <h2 className="md-title-large">{t('systemSettings.addWebhook')}</h2>
        <input className="app-input w-full" placeholder={t('systemSettings.webhookUrl')} value={url} onChange={(e) => setUrl(e.target.value)} required />
        <input className="app-input w-full" placeholder={t('systemSettings.secret')} value={secret} onChange={(e) => setSecret(e.target.value)} required />
        <div>
          <div className="mb-2 md-body-medium text-[color:var(--md-sys-color-on-surface-variant)]">{t('systemSettings.subscribedEvents')}</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {events.map((event) => (
              <label key={event} className="flex items-center gap-2 md-label-large">
                <input type="checkbox" checked={selectedEvents.includes(event)} onChange={() => toggleEvent(event)} />
                <span>{event}</span>
              </label>
            ))}
          </div>
        </div>
        <button className="app-btn app-btn-primary" type="submit">{t('systemSettings.saveConfig')}</button>
      </form>

      <div className="app-card p-4">
        <h2 className="mb-4 md-title-large">{t('systemSettings.existingConfigs')}</h2>
        <div className="space-y-4">
          {configs.map((config) => (
            <div key={config.id} className="shape-small border border-[color:var(--md-sys-color-outline)] p-4">
              <div className="md-title-medium">{config.url}</div>
              <div className="md-body-medium text-[color:var(--md-sys-color-on-surface-variant)]">{t('systemSettings.events')}: {config.subscribed_events.join(', ') || '-'}</div>
              <div className="mt-2 md-label-medium text-[color:var(--md-sys-color-on-surface-variant)]">secret: {config.secret}</div>
              <div className="mt-4 flex gap-2">
                <button className="app-btn app-btn-outline" onClick={() => handleToggleEnabled(config)} type="button">
                  {config.enabled ? t('systemSettings.disable') : t('systemSettings.enable')}
                </button>
                <button className="app-btn app-btn-danger" onClick={() => handleDelete(config.id)} type="button">
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
          {!configs.length && <div className="md-body-medium text-[color:var(--md-sys-color-on-surface-variant)]">{t('systemSettings.empty')}</div>}
        </div>
      </div>
    </div>
  );
}
