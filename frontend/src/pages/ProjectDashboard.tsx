import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, getProjectContentPerformance } from '../api';
import type { DashboardStats, ContentPerformanceResponse, ContentPerformanceItem } from '../api';
import { Play, AlertTriangle, Info, AlertOctagon, TrendingUp, TrendingDown, Activity, MousePointerClick } from 'lucide-react';

export default function ProjectDashboard() {
    const { id } = useParams<{ id: string }>();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [maxPages, setMaxPages] = useState(50);
    const [sitemapUrl, setSitemapUrl] = useState('');
    const [contentPerformance, setContentPerformance] = useState<ContentPerformanceResponse | null>(null);
    const [window, setWindow] = useState<'7d' | '30d' | '90d'>('30d');
    const [sort, setSort] = useState<'traffic' | 'conversion_rate' | 'decay'>('traffic');

    useEffect(() => {
        if (id) {
            fetchDashboard();
            fetchContentPerformance();
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

            {analytics.notes.length > 0 && (
                <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded p-4 text-sm text-yellow-900">
                    {analytics.notes.map((note) => <p key={note}>{note}</p>)}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded shadow">
                    <h3 className="text-gray-500 text-sm uppercase">Total Pages</h3>
                    <p className="text-3xl font-bold">{stats.total_pages}</p>
                </div>
                <div className="bg-white p-6 rounded shadow border-l-4 border-red-500">
                    <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2"><AlertOctagon size={16}/> Critical Issues</h3>
                    <p className="text-3xl font-bold">{issues_breakdown.critical}</p>
                </div>
                <div className="bg-white p-6 rounded shadow border-l-4 border-yellow-500">
                    <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2"><AlertTriangle size={16}/> Warnings</h3>
                    <p className="text-3xl font-bold">{issues_breakdown.warning}</p>
                </div>
                <div className="bg-white p-6 rounded shadow border-l-4 border-blue-500">
                    <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2"><Info size={16}/> Info</h3>
                    <p className="text-3xl font-bold">{issues_breakdown.info}</p>
                </div>
            </div>

            <h2 className="text-xl font-bold mb-4">Traffic & Conversion Insights</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded shadow border-l-4 border-indigo-500">
                    <h3 className="text-gray-500 text-sm uppercase">Monthly Sessions</h3>
                    <p className="text-3xl font-bold">{analytics.period.monthly_total.toLocaleString()}</p>
                </div>
                <div className="bg-white p-6 rounded shadow border-l-4 border-emerald-500">
                    <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2">
                        {hasGrowth ? <TrendingUp size={16} /> : <TrendingDown size={16} />} Growth vs Last Month
                    </h3>
                    <p className={`text-3xl font-bold ${hasGrowth ? 'text-emerald-700' : 'text-red-700'}`}>
                        {analytics.period.growth_pct}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                        {analytics.period.meaningful_growth ? 'Meaningful growth trend' : 'Growth below meaningful threshold'}
                    </p>
                </div>
                <div className="bg-white p-6 rounded shadow border-l-4 border-purple-500">
                    <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2"><Activity size={16}/> Bounce Rate</h3>
                    <p className="text-3xl font-bold">{analytics.totals.bounce_rate}%</p>
                </div>
                <div className="bg-white p-6 rounded shadow border-l-4 border-cyan-500">
                    <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2"><MousePointerClick size={16}/> Conversions</h3>
                    <p className="text-3xl font-bold">{analytics.totals.conversions}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded shadow">
                    <h3 className="font-semibold mb-3">Top Countries</h3>
                    <ul className="space-y-2 text-sm">
                        {analytics.audience.top_countries.map((item) => (
                            <li key={item.country} className="flex justify-between border-b pb-1">
                                <span>{item.country}</span>
                                <span className="font-medium">{item.sessions}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="bg-white p-6 rounded shadow">
                    <h3 className="font-semibold mb-3">Devices</h3>
                    <ul className="space-y-2 text-sm">
                        {analytics.audience.devices.map((item) => (
                            <li key={item.device} className="flex justify-between border-b pb-1">
                                <span className="capitalize">{item.device}</span>
                                <span className="font-medium">{item.sessions}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="bg-white p-6 rounded shadow">
                    <h3 className="font-semibold mb-3">Daily Sessions (Last 7 days)</h3>
                    <ul className="space-y-2 text-sm">
                        {analytics.daily_sessions.slice(-7).map((item) => (
                            <li key={item.date} className="flex justify-between border-b pb-1">
                                <span>{item.date}</span>
                                <span className="font-medium">{item.sessions}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className="bg-white p-6 rounded shadow mb-8 overflow-x-auto">
                <h3 className="font-semibold mb-3">Top Traffic Assets & Conversion Rate</h3>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left border-b">
                            <th className="pb-2">Landing Page</th>
                            <th className="pb-2">Sessions</th>
                            <th className="pb-2">Conversions</th>
                            <th className="pb-2">CVR</th>
                            <th className="pb-2">A/B Variant</th>
                        </tr>
                    </thead>
                    <tbody>
                        {analytics.top_assets.map((asset) => (
                            <tr key={asset.path} className="border-b">
                                <td className="py-2">{asset.path}</td>
                                <td className="py-2">{asset.sessions}</td>
                                <td className="py-2">{asset.conversions}</td>
                                <td className="py-2">{asset.conversion_rate}%</td>
                                <td className="py-2">{asset.ab_test_variant ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
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
