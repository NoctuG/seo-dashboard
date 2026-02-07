import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, Page, Crawl } from '../api';

export default function ProjectPages() {
    const { id } = useParams<{ id: string }>();
    const [pages, setPages] = useState<Page[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) fetchPages();
    }, [id]);

    const fetchPages = async () => {
        try {
            // Get latest crawl
            const crawlsRes = await api.get<Crawl[]>(`/projects/${id}/crawls`);
            if (crawlsRes.data.length === 0) {
                setLoading(false);
                return;
            }
            const latestCrawl = crawlsRes.data[0];

            // Get pages
            const pagesRes = await api.get<Page[]>(`/crawls/${latestCrawl.id}/pages`);
            setPages(pagesRes.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div>
            <h1 className="text-2xl font-bold mb-6">Pages</h1>
            <div className="bg-white rounded shadow overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">URL</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Load Time (ms)</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {pages.map(page => (
                            <tr key={page.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 truncate max-w-xs" title={page.url}>{page.url}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                        page.status_code === 200 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                    }`}>
                                        {page.status_code}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-xs">{page.title || '-'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{page.load_time_ms}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
