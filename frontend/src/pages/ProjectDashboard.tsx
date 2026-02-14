import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import type { DashboardStats } from '../api';
import { Play, AlertTriangle, Info, AlertOctagon } from 'lucide-react';

export default function ProjectDashboard() {
    const { id } = useParams<{ id: string }>();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [maxPages, setMaxPages] = useState(50);
    const [sitemapUrl, setSitemapUrl] = useState('');

    useEffect(() => {
        if (id) fetchDashboard();
    }, [id]);

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

    if (loading) return <div>Loading...</div>;

    if (!stats || !stats.last_crawl) return (
        <div>
            <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
            <p>No crawl data yet.</p>
            <div className="mt-4 mb-4 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
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
            <button onClick={startCrawl} className="bg-blue-600 text-white px-4 py-2 rounded mt-2 flex items-center gap-2">
                <Play size={18} /> Start Crawl
            </button>
        </div>
    );

    const { last_crawl, issues_breakdown } = stats;

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
                </div>
            </div>
        </div>
    );
}
