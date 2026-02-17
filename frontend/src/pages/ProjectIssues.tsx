import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { Issue, Crawl } from '../api';
import PaginationControls from '../components/PaginationControls';

type PaginatedResponse<T> = {
    items: T[];
    total: number;
    page: number;
    page_size: number;
};

const PAGE_SIZE = 20;

export default function ProjectIssues() {
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const [issues, setIssues] = useState<Issue[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [selectedIssueIds, setSelectedIssueIds] = useState<number[]>([]);
    const [categoryFilter, setCategoryFilter] = useState<'all' | Issue['category']>('all');
    const [severityFilter, setSeverityFilter] = useState<'all' | Issue['severity']>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | Issue['status']>('all');

    const selectedCrawlId = searchParams.get('crawlId');

    useEffect(() => {
        if (id) fetchIssues(page);
    }, [id, page, selectedCrawlId]);

    const fetchIssues = async (targetPage: number) => {
        try {
            const crawlsRes = await api.get<PaginatedResponse<Crawl>>(`/projects/${id}/crawls`, {
                params: { page: 1, page_size: selectedCrawlId ? 100 : 1 },
            });
            if (crawlsRes.data.items.length === 0) {
                setIssues([]);
                setTotal(0);
                setLoading(false);
                return;
            }
            const defaultCrawl = crawlsRes.data.items[0];
            const targetCrawl = selectedCrawlId
                ? crawlsRes.data.items.find((crawl) => crawl.id === Number(selectedCrawlId)) ?? defaultCrawl
                : defaultCrawl;
            const issuesRes = await api.get<PaginatedResponse<Issue>>(`/crawls/${targetCrawl.id}/issues`, {
                params: { page: targetPage, page_size: PAGE_SIZE },
            });
            setIssues(issuesRes.data.items);
            setTotal(issuesRes.data.total);
            setPage(issuesRes.data.page);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const filteredIssues = useMemo(() => {
        return issues.filter(issue => {
            const byCategory = categoryFilter === 'all' || issue.category === categoryFilter;
            const bySeverity = severityFilter === 'all' || issue.severity === severityFilter;
            const byStatus = statusFilter === 'all' || issue.status === statusFilter;
            return byCategory && bySeverity && byStatus;
        });
    }, [issues, categoryFilter, severityFilter, statusFilter]);

    const toggleIssueSelection = (issueId: number) => {
        setSelectedIssueIds(prev => prev.includes(issueId) ? prev.filter(selectedId => selectedId !== issueId) : [...prev, issueId]);
    };

    const selectAllFiltered = () => {
        setSelectedIssueIds(filteredIssues.map(issue => issue.id));
    };

    const clearSelection = () => {
        setSelectedIssueIds([]);
    };

    const handleBulkStatusUpdate = async (status: Issue['status']) => {
        if (!selectedIssueIds.length) return;
        try {
            await Promise.all(
                selectedIssueIds.map(issueId => api.patch(`/issues/${issueId}/status`, null, { params: { status } }))
            );
            setIssues(prev => prev.map(issue => selectedIssueIds.includes(issue.id) ? { ...issue, status } : issue));
            clearSelection();
        } catch (error) {
            console.error(error);
        }
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div>
            <h1 className="text-2xl font-bold mb-6">Issues</h1>

            <div className="bg-white rounded shadow p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as typeof categoryFilter)} className="border rounded px-3 py-2 text-sm">
                    <option value="all">All categories</option>
                    <option value="technical_seo">Technical SEO</option>
                    <option value="accessibility">Accessibility</option>
                    <option value="content">Content</option>
                </select>
                <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value as typeof severityFilter)} className="border rounded px-3 py-2 text-sm">
                    <option value="all">All severities</option>
                    <option value="critical">Critical</option>
                    <option value="warning">Warning</option>
                    <option value="info">Info</option>
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className="border rounded px-3 py-2 text-sm">
                    <option value="all">All statuses</option>
                    <option value="open">Open</option>
                    <option value="ignored">Ignored</option>
                    <option value="resolved">Resolved</option>
                </select>
                <div className="flex gap-2">
                    <button onClick={selectAllFiltered} className="px-3 py-2 text-xs rounded bg-gray-100">Select filtered</button>
                    <button onClick={clearSelection} className="px-3 py-2 text-xs rounded bg-gray-100">Clear</button>
                </div>
            </div>

            <div className="bg-white rounded shadow p-4 mb-4 flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-600">Bulk actions for {selectedIssueIds.length} selected</span>
                <button onClick={() => handleBulkStatusUpdate('resolved')} className="px-3 py-1.5 text-xs rounded bg-green-100 text-green-800">Mark resolved</button>
                <button onClick={() => handleBulkStatusUpdate('ignored')} className="px-3 py-1.5 text-xs rounded bg-yellow-100 text-yellow-800">Mark ignored</button>
                <button onClick={() => handleBulkStatusUpdate('open')} className="px-3 py-1.5 text-xs rounded bg-blue-100 text-blue-800">Reopen</button>
            </div>

            <div className="bg-white rounded shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3" />
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Severity</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fix template</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredIssues.map(issue => (
                            <tr key={issue.id}>
                                <td className="px-4 py-4">
                                    <input type="checkbox" checked={selectedIssueIds.includes(issue.id)} onChange={() => toggleIssueSelection(issue.id)} />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{issue.issue_type}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{issue.category}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                        issue.severity === 'critical' ? 'bg-red-100 text-red-800' :
                                        issue.severity === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-blue-100 text-blue-800'
                                    }`}>
                                        {issue.severity}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600">{issue.description}</td>
                                <td className="px-6 py-4 text-sm text-gray-600">{issue.fix_template || '—'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{issue.status}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <PaginationControls page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
            </div>
        </div>
    );
}
