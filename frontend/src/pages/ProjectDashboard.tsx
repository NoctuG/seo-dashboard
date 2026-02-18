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
  getProjectSearchInsights,
  getProjectDashboardLayout,
  saveProjectDashboardLayout,
} from "../api";
import type {
  DashboardStats,
  ContentPerformanceResponse,
  ContentPerformanceItem,
  AuthorityResponse,
  BacklinkResponse,
  BacklinkTrendPoint,
  BacklinkChangesResponse,
  BacklinkStatusResponse,
  CompetitorDomainItem,
  CompetitorTrafficOverviewResponse,
  RoiBreakdownResponse,
  SearchInsightsResponse,
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
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../auth";
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
const DEFAULT_WIDGET_ORDER = [
  "domain-authority",
  "backlinks",
  "ref-domains",
  "ahrefs-rank",
];
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
  const [backlinkStatus, setBacklinkStatus] =
    useState<BacklinkStatusResponse | null>(null);
  const [backlinkTrendWindow, setBacklinkTrendWindow] = useState<7 | 30 | 90>(
    30,
  );
  const [backlinkTrendInterval, setBacklinkTrendInterval] = useState<
    "day" | "week"
  >("day");
  const [brandWindow, setBrandWindow] = useState<"7d" | "30d" | "90d">("30d");
  const [roiRange, setRoiRange] = useState<"30d" | "90d" | "12m">("30d");
  const [attributionModel, setAttributionModel] = useState<
    "linear" | "first_click" | "last_click"
  >("linear");
  const [roi, setRoi] = useState<RoiBreakdownResponse | null>(null);
  const [backlinkQuery, setBacklinkQuery] = useState("");
  const [backlinkSort, setBacklinkSort] = useState<
    "status" | "source" | "date"
  >("date");
  const [competitors, setCompetitors] = useState<CompetitorDomainItem[]>([]);
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<
    number | null
  >(null);
  const [competitorOverview, setCompetitorOverview] =
    useState<CompetitorTrafficOverviewResponse | null>(null);
  const [competitorsLoading, setCompetitorsLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [competitorError, setCompetitorError] = useState<string | null>(null);
  const [searchInsights, setSearchInsights] =
    useState<SearchInsightsResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsPage, setInsightsPage] = useState(1);
  const [heatmapStep, setHeatmapStep] = useState(2);
  const { isAdmin } = useProjectRole(id);
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const [dashboardLayout, setDashboardLayout] = useState<{
    order: string[];
    hidden: string[];
  }>({ order: DEFAULT_WIDGET_ORDER, hidden: [] });
  useEffect(() => {
    if (!id) return;
    const fetchCompetitors = async () => {
      setCompetitorsLoading(true);
      setCompetitorError(null);
      try {
        const listData = await getProjectCompetitorList(id);
        setCompetitors(listData.items);
        setSelectedCompetitorId(
          (prev) => prev ?? listData.items[0]?.id ?? null,
        );
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
        const overview = await getProjectCompetitorTrafficOverview(
          id,
          selectedCompetitorId,
        );
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
  useEffect(() => {
    if (!id) return;
    const fetchSearchInsights = async () => {
      setInsightsLoading(true);
      try {
        const data = await getProjectSearchInsights(id, {
          days: 60,
          page: insightsPage,
          pageSize: 18,
          keywordSampleStep: heatmapStep,
        });
        setSearchInsights(data);
      } catch (error) {
        console.error(error);
        setSearchInsights(null);
      } finally {
        setInsightsLoading(false);
      }
    };
    fetchSearchInsights();
  }, [id, insightsPage, heatmapStep]);
  useEffect(() => {
    if (!id) return;
    if (!isAuthenticated || !isAdmin) {
      setDashboardLayout({ order: DEFAULT_WIDGET_ORDER, hidden: [] });
      return;
    }
    getProjectDashboardLayout(id)
      .then((layout) =>
        setDashboardLayout({
          order: layout.order?.length ? layout.order : DEFAULT_WIDGET_ORDER,
          hidden: layout.hidden ?? [],
        }),
      )
      .catch(() =>
        setDashboardLayout({ order: DEFAULT_WIDGET_ORDER, hidden: [] }),
      );
  }, [id, isAuthenticated, isAdmin]);
  useEffect(() => {
    if (!id || !isAuthenticated || !isAdmin) return;
    const timer = globalThis.setTimeout(() => {
      saveProjectDashboardLayout(id, dashboardLayout).catch((error) =>
        console.error(error),
      );
    }, 800);
    return () => globalThis.clearTimeout(timer);
  }, [id, isAuthenticated, isAdmin, dashboardLayout]);
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
      const [authorityData, backlinkData, changesData, statusData] =
        await Promise.all([
          getProjectAuthority(id),
          getProjectBacklinks(id, {
            window_days: backlinkTrendWindow,
            interval: backlinkTrendInterval,
          }),
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
  }, [id, backlinkTrendInterval, backlinkTrendWindow]);
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
  }, [
    id,
    fetchDashboard,
    fetchContentPerformance,
    fetchBacklinkData,
    fetchRoiData,
  ]);
  useEffect(() => {
    if (id) fetchContentPerformance();
  }, [id, window, sort, fetchContentPerformance]);
  useEffect(() => {
    if (id) fetchBacklinkData();
  }, [id, backlinkTrendWindow, backlinkTrendInterval, fetchBacklinkData]);
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
        params: { max_pages: maxPages, sitemap_url: sitemapUrl || undefined },
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
      ...(changes?.new_links ?? []).map((l) => ({ ...l, status: "新增" })),
      ...(changes?.lost_links ?? []).map((l) => ({ ...l, status: "失效" })),
    ];
    const filtered = rows.filter((row) => {
      if (!backlinkQuery.trim()) return true;
      const q = backlinkQuery.toLowerCase();
      return `${row.status} ${row.source ?? ""} ${row.url} ${row.anchor ?? ""} ${row.date ?? ""}`
        .toLowerCase()
        .includes(q);
    });
    return filtered.sort((a, b) => {
      if (backlinkSort === "source")
        return (a.source ?? "").localeCompare(b.source ?? "");
      if (backlinkSort === "status") return a.status.localeCompare(b.status);
      return (b.date ?? "").localeCompare(a.date ?? "");
    });
  }, [backlinkQuery, backlinkSort, changes?.lost_links, changes?.new_links]);
  const insightPalette = useMemo(
    () =>
      searchInsights?.legend.palette ?? {
        top3: "#0f766e",
        top10: "#0ea5a4",
        top20: "#22d3ee",
        top50: "#67e8f9",
        out: "#e2e8f0",
        missing: "#f8fafc",
      },
    [searchInsights?.legend.palette],
  );
  const resolveRankCellColor = (rank: number | null) => {
    if (rank === null || rank === undefined) return insightPalette.missing;
    if (rank <= 3) return insightPalette.top3;
    if (rank <= 10) return insightPalette.top10;
    if (rank <= 20) return insightPalette.top20;
    if (rank <= 50) return insightPalette.top50;
    return insightPalette.out;
  };
  const geoMaxSessions = Math.max(
    ...(searchInsights?.geo_distribution.rows.map((row) => row.sessions) ?? [
      1,
    ]),
  );
  const backlinkTrendSeries: BacklinkTrendPoint[] =
    backlinks?.trend_series && backlinks.trend_series.length > 0
      ? backlinks.trend_series
      : (backlinks?.history ?? []);
  const backlinkTrendLatest = backlinkTrendSeries.at(-1);
  const backlinkTrendFirst = backlinkTrendSeries[0];
  const backlinkTrendSummary = backlinks?.trend_summary;
  const totalBacklinksMetric =
    backlinkTrendSummary?.latest_backlinks_total ??
    backlinkTrendLatest?.backlinks_total ??
    backlinks?.backlinks_total ??
    0;
  const totalRefDomainsMetric =
    backlinkTrendSummary?.latest_ref_domains ??
    backlinkTrendLatest?.ref_domains ??
    backlinks?.ref_domains ??
    0;
  const netGrowthMetric =
    backlinkTrendSummary?.net_growth ??
    (backlinkTrendLatest?.backlinks_total ?? 0) -
      (backlinkTrendFirst?.backlinks_total ?? 0);
  const formatPct = (value?: number | null) => {
    if (value === null || value === undefined || Number.isNaN(value))
      return "—";
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  };
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
  const competitorCurrentMonthTraffic =
    competitorOverview?.monthly_trend.at(-1)?.competitor ?? null;
  const competitorPrevMonthTraffic =
    competitorOverview && competitorOverview.monthly_trend.length > 1
      ? (competitorOverview.monthly_trend.at(-2)?.competitor ?? null)
      : null;
  const competitorMoM =
    competitorCurrentMonthTraffic !== null &&
    competitorPrevMonthTraffic !== null &&
    competitorPrevMonthTraffic > 0
      ? ((competitorCurrentMonthTraffic - competitorPrevMonthTraffic) /
          competitorPrevMonthTraffic) *
        100
      : null;
  const topKeyword = competitorOverview?.top_keywords[0] ?? null;
  const renderContentList = (
    title: string,
    items: ContentPerformanceItem[],
  ) => (
    <div className="app-card dashboard-card">
      {" "}
      <h3 className="font-semibold mb-3">{title}</h3>{" "}
      <ul className="space-y-3 text-sm">
        {" "}
        {items.length === 0 && (
          <li className="text-[var(--md-sys-color-on-surface-variant)]">
            No data
          </li>
        )}{" "}
        {items.map((item) => (
          <li key={`${title}-${item.url}`} className="border-b pb-2">
            {" "}
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--md-sys-color-primary)] hover:underline break-all"
            >
              {" "}
              {item.url}{" "}
            </a>{" "}
            <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1 flex flex-wrap gap-3">
              {" "}
              <span>Sessions: {item.sessions}</span>{" "}
              <span>CVR: {item.conversion_rate}%</span>{" "}
              <span>7d: {item.change_7d}%</span>{" "}
              {item.decay_flag && (
                <span className="text-red-600">Decay</span>
              )}{" "}
            </div>{" "}
            {item.suggested_action && (
              <p className="text-xs text-orange-700 mt-1">
                {" "}
                {item.suggested_action}{" "}
              </p>
            )}{" "}
          </li>
        ))}{" "}
      </ul>{" "}
    </div>
  );
  return (
    <div className="text-[var(--md-sys-color-on-surface)]">
      {" "}
      <div className="flex justify-between items-center mb-6">
        {" "}
        <div className="flex items-center gap-3">
          {" "}
          <h1 className="text-2xl font-bold">Dashboard</h1>{" "}
          <Link
            to={`/projects/${id}/reports`}
            className="text-sm text-[var(--md-sys-color-primary)] underline"
          >
            {" "}
            Reports{" "}
          </Link>{" "}
          <Link
            to={`/projects/${id}/site-audit`}
            className="text-sm text-[var(--md-sys-color-primary)] underline"
          >
            {" "}
            Site Audit Overview{" "}
          </Link>{" "}
        </div>{" "}
        {isAdmin && (
          <button
            onClick={startCrawl}
            className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-blue-700"
          >
            {" "}
            <Play size={18} /> Start New Crawl{" "}
          </button>
        )}{" "}
      </div>{" "}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        {" "}
        <label className="flex flex-col gap-2 text-sm">
          {" "}
          <span className="text-[var(--md-sys-color-on-surface-variant)]">
            Max pages
          </span>{" "}
          <input
            type="number"
            min={1}
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value) || 1)}
            className="app-input"
          />{" "}
        </label>{" "}
        <label className="flex flex-col gap-2 text-sm">
          {" "}
          <span className="text-[var(--md-sys-color-on-surface-variant)]">
            Sitemap URL (optional)
          </span>{" "}
          <input
            type="url"
            placeholder="https://example.com/sitemap.xml"
            value={sitemapUrl}
            onChange={(e) => setSitemapUrl(e.target.value)}
            className="app-input"
          />{" "}
        </label>{" "}
      </div>{" "}
      <Link
        to={`/projects/${id}/issues`}
        className="mb-6 block app-card dashboard-card hover:border-[var(--md-sys-color-primary)] transition"
      >
        {" "}
        <div className="flex items-center justify-between gap-4">
          {" "}
          <div>
            {" "}
            <p className="text-sm uppercase text-[var(--md-sys-color-on-surface-variant)]">
              Site Health
            </p>{" "}
            <p className={`text-3xl font-bold ${siteHealthColorClass}`}>
              {" "}
              {stats.site_health_score}{" "}
            </p>{" "}
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
              {" "}
              Band: {stats.site_health_band.toUpperCase()} ·
              点击查看审计详情{" "}
            </p>{" "}
          </div>{" "}
          <svg
            width="110"
            height="110"
            viewBox="0 0 110 110"
            aria-label="Site health score chart"
          >
            {" "}
            <circle
              cx="55"
              cy="55"
              r={healthRadius}
              stroke="#e2e8f0"
              strokeWidth="10"
              fill="none"
            />{" "}
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
            />{" "}
            <text
              x="55"
              y="60"
              textAnchor="middle"
              className="fill-slate-700"
              fontSize="18"
              fontWeight="700"
            >
              {" "}
              {stats.site_health_score}{" "}
            </text>{" "}
          </svg>{" "}
        </div>{" "}
      </Link>{" "}
      {categoryScores.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          {" "}
          {categoryScores.map((item) => (
            <div
              key={item.key ?? item.name}
              className="app-card dashboard-card dashboard-card-compact"
            >
              {" "}
              <p className="text-xs uppercase text-[var(--md-sys-color-on-surface-variant)]">
                {item.name}
              </p>{" "}
              <p className="mt-1 text-2xl font-bold text-[var(--md-sys-color-on-surface)]">
                {item.score}
              </p>{" "}
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Issues: {item.issue_count}
              </p>{" "}
            </div>
          ))}{" "}
        </div>
      )}{" "}
      {(authority?.notes?.length ||
        backlinks?.notes?.length ||
        analytics.notes.length > 0) && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded p-4 text-sm text-yellow-900 space-y-1">
          {" "}
          {analytics.notes.map((note) => (
            <p key={`analytics-${note}`}>{note}</p>
          ))}{" "}
          {authority?.notes?.map((note) => (
            <p key={`authority-${note}`}>{note}</p>
          ))}{" "}
          {backlinks?.notes?.map((note) => (
            <p key={`backlinks-${note}`}>{note}</p>
          ))}{" "}
        </div>
      )}{" "}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {" "}
        <div className="app-card dashboard-card">
          {" "}
          <h3 className="text-[var(--md-sys-color-on-surface-variant)] text-sm uppercase">
            Total Pages
          </h3>{" "}
          <p className="text-3xl font-bold">{stats.total_pages}</p>{" "}
        </div>{" "}
        <div className="app-card dashboard-card border-l-4 border-red-500">
          {" "}
          <h3 className="text-[var(--md-sys-color-on-surface-variant)] text-sm uppercase flex items-center gap-2">
            {" "}
            <AlertOctagon size={16} /> Critical{" "}
          </h3>{" "}
          <p className="text-3xl font-bold text-red-600">
            {" "}
            {issues_breakdown.critical}{" "}
          </p>{" "}
        </div>{" "}
        <div className="app-card dashboard-card border-l-4 border-yellow-500">
          {" "}
          <h3 className="text-[var(--md-sys-color-on-surface-variant)] text-sm uppercase flex items-center gap-2">
            {" "}
            <AlertTriangle size={16} /> Warning{" "}
          </h3>{" "}
          <p className="text-3xl font-bold text-yellow-600">
            {" "}
            {issues_breakdown.warning}{" "}
          </p>{" "}
        </div>{" "}
        <div className="app-card dashboard-card border-l-4 border-blue-500">
          {" "}
          <h3 className="text-[var(--md-sys-color-on-surface-variant)] text-sm uppercase flex items-center gap-2">
            {" "}
            <Info size={16} /> Info{" "}
          </h3>{" "}
          <p className="text-3xl font-bold text-[var(--md-sys-color-primary)]">
            {" "}
            {issues_breakdown.info}{" "}
          </p>{" "}
        </div>{" "}
      </div>{" "}
      <div className="app-card dashboard-card mb-8">
        {" "}
        <div className="flex items-center justify-between mb-4">
          {" "}
          <h2 className="text-xl font-semibold">Technical Health</h2>{" "}
          <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            {" "}
            Pass Rate: {stats.technical_health.pass_rate}%{" "}
          </span>{" "}
        </div>{" "}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {" "}
          <div className="dashboard-subcard">
            {" "}
            <p className="text-xs uppercase text-[var(--md-sys-color-on-surface-variant)]">
              CWV Good
            </p>{" "}
            <p className="text-2xl font-bold text-green-600">
              {" "}
              {stats.technical_health.cwv_scorecard.good}{" "}
            </p>{" "}
          </div>{" "}
          <div className="dashboard-subcard">
            {" "}
            <p className="text-xs uppercase text-[var(--md-sys-color-on-surface-variant)]">
              Needs Improvement
            </p>{" "}
            <p className="text-2xl font-bold text-yellow-600">
              {" "}
              {stats.technical_health.cwv_scorecard.needs_improvement}{" "}
            </p>{" "}
          </div>{" "}
          <div className="dashboard-subcard">
            {" "}
            <p className="text-xs uppercase text-[var(--md-sys-color-on-surface-variant)]">
              CWV Poor
            </p>{" "}
            <p className="text-2xl font-bold text-red-600">
              {" "}
              {stats.technical_health.cwv_scorecard.poor}{" "}
            </p>{" "}
          </div>{" "}
          <div className="dashboard-subcard">
            {" "}
            <p className="text-xs uppercase text-[var(--md-sys-color-on-surface-variant)]">
              Failed Items
            </p>{" "}
            <p className="text-2xl font-bold">
              {" "}
              {stats.technical_health.failed_items}{" "}
            </p>{" "}
          </div>{" "}
        </div>{" "}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {" "}
          <div className="border border-[var(--md-sys-color-outline)] rounded p-4">
            {" "}
            <h3 className="font-medium mb-2">Index Coverage Anomalies</h3>{" "}
            <ul className="text-sm space-y-1">
              {" "}
              {stats.technical_health.indexability_anomalies.length === 0 && (
                <li className="text-[var(--md-sys-color-on-surface-variant)]">
                  No anomalies
                </li>
              )}{" "}
              {stats.technical_health.indexability_anomalies.map((item) => (
                <li key={item.issue_type} className="flex justify-between">
                  {" "}
                  <span>{item.issue_type}</span>{" "}
                  <span className="font-semibold">{item.count}</span>{" "}
                </li>
              ))}{" "}
            </ul>{" "}
          </div>{" "}
          <div className="border border-[var(--md-sys-color-outline)] rounded p-4">
            {" "}
            <h3 className="font-medium mb-2">Structured Data Errors</h3>{" "}
            <ul className="text-sm space-y-1">
              {" "}
              {stats.technical_health.structured_data_errors.length === 0 && (
                <li className="text-[var(--md-sys-color-on-surface-variant)]">
                  No errors
                </li>
              )}{" "}
              {stats.technical_health.structured_data_errors.map((item) => (
                <li key={item.issue_type} className="flex justify-between">
                  {" "}
                  <span>{item.issue_type}</span>{" "}
                  <span className="font-semibold">{item.count}</span>{" "}
                </li>
              ))}{" "}
            </ul>{" "}
          </div>{" "}
          <div className="border border-[var(--md-sys-color-outline)] rounded p-4 h-48">
            {" "}
            <h3 className="font-medium mb-2">Pass Rate Trend</h3>{" "}
            <ResponsiveContainer width="100%" height="85%">
              {" "}
              <LineChart data={stats.technical_health.trend}>
                {" "}
                <CartesianGrid strokeDasharray="3 3" /> <XAxis dataKey="date" />{" "}
                <YAxis domain={[0, 100]} /> <Tooltip />{" "}
                <Line
                  type="monotone"
                  dataKey="pass_rate"
                  stroke="#2563eb"
                  strokeWidth={2}
                />{" "}
              </LineChart>{" "}
            </ResponsiveContainer>{" "}
          </div>{" "}
        </div>{" "}
      </div>{" "}
      <DashboardLayout
        layout={dashboardLayout}
        onLayoutChange={setDashboardLayout}
        widgets={[
          {
            widgetId: "domain-authority",
            title: "Domain Authority",
            content: (
              <div className="app-card dashboard-card">
                {" "}
                <h3 className="text-[var(--md-sys-color-on-surface-variant)] text-sm uppercase flex items-center gap-2">
                  {" "}
                  <Shield size={16} /> Domain Authority{" "}
                </h3>{" "}
                <p className="text-3xl font-bold">
                  {authority?.domain_authority ?? 0}
                </p>{" "}
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-2">
                  状态:{" "}
                  {backlinkStatus?.fetch_status ??
                    backlinks?.fetch_status ??
                    "pending"}
                </p>{" "}
              </div>
            ),
          },
          {
            widgetId: "backlinks",
            title: "Backlinks",
            content: (
              <div className="app-card dashboard-card">
                {" "}
                <h3 className="text-[var(--md-sys-color-on-surface-variant)] text-sm uppercase flex items-center gap-2">
                  {" "}
                  <LinkIcon size={16} /> Backlinks{" "}
                </h3>{" "}
                <p className="text-3xl font-bold">
                  {backlinks?.backlinks_total ?? 0}
                </p>{" "}
              </div>
            ),
          },
          {
            widgetId: "ref-domains",
            title: "Ref Domains",
            content: (
              <div className="app-card dashboard-card">
                {" "}
                <h3 className="text-[var(--md-sys-color-on-surface-variant)] text-sm uppercase">
                  Ref Domains
                </h3>{" "}
                <p className="text-3xl font-bold">
                  {backlinks?.ref_domains ?? 0}
                </p>{" "}
                <Link
                  className="mt-2 inline-block text-xs text-[var(--md-sys-color-primary)] hover:underline"
                  to={`/projects/${id}/backlinks/ref-domains`}
                >
                  {" "}
                  查看引用域{" "}
                </Link>{" "}
              </div>
            ),
          },
          {
            widgetId: "ahrefs-rank",
            title: "Ahrefs Rank",
            content: (
              <div className="app-card dashboard-card">
                {" "}
                <h3 className="text-[var(--md-sys-color-on-surface-variant)] text-sm uppercase">
                  Ahrefs Rank
                </h3>{" "}
                <p className="text-3xl font-bold">
                  {backlinks?.ahrefs_rank ?? authority?.ahrefs_rank ?? "—"}
                </p>{" "}
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-2">
                  上次刷新:{" "}
                  {backlinkStatus?.last_fetched_at ??
                    backlinks?.last_fetched_at ??
                    "未刷新"}
                </p>{" "}
              </div>
            ),
          },
        ]}
      />{" "}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {" "}
        <div className="app-card dashboard-card h-72">
          {" "}
          <h3 className="font-semibold mb-3">Authority Trend</h3>{" "}
          <ResponsiveContainer width="100%" height="90%">
            {" "}
            <LineChart data={authority?.history ?? []}>
              {" "}
              <CartesianGrid strokeDasharray="3 3" /> <XAxis dataKey="date" />{" "}
              <YAxis /> <Tooltip />{" "}
              <Line
                type="monotone"
                dataKey="domain_authority"
                stroke="#2563eb"
                strokeWidth={2}
              />{" "}
            </LineChart>{" "}
          </ResponsiveContainer>{" "}
        </div>{" "}
        <div className="app-card dashboard-card min-h-72">
          {" "}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            {" "}
            <h3 className="font-semibold">Backlink Trend</h3>{" "}
            <div className="flex items-center gap-2">
              {" "}
              <select
                value={backlinkTrendWindow}
                onChange={(e) =>
                  setBacklinkTrendWindow(Number(e.target.value) as 7 | 30 | 90)
                }
                className="rounded border px-2 py-1 text-xs"
              >
                {" "}
                <option value={7}>7 天</option>{" "}
                <option value={30}>30 天</option>{" "}
                <option value={90}>90 天</option>{" "}
              </select>{" "}
              <select
                value={backlinkTrendInterval}
                onChange={(e) =>
                  setBacklinkTrendInterval(e.target.value as "day" | "week")
                }
                className="rounded border px-2 py-1 text-xs"
              >
                {" "}
                <option value="day">按日</option>{" "}
                <option value="week">按周</option>{" "}
              </select>{" "}
              <Link
                className="text-xs text-[var(--md-sys-color-primary)] hover:underline"
                to={`/projects/${id}/backlinks/ref-domains`}
              >
                {" "}
                前往引用域分析{" "}
              </Link>{" "}
            </div>{" "}
          </div>{" "}
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {" "}
            <div className="rounded border p-3">
              {" "}
              <p className="text-xs uppercase text-[var(--md-sys-color-on-surface-variant)]">
                总外链
              </p>{" "}
              <p className="text-xl font-semibold">
                {totalBacklinksMetric}
              </p>{" "}
            </div>{" "}
            <div className="rounded border p-3">
              {" "}
              <p className="text-xs uppercase text-[var(--md-sys-color-on-surface-variant)]">
                引用域
              </p>{" "}
              <p className="text-xl font-semibold">
                {totalRefDomainsMetric}
              </p>{" "}
            </div>{" "}
            <div className="rounded border p-3">
              {" "}
              <p className="text-xs uppercase text-[var(--md-sys-color-on-surface-variant)]">
                净增长
              </p>{" "}
              <p
                className={`text-xl font-semibold ${netGrowthMetric >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {netGrowthMetric >= 0 ? "+" : ""}
                {netGrowthMetric}
              </p>{" "}
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                环比 {formatPct(backlinkTrendSummary?.mom_growth_pct)} · 同比{" "}
                {formatPct(backlinkTrendSummary?.yoy_growth_pct)}
              </p>{" "}
            </div>{" "}
          </div>{" "}
          {backlinkTrendSeries.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded border border-dashed text-sm text-[var(--md-sys-color-on-surface-variant)]">
              {" "}
              历史外链为空，暂无法绘图{" "}
            </div>
          ) : (
            <div className="h-56">
              {" "}
              <ResponsiveContainer width="100%" height="100%">
                {" "}
                <LineChart data={backlinkTrendSeries}>
                  {" "}
                  <CartesianGrid strokeDasharray="3 3" />{" "}
                  <XAxis dataKey="date" /> <YAxis /> <Tooltip />{" "}
                  <Line
                    type="monotone"
                    dataKey="backlinks_total"
                    stroke="#16a34a"
                    strokeWidth={2}
                  />{" "}
                  <Line
                    type="monotone"
                    dataKey="ref_domains"
                    stroke="#f59e0b"
                    strokeWidth={2}
                  />{" "}
                </LineChart>{" "}
              </ResponsiveContainer>{" "}
            </div>
          )}{" "}
        </div>{" "}
      </div>{" "}
      <div className="app-card dashboard-card mb-8">
        {" "}
        <h3 className="font-semibold mb-3">重要外链 Top N</h3>{" "}
        <ul className="space-y-2 text-sm">
          {" "}
          {(backlinks?.top_backlinks ?? []).length === 0 && (
            <li className="text-[var(--md-sys-color-on-surface-variant)]">
              暂无缓存数据
            </li>
          )}{" "}
          {(backlinks?.top_backlinks ?? []).map((item, idx) => (
            <li key={`top-link-${idx}-${item.url}`} className="border-b pb-2">
              {" "}
              <p className="font-medium break-all">{item.url}</p>{" "}
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                {item.source ?? "—"} · {item.anchor ?? "—"} · {item.date ?? "—"}
              </p>{" "}
            </li>
          ))}{" "}
        </ul>{" "}
      </div>{" "}
      <div className="app-card dashboard-card mb-8 overflow-x-auto">
        {" "}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {" "}
          <h3 className="font-semibold">最近新增 / 失效外链</h3>{" "}
          <div className="flex gap-2">
            {" "}
            <input
              value={backlinkQuery}
              onChange={(e) => setBacklinkQuery(e.target.value)}
              placeholder="筛选 source / url / anchor"
              className="rounded border px-3 py-1 text-sm"
            />{" "}
            <select
              value={backlinkSort}
              onChange={(e) =>
                setBacklinkSort(e.target.value as "status" | "source" | "date")
              }
              className="rounded border px-3 py-1 text-sm"
            >
              {" "}
              <option value="date">按日期</option>{" "}
              <option value="status">按状态</option>{" "}
              <option value="source">按来源</option>{" "}
            </select>{" "}
          </div>{" "}
        </div>{" "}
        <table className="w-full text-sm">
          {" "}
          <thead>
            {" "}
            <tr className="text-left border-b">
              {" "}
              <th className="pb-2">状态</th> <th className="pb-2">Source</th>{" "}
              <th className="pb-2">URL</th> <th className="pb-2">Anchor</th>{" "}
              <th className="pb-2">Date</th>{" "}
            </tr>{" "}
          </thead>{" "}
          <tbody>
            {" "}
            {backlinkRows.map((item, idx) => (
              <tr
                key={`${item.status}-${item.url}-${idx}`}
                className="border-b"
              >
                {" "}
                <td className="py-2">{item.status}</td>{" "}
                <td className="py-2">{item.source ?? "—"}</td>{" "}
                <td className="py-2 break-all">{item.url}</td>{" "}
                <td className="py-2">{item.anchor ?? "—"}</td>{" "}
                <td className="py-2">{item.date ?? "—"}</td>{" "}
              </tr>
            ))}{" "}
          </tbody>{" "}
        </table>{" "}
      </div>{" "}
      <div className="app-card dashboard-card mb-8">
        {" "}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          {" "}
          <h3 className="font-semibold flex items-center gap-2">
            {" "}
            <BadgePercent size={18} /> SEO ROI{" "}
          </h3>{" "}
          <div className="flex gap-2">
            {" "}
            <select
              value={roiRange}
              onChange={(e) =>
                setRoiRange(e.target.value as "30d" | "90d" | "12m")
              }
              className="border rounded px-3 py-1 text-sm"
            >
              {" "}
              <option value="30d">30天</option>{" "}
              <option value="90d">90天</option>{" "}
              <option value="12m">12个月</option>{" "}
            </select>{" "}
            <select
              value={attributionModel}
              onChange={(e) =>
                setAttributionModel(
                  e.target.value as "linear" | "first_click" | "last_click",
                )
              }
              className="border rounded px-3 py-1 text-sm"
            >
              {" "}
              <option value="linear">Linear</option>{" "}
              <option value="first_click">First Click</option>{" "}
              <option value="last_click">Last Click</option>{" "}
            </select>{" "}
          </div>{" "}
        </div>{" "}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          {" "}
          <div className="rounded bg-[var(--md-sys-color-surface-container-low)] p-4">
            {" "}
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              收益 (Gain)
            </p>{" "}
            <p className="text-2xl font-bold">{roi?.gain ?? 0}</p>{" "}
          </div>{" "}
          <div className="rounded bg-[var(--md-sys-color-surface-container-low)] p-4">
            {" "}
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              成本 (Cost)
            </p>{" "}
            <p className="text-2xl font-bold">
              {" "}
              {roi ? roi.cost.monthly_total_cost : 0}{" "}
            </p>{" "}
          </div>{" "}
          <div className="rounded bg-[var(--md-sys-color-surface-container-low)] p-4">
            {" "}
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              辅助转化
            </p>{" "}
            <p className="text-2xl font-bold">
              {" "}
              {roi?.assisted_conversions ?? 0}{" "}
            </p>{" "}
          </div>{" "}
          <div className="rounded bg-[var(--md-sys-color-surface-container-low)] p-4">
            {" "}
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              ROI %
            </p>{" "}
            <p
              className={`text-2xl font-bold ${(roi?.roi_pct ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {" "}
              {roi?.roi_pct ?? 0}%{" "}
            </p>{" "}
          </div>{" "}
        </div>{" "}
        <div className="h-64 mb-4">
          {" "}
          <ResponsiveContainer width="100%" height="100%">
            {" "}
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
              {" "}
              <CartesianGrid strokeDasharray="3 3" /> <XAxis dataKey="name" />{" "}
              <YAxis /> <Tooltip />{" "}
              <Area
                type="monotone"
                dataKey="value"
                stroke="#2563eb"
                fill="#93c5fd"
              />{" "}
            </AreaChart>{" "}
          </ResponsiveContainer>{" "}
        </div>{" "}
        <RoiAttributionNote
          attributionModel={attributionModel}
          provider={roi?.provider ?? analytics.provider}
        />{" "}
      </div>{" "}
      <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-6">
        {" "}
        <div className="app-card dashboard-card">
          {" "}
          <h3 className="text-[var(--md-sys-color-on-surface-variant)] text-sm uppercase flex items-center gap-2">
            {" "}
            <Activity size={16} /> Daily Avg{" "}
          </h3>{" "}
          <p className="text-3xl font-bold">
            {analytics.period.daily_average}
          </p>{" "}
        </div>{" "}
        <div className="app-card dashboard-card">
          {" "}
          <h3 className="text-[var(--md-sys-color-on-surface-variant)] text-sm uppercase">
            Monthly Sessions
          </h3>{" "}
          <p className="text-3xl font-bold">
            {analytics.period.monthly_total}
          </p>{" "}
        </div>{" "}
        <div className="app-card dashboard-card">
          {" "}
          <h3 className="text-[var(--md-sys-color-on-surface-variant)] text-sm uppercase">
            Growth
          </h3>{" "}
          <p
            className={`text-3xl font-bold flex items-center gap-2 ${hasGrowth ? "text-green-600" : "text-red-600"}`}
          >
            {" "}
            {hasGrowth ? (
              <TrendingUp size={20} />
            ) : (
              <TrendingDown size={20} />
            )}{" "}
            {analytics.period.growth_pct}%{" "}
          </p>{" "}
        </div>{" "}
        <div className="app-card dashboard-card">
          {" "}
          <h3 className="text-[var(--md-sys-color-on-surface-variant)] text-sm uppercase flex items-center gap-2">
            {" "}
            <MousePointerClick size={16} /> Conversions{" "}
          </h3>{" "}
          <p className="text-3xl font-bold">
            {analytics.totals.conversions}
          </p>{" "}
        </div>{" "}
      </div>{" "}
      <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-6">
        {" "}
        {qualityCards.map((card) => (
          <div
            key={card.label}
            className="app-card dashboard-card"
          >
            {" "}
            <h3 className="text-[var(--md-sys-color-on-surface-variant)] text-sm uppercase">
              {card.label}
            </h3>{" "}
            <p className="text-3xl font-bold">{card.value ?? "—"}</p>{" "}
          </div>
        ))}{" "}
      </div>{" "}
      <div className="app-card dashboard-card mb-8">
        {" "}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          {" "}
          <h3 className="font-semibold">Competitor Overview</h3>{" "}
          <select
            value={selectedCompetitorId ?? ""}
            onChange={(e) =>
              setSelectedCompetitorId(Number(e.target.value) || null)
            }
            className="border rounded px-3 py-1 text-sm min-w-48"
            disabled={competitorsLoading || competitors.length === 0}
          >
            {" "}
            {competitors.length === 0 ? (
              <option value="">No competitors</option>
            ) : (
              competitors.map((item) => (
                <option key={item.id} value={item.id}>
                  {" "}
                  {item.domain}{" "}
                </option>
              ))
            )}{" "}
          </select>{" "}
        </div>{" "}
        {(competitorsLoading || overviewLoading) && (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            Loading competitor overview...
          </p>
        )}{" "}
        {!competitorsLoading && !overviewLoading && competitorError && (
          <p className="text-sm text-red-600">{competitorError}</p>
        )}{" "}
        {!competitorsLoading &&
          !overviewLoading &&
          !competitorError &&
          competitors.length === 0 && (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
              Add competitors to view traffic benchmarks.
            </p>
          )}{" "}
        {!competitorsLoading &&
          !overviewLoading &&
          !competitorError &&
          competitorOverview && (
            <>
              {" "}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {" "}
                <div className="rounded bg-[var(--md-sys-color-surface-container-low)] p-4">
                  {" "}
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    本月流量
                  </p>{" "}
                  <p className="text-2xl font-bold">
                    {Math.round(
                      competitorCurrentMonthTraffic ?? 0,
                    ).toLocaleString()}
                  </p>{" "}
                </div>{" "}
                <div className="rounded bg-[var(--md-sys-color-surface-container-low)] p-4">
                  {" "}
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    环比
                  </p>{" "}
                  <p
                    className={`text-2xl font-bold ${(competitorMoM ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    {" "}
                    {competitorMoM === null
                      ? "—"
                      : `${competitorMoM.toFixed(1)}%`}{" "}
                  </p>{" "}
                </div>{" "}
                <div className="rounded bg-[var(--md-sys-color-surface-container-low)] p-4">
                  {" "}
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    Top 关键词
                  </p>{" "}
                  <p className="text-lg font-semibold break-all">
                    {topKeyword?.keyword ?? "—"}
                  </p>{" "}
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
                    {" "}
                    {topKeyword
                      ? `Rank ${topKeyword.rank ?? "—"} · SV ${topKeyword.search_volume}`
                      : "暂无关键词数据"}{" "}
                  </p>{" "}
                </div>{" "}
              </div>{" "}
              {competitorOverview.data_source === "local_estimation" && (
                <p className="mt-3 inline-flex rounded-full bg-amber-100 text-amber-800 text-xs px-2 py-1">
                  估算数据
                </p>
              )}{" "}
            </>
          )}{" "}
      </div>{" "}
      <div className="app-card dashboard-card mb-8">
        {" "}
        <div className="flex items-center justify-between mb-3">
          {" "}
          <h3 className="font-semibold">Brand vs Non-brand</h3>{" "}
          <select
            value={brandWindow}
            onChange={(e) =>
              setBrandWindow(e.target.value as "7d" | "30d" | "90d")
            }
            className="border rounded px-3 py-1 text-sm"
          >
            {" "}
            <option value="7d">7 days</option>{" "}
            <option value="30d">30 days</option>{" "}
            <option value="90d">90 days</option>{" "}
          </select>{" "}
        </div>{" "}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3 text-sm">
          {" "}
          <div>
            {" "}
            Brand Sessions:{""}{" "}
            <span className="font-semibold">{brandSummary.brandSessions}</span>
            {""} · Conversions:{""}{" "}
            <span className="font-semibold">
              {" "}
              {brandSummary.brandConversions}{" "}
            </span>{" "}
          </div>{" "}
          <div>
            {" "}
            Non-brand Sessions:{""}{" "}
            <span className="font-semibold">
              {" "}
              {brandSummary.nonBrandSessions}{" "}
            </span>
            {""} · Conversions:{""}{" "}
            <span className="font-semibold">
              {" "}
              {brandSummary.nonBrandConversions}{" "}
            </span>{" "}
          </div>{" "}
        </div>{" "}
        <div className="h-72">
          {" "}
          <ResponsiveContainer width="100%" height="100%">
            {" "}
            <BarChart data={brandSeries}>
              {" "}
              <CartesianGrid strokeDasharray="3 3" /> <XAxis dataKey="date" />{" "}
              <YAxis /> <Tooltip /> <Legend />{" "}
              <Bar
                dataKey="brand_sessions"
                fill="#2563eb"
                name="Brand Sessions"
              />{" "}
              <Bar
                dataKey="non_brand_sessions"
                fill="#94a3b8"
                name="Non-brand Sessions"
              />{" "}
            </BarChart>{" "}
          </ResponsiveContainer>{" "}
        </div>{" "}
      </div>{" "}
      <div className="mb-4 flex flex-wrap gap-3 items-center">
        {" "}
        <h2 className="text-xl font-bold mr-3">Content Performance</h2>{" "}
        <select
          value={window}
          onChange={(e) => setWindow(e.target.value as "7d" | "30d" | "90d")}
          className="app-select"
        >
          {" "}
          <option value="7d">7 days</option>{" "}
          <option value="30d">30 days</option>{" "}
          <option value="90d">90 days</option>{" "}
        </select>{" "}
        <select
          value={sort}
          onChange={(e) =>
            setSort(e.target.value as "traffic" | "conversion_rate" | "decay")
          }
          className="app-select"
        >
          {" "}
          <option value="traffic">Sort: Traffic</option>{" "}
          <option value="conversion_rate">Sort: Conversion Rate</option>{" "}
          <option value="decay">Sort: Decay</option>{" "}
        </select>{" "}
        <Link
          to={`/projects/${id}/pages`}
          className="text-sm text-[var(--md-sys-color-primary)] hover:underline"
        >
          {" "}
          View page details{" "}
        </Link>{" "}
      </div>{" "}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {" "}
        {renderContentList(
          "热门内容",
          contentPerformance?.top_content ?? [],
        )}{" "}
        {renderContentList(
          "高转化页面",
          contentPerformance?.top_conversion ?? [],
        )}{" "}
        {renderContentList(
          "衰减页面",
          contentPerformance?.decaying_content ?? [],
        )}{" "}
      </div>{" "}
      <div className="app-card dashboard-card mb-8">
        {" "}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          {" "}
          <h2 className="text-xl font-bold">关键词波动热力图</h2>{" "}
          <div className="flex items-center gap-2 text-sm">
            {" "}
            <label htmlFor="heatmap-step">采样步长</label>{" "}
            <select
              id="heatmap-step"
              value={heatmapStep}
              onChange={(event) => {
                setInsightsPage(1);
                setHeatmapStep(Number(event.target.value));
              }}
              className="app-select app-select-sm"
            >
              {" "}
              <option value={1}>每天</option> <option value={2}>每2天</option>{" "}
              <option value={3}>每3天</option>{" "}
              <option value={5}>每5天</option>{" "}
            </select>{" "}
          </div>{" "}
        </div>{" "}
        {insightsLoading && (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            Loading insights...
          </p>
        )}{" "}
        {!insightsLoading && (
          <div className="overflow-auto">
            {" "}
            <table className="min-w-full text-xs border-separate border-spacing-y-1">
              {" "}
              <thead>
                {" "}
                <tr>
                  {" "}
                  <th className="text-left sticky left-0 bg-[var(--md-sys-color-surface-container)] pr-4">
                    Keyword
                  </th>{" "}
                  {searchInsights?.keyword_heatmap.dates.map((d) => (
                    <th
                      key={d}
                      className="font-medium text-[var(--md-sys-color-on-surface-variant)] px-1 whitespace-nowrap"
                    >
                      {d.slice(5)}
                    </th>
                  ))}{" "}
                </tr>{" "}
              </thead>{" "}
              <tbody>
                {" "}
                {searchInsights?.keyword_heatmap.rows.map((row) => (
                  <tr key={row.keyword}>
                    {" "}
                    <td className="sticky left-0 bg-[var(--md-sys-color-surface-container)] pr-4 font-medium">
                      {row.keyword}
                    </td>{" "}
                    {row.cells.map((cell) => (
                      <td
                        key={`${row.keyword}-${cell.date}`}
                        className="w-6 h-6 rounded text-center text-[10px]"
                        style={{
                          backgroundColor: resolveRankCellColor(cell.rank),
                        }}
                        title={`keyword=${row.keyword} | date=${cell.date} | rank=${cell.rank ?? "N/A"}`}
                      >
                        {" "}
                        {cell.rank ?? "-"}{" "}
                      </td>
                    ))}{" "}
                  </tr>
                ))}{" "}
              </tbody>{" "}
            </table>{" "}
          </div>
        )}{" "}
        <div className="mt-4 flex items-center justify-between text-xs text-[var(--md-sys-color-on-surface-variant)]">
          {" "}
          <span> 图例: Top3 / Top10 / Top20 / Top50 / Out / Missing </span>{" "}
          <div className="flex gap-2">
            {" "}
            <button
              className="app-btn app-btn-outline app-btn-sm disabled:opacity-40"
              disabled={insightsPage <= 1}
              onClick={() => setInsightsPage((prev) => Math.max(prev - 1, 1))}
            >
              {" "}
              上一页{" "}
            </button>{" "}
            <span>
              {" "}
              Page {searchInsights?.keyword_heatmap.paging.page ??
                insightsPage}{" "}
              /{" "}
              {Math.max(
                1,
                Math.ceil(
                  (searchInsights?.keyword_heatmap.paging.total_keywords ?? 0) /
                    (searchInsights?.keyword_heatmap.paging.page_size ?? 1),
                ),
              )}{" "}
            </span>{" "}
            <button
              className="app-btn app-btn-outline app-btn-sm disabled:opacity-40"
              disabled={!searchInsights?.keyword_heatmap.paging.has_more}
              onClick={() => setInsightsPage((prev) => prev + 1)}
            >
              {" "}
              下一页{" "}
            </button>{" "}
          </div>{" "}
        </div>{" "}
      </div>{" "}
      <div className="app-card dashboard-card mb-8">
        {" "}
        <h2 className="text-xl font-bold mb-4">流量地理分布图</h2>{" "}
        <div className="space-y-3">
          {" "}
          {searchInsights?.geo_distribution.rows.map((row) => (
            <div key={row.country}>
              {" "}
              <div className="flex justify-between text-sm">
                {" "}
                <span>{row.country}</span>{" "}
                <span
                  title={`country=${row.country} | sessions=${row.sessions} | share=${row.share}%`}
                >
                  {" "}
                  {row.sessions} sessions ({row.share}%){" "}
                </span>{" "}
              </div>{" "}
              <div className="h-2 rounded bg-[var(--md-sys-color-surface-container-low)] overflow-hidden">
                {" "}
                <div
                  className="h-full rounded"
                  style={{
                    width: `${Math.max((row.sessions / geoMaxSessions) * 100, 4)}%`,
                    backgroundColor: insightPalette.top10,
                  }}
                />{" "}
              </div>{" "}
            </div>
          ))}{" "}
          {!searchInsights?.geo_distribution.rows.length && (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
              No geo data.
            </p>
          )}{" "}
        </div>{" "}
      </div>{" "}
      {last_crawl ? (
        <div className="app-card dashboard-card">
          {" "}
          <h2 className="text-xl font-bold mb-4">Last Crawl Status</h2>{" "}
          <div className="grid grid-cols-2 gap-4">
            {" "}
            <div>
              {" "}
              <span className="text-[var(--md-sys-color-on-surface-variant)]">
                Status:
              </span>{" "}
              <span
                className={`ml-2 px-2 py-1 rounded text-sm ${last_crawl.status === "completed" ? "bg-green-100 text-green-800" : last_crawl.status === "failed" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}
              >
                {" "}
                {last_crawl.status}{" "}
              </span>{" "}
            </div>{" "}
            <div>
              {" "}
              <span className="text-[var(--md-sys-color-on-surface-variant)]">
                Date:
              </span>{" "}
              <span className="ml-2">
                {" "}
                {new Date(last_crawl.start_time).toLocaleString()}{" "}
              </span>{" "}
            </div>{" "}
          </div>{" "}
          <div className="mt-4 flex gap-4">
            {" "}
            <Link
              to={`/projects/${id}/pages`}
              className="text-[var(--md-sys-color-primary)] hover:underline"
            >
              {" "}
              View Pages{" "}
            </Link>{" "}
            <Link
              to={`/projects/${id}/issues`}
              className="text-[var(--md-sys-color-primary)] hover:underline"
            >
              {" "}
              View Issues{" "}
            </Link>{" "}
            <Link
              to={`/projects/${id}/keywords`}
              className="text-[var(--md-sys-color-primary)] hover:underline"
            >
              {" "}
              Keyword Rankings{" "}
            </Link>{" "}
            <Link
              to={`/projects/${id}/keyword-research`}
              className="text-[var(--md-sys-color-primary)] hover:underline"
            >
              {" "}
              Keyword Research{" "}
            </Link>{" "}
            {isAdmin && (
              <Link
                to={`/projects/${id}/api-keys`}
                className="text-[var(--md-sys-color-primary)] hover:underline"
              >
                {" "}
                API Keys{" "}
              </Link>
            )}{" "}
          </div>{" "}
        </div>
      ) : (
        <div className="app-card dashboard-card">
          {" "}
          <h2 className="text-xl font-bold mb-4">Last Crawl Status</h2>{" "}
          <p className="text-[var(--md-sys-color-on-surface-variant)]">
            {" "}
            No crawl data yet. Start a crawl to populate technical SEO
            metrics.{" "}
          </p>{" "}
        </div>
      )}{" "}
    </div>
  );
}
