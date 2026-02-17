import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  api,
  getProjectAuthority,
  getProjectBacklinks,
  getProjectBacklinkChanges,
  getProjectBacklinkStatus,
  getProjectCompetitorList,
  getProjectCompetitorTrafficOverview,
  getProjectContentPerformance,
  getProjectRoi,
} from "../api";
import type {
  DashboardStats,
  ContentPerformanceResponse,
  ContentPerformanceItem,
  AuthorityResponse,
  BacklinkResponse,
  BacklinkChangesResponse,
  BacklinkStatusResponse,
  CompetitorDomainItem,
  CompetitorTrafficOverviewResponse,
  RoiBreakdownResponse,
} from "../api";
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
  BadgePercent,
} from "lucide-react";
import RoiAttributionNote from "../components/RoiAttributionNote";
import { useProjectRole } from "../useProjectRole";
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
  AreaChart,
  Area,
} from "recharts";

export default function ProjectDashboard() {
  const { id } = useParams<{ id: string }>();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [maxPages, setMaxPages] = useState(50);
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [contentPerformance, setContentPerformance] =
    useState<ContentPerformanceResponse | null>(null);
  const [window, setWindow] = useState<"7d" | "30d" | "90d">("30d");
  const [sort, setSort] = useState<"traffic" | "conversion_rate" | "decay">(
    "traffic",
  );
  const [authority, setAuthority] = useState<AuthorityResponse | null>(null);
  const [backlinks, setBacklinks] = useState<BacklinkResponse | null>(null);
  const [changes, setChanges] = useState<BacklinkChangesResponse | null>(null);
  const [backlinkStatus, setBacklinkStatus] = useState<BacklinkStatusResponse | null>(null);
  const [brandWindow, setBrandWindow] = useState<"7d" | "30d" | "90d">("30d");
  const [roiRange, setRoiRange] = useState<"30d" | "90d" | "12m">("30d");
  const [attributionModel, setAttributionModel] = useState<
    "linear" | "first_click" | "last_click"
  >("linear");
  const [roi, setRoi] = useState<RoiBreakdownResponse | null>(null);
  const [backlinkQuery, setBacklinkQuery] = useState('');
  const [backlinkSort, setBacklinkSort] = useState<'status' | 'source' | 'date'>('date');
  const [competitors, setCompetitors] = useState<CompetitorDomainItem[]>([]);
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<number | null>(null);
  const [competitorOverview, setCompetitorOverview] = useState<CompetitorTrafficOverviewResponse | null>(null);
  const [competitorsLoading, setCompetitorsLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [competitorError, setCompetitorError] = useState<string | null>(null);
  const { isAdmin } = useProjectRole(id);
  const { t } = useTranslation();

  useEffect(() => {
    if (!id) return;
    const fetchCompetitors = async () => {
      setCompetitorsLoading(true);
      setCompetitorError(null);
      try {
        const listData = await getProjectCompetitorList(id);
        setCompetitors(listData.items);
        setSelectedCompetitorId((prev) => prev ?? listData.items[0]?.id ?? null);
      } catch (error) {
        console.error(error);
        setCompetitorError("Failed to load competitors.");
        setCompetitors([]);
        setSelectedCompetitorId(null);
      } finally {
        setCompetitorsLoading(false);
      }
    };
    fetchCompetitors();
  }, [id]);

  useEffect(() => {
    if (!id || !selectedCompetitorId) {
      setCompetitorOverview(null);
      return;
    }
    const fetchOverview = async () => {
      setOverviewLoading(true);
      setCompetitorError(null);
      try {
        const overview = await getProjectCompetitorTrafficOverview(id, selectedCompetitorId);
        setCompetitorOverview(overview);
      } catch (error) {
        console.error(error);
        setCompetitorError("Failed to load competitor overview.");
        setCompetitorOverview(null);
      } finally {
        setOverviewLoading(false);
      }
    };
    fetchOverview();
  }, [id, selectedCompetitorId]);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await api.get<DashboardStats>(`/projects/${id}/dashboard`);
      setStats(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchBacklinkData = useCallback(async () => {
    if (!id) return;
    try {
      const [authorityData, backlinkData, changesData, statusData] = await Promise.all([
        getProjectAuthority(id),
        getProjectBacklinks(id),
        getProjectBacklinkChanges(id),
        getProjectBacklinkStatus(id),
      ]);
      setAuthority(authorityData);
      setBacklinks(backlinkData);
      setChanges(changesData);
      setBacklinkStatus(statusData);
    } catch (error) {
      console.error(error);
    }
  }, [id]);

  const fetchBacklinkStatus = useCallback(async () => {
    if (!id) return;
    try {
      const status = await getProjectBacklinkStatus(id);
      setBacklinkStatus(status);
    } catch (error) {
      console.error(error);
    }
  }, [id]);

  const fetchRoiData = useCallback(async () => {
    if (!id) return;
    try {
      const roiData = await getProjectRoi(id, roiRange, attributionModel);
      setRoi(roiData);
    } catch (error) {
      console.error(error);
    }
  }, [id, roiRange, attributionModel]);

  const fetchContentPerformance = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getProjectContentPerformance(id, window, sort);
      setContentPerformance(data);
    } catch (error) {
      console.error(error);
    }
  }, [id, window, sort]);

  useEffect(() => {
    if (id) {
      fetchDashboard();
      fetchContentPerformance();
      fetchBacklinkData();
      fetchRoiData();
    }
  }, [id, fetchDashboard, fetchContentPerformance, fetchBacklinkData, fetchRoiData]);

  useEffect(() => {
    if (id) fetchContentPerformance();
  }, [id, window, sort, fetchContentPerformance]);

  useEffect(() => {
    if (id) fetchRoiData();
  }, [id, roiRange, attributionModel, fetchRoiData]);

  useEffect(() => {
    if (!id) return;
    fetchBacklinkStatus();
    const timer = globalThis.setInterval(fetchBacklinkStatus, 10000);
    return () => globalThis.clearInterval(timer);
  }, [id, fetchBacklinkStatus]);

  const startCrawl = async () => {
    try {
      await api.post(`/projects/${id}/crawl`, null, {
        params: {
          max_pages: maxPages,
          sitemap_url: sitemapUrl || undefined,
        },
      });
      fetchDashboard();
      alert(t("dashboard.crawlStarted"));
    } catch (error) {
      console.error(error);
    }
  };

  const brandWindowDays =
    brandWindow === "7d" ? 7 : brandWindow === "30d" ? 30 : 90;
  const brandSeries = useMemo(() => {
    const rows = [...(stats?.analytics.daily_brand_segments || [])];
    return rows.slice(Math.max(rows.length - brandWindowDays, 0));
  }, [stats?.analytics.daily_brand_segments, brandWindowDays]);

  const brandSummary = useMemo(() => {
    return brandSeries.reduce(
      (acc, row) => ({
        brandSessions: acc.brandSessions + row.brand_sessions,
        nonBrandSessions: acc.nonBrandSessions + row.non_brand_sessions,
        brandConversions: acc.brandConversions + row.brand_conversions,
        nonBrandConversions:
          acc.nonBrandConversions + row.non_brand_conversions,
      }),
      {
        brandSessions: 0,
        nonBrandSessions: 0,
        brandConversions: 0,
        nonBrandConversions: 0,
      },
    );
  }, [brandSeries]);

  const backlinkRows = useMemo(() => {
    const rows = [
      ...(changes?.new_links ?? []).map((l) => ({ ...l, status: '新增' })),
      ...(changes?.lost_links ?? []).map((l) => ({ ...l, status: '失效' })),
    ];
    const filtered = rows.filter((row) => {
      if (!backlinkQuery.trim()) return true;
      const q = backlinkQuery.toLowerCase();
      return `${row.status} ${row.source ?? ''} ${row.url} ${row.anchor ?? ''} ${row.date ?? ''}`.toLowerCase().includes(q);
    });

    return filtered.sort((a, b) => {
      if (backlinkSort === 'source') return (a.source ?? '').localeCompare(b.source ?? '');
      if (backlinkSort === 'status') return a.status.localeCompare(b.status);
      return (b.date ?? '').localeCompare(a.date ?? '');
    });
  }, [backlinkQuery, backlinkSort, changes?.lost_links, changes?.new_links]);

  if (loading || !stats) return <div>{t("app.loading")}</div>;

  const { last_crawl, issues_breakdown, analytics } = stats;
  const hasGrowth = analytics.period.growth_pct >= 0;
  const siteHealthColorClass =
    stats.site_health_band === "green"
      ? "text-green-600"
      : stats.site_health_band === "yellow"
        ? "text-yellow-600"
        : "text-red-600";
  const siteHealthStroke =
    stats.site_health_band === "green"
      ? "#16a34a"
      : stats.site_health_band === "yellow"
        ? "#ca8a04"
        : "#dc2626";
  const healthRadius = 40;
  const healthCircumference = 2 * Math.PI * healthRadius;
  const healthDashOffset =
    healthCircumference - (stats.site_health_score / 100) * healthCircumference;

  const categoryScores = stats.category_scores ?? [];

  const qualityCards = [
    {
      label: "Engaged Sessions",
      value: analytics.quality_metrics.engaged_sessions,
    },
    {
      label: "Avg Engagement Time (s)",
      value: analytics.quality_metrics.avg_engagement_time,
    },
    {
      label: "Pages / Session",
      value: analytics.quality_metrics.pages_per_session,
    },
    { label: "Key Events", value: analytics.quality_metrics.key_events },
  ];

  const competitorCurrentMonthTraffic = competitorOverview?.monthly_trend.at(-1)?.competitor ?? null;
  const competitorPrevMonthTraffic = competitorOverview && competitorOverview.monthly_trend.length > 1
    ? competitorOverview.monthly_trend.at(-2)?.competitor ?? null
    : null;
  const competitorMoM =
    competitorCurrentMonthTraffic !== null &&
    competitorPrevMonthTraffic !== null &&
    competitorPrevMonthTraffic > 0
      ? ((competitorCurrentMonthTraffic - competitorPrevMonthTraffic) / competitorPrevMonthTraffic) * 100
      : null;
  const topKeyword = competitorOverview?.top_keywords[0] ?? null;

  const renderContentList = (
    title: string,
    items: ContentPerformanceItem[],
  ) => (
    <div className="bg-white p-6 rounded shadow">
      <h3 className="font-semibold mb-3">{title}</h3>
      <ul className="space-y-3 text-sm">
        {items.length === 0 && <li className="text-slate-600 dark:text-slate-300">No data</li>}
        {items.map((item) => (
          <li key={`${title}-${item.url}`} className="border-b pb-2">
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline break-all"
            >
              {item.url}
            </a>
            <div className="text-xs text-slate-700 dark:text-slate-300 mt-1 flex flex-wrap gap-3">
              <span>Sessions: {item.sessions}</span>
              <span>CVR: {item.conversion_rate}%</span>
              <span>7d: {item.change_7d}%</span>
              {item.decay_flag && <span className="text-red-700 dark:text-red-300">Decay</span>}
            </div>
            {item.suggested_action && (
              <p className="text-xs text-orange-700 mt-1">
                {item.suggested_action}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="text-slate-900 dark:text-slate-100">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <Link
            to={`/projects/${id}/reports`}
            className="text-sm text-blue-600 underline"
          >
            Reports
          </Link>
          <Link
            to={`/projects/${id}/site-audit`}
            className="text-sm text-blue-600 underline"
          >
            Site Audit Overview
          </Link>
        </div>
        {isAdmin && (
          <button
            onClick={startCrawl}
            className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-blue-700"
          >
            <Play size={18} /> Start New Crawl
          </button>
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-slate-700 dark:text-slate-200">Max pages</span>
          <input
            type="number"
            min={1}
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value) || 1)}
            className="border border-slate-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-slate-700 dark:text-slate-200">Sitemap URL (optional)</span>
          <input
            type="url"
            placeholder="https://example.com/sitemap.xml"
            value={sitemapUrl}
            onChange={(e) => setSitemapUrl(e.target.value)}
            className="border border-slate-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800"
          />
        </label>
      </div>

      <Link
        to={`/projects/${id}/issues`}
        className="mb-6 block bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-700 hover:border-blue-400 transition"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase text-slate-500">Site Health</p>
            <p className={`text-3xl font-bold ${siteHealthColorClass}`}>
              {stats.site_health_score}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Band: {stats.site_health_band.toUpperCase()} · 点击查看审计详情
            </p>
          </div>
          <svg width="110" height="110" viewBox="0 0 110 110" aria-label="Site health score chart">
            <circle cx="55" cy="55" r={healthRadius} stroke="#e2e8f0" strokeWidth="10" fill="none" />
            <circle
              cx="55"
              cy="55"
              r={healthRadius}
              stroke={siteHealthStroke}
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={healthCircumference}
              strokeDashoffset={healthDashOffset}
              transform="rotate(-90 55 55)"
            />
            <text x="55" y="60" textAnchor="middle" className="fill-slate-700" fontSize="18" fontWeight="700">
              {stats.site_health_score}
            </text>
          </svg>
        </div>
      </Link>

      {categoryScores.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          {categoryScores.map((item) => (
            <div key={item.key ?? item.name} className="rounded border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs uppercase text-slate-500">{item.name}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{item.score}</p>
              <p className="text-xs text-slate-500">Issues: {item.issue_count}</p>
            </div>
          ))}
        </div>
      )}

      {(authority?.notes?.length ||
        backlinks?.notes?.length ||
        analytics.notes.length > 0) && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded p-4 text-sm text-yellow-900 space-y-1">
          {analytics.notes.map((note) => (
            <p key={`analytics-${note}`}>{note}</p>
          ))}
          {authority?.notes?.map((note) => (
            <p key={`authority-${note}`}>{note}</p>
          ))}
          {backlinks?.notes?.map((note) => (
            <p key={`backlinks-${note}`}>{note}</p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-700">
          <h3 className="text-slate-600 dark:text-slate-300 text-sm uppercase">Total Pages</h3>
          <p className="text-3xl font-bold">{stats.total_pages}</p>
        </div>
        <div className="bg-white p-6 rounded shadow border-l-4 border-red-500">
          <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2">
            <AlertOctagon size={16} />
            Critical
          </h3>
          <p className="text-3xl font-bold text-red-600">
            {issues_breakdown.critical}
          </p>
        </div>
        <div className="bg-white p-6 rounded shadow border-l-4 border-yellow-500">
          <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2">
            <AlertTriangle size={16} />
            Warning
          </h3>
          <p className="text-3xl font-bold text-yellow-600">
            {issues_breakdown.warning}
          </p>
        </div>
        <div className="bg-white p-6 rounded shadow border-l-4 border-blue-500">
          <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2">
            <Info size={16} />
            Info
          </h3>
          <p className="text-3xl font-bold text-blue-600">
            {issues_breakdown.info}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-700 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Technical Health</h2>
          <span className="text-sm text-gray-600">
            Pass Rate: {stats.technical_health.pass_rate}%
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="border rounded p-4">
            <p className="text-xs uppercase text-gray-500">CWV Good</p>
            <p className="text-2xl font-bold text-green-600">
              {stats.technical_health.cwv_scorecard.good}
            </p>
          </div>
          <div className="border rounded p-4">
            <p className="text-xs uppercase text-gray-500">Needs Improvement</p>
            <p className="text-2xl font-bold text-yellow-600">
              {stats.technical_health.cwv_scorecard.needs_improvement}
            </p>
          </div>
          <div className="border rounded p-4">
            <p className="text-xs uppercase text-gray-500">CWV Poor</p>
            <p className="text-2xl font-bold text-red-600">
              {stats.technical_health.cwv_scorecard.poor}
            </p>
          </div>
          <div className="border rounded p-4">
            <p className="text-xs uppercase text-gray-500">Failed Items</p>
            <p className="text-2xl font-bold">
              {stats.technical_health.failed_items}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="border border-slate-200 dark:border-slate-700 rounded p-4">
            <h3 className="font-medium mb-2">Index Coverage Anomalies</h3>
            <ul className="text-sm space-y-1">
              {stats.technical_health.indexability_anomalies.length === 0 && (
                <li className="text-gray-500">No anomalies</li>
              )}
              {stats.technical_health.indexability_anomalies.map((item) => (
                <li key={item.issue_type} className="flex justify-between">
                  <span>{item.issue_type}</span>
                  <span className="font-semibold">{item.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="border border-slate-200 dark:border-slate-700 rounded p-4">
            <h3 className="font-medium mb-2">Structured Data Errors</h3>
            <ul className="text-sm space-y-1">
              {stats.technical_health.structured_data_errors.length === 0 && (
                <li className="text-gray-500">No errors</li>
              )}
              {stats.technical_health.structured_data_errors.map((item) => (
                <li key={item.issue_type} className="flex justify-between">
                  <span>{item.issue_type}</span>
                  <span className="font-semibold">{item.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="border border-slate-200 dark:border-slate-700 rounded p-4 h-48">
            <h3 className="font-medium mb-2">Pass Rate Trend</h3>
            <ResponsiveContainer width="100%" height="85%">
              <LineChart data={stats.technical_health.trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="pass_rate"
                  stroke="#2563eb"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2">
            <Shield size={16} />
            Domain Authority
          </h3>
          <p className="text-3xl font-bold">{authority?.domain_authority ?? 0}</p>
          <p className="text-xs text-slate-500 mt-2">状态: {backlinkStatus?.fetch_status ?? backlinks?.fetch_status ?? "pending"}</p>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2">
            <LinkIcon size={16} />
            Backlinks
          </h3>
          <p className="text-3xl font-bold">{backlinks?.backlinks_total ?? 0}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-700">
          <h3 className="text-slate-600 dark:text-slate-300 text-sm uppercase">Ref Domains</h3>
          <p className="text-3xl font-bold">{backlinks?.ref_domains ?? 0}</p>
          <Link className="mt-2 inline-block text-xs text-blue-600 hover:underline" to={`/projects/${id}/backlinks/ref-domains`}>
            查看引用域
          </Link>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-700">
          <h3 className="text-slate-600 dark:text-slate-300 text-sm uppercase">Ahrefs Rank</h3>
          <p className="text-3xl font-bold">{backlinks?.ahrefs_rank ?? authority?.ahrefs_rank ?? "—"}</p>
          <p className="text-xs text-slate-500 mt-2">上次刷新: {backlinkStatus?.last_fetched_at ?? backlinks?.last_fetched_at ?? "未刷新"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-700 h-72">
          <h3 className="font-semibold mb-3">Authority Trend</h3>
          <ResponsiveContainer width="100%" height="90%">
            <LineChart data={authority?.history ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="domain_authority"
                stroke="#2563eb"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-700 h-72">
          <h3 className="font-semibold mb-3">Backlink Trend</h3>
          <ResponsiveContainer width="100%" height="90%">
            <LineChart data={backlinks?.history ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="backlinks_total"
                stroke="#16a34a"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="ref_domains"
                stroke="#f59e0b"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-700 mb-8">
        <h3 className="font-semibold mb-3">重要外链 Top N</h3>
        <ul className="space-y-2 text-sm">
          {(backlinks?.top_backlinks ?? []).length === 0 && <li className="text-slate-500">暂无缓存数据</li>}
          {(backlinks?.top_backlinks ?? []).map((item, idx) => (
            <li key={`top-link-${idx}-${item.url}`} className="border-b pb-2">
              <p className="font-medium break-all">{item.url}</p>
              <p className="text-xs text-slate-500">{item.source ?? "—"} · {item.anchor ?? "—"} · {item.date ?? "—"}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-700 mb-8 overflow-x-auto">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">最近新增 / 失效外链</h3>
          <div className="flex gap-2">
            <input value={backlinkQuery} onChange={(e) => setBacklinkQuery(e.target.value)} placeholder="筛选 source / url / anchor" className="rounded border px-3 py-1 text-sm" />
            <select value={backlinkSort} onChange={(e) => setBacklinkSort(e.target.value as 'status' | 'source' | 'date')} className="rounded border px-3 py-1 text-sm">
              <option value="date">按日期</option>
              <option value="status">按状态</option>
              <option value="source">按来源</option>
            </select>
          </div>
        </div>
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
            {backlinkRows.map((item, idx) => (
              <tr
                key={`${item.status}-${item.url}-${idx}`}
                className="border-b"
              >
                <td className="py-2">{item.status}</td>
                <td className="py-2">{item.source ?? "—"}</td>
                <td className="py-2 break-all">{item.url}</td>
                <td className="py-2">{item.anchor ?? "—"}</td>
                <td className="py-2">{item.date ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-700 mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <BadgePercent size={18} />
            SEO ROI
          </h3>
          <div className="flex gap-2">
            <select
              value={roiRange}
              onChange={(e) =>
                setRoiRange(e.target.value as "30d" | "90d" | "12m")
              }
              className="border rounded px-3 py-1 text-sm"
            >
              <option value="30d">30天</option>
              <option value="90d">90天</option>
              <option value="12m">12个月</option>
            </select>
            <select
              value={attributionModel}
              onChange={(e) =>
                setAttributionModel(
                  e.target.value as "linear" | "first_click" | "last_click",
                )
              }
              className="border rounded px-3 py-1 text-sm"
            >
              <option value="linear">Linear</option>
              <option value="first_click">First Click</option>
              <option value="last_click">Last Click</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="rounded bg-slate-50 p-4">
            <p className="text-xs text-slate-600 dark:text-slate-300">收益 (Gain)</p>
            <p className="text-2xl font-bold">{roi?.gain ?? 0}</p>
          </div>
          <div className="rounded bg-slate-50 p-4">
            <p className="text-xs text-gray-500">成本 (Cost)</p>
            <p className="text-2xl font-bold">
              {roi ? roi.cost.monthly_total_cost : 0}
            </p>
          </div>
          <div className="rounded bg-slate-50 p-4">
            <p className="text-xs text-gray-500">辅助转化</p>
            <p className="text-2xl font-bold">
              {roi?.assisted_conversions ?? 0}
            </p>
          </div>
          <div className="rounded bg-slate-50 p-4">
            <p className="text-xs text-gray-500">ROI %</p>
            <p
              className={`text-2xl font-bold ${(roi?.roi_pct ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {roi?.roi_pct ?? 0}%
            </p>
          </div>
        </div>

        <div className="h-64 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={[
                {
                  name: "Revenue",
                  value: roi?.revenue ?? analytics.totals.revenue,
                },
                {
                  name: "Pipeline",
                  value: roi?.pipeline_value ?? analytics.totals.pipeline_value,
                },
                { name: "Cost", value: roi?.cost.monthly_total_cost ?? 0 },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#2563eb"
                fill="#93c5fd"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <RoiAttributionNote
          attributionModel={attributionModel}
          provider={roi?.provider ?? analytics.provider}
        />
      </div>

      <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2">
            <Activity size={16} />
            Daily Avg
          </h3>
          <p className="text-3xl font-bold">{analytics.period.daily_average}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-700">
          <h3 className="text-slate-600 dark:text-slate-300 text-sm uppercase">Monthly Sessions</h3>
          <p className="text-3xl font-bold">{analytics.period.monthly_total}</p>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-gray-500 text-sm uppercase">Growth</h3>
          <p
            className={`text-3xl font-bold flex items-center gap-2 ${hasGrowth ? "text-green-600" : "text-red-600"}`}
          >
            {hasGrowth ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
            {analytics.period.growth_pct}%
          </p>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-gray-500 text-sm uppercase flex items-center gap-2">
            <MousePointerClick size={16} />
            Conversions
          </h3>
          <p className="text-3xl font-bold">{analytics.totals.conversions}</p>
        </div>
      </div>
      <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-6">
        {qualityCards.map((card) => (
          <div key={card.label} className="bg-white p-6 rounded shadow">
            <h3 className="text-gray-500 text-sm uppercase">{card.label}</h3>
            <p className="text-3xl font-bold">{card.value ?? "—"}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-700 mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-semibold">Competitor Overview</h3>
          <select
            value={selectedCompetitorId ?? ""}
            onChange={(e) => setSelectedCompetitorId(Number(e.target.value) || null)}
            className="border rounded px-3 py-1 text-sm min-w-48"
            disabled={competitorsLoading || competitors.length === 0}
          >
            {competitors.length === 0 ? (
              <option value="">No competitors</option>
            ) : (
              competitors.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.domain}
                </option>
              ))
            )}
          </select>
        </div>

        {(competitorsLoading || overviewLoading) && (
          <p className="text-sm text-slate-500">Loading competitor overview...</p>
        )}

        {!competitorsLoading && !overviewLoading && competitorError && (
          <p className="text-sm text-red-600">{competitorError}</p>
        )}

        {!competitorsLoading && !overviewLoading && !competitorError && competitors.length === 0 && (
          <p className="text-sm text-slate-500">Add competitors to view traffic benchmarks.</p>
        )}

        {!competitorsLoading && !overviewLoading && !competitorError && competitorOverview && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs text-slate-500">本月流量</p>
                <p className="text-2xl font-bold">{Math.round(competitorCurrentMonthTraffic ?? 0).toLocaleString()}</p>
              </div>
              <div className="rounded bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs text-slate-500">环比</p>
                <p className={`text-2xl font-bold ${((competitorMoM ?? 0) >= 0) ? "text-green-600" : "text-red-600"}`}>
                  {competitorMoM === null ? "—" : `${competitorMoM.toFixed(1)}%`}
                </p>
              </div>
              <div className="rounded bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs text-slate-500">Top 关键词</p>
                <p className="text-lg font-semibold break-all">{topKeyword?.keyword ?? "—"}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {topKeyword ? `Rank ${topKeyword.rank ?? "—"} · SV ${topKeyword.search_volume}` : "暂无关键词数据"}
                </p>
              </div>
            </div>
            {competitorOverview.data_source === "local_estimation" && (
              <p className="mt-3 inline-flex rounded-full bg-amber-100 text-amber-800 text-xs px-2 py-1">估算数据</p>
            )}
          </>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-700 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Brand vs Non-brand</h3>
          <select
            value={brandWindow}
            onChange={(e) =>
              setBrandWindow(e.target.value as "7d" | "30d" | "90d")
            }
            className="border rounded px-3 py-1 text-sm"
          >
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3 text-sm">
          <div>
            Brand Sessions:{" "}
            <span className="font-semibold">{brandSummary.brandSessions}</span>{" "}
            · Conversions:{" "}
            <span className="font-semibold">
              {brandSummary.brandConversions}
            </span>
          </div>
          <div>
            Non-brand Sessions:{" "}
            <span className="font-semibold">
              {brandSummary.nonBrandSessions}
            </span>{" "}
            · Conversions:{" "}
            <span className="font-semibold">
              {brandSummary.nonBrandConversions}
            </span>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={brandSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="brand_sessions"
                fill="#2563eb"
                name="Brand Sessions"
              />
              <Bar
                dataKey="non_brand_sessions"
                fill="#94a3b8"
                name="Non-brand Sessions"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <h2 className="text-xl font-bold mr-3">Content Performance</h2>
        <select
          value={window}
          onChange={(e) => setWindow(e.target.value as "7d" | "30d" | "90d")}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
          <option value="90d">90 days</option>
        </select>
        <select
          value={sort}
          onChange={(e) =>
            setSort(e.target.value as "traffic" | "conversion_rate" | "decay")
          }
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="traffic">Sort: Traffic</option>
          <option value="conversion_rate">Sort: Conversion Rate</option>
          <option value="decay">Sort: Decay</option>
        </select>
        <Link
          to={`/projects/${id}/pages`}
          className="text-sm text-blue-600 hover:underline"
        >
          View page details
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {renderContentList("热门内容", contentPerformance?.top_content ?? [])}
        {renderContentList(
          "高转化页面",
          contentPerformance?.top_conversion ?? [],
        )}
        {renderContentList(
          "衰减页面",
          contentPerformance?.decaying_content ?? [],
        )}
      </div>

      {last_crawl ? (
        <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold mb-4">Last Crawl Status</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-gray-500">Status:</span>
              <span
                className={`ml-2 px-2 py-1 rounded text-sm ${
                  last_crawl.status === "completed"
                    ? "bg-green-100 text-green-800"
                    : last_crawl.status === "failed"
                      ? "bg-red-100 text-red-800"
                      : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {last_crawl.status}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Date:</span>
              <span className="ml-2">
                {new Date(last_crawl.start_time).toLocaleString()}
              </span>
            </div>
          </div>
          <div className="mt-4 flex gap-4">
            <Link
              to={`/projects/${id}/pages`}
              className="text-blue-600 hover:underline"
            >
              View Pages
            </Link>
            <Link
              to={`/projects/${id}/issues`}
              className="text-blue-600 hover:underline"
            >
              View Issues
            </Link>
            <Link
              to={`/projects/${id}/keywords`}
              className="text-blue-600 hover:underline"
            >
              Keyword Rankings
            </Link>
            <Link
              to={`/projects/${id}/keyword-research`}
              className="text-blue-600 hover:underline"
            >
              Keyword Research
            </Link>
            {isAdmin && (
              <Link
                to={`/projects/${id}/api-keys`}
                className="text-blue-600 hover:underline"
              >
                API Keys
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold mb-4">Last Crawl Status</h2>
          <p className="text-gray-600">
            No crawl data yet. Start a crawl to populate technical SEO metrics.
          </p>
        </div>
      )}
    </div>
  );
}
