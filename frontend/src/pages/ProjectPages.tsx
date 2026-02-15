import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_URL, api, getAuthToken } from '../api';
import type { Page, Crawl } from '../api';
import PaginationControls from '../components/PaginationControls';

type PaginatedResponse<T> = {
    items: T[];
    total: number;
    page: number;
    page_size: number;
};

type CrawlEvent = {
    type: 'snapshot' | 'crawl_started' | 'crawl_progress' | 'crawl_error' | 'crawl_completed' | 'crawl_failed';
    crawl_id: number;
    status: Crawl['status'];
    pages_processed: number;
    max_pages?: number;
    current_url?: string | null;
    issues_found?: number;
    error_count?: number;
    ts?: string;
};

const PAGE_SIZE = 20;

export default function ProjectPages() {
    const { id } = useParams<{ id: string }>();
    const [pages, setPages] = useState<Page[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [latestCrawl, setLatestCrawl] = useState<Crawl | null>(null);
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState<string[]>([]);
    const [progress, setProgress] = useState({ pagesProcessed: 0, maxPages: 0, currentUrl: '', errorCount: 0 });
    const [connectionMode, setConnectionMode] = useState<'idle' | 'connecting' | 'live' | 'polling'>('idle');

    const fetchPages = useCallback(async () => {
        if (!id) return;

        try {
            const crawlsRes = await api.get<PaginatedResponse<Crawl>>(`/projects/${id}/crawls`, {
                params: { page: 1, page_size: 1 },
            });
            if (crawlsRes.data.items.length === 0) {
                setLatestCrawl(null);
                setPages([]);
                setTotal(0);
                return;
            }

            const crawl = crawlsRes.data.items[0];
            setLatestCrawl(crawl);
            setProgress((prev) => ({
                ...prev,
                pagesProcessed: crawl.total_pages ?? prev.pagesProcessed,
            }));

            const pagesRes = await api.get<PaginatedResponse<Page>>(`/crawls/${crawl.id}/pages`, {
                params: { page, page_size: PAGE_SIZE },
            });
            setPages(pagesRes.data.items);
            setTotal(pagesRes.data.total);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [id, page]);

    useEffect(() => {
        void fetchPages();
    }, [fetchPages]);

    const isCrawlActive = latestCrawl?.status === 'running' || latestCrawl?.status === 'pending';

    useEffect(() => {
        if (!latestCrawl || !isCrawlActive) {
            setConnectionMode('idle');
            return;
        }

        const controller = new AbortController();
        let pollingTimer: number | null = null;

        const startPollingFallback = () => {
            if (pollingTimer) return;
            setConnectionMode('polling');
            pollingTimer = window.setInterval(() => {
                void fetchPages();
            }, 5000);
        };

        const appendLog = (message: string) => {
            setLogs((prev) => [message, ...prev].slice(0, 40));
        };

        const applyEvent = (event: CrawlEvent) => {
            setProgress((prev) => ({
                pagesProcessed: event.pages_processed ?? prev.pagesProcessed,
                maxPages: event.max_pages ?? prev.maxPages,
                currentUrl: event.current_url ?? prev.currentUrl,
                errorCount: event.error_count ?? prev.errorCount,
            }));

            appendLog(`[${event.ts ?? new Date().toISOString()}] ${event.type} ${event.current_url ?? ''}`.trim());

            setLatestCrawl((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    status: event.status,
                    total_pages: event.pages_processed ?? prev.total_pages,
                    issues_count: event.issues_found ?? prev.issues_count,
                };
            });

            if (event.type === 'crawl_completed' || event.type === 'crawl_failed') {
                setConnectionMode('idle');
                void fetchPages();
                controller.abort();
            }
        };

        const connect = async () => {
            setConnectionMode('connecting');
            const token = getAuthToken();
            const res = await fetch(`${API_URL}/crawls/${latestCrawl.id}/events`, {
                method: 'GET',
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    Accept: 'text/event-stream',
                },
                signal: controller.signal,
            });

            if (!res.ok || !res.body) {
                throw new Error(`SSE connection failed: ${res.status}`);
            }

            setConnectionMode('live');

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const chunks = buffer.split('\n\n');
                buffer = chunks.pop() ?? '';

                for (const chunk of chunks) {
                    const dataLine = chunk
                        .split('\n')
                        .map((line) => line.trim())
                        .find((line) => line.startsWith('data:'));

                    if (!dataLine) continue;

                    const payload = dataLine.replace(/^data:\s?/, '');
                    try {
                        applyEvent(JSON.parse(payload) as CrawlEvent);
                    } catch (error) {
                        console.error('Failed to parse crawl event', error);
                    }
                }
            }

            if (!controller.signal.aborted) {
                startPollingFallback();
            }
        };

        void connect().catch((error) => {
            if (!controller.signal.aborted) {
                console.error('Live crawl stream unavailable, falling back to polling', error);
                appendLog(`[${new Date().toISOString()}] live stream failed, switched to polling`);
                startPollingFallback();
            }
        });

        return () => {
            controller.abort();
            if (pollingTimer) {
                window.clearInterval(pollingTimer);
            }
        };
    }, [fetchPages, isCrawlActive, latestCrawl]);

    const progressPercent = useMemo(() => {
        if (!progress.maxPages) return 0;
        return Math.min(100, Math.round((progress.pagesProcessed / progress.maxPages) * 100));
    }, [progress.maxPages, progress.pagesProcessed]);

    if (loading) return <div>Loading...</div>;

    return (
        <div>
            <h1 className="text-2xl font-bold mb-6">Pages</h1>

            {latestCrawl && (
                <div className="bg-white rounded shadow p-4 mb-6">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-gray-700">Crawl status: {latestCrawl.status}</p>
                        <p className="text-xs text-gray-500">Update mode: {connectionMode}</p>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                        <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progressPercent}%` }} />
                    </div>
                    <p className="text-xs text-gray-600">
                        {progress.pagesProcessed} / {progress.maxPages || '?'} pages · errors: {progress.errorCount}
                    </p>
                    {progress.currentUrl && <p className="text-xs text-gray-500 mt-1 truncate">Current URL: {progress.currentUrl}</p>}
                    {logs.length > 0 && (
                        <div className="mt-3 border rounded bg-gray-50 p-2 max-h-28 overflow-auto">
                            {logs.map((line, index) => (
                                <p key={`${line}-${index}`} className="text-xs text-gray-600 font-mono">{line}</p>
                            ))}
                        </div>
                    )}
                </div>
            )}

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
                        {pages.map(pageItem => (
                            <tr key={pageItem.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 truncate max-w-xs" title={pageItem.url}>{pageItem.url}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                        pageItem.status_code === 200 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                    }`}>
                                        {pageItem.status_code}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-xs">{pageItem.title || '-'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{pageItem.load_time_ms}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <PaginationControls page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
            </div>
        </div>
    );
}
