# SEO Dashboard

基于 FastAPI + React (Vite) 的轻量级自托管 SEO 工具，用于监控和优化网站搜索引擎表现。

## 功能

- **项目管理** — 创建和管理多个网站项目
- **网站爬虫** — 自动爬取页面，提取元数据，分析链接结构
- **SEO 审计** — 检测 404、标题/描述缺失、重复内容等问题
- **数据仪表盘** — 可视化爬取统计与问题汇总
- **流量分析** — 可选集成 Google Analytics (GA4) 或 Matomo
- **AI 助手** — AI 驱动的 SEO 优化建议

## 快速开始

### Docker Compose 部署（推荐）

```bash
git clone https://github.com/NoctuG/seo-dashboard.git
cd seo-dashboard
cp backend/.env.example backend/.env  # 按需修改配置
docker compose up -d --build
```

访问 `http://localhost:32000`。

> `API_UPSTREAM` 环境变量控制前端容器内 Nginx 到后端的转发地址，默认 `backend:28000`。跨主机部署时改为可达地址即可。

### 从源代码运行

**前提**: Python 3.10+、Node.js 18+

**后端：**

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # 按需修改
alembic upgrade heads
uvicorn app.main:app --reload --host 0.0.0.0 --port 28000
```

**前端：**

```bash
cd frontend
npm install
cp .env.example .env  # 确保 VITE_API_URL 指向浏览器可访问的后端地址
npm run dev -- --host
```

## 配置

所有配置通过环境变量管理，详见 [`backend/.env.example`](backend/.env.example)。

关键配置项：

| 变量 | 说明 |
|------|------|
| `JWT_SECRET_KEY` | JWT 签名密钥（生产环境必改，至少 32 字符） |
| `ALLOWED_ORIGINS` | CORS 允许的前端域名 |
| `SMTP_HOST/PORT/USER/PASSWORD` | 邮件服务（用于密码重置） |
| `AI_BASE_URL / AI_API_KEY / AI_MODEL` | AI 助手（OpenAI 兼容接口） |

## 部署后设置

### 创建管理员

**方式 A**：在 `backend/.env` 中设置 `INITIAL_ADMIN_EMAIL`、`INITIAL_ADMIN_PASSWORD`、`INITIAL_ADMIN_NAME`，首次启动时自动创建。

**方式 B**：调用 Bootstrap API：

```bash
curl -X POST http://localhost:28000/api/v1/auth/bootstrap-admin \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "your-secure-password", "full_name": "Administrator", "organization_name": "My Org"}'
```

> 两种方式均仅在数据库无用户时生效。

### 数据备份

```bash
# 使用内置脚本
./scripts/backup-db.sh

# 或直接从容器复制
docker compose cp backend:/data/seo_tool.db ./backup.db
```

### 健康检查

| 端点 | 用途 |
|------|------|
| `GET /api/v1/health` | 整体健康状态 |
| `GET /api/v1/health/ready` | 就绪检查（K8s readiness probe） |
| `GET /metrics` | Prometheus 指标 |

### 安全建议

- 生产环境务必启用 HTTPS（推荐 Caddy 或 Nginx 反向代理）
- 修改默认 `JWT_SECRET_KEY`，启用两步验证
- 后端端口 `28000` 不应直接对公网开放
- 定期备份数据库并同步至异地存储
