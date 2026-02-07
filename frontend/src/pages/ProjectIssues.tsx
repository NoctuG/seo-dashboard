import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import type { Issue, Crawl } from '../api';

export default function ProjectIssues() {
    const { id } = useParams<{ id: string }>();
    const [issues, setIssues] = useState<Issue[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) fetchIssues();
    }, [id]);

    const fetchIssues = async () => {
        try {
            // Get latest crawl
            const crawlsRes = await api.get<Crawl[]>(`/projects/${id}/crawls`);
            if (crawlsRes.data.length === 0) {
                setLoading(false);
                return;
            }
            const latestCrawl = crawlsRes.data[0];

            // Get issues
            const issuesRes = await api.get<Issue[]>(`/crawls/${latestCrawl.id}/issues`);
            setIssues(issuesRes.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div>
            <h1 className="text-2xl font-bold mb-6">Issues</h1>
            <div className="bg-white rounded shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Severity</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {issues.map(issue => (
                            <tr key={issue.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{issue.issue_type}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                        issue.severity === 'critical' ? 'bg-red-100 text-red-800' :
                                        issue.severity === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-blue-100 text-blue-800'
                                    }`}>
                                        {issue.severity}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500">{issue.description}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{issue.status}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
