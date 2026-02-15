import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { analyzeSeoWithAi } from '../api';

export default function AiAssistant() {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult('');
    setLoading(true);
    try {
      const data = await analyzeSeoWithAi(content);
      setResult(data.result);
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('aiAssistant.errors.requestFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">{t('aiAssistant.title')}</h1>
      <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">{t('aiAssistant.inputLabel')}</label>
          <textarea
            className="w-full rounded-xl border border-slate-300 px-4 py-3 h-44 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('aiAssistant.placeholder')}
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 text-white font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            <Sparkles size={18} /> {loading ? t('aiAssistant.loading') : t('aiAssistant.submit')}
          </button>
        </form>
      </div>

      {error && <div className="mt-6 rounded-xl bg-red-50 border border-red-200 p-4 text-red-700">{error}</div>}

      {result && (
        <div className="mt-6 bg-white rounded-2xl shadow-md border border-slate-200 p-6">
          <h2 className="text-lg font-semibold mb-3">{t('aiAssistant.result')}</h2>
          <pre className="whitespace-pre-wrap text-sm text-slate-700 leading-6">{result}</pre>
        </div>
      )}
    </div>
  );
}
