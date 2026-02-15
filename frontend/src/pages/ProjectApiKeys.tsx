import { useEffect, useState } from "react";
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
        <h2 className="text-lg font-semibold mb-3">已有 API Keys</h2>
        {loading ? (
          <p>加载中...</p>
        ) : items.length === 0 ? (
          <p className="text-gray-500">暂无 API Key</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">名称</th>
                <th>前缀</th>
                <th>权限</th>
                <th>失效时间</th>
                <th>状态</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
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
