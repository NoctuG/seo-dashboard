import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import type { KeywordItem, RankHistoryItem } from '../api';
import { Plus, Trash2, RefreshCw, TrendingUp, Search } from 'lucide-react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';

export default function ProjectKeywords() {
    const { id } = useParams<{ id: string }>();
    const [keywords, setKeywords] = useState<KeywordItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [term, setTerm] = useState('');
    const [targetUrl, setTargetUrl] = useState('');
    const [checking, setChecking] = useState<number | null>(null);
    const [checkingAll, setCheckingAll] = useState(false);

    // History chart state
    const [selectedKeyword, setSelectedKeyword] = useState<KeywordItem | null>(null);
    const [history, setHistory] = useState<RankHistoryItem[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    useEffect(() => {
        if (id) fetchKeywords();
    }, [id]);

    const fetchKeywords = async () => {
        try {
            const res = await api.get<KeywordItem[]>(`/projects/${id}/keywords`);
            setKeywords(res.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const addKeyword = async () => {
        if (!term.trim()) return;
        try {
            await api.post(`/projects/${id}/keywords`, {
                term: term.trim(),
                target_url: targetUrl.trim() || undefined,
            });
            setTerm('');
            setTargetUrl('');
            fetchKeywords();
        } catch (error) {
            console.error(error);
        }
    };

    const deleteKeyword = async (keywordId: number) => {
        try {
            await api.delete(`/projects/${id}/keywords/${keywordId}`);
            if (selectedKeyword?.id === keywordId) {
                setSelectedKeyword(null);
                setHistory([]);
            }
            fetchKeywords();
        } catch (error) {
            console.error(error);
        }
    };

    const checkRank = async (keywordId: number) => {
        setChecking(keywordId);
        try {
            await api.post(`/projects/${id}/keywords/${keywordId}/check`);
            fetchKeywords();
            if (selectedKeyword?.id === keywordId) {
                fetchHistory(keywordId);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setChecking(null);
        }
    };

    const checkAllRanks = async () => {
        setCheckingAll(true);
        try {
            await api.post(`/projects/${id}/keywords/check-all`);
            fetchKeywords();
            if (selectedKeyword) {
                fetchHistory(selectedKeyword.id);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setCheckingAll(false);
        }
    };

    const fetchHistory = async (keywordId: number) => {
        setHistoryLoading(true);
        try {
            const res = await api.get<RankHistoryItem[]>(
                `/projects/${id}/keywords/${keywordId}/history`
            );
            setHistory(res.data);
        } catch (error) {
            console.error(error);
        } finally {
            setHistoryLoading(false);
        }
    };

    const selectKeyword = (kw: KeywordItem) => {
        setSelectedKeyword(kw);
        fetchHistory(kw.id);
    };

    const chartData = history.map((h) => ({
        date: new Date(h.checked_at).toLocaleDateString(),
        rank: h.rank ?? null,
    }));

    if (loading) return <div>Loading...</div>;

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <TrendingUp size={24} /> 关键词排名跟踪
                </h1>
                {keywords.length > 0 && (
                    <button
                        onClick={checkAllRanks}
                        disabled={checkingAll}
                        className="bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-green-700 disabled:opacity-50"
                    >
                        <RefreshCw size={18} className={checkingAll ? 'animate-spin' : ''} />
                        {checkingAll ? '查询中...' : '查询全部排名'}
                    </button>
                )}
            </div>

            {/* Add keyword form */}
            <div className="bg-white p-4 rounded shadow mb-6">
                <h2 className="text-lg font-semibold mb-3">添加关键词</h2>
                <div className="flex gap-3 items-end">
                    <label className="flex flex-col gap-1 text-sm flex-1">
                        <span className="text-gray-600">关键词 *</span>
                        <input
                            type="text"
                            value={term}
                            onChange={(e) => setTerm(e.target.value)}
                            placeholder="例如：SEO 优化工具"
                            className="border rounded px-3 py-2"
                            onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-sm flex-1">
                        <span className="text-gray-600">目标 URL（可选）</span>
                        <input
                            type="url"
                            value={targetUrl}
                            onChange={(e) => setTargetUrl(e.target.value)}
                            placeholder="https://example.com/page"
                            className="border rounded px-3 py-2"
                            onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                        />
                    </label>
                    <button
                        onClick={addKeyword}
                        disabled={!term.trim()}
                        className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50"
                    >
                        <Plus size={18} /> 添加
                    </button>
                </div>
            </div>

            {/* Keywords table */}
            {keywords.length === 0 ? (
                <div className="bg-white p-8 rounded shadow text-center text-gray-500">
                    <Search size={48} className="mx-auto mb-3 text-gray-300" />
                    <p>尚未添加关键词，请在上方添加要跟踪的关键词。</p>
                </div>
            ) : (
                <div className="bg-white rounded shadow overflow-hidden mb-6">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-sm font-medium text-gray-500">关键词</th>
                                <th className="px-4 py-3 text-sm font-medium text-gray-500">目标 URL</th>
                                <th className="px-4 py-3 text-sm font-medium text-gray-500 text-center">当前排名</th>
                                <th className="px-4 py-3 text-sm font-medium text-gray-500">最后检查时间</th>
                                <th className="px-4 py-3 text-sm font-medium text-gray-500 text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {keywords.map((kw) => (
                                <tr
                                    key={kw.id}
                                    className={`hover:bg-gray-50 cursor-pointer ${selectedKeyword?.id === kw.id ? 'bg-blue-50' : ''}`}
                                    onClick={() => selectKeyword(kw)}
                                >
                                    <td className="px-4 py-3 font-medium">{kw.term}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                                        {kw.target_url || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {kw.current_rank != null ? (
                                            <span
                                                className={`inline-block px-2 py-1 rounded text-sm font-semibold ${
                                                    kw.current_rank <= 3
                                                        ? 'bg-green-100 text-green-800'
                                                        : kw.current_rank <= 10
                                                          ? 'bg-blue-100 text-blue-800'
                                                          : kw.current_rank <= 30
                                                            ? 'bg-yellow-100 text-yellow-800'
                                                            : 'bg-red-100 text-red-800'
                                                }`}
                                            >
                                                #{kw.current_rank}
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">未检测</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                        {kw.last_checked
                                            ? new Date(kw.last_checked).toLocaleString()
                                            : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    checkRank(kw.id);
                                                }}
                                                disabled={checking === kw.id}
                                                className="text-green-600 hover:text-green-800 p-1 disabled:opacity-50"
                                                title="查询排名"
                                            >
                                                <RefreshCw
                                                    size={16}
                                                    className={checking === kw.id ? 'animate-spin' : ''}
                                                />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteKeyword(kw.id);
                                                }}
                                                className="text-red-500 hover:text-red-700 p-1"
                                                title="删除"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Ranking history chart */}
            {selectedKeyword && (
                <div className="bg-white p-6 rounded shadow">
                    <h2 className="text-lg font-semibold mb-4">
                        排名趋势：{selectedKeyword.term}
                    </h2>
                    {historyLoading ? (
                        <div className="text-center py-8 text-gray-500">加载中...</div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            暂无排名历史数据，请先点击查询排名。
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 12 }}
                                />
                                <YAxis
                                    reversed
                                    domain={[1, 'auto']}
                                    tick={{ fontSize: 12 }}
                                    label={{
                                        value: '排名',
                                        angle: -90,
                                        position: 'insideLeft',
                                        style: { fontSize: 12 },
                                    }}
                                />
                                <Tooltip
                                    formatter={(value) => {
                                        const rank = typeof value === 'number' ? value : null;
                                        return rank != null ? [`#${rank}`, '排名'] : ['未上榜', '排名'];
                                    }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="rank"
                                    stroke="#2563eb"
                                    strokeWidth={2}
                                    dot={{ r: 4 }}
                                    activeDot={{ r: 6 }}
                                    connectNulls
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>
            )}
        </div>
    );
}
