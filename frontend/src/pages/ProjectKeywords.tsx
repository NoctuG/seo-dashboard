import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
    addProjectCompetitor,
    api,
    deleteProjectCompetitor,
    getProjectCompetitors,
    getProjectVisibility,
    getProjectRankingsDistribution,
    runProjectKeywordCompare,
    updateProjectSettings,
    getKeywordRankSchedule,
    upsertKeywordRankSchedule,
    toggleKeywordRankSchedule,
} from '../api';
import type {
    CompetitorDomainItem,
    KeywordItem,
    RankHistoryItem,
    VisibilityHistoryItem,
    VisibilityResponse,
    Project,
    PaginatedResponse,
    KeywordRankSchedule,
    KeywordScheduleFrequency,
    RankingDistributionResponse,
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
    AreaChart,
    Area,
    BarChart,
    Bar,
    Legend,
} from 'recharts';
import PaginationControls from '../components/PaginationControls';
import { runWithUiState } from '../utils/asyncAction';
import { getErrorMessage } from '../utils/error';

export default function ProjectKeywords() {
    const { id } = useParams<{ id: string }>();
    const [keywords, setKeywords] = useState<KeywordItem[]>([]);
    const [keywordTotal, setKeywordTotal] = useState(0);
    const [keywordPage, setKeywordPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
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
    const [historyWindow, setHistoryWindow] = useState<7 | 30 | 90>(30);
    const [distributionWindow, setDistributionWindow] = useState<7 | 30 | 90>(30);
    const [distributionBucket, setDistributionBucket] = useState<'day' | 'week'>('day');
    const [distribution, setDistribution] = useState<RankingDistributionResponse | null>(null);
    const [distributionLoading, setDistributionLoading] = useState(false);

    const [competitors, setCompetitors] = useState<CompetitorDomainItem[]>([]);
    const [competitorTotal, setCompetitorTotal] = useState(0);
    const [competitorPage, setCompetitorPage] = useState(1);
    const [competitorInput, setCompetitorInput] = useState('');
    const [compareHistory, setCompareHistory] = useState<VisibilityHistoryItem[]>([]);
    const [visibility, setVisibility] = useState<VisibilityResponse | null>(null);
    const [projectSettings, setProjectSettings] = useState<Project | null>(null);
    const [marketFilter, setMarketFilter] = useState('all');
    const [rankSchedule, setRankSchedule] = useState<KeywordRankSchedule | null>(null);
    const [scheduleForm, setScheduleForm] = useState({
        frequency: "daily" as KeywordScheduleFrequency,
        day_of_week: 1,
        hour: 9,
        timezone: "UTC",
        active: true,
    });
    const [savingSchedule, setSavingSchedule] = useState(false);
    const { isAdmin } = useProjectRole(id);

    useEffect(() => {
        if (id) {
            fetchVisibility();
            fetchProject();
            fetchSchedule();
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

    useEffect(() => {
        if (id) {
            fetchDistribution(distributionWindow, distributionBucket);
        }
    }, [id, distributionWindow, distributionBucket]);

    const fetchKeywords = async (page: number = keywordPage) => {
        await runWithUiState(async () => {
            const res = await api.get<PaginatedResponse<KeywordItem>>(`/projects/${id}/keywords`, {
                params: { page, page_size: 20 },
            });
            setKeywords(res.data.items);
            setKeywordTotal(res.data.total);
            setKeywordPage(res.data.page);
        }, {
            setLoading,
            setError,
            clearErrorValue: null,
            formatError: (err: unknown) => getErrorMessage(err, '加载关键词失败，请稍后再试。'),
            onError: (err: unknown) => console.error(err),
        });
    };

    const fetchCompetitors = async (page: number = competitorPage) => {
        if (!id) return;
        await runWithUiState(async () => {
            const res = await getProjectCompetitors(id, page, 20);
            setCompetitors(res.items);
            setCompetitorTotal(res.total);
            setCompetitorPage(res.page);
        }, {
            setError,
            formatError: (err: unknown) => getErrorMessage(err, '加载竞争对手失败，请稍后再试。'),
            onError: (err: unknown) => console.error(err),
        });
    };


    const fetchProject = async () => {
        if (!id) return;
        await runWithUiState(async () => {
            const res = await api.get<Project>(`/projects/${id}`);
            setProjectSettings(res.data);
        }, {
            setError,
            formatError: (err: unknown) => getErrorMessage(err, '加载项目设置失败，请稍后再试。'),
            onError: (err: unknown) => console.error(err),
        });
    };

    const fetchVisibility = async () => {
        if (!id) return;
        await runWithUiState(async () => {
            setVisibility(await getProjectVisibility(id));
        }, {
            setError,
            formatError: (err: unknown) => getErrorMessage(err, '加载可见度数据失败，请稍后再试。'),
            onError: (err: unknown) => console.error(err),
        });
    };

    async function fetchDistribution(windowDays: 7 | 30 | 90, bucket: 'day' | 'week') {
        if (!id) return;
        await runWithUiState(async () => {
            const data = await getProjectRankingsDistribution(id, windowDays, bucket);
            setDistribution(data);
        }, {
            setLoading: setDistributionLoading,
            setError,
            formatError: (err: unknown) => getErrorMessage(err, '加载排名分布失败，请稍后再试。'),
            onError: (err: unknown) => console.error(err),
        });
    }

    const fetchSchedule = async () => {
        if (!id) return;
        await runWithUiState(async () => {
            const schedule = await getKeywordRankSchedule(id);
            setRankSchedule(schedule);
            if (schedule) {
                setScheduleForm({
                    frequency: schedule.frequency,
                    day_of_week: schedule.day_of_week ?? 1,
                    hour: schedule.hour,
                    timezone: schedule.timezone,
                    active: schedule.active,
                });
            }
        }, {
            setError,
            formatError: (err: unknown) => getErrorMessage(err, '加载自动检查设置失败，请稍后再试。'),
            onError: (err: unknown) => console.error(err),
        });
    };

    const addKeyword = async () => {
        if (!term.trim()) return;
        await runWithUiState(async () => {
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
            await fetchKeywords(keywordPage);
        }, {
            setError,
            formatError: (err: unknown) => getErrorMessage(err, '添加关键词失败，请稍后再试。'),
            onError: (err: unknown) => console.error(err),
        });
    };

    const addCompetitor = async () => {
        if (!id || !competitorInput.trim()) return;
        await runWithUiState(async () => {
            await addProjectCompetitor(id, competitorInput.trim());
            setCompetitorInput('');
            await fetchCompetitors(competitorPage);
        }, {
            setError,
            formatError: (err: unknown) => getErrorMessage(err, '添加竞争对手失败，请稍后再试。'),
            onError: (err: unknown) => console.error(err),
        });
    };

    const removeCompetitor = async (competitorId: number) => {
        if (!id) return;
        await runWithUiState(async () => {
            await deleteProjectCompetitor(id, competitorId);
            await fetchCompetitors(competitorPage);
        }, {
            setError,
            formatError: (err: unknown) => getErrorMessage(err, '删除竞争对手失败，请稍后再试。'),
            onError: (err: unknown) => console.error(err),
        });
    };

    const deleteKeyword = async (keywordId: number) => {
        await runWithUiState(async () => {
            await api.delete(`/projects/${id}/keywords/${keywordId}`);
            if (selectedKeyword?.id === keywordId) {
                setSelectedKeyword(null);
                setHistory([]);
            }
            await fetchKeywords(keywordPage);
        }, {
            setError,
            formatError: (err: unknown) => getErrorMessage(err, '删除关键词失败，请稍后再试。'),
            onError: (err: unknown) => console.error(err),
        });
    };

    const checkRank = async (keywordId: number) => {
        setChecking(keywordId);
        try {
            await runWithUiState(async () => {
                await api.post(`/projects/${id}/keywords/${keywordId}/check`);
                await fetchKeywords(keywordPage);
                if (selectedKeyword?.id === keywordId) {
                    await fetchHistory(keywordId, historyWindow);
                }
            }, {
                setError,
                formatError: (err: unknown) => getErrorMessage(err, '检查关键词排名失败，请稍后再试。'),
                onError: (err: unknown) => console.error(err),
            });
        } finally {
            setChecking(null);
        }
    };

    const checkAllRanks = async () => {
        await runWithUiState(async () => {
            await api.post(`/projects/${id}/keywords/check-all`);
            await fetchKeywords(keywordPage);
            if (selectedKeyword) {
                await fetchHistory(selectedKeyword.id, historyWindow);
            }
        }, {
            setLoading: setCheckingAll,
            setError,
            formatError: (err: unknown) => getErrorMessage(err, '批量检查排名失败，请稍后再试。'),
            onError: (err: unknown) => console.error(err),
        });
    };

    const runCompare = async () => {
        if (!id) return;
        await runWithUiState(async () => {
            const rows = await runProjectKeywordCompare(id);
            setCompareHistory(rows);
            await Promise.all([
                fetchKeywords(keywordPage),
                fetchVisibility(),
                fetchProject(),
                fetchSchedule(),
            ]);
        }, {
            setLoading: setComparing,
            setError,
            formatError: (err: unknown) => getErrorMessage(err, '执行批量对比失败，请稍后再试。'),
            onError: (err: unknown) => console.error(err),
        });
    };

    const fetchHistory = useCallback(async (keywordId: number, days: 7 | 30 | 90) => {
        if (!id) return;
        await runWithUiState(async () => {
            const res = await api.get<RankHistoryItem[]>(`/projects/${id}/keywords/${keywordId}/history`, {
                params: { days, limit: 180 },
            });
            setHistory(res.data);
        }, {
            setLoading: setHistoryLoading,
            setError,
            formatError: (err: unknown) => getErrorMessage(err, '加载历史排名失败，请稍后再试。'),
            onError: (err: unknown) => console.error(err),
        });
    }, [id]);

    const selectKeyword = (kw: KeywordItem) => {
        setSelectedKeyword(kw);
        fetchHistory(kw.id, historyWindow);
    };

    useEffect(() => {
        if (!selectedKeyword) return;
        fetchHistory(selectedKeyword.id, historyWindow);
    }, [selectedKeyword, historyWindow, fetchHistory]);

    const saveSchedule = async () => {
        if (!id) return;
        await runWithUiState(async () => {
            const saved = await upsertKeywordRankSchedule(id, {
                frequency: scheduleForm.frequency,
                day_of_week: scheduleForm.frequency === 'weekly' ? scheduleForm.day_of_week : null,
                hour: scheduleForm.hour,
                timezone: scheduleForm.timezone,
                active: scheduleForm.active,
            });
            setRankSchedule(saved);
        }, {
            setLoading: setSavingSchedule,
            setError,
            formatError: (err: unknown) => getErrorMessage(err, '保存自动检查设置失败，请稍后再试。'),
            onError: (err: unknown) => console.error(err),
        });
    };

    const toggleSchedule = async () => {
        if (!id || !rankSchedule) return;
        await runWithUiState(async () => {
            const saved = await toggleKeywordRankSchedule(id, !rankSchedule.active);
            setRankSchedule(saved);
            setScheduleForm((prev) => ({ ...prev, active: saved.active }));
        }, {
            setLoading: setSavingSchedule,
            setError,
            formatError: (err: unknown) => getErrorMessage(err, '切换自动检查状态失败，请稍后再试。'),
            onError: (err: unknown) => console.error(err),
        });
    };

    const chartData = history.map((h) => ({
        date: new Date(h.checked_at).toLocaleDateString(),
        rank: h.rank ?? null,
    }));

    const distributionChartData = useMemo(() => (distribution?.series ?? []).map((point) => ({
        label: distributionBucket === 'week'
            ? `W${new Date(point.bucket_start).toLocaleDateString()}`
            : new Date(point.bucket_start).toLocaleDateString(),
        top3_count: point.top3_count,
        top10_count: point.top10_count,
        top100_count: point.top100_count,
    })), [distribution, distributionBucket]);

    const formatDelta = (value: number) => `${value > 0 ? '+' : ''}${value}`;

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
                    <Link
                        to={`/projects/${id}/keyword-research`}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                    >
                        关键词研究
                    </Link>
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


            {error && (
                <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            <div className="bg-white p-4 rounded shadow space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold">排名分布概览</h2>
                    <div className="flex items-center gap-2">
                        {([7, 30, 90] as const).map((d) => (
                            <button key={d} onClick={() => setDistributionWindow(d)} className={`px-3 py-1 rounded text-sm ${distributionWindow === d ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>{d}天</button>
                        ))}
                        {(['day', 'week'] as const).map((bucket) => (
                            <button key={bucket} onClick={() => setDistributionBucket(bucket)} className={`px-3 py-1 rounded text-sm ${distributionBucket === bucket ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}>{bucket === 'day' ? '按日' : '按周'}</button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                        { key: 'top3', title: 'Top 3', count: distribution?.summary.top3_count ?? 0, change: distribution?.summary.top3_change ?? 0 },
                        { key: 'top10', title: 'Top 10', count: distribution?.summary.top10_count ?? 0, change: distribution?.summary.top10_change ?? 0 },
                        { key: 'top100', title: 'Top 100', count: distribution?.summary.top100_count ?? 0, change: distribution?.summary.top100_change ?? 0 },
                    ].map((item) => (
                        <div key={item.key} className="border rounded p-4">
                            <div className="text-sm text-gray-500">{item.title} 关键词</div>
                            <div className="text-2xl font-semibold">{item.count}</div>
                            <div className={`text-sm ${item.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>较上周 {formatDelta(item.change)}</div>
                        </div>
                    ))}
                </div>

                {distributionLoading ? (
                    <div className="text-sm text-gray-500">加载分布中...</div>
                ) : distributionChartData.length === 0 ? (
                    <div className="text-sm text-gray-500">暂无分布数据，请先执行排名检查。</div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <ResponsiveContainer width="100%" height={240}>
                            <AreaChart data={distributionChartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Area type="monotone" dataKey="top10_count" stroke="#2563eb" fill="#93c5fd" name="Top10" />
                                <Area type="monotone" dataKey="top3_count" stroke="#16a34a" fill="#86efac" name="Top3" />
                            </AreaChart>
                        </ResponsiveContainer>
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={distributionChartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="top3_count" stackId="a" fill="#16a34a" name="Top3" />
                                <Bar dataKey="top10_count" stackId="a" fill="#2563eb" name="Top10" />
                                <Bar dataKey="top100_count" stackId="a" fill="#0ea5e9" name="Top100" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            <div className="bg-white p-4 rounded shadow">
                <h2 className="text-lg font-semibold mb-3">自动检查设置</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="text-gray-600">频率</span>
                        <select
                            value={scheduleForm.frequency}
                            onChange={(e) => setScheduleForm((prev) => ({ ...prev, frequency: e.target.value as KeywordScheduleFrequency }))}
                            className="border rounded px-3 py-2"
                        >
                            <option value="daily">每天</option>
                            <option value="weekly">每周</option>
                        </select>
                    </label>
                    {scheduleForm.frequency === 'weekly' && (
                        <label className="flex flex-col gap-1 text-sm">
                            <span className="text-gray-600">星期</span>
                            <select
                                value={scheduleForm.day_of_week}
                                onChange={(e) => setScheduleForm((prev) => ({ ...prev, day_of_week: Number(e.target.value) }))}
                                className="border rounded px-3 py-2"
                            >
                                <option value={0}>周一</option>
                                <option value={1}>周二</option>
                                <option value={2}>周三</option>
                                <option value={3}>周四</option>
                                <option value={4}>周五</option>
                                <option value={5}>周六</option>
                                <option value={6}>周日</option>
                            </select>
                        </label>
                    )}
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="text-gray-600">执行小时</span>
                        <input
                            type="number"
                            min={0}
                            max={23}
                            value={scheduleForm.hour}
                            onChange={(e) => setScheduleForm((prev) => ({ ...prev, hour: Number(e.target.value) }))}
                            className="border rounded px-3 py-2"
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="text-gray-600">时区</span>
                        <input
                            type="text"
                            value={scheduleForm.timezone}
                            onChange={(e) => setScheduleForm((prev) => ({ ...prev, timezone: e.target.value }))}
                            className="border rounded px-3 py-2"
                            placeholder="UTC / Asia/Shanghai"
                        />
                    </label>
                </div>
                <div className="mt-3 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                        上次自动检查：{rankSchedule?.last_run_at ? new Date(rankSchedule.last_run_at).toLocaleString() : '尚未执行'}
                    </div>
                    <div className="flex gap-2">
                        {rankSchedule && isAdmin && (
                            <button onClick={toggleSchedule} disabled={savingSchedule} className="px-3 py-2 rounded border">
                                {rankSchedule.active ? '停用' : '启用'}
                            </button>
                        )}
                        {isAdmin && (
                            <button onClick={saveSchedule} disabled={savingSchedule} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
                                {savingSchedule ? '保存中...' : '保存设置'}
                            </button>
                        )}
                    </div>
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
                    <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">排名趋势：{selectedKeyword.term}</h2><div className="flex gap-2">{([7, 30, 90] as const).map((d) => (<button key={d} onClick={() => setHistoryWindow(d)} className={`px-3 py-1 rounded text-sm ${historyWindow === d ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>{d} 天</button>))}</div></div>
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
