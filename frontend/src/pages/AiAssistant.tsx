import { useState } from 'react';
import { analyzeSeoWithAi } from '../api';
import { Sparkles } from 'lucide-react';

export default function AiAssistant() {
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
      setError(err?.response?.data?.detail || 'AI 请求失败，请检查配置。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">AI SEO Assistant</h1>
      <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">输入页面内容或SEO文案</label>
          <textarea
            className="w-full rounded-xl border border-slate-300 px-4 py-3 h-44 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="粘贴页面主要内容、标题、描述或产品文案..."
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 text-white font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            <Sparkles size={18} /> {loading ? '分析中...' : 'AI 分析'}
          </button>
        </form>
      </div>

      {error && <div className="mt-6 rounded-xl bg-red-50 border border-red-200 p-4 text-red-700">{error}</div>}

      {result && (
        <div className="mt-6 bg-white rounded-2xl shadow-md border border-slate-200 p-6">
          <h2 className="text-lg font-semibold mb-3">分析结果</h2>
          <pre className="whitespace-pre-wrap text-sm text-slate-700 leading-6">{result}</pre>
        </div>
      )}
    </div>
  );
}
