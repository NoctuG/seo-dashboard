import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getProjectRefDomainDetail, type RefDomainDetailResponse } from '../api';

export default function ProjectBacklinkRefDomainDetail() {
  const { id, domain } = useParams<{ id: string; domain: string }>();
  const [data, setData] = useState<RefDomainDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !domain) return;
    setLoading(true);
    void getProjectRefDomainDetail(id, domain).then(setData).finally(() => setLoading(false));
  }, [id, domain]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">引用域详情：{decodeURIComponent(domain ?? '')}</h1>
        <Link to={`/projects/${id}/backlinks/ref-domains`} className="text-sm text-blue-600 hover:underline">
          返回引用域列表
        </Link>
      </div>

      {loading && <p className="text-sm text-slate-500">加载中...</p>}

      {!loading && (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-3">Source</th>
                <th className="p-3">Target URL</th>
                <th className="p-3">Anchor</th>
                <th className="p-3">First Seen</th>
                <th className="p-3">Lost Seen</th>
                <th className="p-3">状态</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((item, idx) => (
                <tr key={`${item.source_url}-${item.target_url}-${idx}`} className="border-b">
                  <td className="p-3 break-all">{item.source_url ?? '—'}</td>
                  <td className="p-3 break-all">{item.target_url ?? '—'}</td>
                  <td className="p-3">{item.anchor ?? '—'}</td>
                  <td className="p-3">{item.first_seen ?? '—'}</td>
                  <td className="p-3">{item.lost_seen ?? '—'}</td>
                  <td className="p-3">{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
