import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  createReportSchedule,
  createReportTemplate,
  deleteReportSchedule,
  exportProjectReport,
  getReportLogs,
  getReportSchedules,
  getReportTemplates,
} from '../api';
import type { ReportDeliveryLog, ReportSchedule, ReportTemplate } from '../api';

export default function ProjectReports() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [logs, setLogs] = useState<ReportDeliveryLog[]>([]);
  const [name, setName] = useState('Weekly SEO Summary');
  const [indicators, setIndicators] = useState('traffic,rank,conversion');
  const [timeRange, setTimeRange] = useState('30d');
  const [templateLocale, setTemplateLocale] = useState(i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US');
  const [brandPrimary, setBrandPrimary] = useState('#1d4ed8');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv');
  const [cron, setCron] = useState('0 9 * * 1');
  const [email, setEmail] = useState('ops@example.com');

  const dtf = useMemo(() => new Intl.DateTimeFormat(templateLocale, { dateStyle: 'medium', timeStyle: 'short' }), [templateLocale]);

  const reload = async () => {
    if (!id) return;
    const [templateData, scheduleData, logData] = await Promise.all([
      getReportTemplates(id),
      getReportSchedules(id),
      getReportLogs(id),
    ]);
    setTemplates(templateData);
    setSchedules(scheduleData);
    setLogs(logData);
    if (!selectedTemplateId && templateData[0]) {
      setSelectedTemplateId(templateData[0].id);
    }
  };

  useEffect(() => {
    reload();
  }, [id]);

  const handleCreateTemplate = async () => {
    if (!id) return;
    const template = await createReportTemplate(id, {
      name,
      indicators: indicators.split(',').map((item) => item.trim()).filter(Boolean),
      brand_styles: { primary: brandPrimary },
      time_range: timeRange,
      locale: templateLocale,
    });
    setSelectedTemplateId(template.id);
    await reload();
  };

  const handleExport = async () => {
    if (!id || !selectedTemplateId) return;
    const blob = await exportProjectReport(id, { template_id: selectedTemplateId, format, locale: templateLocale });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-${id}-report.${format}`;
    a.click();
    window.URL.revokeObjectURL(url);
    await reload();
  };

  const handleCreateSchedule = async () => {
    if (!id || !selectedTemplateId) return;
    await createReportSchedule(id, {
      template_id: selectedTemplateId,
      cron_expression: cron,
      timezone: 'UTC',
      recipient_email: email,
      active: true,
      retry_limit: 2,
    });
    await reload();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('reports.title')}</h1>

      <section className="bg-white rounded shadow p-4 space-y-3">
        <h2 className="font-semibold">{t('reports.templateEditor')}</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <input className="border rounded px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" />
          <input className="border rounded px-3 py-2" value={timeRange} onChange={(e) => setTimeRange(e.target.value)} placeholder="30d / 90d / 12m" />
          <input className="border rounded px-3 py-2" value={indicators} onChange={(e) => setIndicators(e.target.value)} placeholder="comma separated indicators" />
          <input className="border rounded px-3 py-2" value={brandPrimary} onChange={(e) => setBrandPrimary(e.target.value)} placeholder="brand primary color" />
          <select className="border rounded px-3 py-2" value={templateLocale} onChange={(e) => setTemplateLocale(e.target.value)}>
            <option value="zh-CN">{t('reports.templateLocale')} zh-CN</option>
            <option value="en-US">{t('reports.templateLocale')} en-US</option>
          </select>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={handleCreateTemplate}>Save Template</button>
      </section>

      <section className="bg-white rounded shadow p-4 space-y-3">
        <h2 className="font-semibold">Manual Export</h2>
        <div className="flex flex-wrap gap-3">
          <select className="border rounded px-3 py-2" value={selectedTemplateId ?? ''} onChange={(e) => setSelectedTemplateId(Number(e.target.value))}>
            <option value="">Select template</option>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
          <select className="border rounded px-3 py-2" value={format} onChange={(e) => setFormat(e.target.value as 'csv' | 'pdf')}>
            <option value="csv">CSV</option>
            <option value="pdf">PDF</option>
          </select>
          <button className="bg-emerald-600 text-white px-4 py-2 rounded" onClick={handleExport}>Export Now</button>
        </div>
      </section>

      <section className="bg-white rounded shadow p-4 space-y-3">
        <h2 className="font-semibold">Schedule Management</h2>
        <div className="flex flex-wrap gap-3">
          <input className="border rounded px-3 py-2" value={cron} onChange={(e) => setCron(e.target.value)} placeholder="cron expression" />
          <input className="border rounded px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="recipient email" />
          <button className="bg-indigo-600 text-white px-4 py-2 rounded" onClick={handleCreateSchedule}>Create Schedule</button>
        </div>
        <ul className="text-sm space-y-2">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="border rounded p-2 flex justify-between">
              <span>{schedule.cron_expression} → {schedule.recipient_email}</span>
              <button className="text-red-600" onClick={() => id && deleteReportSchedule(id, schedule.id).then(reload)}>Delete</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white rounded shadow p-4 space-y-3">
        <h2 className="font-semibold">Delivery Logs</h2>
        <ul className="text-sm space-y-2 max-h-72 overflow-auto">
          {logs.map((log) => (
            <li key={log.id} className="border rounded p-2">
              <div className="font-medium">{log.status.toUpperCase()} · {log.format} · retries={new Intl.NumberFormat(templateLocale).format(log.retries)}</div>
              <div className="text-gray-600">{log.recipient_email || 'manual'} · {dtf.format(new Date(log.created_at))}</div>
              {log.error_message && <div className="text-red-600">{log.error_message}</div>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
