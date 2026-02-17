import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Gauge, ShieldCheck } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getSiteAuditHistory,
  getSiteAuditOverview,
  type SiteAuditHistoryPoint,
  type SiteAuditOverview as SiteAuditOverviewData,
} from "../api";

export default function SiteAuditOverview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<SiteAuditOverviewData | null>(null);
  const [history, setHistory] = useState<SiteAuditHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      try {
        const [overview, trend] = await Promise.all([
          getSiteAuditOverview(id),
          getSiteAuditHistory(id),
        ]);
        setData(overview);
        setHistory(trend);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const chartData = useMemo(
    () =>
      history.map((item) => ({
        ...item,
        date: new Date(item.calculated_at).toLocaleDateString(),
      })),
    [history],
  );

  if (loading || !data) {
    return <div className="p-6">Loading site audit overview...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Site Audit Overview</h1>
          <p className="text-sm text-slate-600">
            Last crawl: {data.last_crawl ? new Date(data.last_crawl.start_time).toLocaleString() : "No crawl yet"}
          </p>
        </div>
        <Link to={`/projects/${id}`} className="text-blue-600 hover:underline">
          Back to Dashboard
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-slate-500">
            <Gauge size={16} />
            Site Health Score
          </div>
          <div className="text-3xl font-semibold">{data.site_health_score}</div>
        </div>

        <div className="rounded border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-slate-500">
            <AlertTriangle size={16} />
            Total Issues
          </div>
          <div className="text-3xl font-semibold">{data.issues_count}</div>
        </div>

        <div className="rounded border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-slate-500">
            <ShieldCheck size={16} />
            Scored Categories
          </div>
          <div className="text-3xl font-semibold">{data.category_scores.length}</div>
        </div>
      </div>

      <div className="rounded border bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Site Health Trend</h2>
          <p className="text-xs text-slate-500">Click a point to open the related crawl report</p>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
              onClick={(state: any) => {
                const point = state?.activePayload?.[0]?.payload as SiteAuditHistoryPoint | undefined;
                if (!id || !point?.crawl_id) return;
                navigate(`/projects/${id}/issues?crawlId=${point.crawl_id}`);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={[0, 100]} />
              <Tooltip
                formatter={(value) => [`${value}`, "Score"]}
                labelFormatter={(_, payload) => {
                  const point = payload?.[0]?.payload as SiteAuditHistoryPoint | undefined;
                  return point ? new Date(point.calculated_at).toLocaleString() : "";
                }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.category_scores.map((item) => (
          <div key={item.name} className="rounded border bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">{item.name}</div>
            <div className="mt-2 text-3xl font-bold">{item.score}</div>
            <div className="mt-1 text-sm text-slate-600">Issues: {item.issue_count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
