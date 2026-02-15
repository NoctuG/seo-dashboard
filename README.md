# SEO Dashboard

一款基于 Python（FastAPI）和 React（Vite）构建的轻量级、可自托管的 SEO 工具。

## 功能特性

- **项目管理**：创建并管理多个项目。
- **爬虫**：爬取网站内容，提取元数据并分析内部链接。
- **审计**：检测常见 SEO 问题（如 404 错误、缺失标题/描述、重复内容等）。
- **仪表盘**：查看爬取统计信息及问题分类汇总。
- **流量分析**：集成 GA4 或 Matomo，监控会话数、受众细分、跳出率、增长趋势及转化率最高的落地页。

## 技术栈

- **后端**：Python 3.10+、FastAPI、SQLModel（SQLite）、Alembic。
- **前端**：React 18、TypeScript、Tailwind CSS、Vite。

## 安装指南

### 后端

1. 进入后端目录：
    ```bash
    cd backend
    ```

2. 创建虚拟环境（可选，但推荐）：
    ```bash
    python -m venv venv
    source venv/bin/activate  # Windows 系统：venv\Scripts\activate
    ```

3. 安装依赖：
    ```bash
    pip install -r requirements.txt
    ```

4. 初始化数据库：
    ```bash
    alembic upgrade head
    ```

5. 启动服务器：
    ```bash
    uvicorn app.main:app --reload
    ```
    API 将运行在 `http://localhost:8000`。

### 前端

1. 进入前端目录：
    ```bash
    cd frontend
    ```

2. 安装依赖：
    ```bash
    npm install
    ```

3. 启动开发服务器：
    ```bash
    npm run dev
    ```
    应用将运行在 `http://localhost:5173`。

## 使用方法

1. 在浏览器中打开前端页面。
2. 通过输入项目名称和域名（例如：`https://example.com`）创建新项目。
3. 点击项目卡片进入详情页。
4. 点击 **开始爬取** 按钮以分析网站。
5. 爬取完成后，可在“仪表盘”、“页面”和“问题”标签页中查看分析结果。

### 环境变量

- 后端通过 `python-dotenv` 支持 `.env` 配置文件（位于 `backend/.env`），可配置以下参数：
  - `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`：用于 AI 驱动的 SEO 分析。
  - `API_USERNAME`、`API_PASSWORD`：可选的基础身份验证。
  - `SERP_API_KEY`、`SERP_API_PROVIDER`：用于关键词排名查询。
  - `ANALYTICS_PROVIDER`（可选值：`sample`、`ga4`、`matomo`）：配置仪表盘的流量数据源。
  - `ANALYTICS_MEANINGFUL_GROWTH_PCT`：用于判断增长信号的阈值百分比。
  - `GA4_PROPERTY_ID`、`GA4_ACCESS_TOKEN`：GA4 Data API 所需参数。
  - `MATOMO_BASE_URL`、`MATOMO_SITE_ID`、`MATOMO_TOKEN_AUTH`：Matomo API 所需参数。
  - `ALLOWED_ORIGINS`：后端 CORS 白名单，支持逗号分隔（如 `https://app.example.com,https://admin.example.com`）或 JSON 数组。
  - `LOG_LEVEL`：日志级别（如 `DEBUG`、`INFO`、`WARNING`、`ERROR`）。
  - `LOG_FORMAT`：日志输出格式，支持 `json`（默认，推荐 ELK/Loki）或 `plain`。

- 前端支持 `.env` 配置文件（位于 `frontend/.env`），可配置：
  - `VITE_API_URL`
  - `VITE_API_USERNAME`、`VITE_API_PASSWORD`（当后端启用身份验证时使用）
- 可分别参考 `backend/.env.example` 和 `frontend/.env.example` 创建配置文件。


### 手动备份与恢复（Superuser）

> 需要先登录拿到 Bearer Token，并确保后端配置了 `BACKUP_DIR`（默认 `/data/backups`）。

1. 触发备份（返回备份文件路径）：
   ```bash
   curl -X POST http://localhost:8000/api/v1/admin/backup \
     -H "Authorization: Bearer <SUPERUSER_TOKEN>"
   ```

2. 使用返回路径进行恢复（需要显式确认）：
   ```bash
   curl -X POST http://localhost:8000/api/v1/admin/restore \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <SUPERUSER_TOKEN>" \
     -d '{
       "backup_file": "/data/backups/seo-backup-20260101-010203.db",
       "confirm_phrase": "RESTORE"
     }'
   ```

### AI 功能

- 侧边栏新增 **AI 助手** 页面。
- 可粘贴 SEO 内容，获取由所配置 AI 接口生成的优化建议。


## TLS 部署（Docker Compose）

生产环境建议通过 HTTPS 暴露前端。当前 `frontend/nginx.conf` 已包含：

- `80` 端口自动重定向到 `443`。
- `443` 端口启用 TLS（`ssl_certificate` / `ssl_certificate_key`）。
- `/api/` 反向代理到 `backend:8000`，前端通过同源路径 `/api/v1` 访问 API，避免浏览器 mixed content。

### 方式一：自签证书（快速内网部署）

1. 在仓库根目录创建证书目录：
   ```bash
   mkdir -p certs
   ```
2. 生成自签证书（示例域名替换为你的域名/IP）：
   ```bash
   openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
     -keyout certs/privkey.pem \
     -out certs/fullchain.pem \
     -subj "/CN=your-domain-or-ip"
   ```
3. 启动服务：
   ```bash
   docker compose up -d --build
   ```
4. 浏览器访问 `https://<your-domain-or-ip>`（首次会提示证书不受信任，需手动信任）。

### 方式二：使用反向代理自动证书（推荐公网）

你也可以让本项目仅提供 HTTP（容器内部），由上层反向代理负责 TLS 终止与证书自动续期：

- **Caddy**：通过 `reverse_proxy` 指向本项目前端服务，自动申请/续签 Let's Encrypt 证书。
- **Traefik**：通过 Docker labels / IngressRoute 将域名路由到前端服务，配合 ACME 自动证书。

在这种模式下，仍建议保持前端 API 基地址为同源 `/api/v1`，由入口代理统一转发到后端，避免 HTTPS 页面请求 HTTP API 导致 mixed content。

> ⚠️ 生产环境必须将 `ALLOWED_ORIGINS` 配置为真实业务域名列表，严禁使用 `*`，否则会带来严重的跨域安全风险。

## 日志采集建议（ELK / Loki）

后端启动后会统一输出结构化日志（JSON），每条日志包含以下字段，便于在日志平台中检索与聚合：

- `timestamp`：UTC ISO8601 时间戳。
- `level`：日志等级。
- `message`：日志消息内容。
- `trace_id`：请求链路追踪 ID（同一个请求内保持一致，同时会通过响应头 `X-Trace-Id` 返回）。
- `path`：请求路径（非请求上下文日志为 `-`）。

### ELK（Filebeat / Logstash / Elasticsearch）

- 建议将后端 stdout 作为 JSON 日志源采集。
- Filebeat 可启用 `json.keys_under_root: true`（或等价配置）直接展开字段。
- 推荐以 `trace_id` + `path` 作为排障主键，配合 `level` 做告警规则。

### Loki（Promtail / Grafana）

- Promtail 可使用 `json` stage 提取 `level`、`trace_id`、`path`。
- 建议将低基数字段（如 `level`、服务名）作为 labels；`trace_id` 更适合保留在 log line/parsed field，避免高基数标签导致成本上升。
- Grafana Explore 中可通过 `trace_id="..."` 快速定位单次请求全链路日志。
