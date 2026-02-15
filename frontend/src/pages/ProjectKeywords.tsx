import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
    addProjectCompetitor,
    api,
    deleteProjectCompetitor,
    getProjectCompetitors,
    getProjectVisibility,
    runProjectKeywordCompare,
    updateProjectSettings,
} from '../api';
import type {
    CompetitorDomainItem,
    KeywordItem,
    RankHistoryItem,
    VisibilityHistoryItem,
    VisibilityResponse,
    Project,
    PaginatedResponse,
} from '../api';
import { Plus, Trash2, RefreshCw, TrendingUp, Search, BarChart3, Shield } from 'lucide-react';
import { useProjectRole } from '../useProjectRole';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
} from 'recharts';
import PaginationControls from '../components/PaginationControls';

export default function ProjectKeywords() {
    const { id } = useParams<{ id: string }>();
    const [keywords, setKeywords] = useState<KeywordItem[]>([]);
    const [keywordTotal, setKeywordTotal] = useState(0);
    const [keywordPage, setKeywordPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [term, setTerm] = useState('');
    const [targetUrl, setTargetUrl] = useState('');
    const [locale, setLocale] = useState('');
    const [market, setMarket] = useState('');
    const [checking, setChecking] = useState<number | null>(null);
    const [checkingAll, setCheckingAll] = useState(false);
    const [comparing, setComparing] = useState(false);

    const [selectedKeyword, setSelectedKeyword] = useState<KeywordItem | null>(null);
    const [history, setHistory] = useState<RankHistoryItem[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const [competitors, setCompetitors] = useState<CompetitorDomainItem[]>([]);
    const [competitorTotal, setCompetitorTotal] = useState(0);
    const [competitorPage, setCompetitorPage] = useState(1);
    const [competitorInput, setCompetitorInput] = useState('');
    const [compareHistory, setCompareHistory] = useState<VisibilityHistoryItem[]>([]);
    const [visibility, setVisibility] = useState<VisibilityResponse | null>(null);
    const [projectSettings, setProjectSettings] = useState<Project | null>(null);
    const [marketFilter, setMarketFilter] = useState('all');
    const { isAdmin } = useProjectRole(id);

    useEffect(() => {
        if (id) {
            fetchVisibility();
            fetchProject();
        }
    }, [id]);

    useEffect(() => {
        if (id) {
            fetchKeywords(keywordPage);
        }
    }, [id, keywordPage]);

    useEffect(() => {
        if (id) {
            fetchCompetitors(competitorPage);
        }
    }, [id, competitorPage]);

    const fetchKeywords = async (page: number = keywordPage) => {
        try {
            const res = await api.get<PaginatedResponse<KeywordItem>>(`/projects/${id}/keywords`, {
                params: { page, page_size: 20 },
            });
            setKeywords(res.data.items);
            setKeywordTotal(res.data.total);
            setKeywordPage(res.data.page);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const fetchCompetitors = async (page: number = competitorPage) => {
        if (!id) return;
        try {
            const res = await getProjectCompetitors(id, page, 20);
            setCompetitors(res.items);
            setCompetitorTotal(res.total);
            setCompetitorPage(res.page);
        } catch (error) {
            console.error(error);
        }
    };


    const fetchProject = async () => {
        if (!id) return;
        try {
            const res = await api.get<Project>(`/projects/${id}`);
            setProjectSettings(res.data);
        } catch (error) {
            console.error(error);
        }
    };

    const fetchVisibility = async () => {
        if (!id) return;
        try {
            setVisibility(await getProjectVisibility(id));
        } catch (error) {
            console.error(error);
        }
    };

    const addKeyword = async () => {
        if (!term.trim()) return;
        try {
            await api.post(`/projects/${id}/keywords`, {
                term: term.trim(),
                target_url: targetUrl.trim() || undefined,
                locale: locale.trim() || undefined,
                market: market.trim() || undefined,
            });
            setTerm('');
            setTargetUrl('');
            setLocale('');
            setMarket('');
            fetchKeywords(keywordPage);
        } catch (error) {
            console.error(error);
        }
    };

    const addCompetitor = async () => {
        if (!id || !competitorInput.trim()) return;
        try {
            await addProjectCompetitor(id, competitorInput.trim());
            setCompetitorInput('');
            fetchCompetitors(competitorPage);
        } catch (error) {
            console.error(error);
        }
    };

    const removeCompetitor = async (competitorId: number) => {
        if (!id) return;
        try {
            await deleteProjectCompetitor(id, competitorId);
            fetchCompetitors(competitorPage);
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
            fetchKeywords(keywordPage);
        } catch (error) {
            console.error(error);
        }
    };

    const checkRank = async (keywordId: number) => {
        setChecking(keywordId);
        try {
            await api.post(`/projects/${id}/keywords/${keywordId}/check`);
            fetchKeywords(keywordPage);
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
            fetchKeywords(keywordPage);
            if (selectedKeyword) {
                fetchHistory(selectedKeyword.id);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setCheckingAll(false);
        }
    };

    const runCompare = async () => {
        if (!id) return;
        setComparing(true);
        try {
            const rows = await runProjectKeywordCompare(id);
            setCompareHistory(rows);
            fetchKeywords(keywordPage);
            fetchVisibility();
            fetchProject();
        } catch (error) {
            console.error(error);
        } finally {
            setComparing(false);
        }
    };

    const fetchHistory = async (keywordId: number) => {
        setHistoryLoading(true);
        try {
            const res = await api.get<RankHistoryItem[]>(`/projects/${id}/keywords/${keywordId}/history`);
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

    const serpCoverageData = useMemo(
        () =>
            Object.entries(visibility?.serp_feature_coverage ?? {}).map(([name, ratio]) => ({
                name,
                value: Number((ratio * 100).toFixed(1)),
            })),
        [visibility]
    );

    const filteredKeywords = useMemo(() => {
        if (marketFilter === 'all') return keywords;
        return keywords.filter((kw: KeywordItem) => (kw.market || '').toLowerCase() === marketFilter.toLowerCase());
    }, [keywords, marketFilter]);

    if (loading) return <div>Loading...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <TrendingUp size={24} /> 关键词排名跟踪
                </h1>
                <div className="flex gap-2">
                    {isAdmin && keywords.length > 0 && (
                        <button
                            onClick={checkAllRanks}
                            disabled={checkingAll}
                            className="bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-green-700 disabled:opacity-50"
                        >
                            <RefreshCw size={18} className={checkingAll ? 'animate-spin' : ''} />
                            {checkingAll ? '查询中...' : '查询全部排名'}
                        </button>
                    )}
                    {isAdmin && (<button
                        onClick={runCompare}
                        disabled={comparing || keywords.length === 0}
                        className="bg-indigo-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50"
                    >
                        <BarChart3 size={18} className={comparing ? 'animate-pulse' : ''} />
                        {comparing ? '对比中...' : '批量对比本站/竞品'}
                    </button>)}
                </div>
            </div>

            <div className="bg-white p-4 rounded shadow">
                <h2 className="text-lg font-semibold mb-3">竞争对手管理</h2>
                <div className="flex gap-3 items-end mb-3">
                    <label className="flex flex-col gap-1 text-sm flex-1">
                        <span className="text-gray-600">竞争对手域名</span>
                        <input
                            type="text"
                            value={competitorInput}
                            onChange={(e) => setCompetitorInput(e.target.value)}
                            placeholder="例如：competitor.com"
                            className="border rounded px-3 py-2"
                            onKeyDown={(e) => e.key === 'Enter' && addCompetitor()}
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="text-gray-600">locale</span>
                        <input type="text" value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en / zh-CN" className="border rounded px-3 py-2" />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="text-gray-600">market</span>
                        <input type="text" value={market} onChange={(e) => setMarket(e.target.value)} placeholder="us / sg / cn" className="border rounded px-3 py-2" />
                    </label>
                    {isAdmin && (<button
                        onClick={addCompetitor}
                        disabled={!competitorInput.trim()}
                        className="bg-slate-800 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-slate-900 disabled:opacity-50"
>
                        <Plus size={18} /> 添加竞争对手
                    </button>)}
                </div>
                <div className="flex flex-wrap gap-2">
                    {competitors.length === 0 ? (
                        <span className="text-sm text-gray-500">暂无竞争对手配置。</span>
                    ) : (
                        competitors.map((item) => (
                            <span key={item.id} className="inline-flex items-center gap-2 bg-slate-100 rounded-full px-3 py-1 text-sm">
                                {item.domain}
                                {isAdmin && (
                                <button onClick={() => removeCompetitor(item.id)} className="text-red-500 hover:text-red-700">
                                    <Trash2 size={14} />
                                </button>
                                )}
                            </span>
                        ))
                    )}
                </div>
                <PaginationControls page={competitorPage} pageSize={20} total={competitorTotal} onPageChange={setCompetitorPage} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-4 rounded shadow">
                    <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><Shield size={18} /> SOV 趋势</h2>
                    {!visibility || visibility.trend.length === 0 ? (
                        <p className="text-sm text-gray-500">暂无可见度历史数据，请先执行批量对比。</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <LineChart data={visibility.trend}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis domain={[0, 1]} />
                                <Tooltip />
                                <Line dataKey="visibility_score" stroke="#4f46e5" strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>

                <div className="bg-white p-4 rounded shadow">
                    <h2 className="text-lg font-semibold mb-3">SERP 特性覆盖率</h2>
                    {serpCoverageData.length === 0 ? (
                        <p className="text-sm text-gray-500">暂无 SERP 特性覆盖数据。</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={serpCoverageData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                <YAxis unit="%" />
                                <Tooltip formatter={(v) => [`${v}%`, '覆盖率']} />
                                <Bar dataKey="value" fill="#0ea5e9" />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            <div className="bg-white p-4 rounded shadow mb-6">
                <h2 className="text-lg font-semibold mb-3">项目市场设置</h2>
                <div className="flex gap-3 items-end">
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="text-gray-600">国家(gl)</span>
                        <input className="border rounded px-3 py-2" value={projectSettings?.default_gl || ''} onChange={(e) => setProjectSettings((p) => p ? ({ ...p, default_gl: e.target.value }) : p)} />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="text-gray-600">语言(hl)</span>
                        <input className="border rounded px-3 py-2" value={projectSettings?.default_hl || ''} onChange={(e) => setProjectSettings((p) => p ? ({ ...p, default_hl: e.target.value }) : p)} />
                    </label>
                    {isAdmin && <button className="bg-indigo-600 text-white px-4 py-2 rounded" onClick={() => id && projectSettings && updateProjectSettings(id, { default_gl: projectSettings.default_gl, default_hl: projectSettings.default_hl })}>保存</button>}
                    <label className="flex flex-col gap-1 text-sm ml-auto">
                        <span className="text-gray-600">按市场筛选</span>
                        <select className="border rounded px-3 py-2" value={marketFilter} onChange={(e) => setMarketFilter(e.target.value)}>
                            <option value="all">全部</option>
                            {[...new Set(keywords.map((k) => k.market).filter(Boolean) as string[])].map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </label>
                </div>
            </div>

            <div className="bg-white p-4 rounded shadow mb-6">
                <h2 className="text-lg font-semibold mb-3">添加关键词</h2>
                <div className="flex gap-3 items-end">
                    <label className="flex flex-col gap-1 text-sm flex-1">
                        <span className="text-gray-600">关键词 *</span>
                        <input type="text" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="例如：SEO 优化工具" className="border rounded px-3 py-2" onKeyDown={(e) => e.key === 'Enter' && addKeyword()} />
                    </label>
                    <label className="flex flex-col gap-1 text-sm flex-1">
                        <span className="text-gray-600">目标 URL（可选）</span>
                        <input type="url" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://example.com/page" className="border rounded px-3 py-2" onKeyDown={(e) => e.key === 'Enter' && addKeyword()} />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="text-gray-600">locale</span>
                        <input type="text" value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en / zh-CN" className="border rounded px-3 py-2" />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="text-gray-600">market</span>
                        <input type="text" value={market} onChange={(e) => setMarket(e.target.value)} placeholder="us / sg / cn" className="border rounded px-3 py-2" />
                    </label>
                    {isAdmin && (
                    <button onClick={addKeyword} disabled={!term.trim()} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50">
                        <Plus size={18} /> 添加
                    </button>
                    )}
                </div>
            </div>

            {filteredKeywords.length === 0 ? (
                <div className="bg-white p-8 rounded shadow text-center text-gray-500">
                    <Search size={48} className="mx-auto mb-3 text-gray-300" />
                    <p>尚未添加关键词，请在上方添加要跟踪的关键词。</p>
                </div>
            ) : (
                <div className="bg-white rounded shadow overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-sm font-medium text-gray-500">关键词</th>
                                <th className="px-4 py-3 text-sm font-medium text-gray-500">目标 URL</th>
                                <th className="px-4 py-3 text-sm font-medium text-gray-500">locale</th>
                                <th className="px-4 py-3 text-sm font-medium text-gray-500">market</th>
                                <th className="px-4 py-3 text-sm font-medium text-gray-500 text-center">当前排名</th>
                                <th className="px-4 py-3 text-sm font-medium text-gray-500">最后检查时间</th>
                                <th className="px-4 py-3 text-sm font-medium text-gray-500 text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filteredKeywords.map((kw) => (
                                <tr key={kw.id} className={`hover:bg-gray-50 cursor-pointer ${selectedKeyword?.id === kw.id ? 'bg-blue-50' : ''}`} onClick={() => selectKeyword(kw)}>
                                    <td className="px-4 py-3 font-medium">{kw.term}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{kw.target_url || '-'}</td>
                                    <td className="px-4 py-3 text-sm">{kw.locale || '-'}</td>
                                    <td className="px-4 py-3 text-sm">{kw.market || '-'}</td>
                                    <td className="px-4 py-3 text-center">{kw.current_rank != null ? `#${kw.current_rank}` : '未检测'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{kw.last_checked ? new Date(kw.last_checked).toLocaleString() : '-'}</td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {isAdmin && (<>
                                            <button onClick={(e) => { e.stopPropagation(); checkRank(kw.id); }} disabled={checking === kw.id} className="text-green-600 hover:text-green-800 p-1 disabled:opacity-50"><RefreshCw size={16} className={checking === kw.id ? 'animate-spin' : ''} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); deleteKeyword(kw.id); }} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={16} /></button>
                                            </>)}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <PaginationControls page={keywordPage} pageSize={20} total={keywordTotal} onPageChange={setKeywordPage} />
                </div>
            )}

            {selectedKeyword && (
                <div className="bg-white p-6 rounded shadow">
                    <h2 className="text-lg font-semibold mb-4">排名趋势：{selectedKeyword.term}</h2>
                    {historyLoading ? (
                        <div className="text-center py-8 text-gray-500">加载中...</div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">暂无排名历史数据，请先点击查询排名。</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                <YAxis reversed domain={[1, 'auto']} tick={{ fontSize: 12 }} />
                                <Tooltip formatter={(value) => (typeof value === 'number' ? [`#${value}`, '排名'] : ['未上榜', '排名'])} />
                                <Line type="monotone" dataKey="rank" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>
            )}

            {compareHistory.length > 0 && (
                <div className="bg-white p-4 rounded shadow">
                    <h2 className="text-lg font-semibold mb-3">最近一次对比样本（前 10 条）</h2>
                    <div className="space-y-2 text-sm">
                        {compareHistory.slice(0, 10).map((item, idx) => (
                            <div key={`${item.keyword_term}-${item.source_domain}-${idx}`} className="border rounded p-2">
                                <strong>{item.keyword_term}</strong> · {item.source_domain} · 排名 {item.rank ?? '-'} · SOV {item.visibility_score}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}