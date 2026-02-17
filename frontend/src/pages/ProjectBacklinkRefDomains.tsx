import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getProjectRefDomains, type RefDomainListItem } from '../api';
import PaginationControls from '../components/PaginationControls';
import Sparkline, { EMPTY_PLACEHOLDER } from '../components/Sparkline';

const PAGE_SIZE = 20;

export default function ProjectBacklinkRefDomains() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<RefDomainListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'backlinks_count' | 'da' | 'first_seen'>('backlinks_count');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void getProjectRefDomains(id, {
      page,
      page_size: PAGE_SIZE,
      search: search.trim() || undefined,
      sort_by: sortBy,
      sort_order: 'desc',
    })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [id, page, search, sortBy]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">引用域列表</h1>
        <Link to={`/projects/${id}`} className="text-sm text-blue-600 hover:underline">
          返回 Dashboard
        </Link>
      </div>

      <div className="flex gap-2">
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="搜索域名"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <select
          className="rounded border px-3 py-2 text-sm"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'backlinks_count' | 'da' | 'first_seen')}
        >
          <option value="backlinks_count">按外链数</option>
          <option value="da">按 DA</option>
          <option value="first_seen">按首见时间</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-3">域名</th>
              <th className="p-3">外链数</th>
              <th className="p-3">DA</th>
              <th className="p-3">引用域外链变化趋势</th>
              <th className="p-3">首见</th>
              <th className="p-3">最近</th>
            </tr>
          </thead>
          <tbody>
            {!loading && items.length === 0 && (
              <tr>
                <td className="p-4 text-slate-500" colSpan={6}>暂无数据</td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.domain} className="border-b">
                <td className="p-3">
                  <Link className="text-blue-600 hover:underline" to={`/projects/${id}/backlinks/ref-domains/${encodeURIComponent(item.domain)}`}>
                    {item.domain}
                  </Link>
                </td>
                <td className="p-3">{item.backlinks_count}</td>
                <td className="p-3">{item.da ?? EMPTY_PLACEHOLDER}</td>
                <td className="p-3">
                  <Sparkline
                    data={(item.backlinks_history ?? []).map((point) => ({ value: point.backlinks_count, label: point.date }))}
                  />
                </td>
                <td className="p-3">{item.first_seen ?? EMPTY_PLACEHOLDER}</td>
                <td className="p-3">{item.last_seen ?? EMPTY_PLACEHOLDER}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationControls page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      </div>
    </div>
  );
}
