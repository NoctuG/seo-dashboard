import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, Gauge, ShieldCheck } from "lucide-react";
import { getSiteAuditOverview, type SiteAuditOverview as SiteAuditOverviewData } from "../api";

export default function SiteAuditOverview() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<SiteAuditOverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      try {
        const overview = await getSiteAuditOverview(id);
        setData(overview);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

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
