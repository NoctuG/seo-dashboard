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
import { DashboardSkeleton } from "../components/SkeletonCard";
import { EmptyState } from "../components/EmptyState";
import { InlineAlert } from "../components/InlineAlert";
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

// ---------------------------------------------------------------------------
// Shared chart style tokens — derived from CSS custom properties so they
// automatically follow the active light / dark theme.
// ---------------------------------------------------------------------------
const chartSeriesColors = {
  primary: "var(--md-sys-color-primary)",
  secondary: "var(--md-sys-color-secondary)",
  tertiary: "var(--md-sys-color-tertiary)",
};

const chartGridStroke = "var(--md-sys-color-outline-variant)";
const chartAxisText = "var(--md-sys-color-on-surface-variant)";
const chartTooltipStyle = {
  backgroundColor:
    "color-mix(in srgb, var(--md-sys-color-surface-container) 92%, transparent)",
  border: "1px solid var(--md-sys-color-outline-variant)",
  borderRadius: "12px",
  color: "var(--md-sys-color-on-surface)",
};
const chartTooltipLabelStyle = {
  color: "var(--md-sys-color-on-surface-variant)",
};
const chartTooltipCursor = {
  stroke: "var(--md-sys-color-outline)",
};

const siteHealthStrokeByBand: Record<
  "green" | "yellow" | "red",
  (typeof chartSeriesColors)[keyof typeof chartSeriesColors]
> = {
  green: chartSeriesColors.primary,
  yellow: chartSeriesColors.secondary,
  red: chartSeriesColors.tertiary,
};

const getSiteHealthStroke = (band: "green" | "yellow" | "red") =>
  siteHealthStrokeByBand[band] ?? chartSeriesColors.primary;

const crawlStatusStyles: Record<
  string,
  { backgroundColor: string; color: string }
> = {
  completed: {
    backgroundColor:
      "color-mix(in srgb, var(--md-sys-color-primary) 18%, transparent)",
    color: "var(--md-sys-color-primary)",
  },
  failed: {
    backgroundColor:
      "color-mix(in srgb, var(--md-sys-color-error) 18%, transparent)",
    color: "var(--md-sys-color-error)",
  },
  pending: {
    backgroundColor:
      "color-mix(in srgb, var(--md-sys-color-secondary) 18%, transparent)",
    color: "var(--md-sys-color-secondary)",
  },
};

const getCrawlStatusStyle = (status: string) =>
  crawlStatusStyles[status] ?? crawlStatusStyles.pending;

const DEFAULT_WIDGET_ORDER = [
  "domain-authority",
  "backlinks",
  "ref-domains",
  "ahrefs-rank",
];

// ---------------------------------------------------------------------------
// Heatmap loading skeleton — 5 placeholder rows
// ---------------------------------------------------------------------------
function HeatmapSkeleton() {
  return (
    <div className="animate-pulse space-y-2 py-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-6 w-full rounded bg-[var(--md-sys-color-surface-variant)]"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function ProjectDashboard() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();

  // Core dashboard
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [maxPages, setMaxPages] = useState(50);
  const [sitemapUrl, setSitemapUrl] = useState("");

  // Content performance
  const [contentPerformance, setContentPerformance] =
    useState<ContentPerformanceResponse | null>(null);
  const [window, setWindow] = useState<"7d" | "30d" | "90d">("30d");
  const [sort, setSort] = useState<"traffic" | "conversion_rate" | "decay">(
    "traffic",
  );

  // Authority & backlinks
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
  const [backlinkQuery, setBacklinkQuery] = useState("");
  const [backlinkSort, setBacklinkSort] = useState<
    "status" | "source" | "date"
  >("date");

  // Brand / ROI
  const [brandWindow, setBrandWindow] = useState<"7d" | "30d" | "90d">("30d");
  const [roiRange, setRoiRange] = useState<"30d" | "90d" | "12m">("30d");
  const [attributionModel, setAttributionModel] = useState<
    "linear" | "first_click" | "last_click"
  >("linear");
  const [roi, setRoi] = useState<RoiBreakdownResponse | null>(null);

  // Competitor
  const [competitors, setCompetitors] = useState<CompetitorDomainItem[]>([]);
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<
    number | null
  >(null);
  const [competitorOverview, setCompetitorOverview] =
    useState<CompetitorTrafficOverviewResponse | null>(null);
  const [competitorsLoading, setCompetitorsLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  /**
   * "list" → failed to load the competitor list
   * "overview" → failed to load the traffic overview for selected competitor
   */
  const [competitorError, setCompetitorError] = useState<
    "list" | "overview" | null
  >(null);

  // Search insights / heatmap
  const [searchInsights, setSearchInsights] =
    useState<SearchInsightsResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsPage, setInsightsPage] = useState(1);
  const [heatmapStep, setHeatmapStep] = useState(2);

  // Auth / layout
  const { isAdmin } = useProjectRole(id);
  const { isAuthenticated } = useAuth();
  const [dashboardLayout, setDashboardLayout] = useState<{
    order: string[];
    hidden: string[];
  }>({ order: DEFAULT_WIDGET_ORDER, hidden: [] });

  // ---------------------------------------------------------------------------
  // Data-fetch callbacks (extracted so retry buttons can call them directly)
  // ---------------------------------------------------------------------------
  const fetchCompetitorsList = useCallback(async () => {
    if (!id) return;
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
      setCompetitorError("list");
      setCompetitors([]);
      setSelectedCompetitorId(null);
    } finally {
      setCompetitorsLoading(false);
    }
  }, [id]);

  const fetchCompetitorOverview = useCallback(async () => {
    if (!id || !selectedCompetitorId) {
      setCompetitorOverview(null);
      return;
    }
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
      setCompetitorError("overview");
      setCompetitorOverview(null);
    } finally {
      setOverviewLoading(false);
    }
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

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------
  useEffect(() => {
    fetchCompetitorsList();
  }, [fetchCompetitorsList]);

  useEffect(() => {
    fetchCompetitorOverview();
  }, [fetchCompetitorOverview]);

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

  // ---------------------------------------------------------------------------
  // Derived / memoised values
  // ---------------------------------------------------------------------------
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

  // Store raw status keys; translate at render time to stay i18n-correct.
  const backlinkRows = useMemo(() => {
    const rows = [
      ...(changes?.new_links ?? []).map((l) => ({
        ...l,
        status: "new" as const,
      })),
      ...(changes?.lost_links ?? []).map((l) => ({
        ...l,
        status: "lost" as const,
      })),
    ];
    const filtered = rows.filter((row) => {
      if (!backlinkQuery.trim()) return true;
      const q = backlinkQuery.toLowerCase();
      return `${row.source ?? ""} ${row.url} ${row.anchor ?? ""} ${row.date ?? ""}`
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

  // ---------------------------------------------------------------------------
  // Skeleton guard — show animated placeholder until core stats arrive
  // ---------------------------------------------------------------------------
  if (loading || !stats) return <DashboardSkeleton />;

  const { last_crawl, issues_breakdown, analytics } = stats;
  const hasGrowth = analytics.period.growth_pct >= 0;
  const siteHealthStroke = getSiteHealthStroke(stats.site_health_band);
  const healthRadius = 40;
  const healthCircumference = 2 * Math.PI * healthRadius;
  const healthDashOffset =
    healthCircumference - (stats.site_health_score / 100) * healthCircumference;
  const categoryScores = stats.category_scores ?? [];

  const qualityCards = [
    {
      label: t("dashboard.qualityEngagedSessions"),
      value: analytics.quality_metrics.engaged_sessions,
    },
    {
      label: t("dashboard.qualityAvgEngagementTime"),
      value: analytics.quality_metrics.avg_engagement_time,
    },
    {
      label: t("dashboard.qualityPagesPerSession"),
      value: analytics.quality_metrics.pages_per_session,
    },
    {
      label: t("dashboard.qualityKeyEvents"),
      value: analytics.quality_metrics.key_events,
    },
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

  // ---------------------------------------------------------------------------
  // Content list renderer (shared across top / conversion / decay lists)
  // ---------------------------------------------------------------------------
  const renderContentList = (
    title: string,
    items: ContentPerformanceItem[],
  ) => (
    <div className="app-card dashboard-card">
      <h3 className="md-title-medium mb-3">{title}</h3>
      <ul className="space-y-3 md-body-medium">
        {items.length === 0 && (
          <li>
            <EmptyState message={t("dashboard.noData")} />
          </li>
        )}
        {items.map((item) => (
          <li key={`${title}-${item.url}`} className="border-b pb-2">
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="app-action-link break-all"
            >
              {item.url}
            </a>
            <div className="md-label-medium text-[var(--md-sys-color-on-surface-variant)] mt-1 flex flex-wrap gap-3">
              <span>
                {t("dashboard.sessions")}: {item.sessions}
              </span>
              <span>
                {t("dashboard.cvr")}: {item.conversion_rate}%
              </span>
              <span>
                {t("dashboard.change7d")}: {item.change_7d}%
              </span>
              {item.decay_flag && (
                <span className="text-[var(--md-sys-color-error)]">
                  {t("dashboard.decayFlag")}
                </span>
              )}
            </div>
            {item.suggested_action && (
              <p className="md-label-medium text-orange-700 mt-1">
                {item.suggested_action}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="dashboard-page text-[var(--md-sys-color-on-surface)]">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <h1 className="md-headline-large">{t("dashboard.title")}</h1>
          <Link
            to={`/projects/${id}/reports`}
            className="md-body-medium app-action-link"
          >
            {t("dashboard.reports")}
          </Link>
          <Link
            to={`/projects/${id}/site-audit`}
            className="md-body-medium app-action-link"
          >
            {t("dashboard.siteAudit")}
          </Link>
        </div>
        {isAdmin && (
          <button onClick={startCrawl} className="app-btn app-btn-primary">
            <Play size={18} /> {t("dashboard.startCrawl")}
          </button>
        )}
      </div>

      {/* ── Crawl configuration ──────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-[var(--md-sys-color-on-surface-variant)]">
            {t("dashboard.maxPages")}
          </span>
          <input
            type="number"
            min={1}
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value) || 1)}
            className="app-input"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-[var(--md-sys-color-on-surface-variant)]">
            {t("dashboard.sitemapUrl")}
          </span>
          <input
            type="url"
            placeholder="https://example.com/sitemap.xml"
            value={sitemapUrl}
            onChange={(e) => setSitemapUrl(e.target.value)}
            className="app-input"
          />
        </label>
      </div>

      {/* ── Site Health card ─────────────────────────────────────────────── */}
      <Link
        to={`/projects/${id}/issues`}
        className="mb-6 block app-card dashboard-card hover:border-[var(--md-sys-color-primary)] transition"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="md-label-medium uppercase text-[var(--md-sys-color-on-surface-variant)]">
              {t("dashboard.siteHealth")}
            </p>
            <p className="md-display-large" style={{ color: siteHealthStroke }}>
              {stats.site_health_score}
            </p>
            <p className="md-body-medium text-[var(--md-sys-color-on-surface-variant)]">
              {t("dashboard.band", {
                value: stats.site_health_band.toUpperCase(),
              })}{" "}
              {t("dashboard.viewAuditDetail")}
            </p>
          </div>
          <svg
            width="110"
            height="110"
            viewBox="0 0 110 110"
            aria-label="Site health score chart"
          >
            <circle
              cx="55"
              cy="55"
              r={healthRadius}
              stroke="var(--md-sys-color-outline-variant)"
              strokeWidth="10"
              fill="none"
            />
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
            <text
              x="55"
              y="60"
              textAnchor="middle"
              fill="var(--md-sys-color-on-surface)"
              fontSize="18"
              fontWeight="700"
            >
              {stats.site_health_score}
            </text>
          </svg>
        </div>
      </Link>

      {/* ── Category scores ──────────────────────────────────────────────── */}
      {categoryScores.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          {categoryScores.map((item) => (
            <div
              key={item.key ?? item.name}
              className="app-card dashboard-card dashboard-card-compact"
            >
              <p className="md-label-medium uppercase text-[var(--md-sys-color-on-surface-variant)]">
                {item.name}
              </p>
              <p className="mt-1 md-headline-large text-[var(--md-sys-color-on-surface)]">
                {item.score}
              </p>
              <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">
                Issues: {item.issue_count}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Data notes banner ────────────────────────────────────────────── */}
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

      {/* ── Issue breakdown cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 dashboard-grid dashboard-section">
        <div className="app-card dashboard-card">
          <h3 className="md-title-medium text-[var(--md-sys-color-on-surface-variant)] uppercase">
            {t("dashboard.totalPages")}
          </h3>
          <p className="md-display-large">{stats.total_pages}</p>
        </div>
        <div className="app-card dashboard-card border-l-4 border-red-500">
          <h3 className="md-title-medium text-[var(--md-sys-color-on-surface-variant)] uppercase flex items-center gap-2">
            <AlertOctagon size={16} /> {t("dashboard.critical")}
          </h3>
          <p className="md-display-large text-red-600">
            {issues_breakdown.critical}
          </p>
        </div>
        <div className="app-card dashboard-card border-l-4 border-yellow-500">
          <h3 className="md-title-medium text-[var(--md-sys-color-on-surface-variant)] uppercase flex items-center gap-2">
            <AlertTriangle size={16} /> {t("dashboard.warning")}
          </h3>
          <p className="md-display-large text-yellow-600">
            {issues_breakdown.warning}
          </p>
        </div>
        <div className="app-card dashboard-card border-l-4 border-blue-500">
          <h3 className="md-title-medium text-[var(--md-sys-color-on-surface-variant)] uppercase flex items-center gap-2">
            <Info size={16} /> {t("dashboard.info")}
          </h3>
          <p className="md-display-large text-[var(--md-sys-color-primary)]">
            {issues_breakdown.info}
          </p>
        </div>
      </div>

      {/* ── Technical Health ─────────────────────────────────────────────── */}
      <div className="app-card dashboard-card dashboard-section">
        <div className="flex items-center justify-between mb-4">
          <h2 className="md-headline-large">{t("dashboard.technicalHealth")}</h2>
          <span className="md-body-medium text-[var(--md-sys-color-on-surface-variant)]">
            {t("dashboard.passRate", {
              rate: stats.technical_health.pass_rate,
            })}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="dashboard-subcard">
            <p className="md-label-medium uppercase text-[var(--md-sys-color-on-surface-variant)]">
              {t("dashboard.cwvGood")}
            </p>
            <p className="md-headline-large text-green-600">
              {stats.technical_health.cwv_scorecard.good}
            </p>
          </div>
          <div className="dashboard-subcard">
            <p className="md-label-medium uppercase text-[var(--md-sys-color-on-surface-variant)]">
              {t("dashboard.needsImprovement")}
            </p>
            <p className="md-headline-large text-yellow-600">
              {stats.technical_health.cwv_scorecard.needs_improvement}
            </p>
          </div>
          <div className="dashboard-subcard">
            <p className="md-label-medium uppercase text-[var(--md-sys-color-on-surface-variant)]">
              {t("dashboard.cwvPoor")}
            </p>
            <p className="md-headline-large text-red-600">
              {stats.technical_health.cwv_scorecard.poor}
            </p>
          </div>
          <div className="dashboard-subcard">
            <p className="md-label-medium uppercase text-[var(--md-sys-color-on-surface-variant)]">
              {t("dashboard.failedItems")}
            </p>
            <p className="md-headline-large">
              {stats.technical_health.failed_items}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="border border-[var(--md-sys-color-outline)] rounded p-4">
            <h3 className="md-title-medium mb-2">
              {t("dashboard.indexAnomalies")}
            </h3>
            <ul className="text-sm space-y-1">
              {stats.technical_health.indexability_anomalies.length === 0 && (
                <li className="text-[var(--md-sys-color-on-surface-variant)]">
                  {t("dashboard.noAnomalies")}
                </li>
              )}
              {stats.technical_health.indexability_anomalies.map((item) => (
                <li key={item.issue_type} className="flex justify-between">
                  <span>{item.issue_type}</span>
                  <span className="md-title-medium">{item.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="border border-[var(--md-sys-color-outline)] rounded p-4">
            <h3 className="md-title-medium mb-2">
              {t("dashboard.structuredDataErrors")}
            </h3>
            <ul className="text-sm space-y-1">
              {stats.technical_health.structured_data_errors.length === 0 && (
                <li className="text-[var(--md-sys-color-on-surface-variant)]">
                  {t("dashboard.noStructuredErrors")}
                </li>
              )}
              {stats.technical_health.structured_data_errors.map((item) => (
                <li key={item.issue_type} className="flex justify-between">
                  <span>{item.issue_type}</span>
                  <span className="md-title-medium">{item.count}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* Pass Rate Trend – dynamic height via aspect-ratio on xl screens */}
          <div className="border border-[var(--md-sys-color-outline)] rounded p-4 h-48 xl:h-56">
            <h3 className="md-title-medium mb-2">
              {t("dashboard.passRateTrend")}
            </h3>
            <ResponsiveContainer width="100%" height="85%">
              <LineChart data={stats.technical_health.trend}>
                <CartesianGrid stroke={chartGridStroke} strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: chartAxisText }} />
                <YAxis domain={[0, 100]} tick={{ fill: chartAxisText }} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  cursor={chartTooltipCursor}
                />
                <Line
                  type="monotone"
                  dataKey="pass_rate"
                  stroke={chartSeriesColors.primary}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Authority metric widgets (drag-and-drop) ─────────────────────── */}
      <DashboardLayout
        layout={dashboardLayout}
        onLayoutChange={setDashboardLayout}
        widgets={[
          {
            widgetId: "domain-authority",
            title: t("dashboard.domainAuthority"),
            content: (
              <div className="app-card dashboard-card">
                <h3 className="md-title-medium text-[var(--md-sys-color-on-surface-variant)] uppercase flex items-center gap-2">
                  <Shield size={16} /> {t("dashboard.domainAuthority")}
                </h3>
                <p className="md-display-large">
                  {authority?.domain_authority ?? 0}
                </p>
                <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)] mt-2">
                  {t("dashboard.statusLabel")}:{" "}
                  {backlinkStatus?.fetch_status ??
                    backlinks?.fetch_status ??
                    "pending"}
                </p>
              </div>
            ),
          },
          {
            widgetId: "backlinks",
            title: t("dashboard.backlinkCount"),
            content: (
              <div className="app-card dashboard-card">
                <h3 className="md-title-medium text-[var(--md-sys-color-on-surface-variant)] uppercase flex items-center gap-2">
                  <LinkIcon size={16} /> {t("dashboard.backlinkCount")}
                </h3>
                <p className="md-display-large">
                  {backlinks?.backlinks_total ?? 0}
                </p>
              </div>
            ),
          },
          {
            widgetId: "ref-domains",
            title: t("dashboard.refDomainsMetric"),
            content: (
              <div className="app-card dashboard-card">
                <h3 className="md-title-medium text-[var(--md-sys-color-on-surface-variant)] uppercase">
                  {t("dashboard.refDomainsMetric")}
                </h3>
                <p className="md-display-large">
                  {backlinks?.ref_domains ?? 0}
                </p>
                <Link
                  className="mt-2 inline-block md-label-medium app-action-link"
                  to={`/projects/${id}/backlinks/ref-domains`}
                >
                  {t("dashboard.viewRefDomains")}
                </Link>
              </div>
            ),
          },
          {
            widgetId: "ahrefs-rank",
            title: t("dashboard.ahrefsRank"),
            content: (
              <div className="app-card dashboard-card">
                <h3 className="md-title-medium text-[var(--md-sys-color-on-surface-variant)] uppercase">
                  {t("dashboard.ahrefsRank")}
                </h3>
                <p className="md-display-large">
                  {backlinks?.ahrefs_rank ?? authority?.ahrefs_rank ?? "—"}
                </p>
                <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)] mt-2">
                  {backlinkStatus?.last_fetched_at ?? backlinks?.last_fetched_at
                    ? t("dashboard.lastRefreshed", {
                        time:
                          backlinkStatus?.last_fetched_at ??
                          backlinks?.last_fetched_at,
                      })
                    : t("dashboard.neverRefreshed")}
                </p>
              </div>
            ),
          },
        ]}
      />

      {/* ── Authority Trend + Backlink Trend charts ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 dashboard-grid dashboard-section">
        {/* Authority trend */}
        <div className="app-card dashboard-card h-72 xl:h-80">
          <h3 className="md-title-medium mb-3">
            {t("dashboard.authorityTrend")}
          </h3>
          <ResponsiveContainer width="100%" height="90%">
            <LineChart data={authority?.history ?? []}>
              <CartesianGrid stroke={chartGridStroke} strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: chartAxisText }} />
              <YAxis tick={{ fill: chartAxisText }} />
              <Tooltip
                contentStyle={chartTooltipStyle}
                labelStyle={chartTooltipLabelStyle}
                cursor={chartTooltipCursor}
              />
              <Line
                type="monotone"
                dataKey="domain_authority"
                stroke={chartSeriesColors.primary}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Backlink trend */}
        <div className="app-card dashboard-card min-h-72">
          <div className="mb-[var(--space-2)] flex flex-wrap items-center justify-between gap-[var(--space-1)]">
            <h3 className="md-title-medium">{t("dashboard.backlinkTrend")}</h3>
            <div className="flex items-center gap-2">
              <select
                value={backlinkTrendWindow}
                onChange={(e) =>
                  setBacklinkTrendWindow(Number(e.target.value) as 7 | 30 | 90)
                }
                className="rounded border px-2 py-1 text-xs"
              >
                <option value={7}>{t("dashboard.range7d")}</option>
                <option value={30}>{t("dashboard.range30d")}</option>
                <option value={90}>{t("dashboard.range90d")}</option>
              </select>
              <select
                value={backlinkTrendInterval}
                onChange={(e) =>
                  setBacklinkTrendInterval(e.target.value as "day" | "week")
                }
                className="rounded border px-2 py-1 text-xs"
              >
                <option value="day">{t("dashboard.byDay")}</option>
                <option value="week">{t("dashboard.byWeek")}</option>
              </select>
              <Link
                className="md-label-medium app-action-link"
                to={`/projects/${id}/backlinks/ref-domains`}
              >
                {t("dashboard.goToRefDomainAnalysis")}
              </Link>
            </div>
          </div>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded border p-3">
              <p className="md-label-medium uppercase text-[var(--md-sys-color-on-surface-variant)]">
                {t("dashboard.totalBacklinksMetric")}
              </p>
              <p className="md-headline-large">{totalBacklinksMetric}</p>
            </div>
            <div className="rounded border p-3">
              <p className="md-label-medium uppercase text-[var(--md-sys-color-on-surface-variant)]">
                {t("dashboard.refDomainsMetric")}
              </p>
              <p className="md-headline-large">{totalRefDomainsMetric}</p>
            </div>
            <div className="rounded border p-3">
              <p className="md-label-medium uppercase text-[var(--md-sys-color-on-surface-variant)]">
                {t("dashboard.netGrowth")}
              </p>
              <p
                className={`md-headline-large ${netGrowthMetric >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {netGrowthMetric >= 0 ? "+" : ""}
                {netGrowthMetric}
              </p>
              <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">
                {t("dashboard.momYoy", {
                  mom: formatPct(backlinkTrendSummary?.mom_growth_pct),
                  yoy: formatPct(backlinkTrendSummary?.yoy_growth_pct),
                })}
              </p>
            </div>
          </div>
          {backlinkTrendSeries.length === 0 ? (
            <EmptyState
              message={t("dashboard.noBacklinkHistory")}
              className="h-40 rounded border border-dashed"
            />
          ) : (
            <div className="h-56 xl:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={backlinkTrendSeries}>
                  <CartesianGrid stroke={chartGridStroke} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: chartAxisText }} />
                  <YAxis tick={{ fill: chartAxisText }} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={chartTooltipLabelStyle}
                    cursor={chartTooltipCursor}
                  />
                  <Line
                    type="monotone"
                    dataKey="backlinks_total"
                    stroke={chartSeriesColors.primary}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="ref_domains"
                    stroke={chartSeriesColors.secondary}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Top backlinks list ───────────────────────────────────────────── */}
      <div className="app-card dashboard-card dashboard-section">
        <h3 className="md-title-medium mb-3">{t("dashboard.topBacklinks")}</h3>
        <ul className="space-y-2 text-sm">
          {(backlinks?.top_backlinks ?? []).length === 0 ? (
            <li>
              <EmptyState message={t("dashboard.noBacklinkCache")} />
            </li>
          ) : (
            (backlinks?.top_backlinks ?? []).map((item, idx) => (
              <li
                key={`top-link-${idx}-${item.url}`}
                className="border-b pb-2"
              >
                <p className="md-body-medium break-all">{item.url}</p>
                <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">
                  {item.source ?? "—"} · {item.anchor ?? "—"} ·{" "}
                  {item.date ?? "—"}
                </p>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* ── Recent backlink changes table ────────────────────────────────── */}
      <div className="app-card dashboard-card dashboard-section overflow-x-auto">
        <div className="mb-[var(--space-2)] flex flex-wrap items-center justify-between gap-[var(--space-1)]">
          <h3 className="md-title-medium">
            {t("dashboard.recentBacklinkChanges")}
          </h3>
          <div className="flex gap-[var(--space-1)]">
            <input
              value={backlinkQuery}
              onChange={(e) => setBacklinkQuery(e.target.value)}
              placeholder={t("dashboard.filterPlaceholder")}
              className="rounded border px-3 py-1 text-sm"
            />
            <select
              value={backlinkSort}
              onChange={(e) =>
                setBacklinkSort(
                  e.target.value as "status" | "source" | "date",
                )
              }
              className="rounded border px-3 py-1 text-sm"
            >
              <option value="date">{t("dashboard.sortByDate")}</option>
              <option value="status">{t("dashboard.sortByStatus")}</option>
              <option value="source">{t("dashboard.sortBySource")}</option>
            </select>
          </div>
        </div>
        {/* Max height + sticky header so long tables are easier to browse */}
        <div className="max-h-80 overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--md-sys-color-surface-container)] shadow-[0_1px_0_var(--md-sys-color-outline-variant)]">
              <tr className="text-left">
                <th className="pb-2 pt-1 pr-3">
                  {t("dashboard.colStatus")}
                </th>
                <th className="pb-2 pt-1 pr-3">
                  {t("dashboard.colSource")}
                </th>
                <th className="pb-2 pt-1 pr-3">{t("dashboard.colUrl")}</th>
                <th className="pb-2 pt-1 pr-3">
                  {t("dashboard.colAnchor")}
                </th>
                <th className="pb-2 pt-1">{t("dashboard.colDate")}</th>
              </tr>
            </thead>
            <tbody>
              {backlinkRows.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState message={t("dashboard.noData")} />
                  </td>
                </tr>
              ) : (
                backlinkRows.map((item, idx) => (
                  <tr
                    key={`${item.status}-${item.url}-${idx}`}
                    className="border-b"
                  >
                    <td className="py-2 pr-3">
                      <span
                        className={
                          item.status === "new"
                            ? "text-green-600"
                            : "text-red-600"
                        }
                      >
                        {item.status === "new"
                          ? t("dashboard.newLink")
                          : t("dashboard.lostLink")}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{item.source ?? "—"}</td>
                    <td className="py-2 pr-3 break-all">{item.url}</td>
                    <td className="py-2 pr-3">{item.anchor ?? "—"}</td>
                    <td className="py-2">{item.date ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SEO ROI ──────────────────────────────────────────────────────── */}
      <div className="app-card dashboard-card dashboard-section">
        <div className="flex flex-wrap items-center justify-between gap-[var(--space-2)] mb-[var(--space-2)]">
          <h3 className="md-title-medium flex items-center gap-2">
            <BadgePercent size={18} /> {t("dashboard.roiTitle")}
          </h3>
          <div className="flex gap-[var(--space-1)]">
            <select
              value={roiRange}
              onChange={(e) =>
                setRoiRange(e.target.value as "30d" | "90d" | "12m")
              }
              className="border rounded px-3 py-1 text-sm"
            >
              <option value="30d">{t("dashboard.range30d")}</option>
              <option value="90d">{t("dashboard.range90d")}</option>
              <option value="12m">{t("dashboard.range12m")}</option>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-[var(--space-2)] mb-[var(--space-2)]">
          <div className="rounded bg-[var(--md-sys-color-surface-container-low)] p-4">
            <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">
              {t("dashboard.gain")}
            </p>
            <p className="md-headline-large">{roi?.gain ?? 0}</p>
          </div>
          <div className="rounded bg-[var(--md-sys-color-surface-container-low)] p-4">
            <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">
              {t("dashboard.cost")}
            </p>
            <p className="md-headline-large">
              {roi ? roi.cost.monthly_total_cost : 0}
            </p>
          </div>
          <div className="rounded bg-[var(--md-sys-color-surface-container-low)] p-4">
            <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">
              {t("dashboard.assistedConversions")}
            </p>
            <p className="md-headline-large">
              {roi?.assisted_conversions ?? 0}
            </p>
          </div>
          <div className="rounded bg-[var(--md-sys-color-surface-container-low)] p-4">
            <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">
              {t("dashboard.roiPct")}
            </p>
            <p
              className={`md-headline-large ${(roi?.roi_pct ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {roi?.roi_pct ?? 0}%
            </p>
          </div>
        </div>
        <div className="h-64 xl:h-72 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={[
                {
                  name: "Revenue",
                  value: roi?.revenue ?? analytics.totals.revenue,
                },
                {
                  name: "Pipeline",
                  value:
                    roi?.pipeline_value ?? analytics.totals.pipeline_value,
                },
                { name: "Cost", value: roi?.cost.monthly_total_cost ?? 0 },
              ]}
            >
              <CartesianGrid stroke={chartGridStroke} strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fill: chartAxisText }} />
              <YAxis tick={{ fill: chartAxisText }} />
              <Tooltip
                contentStyle={chartTooltipStyle}
                labelStyle={chartTooltipLabelStyle}
                cursor={chartTooltipCursor}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={chartSeriesColors.primary}
                fill="color-mix(in srgb, var(--md-sys-color-primary) 28%, transparent)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <RoiAttributionNote
          attributionModel={attributionModel}
          provider={roi?.provider ?? analytics.provider}
        />
      </div>

      {/* ── Analytics metric cards ───────────────────────────────────────── */}
      <div className="dashboard-section grid grid-cols-1 md:grid-cols-4 dashboard-grid">
        <div className="app-card dashboard-card">
          <h3 className="md-title-medium text-[var(--md-sys-color-on-surface-variant)] uppercase flex items-center gap-2">
            <Activity size={16} /> {t("dashboard.dailyAvg")}
          </h3>
          <p className="md-display-large">{analytics.period.daily_average}</p>
        </div>
        <div className="app-card dashboard-card">
          <h3 className="md-title-medium text-[var(--md-sys-color-on-surface-variant)] uppercase">
            {t("dashboard.monthlySessions")}
          </h3>
          <p className="md-display-large">{analytics.period.monthly_total}</p>
        </div>
        <div className="app-card dashboard-card">
          <h3 className="md-title-medium text-[var(--md-sys-color-on-surface-variant)] uppercase">
            {t("dashboard.growth")}
          </h3>
          <p
            className={`md-display-large flex items-center gap-2 ${hasGrowth ? "text-green-600" : "text-red-600"}`}
          >
            {hasGrowth ? (
              <TrendingUp size={20} />
            ) : (
              <TrendingDown size={20} />
            )}
            {analytics.period.growth_pct}%
          </p>
        </div>
        <div className="app-card dashboard-card">
          <h3 className="md-title-medium text-[var(--md-sys-color-on-surface-variant)] uppercase flex items-center gap-2">
            <MousePointerClick size={16} /> {t("dashboard.conversions")}
          </h3>
          <p className="md-display-large">{analytics.totals.conversions}</p>
        </div>
      </div>

      {/* ── Quality metric cards ─────────────────────────────────────────── */}
      <div className="dashboard-section grid grid-cols-1 md:grid-cols-4 dashboard-grid">
        {qualityCards.map((card) => (
          <div key={card.label} className="app-card dashboard-card">
            <h3 className="md-title-medium text-[var(--md-sys-color-on-surface-variant)] uppercase">
              {card.label}
            </h3>
            <p className="md-display-large">{card.value ?? "—"}</p>
          </div>
        ))}
      </div>

      {/* ── Competitor Overview ──────────────────────────────────────────── */}
      <div className="app-card dashboard-card dashboard-section">
        <div className="flex flex-wrap items-center justify-between gap-[var(--space-2)] mb-[var(--space-2)]">
          <h3 className="md-headline-large">
            {t("dashboard.competitorOverview")}
          </h3>
          <select
            value={selectedCompetitorId ?? ""}
            onChange={(e) =>
              setSelectedCompetitorId(Number(e.target.value) || null)
            }
            className="border rounded px-3 py-1 text-sm min-w-48"
            disabled={competitorsLoading || competitors.length === 0}
          >
            {competitors.length === 0 ? (
              <option value="">{t("dashboard.noCompetitors")}</option>
            ) : (
              competitors.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.domain}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Loading state */}
        {(competitorsLoading || overviewLoading) && (
          <p className="md-body-medium text-[var(--md-sys-color-on-surface-variant)]">
            {t("dashboard.loadingCompetitor")}
          </p>
        )}

        {/* Error state with retry */}
        {!competitorsLoading && !overviewLoading && competitorError && (
          <InlineAlert
            message={t(
              competitorError === "list"
                ? "dashboard.competitorFailedLoad"
                : "dashboard.competitorOverviewFailed",
            )}
            onRetry={
              competitorError === "list"
                ? fetchCompetitorsList
                : fetchCompetitorOverview
            }
            retryLabel={t("dashboard.retryButton")}
          />
        )}

        {/* Empty: no competitors configured */}
        {!competitorsLoading &&
          !overviewLoading &&
          !competitorError &&
          competitors.length === 0 && (
            <EmptyState message={t("dashboard.addCompetitors")} />
          )}

        {/* Overview data */}
        {!competitorsLoading &&
          !overviewLoading &&
          !competitorError &&
          competitorOverview && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded bg-[var(--md-sys-color-surface-container-low)] p-4">
                  <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">
                    {t("dashboard.currentMonthTraffic")}
                  </p>
                  <p className="md-headline-large">
                    {Math.round(
                      competitorCurrentMonthTraffic ?? 0,
                    ).toLocaleString()}
                  </p>
                </div>
                <div className="rounded bg-[var(--md-sys-color-surface-container-low)] p-4">
                  <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">
                    {t("dashboard.momChange")}
                  </p>
                  <p
                    className={`md-headline-large ${(competitorMoM ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    {competitorMoM === null
                      ? "—"
                      : `${competitorMoM.toFixed(1)}%`}
                  </p>
                </div>
                <div className="rounded bg-[var(--md-sys-color-surface-container-low)] p-4">
                  <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">
                    {t("dashboard.topKeyword")}
                  </p>
                  <p className="md-title-medium break-all">
                    {topKeyword?.keyword ?? "—"}
                  </p>
                  <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)] mt-1">
                    {topKeyword
                      ? t("dashboard.rankAndVolume", {
                          rank: topKeyword.rank ?? "—",
                          volume: topKeyword.search_volume,
                        })
                      : t("dashboard.noKeywordData")}
                  </p>
                </div>
              </div>
              {competitorOverview.data_source === "local_estimation" && (
                <p className="mt-3 inline-flex rounded-full bg-amber-100 text-amber-800 text-xs px-2 py-1">
                  {t("dashboard.estimatedData")}
                </p>
              )}
            </>
          )}
      </div>

      {/* ── Brand vs Non-Brand ───────────────────────────────────────────── */}
      <div className="app-card dashboard-card dashboard-section">
        <div className="flex items-center justify-between mb-3">
          <h3 className="md-headline-large">
            {t("dashboard.brandVsNonBrand")}
          </h3>
          <select
            value={brandWindow}
            onChange={(e) =>
              setBrandWindow(e.target.value as "7d" | "30d" | "90d")
            }
            className="border rounded px-3 py-1 text-sm"
          >
            <option value="7d">{t("dashboard.range7d")}</option>
            <option value="30d">{t("dashboard.range30d")}</option>
            <option value="90d">{t("dashboard.range90d")}</option>
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3 text-sm">
          <div>
            {t("dashboard.brandSessions")}:{" "}
            <span className="md-title-medium">{brandSummary.brandSessions}</span>
            {" · "}{t("dashboard.conversions")}:{" "}
            <span className="md-title-medium">
              {brandSummary.brandConversions}
            </span>
          </div>
          <div>
            {t("dashboard.nonBrandSessions")}:{" "}
            <span className="md-title-medium">
              {brandSummary.nonBrandSessions}
            </span>
            {" · "}{t("dashboard.conversions")}:{" "}
            <span className="md-title-medium">
              {brandSummary.nonBrandConversions}
            </span>
          </div>
        </div>
        <div className="h-72 xl:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={brandSeries}>
              <CartesianGrid stroke={chartGridStroke} strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: chartAxisText }} />
              <YAxis tick={{ fill: chartAxisText }} />
              <Tooltip
                contentStyle={chartTooltipStyle}
                labelStyle={chartTooltipLabelStyle}
                cursor={chartTooltipCursor}
              />
              <Legend
                wrapperStyle={{
                  color: "var(--md-sys-color-on-surface-variant)",
                }}
              />
              <Bar
                dataKey="brand_sessions"
                fill={chartSeriesColors.primary}
                name={t("dashboard.brandSessions")}
              />
              <Bar
                dataKey="non_brand_sessions"
                fill={chartSeriesColors.secondary}
                name={t("dashboard.nonBrandSessions")}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Content Performance ──────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-[var(--space-2)] items-center">
        <h2 className="md-headline-large mr-3">
          {t("dashboard.contentPerformance")}
        </h2>
        <select
          value={window}
          onChange={(e) => setWindow(e.target.value as "7d" | "30d" | "90d")}
          className="app-select"
        >
          <option value="7d">{t("dashboard.range7d")}</option>
          <option value="30d">{t("dashboard.range30d")}</option>
          <option value="90d">{t("dashboard.range90d")}</option>
        </select>
        <select
          value={sort}
          onChange={(e) =>
            setSort(
              e.target.value as "traffic" | "conversion_rate" | "decay",
            )
          }
          className="app-select"
        >
          <option value="traffic">{t("dashboard.sortTraffic")}</option>
          <option value="conversion_rate">
            {t("dashboard.sortConversionRate")}
          </option>
          <option value="decay">{t("dashboard.sortDecay")}</option>
        </select>
        <Link
          to={`/projects/${id}/pages`}
          className="md-body-medium app-action-link"
        >
          {t("dashboard.viewPageDetails")}
        </Link>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 dashboard-grid dashboard-section">
        {renderContentList(
          t("dashboard.topContent"),
          contentPerformance?.top_content ?? [],
        )}
        {renderContentList(
          t("dashboard.topConversion"),
          contentPerformance?.top_conversion ?? [],
        )}
        {renderContentList(
          t("dashboard.decayingContent"),
          contentPerformance?.decaying_content ?? [],
        )}
      </div>

      {/* ── Keyword Ranking Heatmap ──────────────────────────────────────── */}
      <div className="app-card dashboard-card dashboard-section">
        <div className="flex flex-wrap items-center justify-between gap-[var(--space-2)] mb-[var(--space-2)]">
          <h2 className="md-headline-large">{t("dashboard.keywordHeatmap")}</h2>
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="heatmap-step">{t("dashboard.sampleStep")}</label>
            <select
              id="heatmap-step"
              value={heatmapStep}
              onChange={(event) => {
                setInsightsPage(1);
                setHeatmapStep(Number(event.target.value));
              }}
              className="app-select app-select-sm"
            >
              <option value={1}>{t("dashboard.daily")}</option>
              <option value={2}>{t("dashboard.every2Days")}</option>
              <option value={3}>{t("dashboard.every3Days")}</option>
              <option value={5}>{t("dashboard.every5Days")}</option>
            </select>
          </div>
        </div>

        {insightsLoading ? (
          <HeatmapSkeleton />
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-xs border-separate border-spacing-y-1">
              <thead>
                <tr>
                  {/* Sticky keyword column header */}
                  <th className="text-left sticky left-0 bg-[var(--md-sys-color-surface-container)] pr-4 shadow-[1px_0_0_var(--md-sys-color-outline-variant)]">
                    {t("dashboard.colKeyword")}
                  </th>
                  {searchInsights?.keyword_heatmap.dates.map((d) => (
                    <th
                      key={d}
                      className="md-label-medium text-[var(--md-sys-color-on-surface-variant)] px-1 whitespace-nowrap"
                    >
                      {d.slice(5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {searchInsights?.keyword_heatmap.rows.map((row) => (
                  <tr key={row.keyword}>
                    {/* Sticky keyword column with right shadow for depth */}
                    <td className="sticky left-0 bg-[var(--md-sys-color-surface-container)] pr-4 md-body-medium shadow-[1px_0_0_var(--md-sys-color-outline-variant)]">
                      {row.keyword}
                    </td>
                    {row.cells.map((cell) => (
                      <td
                        key={`${row.keyword}-${cell.date}`}
                        className="w-6 h-6 rounded text-center text-[10px]"
                        style={{
                          backgroundColor: resolveRankCellColor(cell.rank),
                        }}
                        title={`keyword=${row.keyword} | date=${cell.date} | rank=${cell.rank ?? "N/A"}`}
                      >
                        {cell.rank ?? "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-[var(--space-2)] flex items-center justify-between md-label-medium text-[var(--md-sys-color-on-surface-variant)]">
          <span>{t("dashboard.heatmapLegend")}</span>
          <div className="flex gap-[var(--space-1)]">
            <button
              className="app-btn app-btn-outline app-btn-sm disabled:opacity-40"
              disabled={insightsPage <= 1}
              onClick={() =>
                setInsightsPage((prev) => Math.max(prev - 1, 1))
              }
            >
              {t("dashboard.prevPage")}
            </button>
            <span>
              {t("dashboard.pageOf", {
                current:
                  searchInsights?.keyword_heatmap.paging.page ?? insightsPage,
                total: Math.max(
                  1,
                  Math.ceil(
                    (searchInsights?.keyword_heatmap.paging.total_keywords ??
                      0) /
                      (searchInsights?.keyword_heatmap.paging.page_size ?? 1),
                  ),
                ),
              })}
            </span>
            <button
              className="app-btn app-btn-outline app-btn-sm disabled:opacity-40"
              disabled={!searchInsights?.keyword_heatmap.paging.has_more}
              onClick={() => setInsightsPage((prev) => prev + 1)}
            >
              {t("dashboard.nextPage")}
            </button>
          </div>
        </div>
      </div>

      {/* ── Geo Distribution ─────────────────────────────────────────────── */}
      <div className="app-card dashboard-card dashboard-section">
        <h2 className="md-headline-large mb-4">
          {t("dashboard.geoDistribution")}
        </h2>
        <div className="space-y-[var(--space-2)]">
          {searchInsights?.geo_distribution.rows.map((row) => (
            <div key={row.country}>
              <div className="flex justify-between text-sm">
                <span>{row.country}</span>
                <span
                  title={`country=${row.country} | sessions=${row.sessions} | share=${row.share}%`}
                >
                  {row.sessions} sessions ({row.share}%)
                </span>
              </div>
              <div className="h-2 rounded bg-[var(--md-sys-color-surface-container-low)] overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${Math.max((row.sessions / geoMaxSessions) * 100, 4)}%`,
                    backgroundColor: insightPalette.top10,
                  }}
                />
              </div>
            </div>
          ))}
          {!searchInsights?.geo_distribution.rows.length && (
            <EmptyState message={t("dashboard.noGeoData")} />
          )}
        </div>
      </div>

      {/* ── Last Crawl Status ─────────────────────────────────────────────── */}
      {last_crawl ? (
        <div className="app-card dashboard-card">
          <h2 className="md-headline-large mb-4">
            {t("dashboard.lastCrawlStatus")}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-[var(--md-sys-color-on-surface-variant)]">
                {t("dashboard.colStatus")}:
              </span>
              <span
                className="ml-2 px-2 py-1 rounded text-sm"
                style={getCrawlStatusStyle(last_crawl.status)}
              >
                {last_crawl.status}
              </span>
            </div>
            <div>
              <span className="text-[var(--md-sys-color-on-surface-variant)]">
                {t("dashboard.colDate")}:
              </span>
              <span className="ml-2">
                {new Date(last_crawl.start_time).toLocaleString()}
              </span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-4">
            <Link to={`/projects/${id}/pages`} className="app-action-link">
              {t("dashboard.viewPages")}
            </Link>
            <Link to={`/projects/${id}/issues`} className="app-action-link">
              {t("dashboard.viewIssues")}
            </Link>
            <Link to={`/projects/${id}/keywords`} className="app-action-link">
              {t("dashboard.keywordRankings")}
            </Link>
            <Link
              to={`/projects/${id}/keyword-research`}
              className="app-action-link"
            >
              {t("dashboard.keywordResearch")}
            </Link>
            {isAdmin && (
              <Link
                to={`/projects/${id}/api-keys`}
                className="app-action-link"
              >
                {t("dashboard.apiKeys")}
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="app-card dashboard-card">
          <h2 className="md-headline-large mb-4">
            {t("dashboard.lastCrawlStatus")}
          </h2>
          <p className="text-[var(--md-sys-color-on-surface-variant)]">
            {t("dashboard.noCrawlData")}
          </p>
        </div>
      )}
    </div>
  );
}
