import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  createProjectApiKey,
  listProjectApiKeys,
  revokeProjectApiKey,
  type ProjectApiKey,
} from "../api";
import { useProjectRole } from "../useProjectRole";

export default function ProjectApiKeys() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useProjectRole(id);
  const [items, setItems] = useState<ProjectApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [scopesInput, setScopesInput] = useState("read");
  const [expiresAt, setExpiresAt] = useState("");
  const [createdPlainKey, setCreatedPlainKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "status" | "expires">("name");

  const fetchItems = async () => {
    if (!id) return;
    try {
      setItems(await listProjectApiKeys(id));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchItems();
  }, [id]);

  const createKey = async () => {
    if (!id || !name.trim()) return;
    const scopes = scopesInput
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    try {
      const created = await createProjectApiKey(id, {
        name: name.trim(),
        scopes,
        expires_at: expiresAt || undefined,
      });
      setCreatedPlainKey(created.plain_key);
      setName("");
      fetchItems();
    } catch (error) {
      console.error(error);
    }
  };

  const revokeKey = async (apiKeyId: number) => {
    if (!id) return;
    try {
      await revokeProjectApiKey(id, apiKeyId);
      fetchItems();
    } catch (error) {
      console.error(error);
    }
  };


  const displayItems = useMemo(() => {
    const filtered = items.filter((item) => !query.trim() || `${item.name} ${item.key_prefix} ${item.scopes.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
    return filtered.sort((a, b) => {
      if (sortBy === 'status') return Number(!!a.revoked_at) - Number(!!b.revoked_at);
      if (sortBy === 'expires') return (a.expires_at ?? '').localeCompare(b.expires_at ?? '');
      return a.name.localeCompare(b.name);
    });
  }, [items, query, sortBy]);

  if (!isAdmin) return <div className="p-6">仅项目管理员可管理 API Key。</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">API Key 管理</h1>
        <div className="flex gap-4 text-sm">
          <Link
            to={`/projects/${id}`}
            className="text-blue-600 hover:underline"
          >
            Dashboard
          </Link>
          <Link
            to={`/projects/${id}/keywords`}
            className="text-blue-600 hover:underline"
          >
            Keywords
          </Link>
          <Link
            to={`/projects/${id}/keyword-research`}
            className="text-blue-600 hover:underline"
          >
            Keyword Research
          </Link>
        </div>
      </div>

      {createdPlainKey && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">
            请立即保存：明文 Key 仅显示一次
          </p>
          <code className="block mt-2 p-2 bg-white border rounded break-all">
            {createdPlainKey}
          </code>
          <button
            className="mt-3 px-3 py-1 border rounded text-sm hover:bg-white"
            onClick={() => setCreatedPlainKey(null)}
          >
            我已保存
          </button>
        </div>
      )}

      <div className="bg-white p-4 rounded shadow space-y-3">
        <h2 className="text-lg font-semibold">创建新 API Key</h2>
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="名称，例如 CI deploy"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="权限范围，逗号分隔，例如 read,write"
          value={scopesInput}
          onChange={(e) => setScopesInput(e.target.value)}
        />
        <input
          className="w-full border rounded px-3 py-2"
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded"
          onClick={createKey}
        >
          创建
        </button>
      </div>

      <div className="bg-white p-4 rounded shadow">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">已有 API Keys</h2>
          <div className="flex gap-2">
            <input className="border rounded px-3 py-1 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="筛选 key" />
            <select className="border rounded px-3 py-1 text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value as "name" | "status" | "expires")}>
              <option value="name">按名称</option>
              <option value="status">按状态</option>
              <option value="expires">按失效时间</option>
            </select>
          </div>
        </div>
        {loading ? (
          <p>加载中...</p>
        ) : items.length === 0 ? (
          <p className="text-gray-500">暂无 API Key</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 cursor-pointer" onClick={() => setSortBy("name")}>名称</th>
                <th>前缀</th>
                <th>权限</th>
                <th className="cursor-pointer" onClick={() => setSortBy("expires")}>失效时间</th>
                <th className="cursor-pointer" onClick={() => setSortBy("status")}>状态</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="py-2">{item.name}</td>
                  <td>{item.key_prefix}</td>
                  <td>{item.scopes.join(", ") || "-"}</td>
                  <td>
                    {item.expires_at
                      ? new Date(item.expires_at).toLocaleString()
                      : "-"}
                  </td>
                  <td>{item.revoked_at ? "已吊销" : "有效"}</td>
                  <td>
                    {!item.revoked_at && (
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => revokeKey(item.id)}
                      >
                        吊销
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
