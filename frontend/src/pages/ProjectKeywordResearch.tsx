import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  bulkCreateProjectKeywords,
  runKeywordResearch,
  type KeywordResearchItem,
} from "../api";
import { useProjectRole } from "../useProjectRole";

export default function ProjectKeywordResearch() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useProjectRole(id);
  const [seedTerm, setSeedTerm] = useState("");
  const [locale, setLocale] = useState("en");
  const [market, setMarket] = useState("us");
  const [limit, setLimit] = useState(20);
  const [items, setItems] = useState<KeywordResearchItem[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"keyword" | "volume" | "difficulty">("volume");

  const selectedKeywords = useMemo(
    () => items.filter((item) => selected[item.keyword]).map((item) => item.keyword),
    [items, selected],
  );


  const displayItems = useMemo(() => {
    const filtered = items.filter((item) => !query.trim() || `${item.keyword} ${item.intent}`.toLowerCase().includes(query.toLowerCase()));
    return filtered.sort((a, b) => {
      if (sortBy === "keyword") return a.keyword.localeCompare(b.keyword);
      if (sortBy === "difficulty") return b.difficulty - a.difficulty;
      return b.search_volume - a.search_volume;
    });
  }, [items, query, sortBy]);

  const onResearch = async () => {    if (!id || !seedTerm.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await runKeywordResearch(id, {
        seed_term: seedTerm.trim(),
        locale,
        market,
        limit,
      });
      setItems(response.items);
      const nextSelected: Record<string, boolean> = {};
      response.items.forEach((item) => {
        nextSelected[item.keyword] = false;
      });
      setSelected(nextSelected);
    } catch (error) {
      console.error(error);
      setMessage("关键词研究失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  const onBulkCreate = async () => {
    if (!id || selectedKeywords.length === 0) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await bulkCreateProjectKeywords(id, {
        keywords: selectedKeywords,
        locale,
        market,
      });
      setMessage(`已创建 ${response.created.length} 个关键词，跳过 ${response.skipped_existing.length} 个已存在关键词。`);
    } catch (error) {
      console.error(error);
      setMessage("批量加入失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) return <div className="p-6">仅项目管理员可执行关键词研究。</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">关键词研究</h1>
        <div className="flex gap-4 text-sm">
          <Link to={`/projects/${id}`} className="text-blue-600 hover:underline">Dashboard</Link>
          <Link to={`/projects/${id}/keywords`} className="text-blue-600 hover:underline">Keywords</Link>
        </div>
      </div>

      <div className="bg-white p-4 rounded shadow grid grid-cols-1 md:grid-cols-5 gap-3">
        <input
          className="border rounded px-3 py-2 md:col-span-2"
          value={seedTerm}
          onChange={(e) => setSeedTerm(e.target.value)}
          placeholder="输入种子词，例如：seo tool"
        />
        <input className="border rounded px-3 py-2" value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="locale" />
        <input className="border rounded px-3 py-2" value={market} onChange={(e) => setMarket(e.target.value)} placeholder="market" />
        <input
          className="border rounded px-3 py-2"
          type="number"
          min={1}
          max={100}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          placeholder="limit"
        />
        <button onClick={onResearch} disabled={loading || !seedTerm.trim()} className="md:col-span-5 bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50">
          {loading ? "执行中..." : "运行关键词研究"}
        </button>
      </div>

      {message && <div className="text-sm text-slate-700">{message}</div>}

      <div className="bg-white p-4 rounded shadow">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">建议词列表</h2>
          <div className="flex gap-2">
            <input className="border rounded px-3 py-1 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="筛选关键词" />
            <select className="border rounded px-3 py-1 text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value as "keyword" | "volume" | "difficulty")}>
              <option value="volume">按搜索量</option>
              <option value="difficulty">按难度</option>
              <option value="keyword">按关键词</option>
            </select>
          </div>
          <button
            onClick={onBulkCreate}
            disabled={loading || selectedKeywords.length === 0}
            className="px-3 py-2 bg-emerald-600 text-white rounded disabled:opacity-50"
          >
            一键加入排名跟踪（{selectedKeywords.length}）
          </button>
        </div>

        {items.length === 0 ? (
          <p className="text-gray-500">请先输入 seed term 并运行研究。</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 w-10"></th>
                <th className="cursor-pointer" onClick={() => setSortBy("keyword")}>关键词</th>
                <th className="cursor-pointer" onClick={() => setSortBy("volume")}>搜索量</th>
                <th>CPC</th>
                <th className="cursor-pointer" onClick={() => setSortBy("difficulty")}>难度</th>
                <th>意图</th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map((item) => (
                <tr key={item.keyword} className="border-b">
                  <td>
                    <input
                      type="checkbox"
                      checked={!!selected[item.keyword]}
                      onChange={(e) => setSelected((prev) => ({ ...prev, [item.keyword]: e.target.checked }))}
                    />
                  </td>
                  <td className="py-2">{item.keyword}</td>
                  <td>{item.search_volume.toLocaleString()}</td>
                  <td>{item.cpc.toFixed(2)}</td>
                  <td>{item.difficulty.toFixed(1)}</td>
                  <td>{item.intent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
