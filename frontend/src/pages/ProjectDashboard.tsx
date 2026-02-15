import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  api,
  getProjectAuthority,
  getProjectBacklinks,
  getProjectBacklinkChanges,
  getProjectContentPerformance,
} from '../api';
import type {
  DashboardStats,
  ContentPerformanceResponse,
  ContentPerformanceItem,
  AuthorityResponse,
  BacklinkResponse,
  BacklinkChangesResponse,
} from '../api';
import {
  Play,
  AlertTriangle,
  Info,
  AlertOctagon,
  TrendingUp,
  TrendingDown,
  Activity,
  MousePointerClick,
  Shield,
  Link as LinkIcon,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  Legend,
} from 'recharts';

export default function ProjectDashboard() {
  const { id } = useParams<{ id: string }>();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [maxPages, setMaxPages] = useState(50);
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [contentPerformance, setContentPerformance] = useState<ContentPerformanceResponse | null>(null);
  const [window, setWindow] = useState<'7d' | '30d' | '90d'>('30d');
  const [sort, setSort] = useState<'traffic' | 'conversion_rate' | 'decay'>('traffic');
  const [authority, setAuthority] = useState<AuthorityResponse | null>(null);
  const [backlinks, setBacklinks] = useState<BacklinkResponse | null>(null);
  const [changes, setChanges] = useState<BacklinkChangesResponse | null>(null);
  const [brandWindow, setBrandWindow] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    if (id) {
      fetchDashboard();
      fetchContentPerformance();
      fetchBacklinkData();
    }
  }, [id]);

  useEffect(() => {
    if (id) fetchContentPerformance();
  }, [id, window, sort]);

  const fetchDashboard = async () => {
    try {
      const res = await api.get(`/projects/${id}/dashboard`);
      setStats(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBacklinkData = async () => {
    if (!id) return;
    try {
      const [authorityData, backlinkData, changesData] = await Promise.all([
        getProjectAuthority(id),
        getProjectBacklinks(id),
        getProjectBacklinkChanges(id),
      ]);
      setAuthority(authorityData);
      setBacklinks(backlinkData);
      setChanges(changesData);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchContentPerformance = async () => {
    if (!id) return;
    try {
      const data = await getProjectContentPerformance(id, window, sort);
      setContentPerformance(data);
    } catch (error) {
      console.error(error);
    }
  };

  const startCrawl = async () => {
    try {
      await api.post(`/projects/${id}/crawl`, null, {
        params: {
          max_pages: maxPages,
          sitemap_url: sitemapUrl || undefined,
        },
      });
      fetchDashboard();
      alert('Crawl started!');
    } catch (error) {
      console.error(error);
    }
  };

  if (loading || !stats) return <div>Loading...</div>;

  const { last_crawl, issues_breakdown, analytics } = stats;
  const hasGrowth = analytics.period.growth_pct >= 0;

  const brandWindowDays = brandWindow === '7d' ? 7 : brandWindow === '30d' ? 30 : 90;
  const brandSeries = useMemo(() => {
    const rows = [...(analytics.daily_brand_segments || [])];
    return rows.slice(Math.max(rows.length - brandWindowDays, 0));
  }, [analytics.daily_brand_segments, brandWindowDays]);

  const brandSummary = useMemo(() => {
    return brandSeries.reduce(
      (acc, row) => ({
        brandSessions: acc.brandSessions + row.brand_sessions,
        nonBrandSessions: acc.nonBrandSessions + row.non_brand_sessions,
        brandConversions: acc.brandConversions + row.brand_conversions,
        nonBrandConversions: acc.nonBrandConversions + row.non_brand_conversions,
      }),
      { brandSessions: 0, nonBrandSessions: 0, brandConversions: 0, nonBrandConversions: 0 },
    );
  }, [brandSeries]);

  const qualityCards = [
    { label: 'Engaged Sessions', value: analytics.quality_metrics.engaged_sessions },
    { label: 'Avg Engagement Time (s)', value: analytics.quality_metrics.avg_engagement_time },
    { label: 'Pages / Session', value: analytics.quality_metrics.pages_per_session },
    { label: 'Key Events', value: analytics.quality_metrics.key_events },
  ];

  const renderContentList = (title: string, items: ContentPerformanceItem[]) => (
    <div className="bg-white p-6 rounded shadow">
      <h3 className="font-semibold mb-3">{title}</h3>
      <ul className="space-y-3 text-sm">
        {items.length === 0 && <li className="text-gray-500">No data</li>}
        {items.map((item) => (
          <li key={`${title}-${item.url}`} className="border-b pb-2">
            <a href={item.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">
              {item.url}
            </a>
            <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-3">
              <span>Sessions: {item.sessions}</span>
              <span>CVR: {item.conversion_rate}%</span>
              <span>7d: {item.change_7d}%</span>
              {item.decay_flag && <span className="text-red-600">Decay</span>}
            </div>
            {item.suggested_action && <p className="text-xs text-orange-700 mt-1">{item.suggested_action}</p>}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button onClick={startCrawl} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-blue-700">
          <Play size={18} /> Start New Crawl
        </button>
      </div>


      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-gray-700">Max pages</span>
          <input
            type="number"
            min={1}
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value) || 1)}
            className="border rounded px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-gray-700">Sitemap URL (optional)</span>
          <input
            type="url"
            placeholder="https://example.com/sitemap.xml"
            value={sitemapUrl}
            onChange={(e) => setSitemapUrl(e.target.value)}
            className="border rounded px-3 py-2"
          />
        </label>
      </div>

      {(authority?.notes?.length || backlinks?.notes?.length || analytics.notes.length > 0) && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded p-4 text-sm text-yellow-900 space-y-1">
          {analytics.notes.map((note) => <p key={`analytics-${note}`}>{note}</p>)}
          {authority?.notes?.map((note) => <p key={`authority-${note}`}>{note}</p>)}
          {backlinks?.notes?.map((note) => <p key={`backlinks-${note}`}>{note}</p>)}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-gray-500 text-sm uppercase">Total Pages</h3>
          <p className="text-3xl font-bold">{stats.total_pages}</p>
        </div>
        <div className="bg-white p-6 rounded shadow border-l-4 border-red-500">
          <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2"><AlertOctagon size={16}/>Critical</h3>
          <p className="text-3xl font-bold text-red-600">{issues_breakdown.critical}</p>
        </div>
        <div className="bg-white p-6 rounded shadow border-l-4 border-yellow-500">
          <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2"><AlertTriangle size={16}/>Warning</h3>
          <p className="text-3xl font-bold text-yellow-600">{issues_breakdown.warning}</p>
        </div>
        <div className="bg-white p-6 rounded shadow border-l-4 border-blue-500">
          <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2"><Info size={16}/>Info</h3>
          <p className="text-3xl font-bold text-blue-600">{issues_breakdown.info}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2"><Shield size={16}/>Domain Authority</h3>
          <p className="text-3xl font-bold">{authority?.domain_authority ?? 0}</p>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2"><LinkIcon size={16}/>Backlinks</h3>
          <p className="text-3xl font-bold">{backlinks?.backlinks_total ?? 0}</p>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-gray-500 text-sm uppercase">Ref Domains</h3>
          <p className="text-3xl font-bold">{backlinks?.ref_domains ?? 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded shadow h-72">
          <h3 className="font-semibold mb-3">Authority Trend</h3>
          <ResponsiveContainer width="100%" height="90%">
            <LineChart data={authority?.history ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="domain_authority" stroke="#2563eb" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded shadow h-72">
          <h3 className="font-semibold mb-3">Backlink Trend</h3>
          <ResponsiveContainer width="100%" height="90%">
            <LineChart data={backlinks?.history ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="backlinks_total" stroke="#16a34a" strokeWidth={2} />
              <Line type="monotone" dataKey="ref_domains" stroke="#f59e0b" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-6 rounded shadow mb-8 overflow-x-auto">
        <h3 className="font-semibold mb-3">最近新增 / 失效外链</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="pb-2">状态</th>
              <th className="pb-2">Source</th>
              <th className="pb-2">URL</th>
              <th className="pb-2">Anchor</th>
              <th className="pb-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {[...(changes?.new_links ?? []).map((l) => ({ ...l, status: '新增' })), ...(changes?.lost_links ?? []).map((l) => ({ ...l, status: '失效' }))].map((item, idx) => (
              <tr key={`${item.status}-${item.url}-${idx}`} className="border-b">
                <td className="py-2">{item.status}</td>
                <td className="py-2">{item.source ?? '—'}</td>
                <td className="py-2 break-all">{item.url}</td>
                <td className="py-2">{item.anchor ?? '—'}</td>
                <td className="py-2">{item.date ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2"><Activity size={16}/>Daily Avg</h3>
          <p className="text-3xl font-bold">{analytics.period.daily_average}</p>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-gray-500 text-sm uppercase">Monthly Sessions</h3>
          <p className="text-3xl font-bold">{analytics.period.monthly_total}</p>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-gray-500 text-sm uppercase">Growth</h3>
          <p className={`text-3xl font-bold flex items-center gap-2 ${hasGrowth ? 'text-green-600' : 'text-red-600'}`}>
            {hasGrowth ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
            {analytics.period.growth_pct}%
          </p>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2"><MousePointerClick size={16}/>Conversions</h3>
          <p className="text-3xl font-bold">{analytics.totals.conversions}</p>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-6">
        {qualityCards.map((card) => (
          <div key={card.label} className="bg-white p-6 rounded shadow">
            <h3 className="text-gray-500 text-sm uppercase">{card.label}</h3>
            <p className="text-3xl font-bold">{card.value ?? '—'}</p>
          </div>
        ))}
      </div>

      <div className="bg-white p-6 rounded shadow mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Brand vs Non-brand</h3>
          <select
            value={brandWindow}
            onChange={(e) => setBrandWindow(e.target.value as '7d' | '30d' | '90d')}
            className="border rounded px-3 py-1 text-sm"
          >
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3 text-sm">
          <div>Brand Sessions: <span className="font-semibold">{brandSummary.brandSessions}</span> · Conversions: <span className="font-semibold">{brandSummary.brandConversions}</span></div>
          <div>Non-brand Sessions: <span className="font-semibold">{brandSummary.nonBrandSessions}</span> · Conversions: <span className="font-semibold">{brandSummary.nonBrandConversions}</span></div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={brandSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="brand_sessions" fill="#2563eb" name="Brand Sessions" />
              <Bar dataKey="non_brand_sessions" fill="#94a3b8" name="Non-brand Sessions" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <h2 className="text-xl font-bold mr-3">Content Performance</h2>
        <select value={window} onChange={(e) => setWindow(e.target.value as '7d' | '30d' | '90d')} className="border rounded px-3 py-2 text-sm">
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
          <option value="90d">90 days</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as 'traffic' | 'conversion_rate' | 'decay')} className="border rounded px-3 py-2 text-sm">
          <option value="traffic">Sort: Traffic</option>
          <option value="conversion_rate">Sort: Conversion Rate</option>
          <option value="decay">Sort: Decay</option>
        </select>
        <Link to={`/projects/${id}/pages`} className="text-sm text-blue-600 hover:underline">View page details</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {renderContentList('热门内容', contentPerformance?.top_content ?? [])}
        {renderContentList('高转化页面', contentPerformance?.top_conversion ?? [])}
        {renderContentList('衰减页面', contentPerformance?.decaying_content ?? [])}
      </div>

      {last_crawl ? (
        <div className="bg-white p-6 rounded shadow">
          <h2 className="text-xl font-bold mb-4">Last Crawl Status</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-gray-500">Status:</span>
              <span className={`ml-2 px-2 py-1 rounded text-sm ${
                last_crawl.status === 'completed' ? 'bg-green-100 text-green-800' :
                last_crawl.status === 'failed' ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {last_crawl.status}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Date:</span>
              <span className="ml-2">{new Date(last_crawl.start_time).toLocaleString()}</span>
            </div>
          </div>
          <div className="mt-4 flex gap-4">
            <Link to={`/projects/${id}/pages`} className="text-blue-600 hover:underline">View Pages</Link>
            <Link to={`/projects/${id}/issues`} className="text-blue-600 hover:underline">View Issues</Link>
            <Link to={`/projects/${id}/keywords`} className="text-blue-600 hover:underline">Keyword Rankings</Link>
          </div>
        </div>
      ) : (
        <div className="bg-white p-6 rounded shadow">
          <h2 className="text-xl font-bold mb-4">Last Crawl Status</h2>
          <p className="text-gray-600">No crawl data yet. Start a crawl to populate technical SEO metrics.</p>
        </div>
      )}
    </div>
  );
}
