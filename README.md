# SEO Dashboard

一款基于 Python (FastAPI) 和 React (Vite) 构建的轻量级、可自托管的 SEO 工具，旨在帮助您轻松监控和优化网站的搜索引擎表现。

## ✨ 功能特性

- **项目管理**: 轻松创建和管理多个网站项目。
- **网站爬虫**: 自动爬取网站内容，提取关键元数据并分析内部链接结构。
- **SEO 审计**: 智能检测常见的 SEO 技术问题，如 404 错误、标题或描述缺失、重复内容等。
- **数据仪表盘**: 直观展示爬取统计数据和问题分类汇总，让网站健康状况一目了然。
- **流量分析集成**: 可选集成 Google Analytics (GA4) 或 Matomo，深入分析流量来源、用户行为和转化数据。
- **AI 助手**: 利用 AI 功能获取 SEO 内容优化建议。

## 🚀 快速开始

您可以选择从源代码手动构建和运行，或使用 Docker Compose 进行一键部署。

### 🐳 方式一：使用 Docker Compose 一键部署 (推荐)

这是最简单、最推荐的部署方式，能够一键启动包含后端、前端和数据库的完整环境。

**前提条件:**
- 已安装 [Docker](https://docs.docker.com/get-docker/) 和 [Docker Compose](https://docs.docker.com/compose/install/)。

**部署步骤:**

1.  **克隆仓库**
    ```bash
    git clone https://github.com/NoctuG/seo-dashboard.git
    cd seo-dashboard
    ```

2.  **创建环境配置文件（推荐）**

    项目通过 `.env` 文件进行配置。您需要为后端和前端分别创建配置文件。

    - **后端配置**: 复制示例文件并根据需要修改。
      ```bash
      cp backend/.env.example backend/.env
      ```
      > **说明**: 若未提供 `backend/.env`，容器会使用内置开发默认值启动；但在生产环境中，请务必显式创建并修改 `JWT_SECRET_KEY`、`ALLOWED_ORIGINS` 等配置以确保安全。

    - **前端配置**: 默认无需额外 `.env` 配置。容器模式下浏览器应始终访问前端域名下的 `/api/v1`，再由前端容器内 Nginx 转发到 `API_UPSTREAM` 指定的后端地址。
      > **重要**: 不建议在浏览器可见的 URL 中直接写 `backend:28000` 这类容器服务名；容器服务名仅用于容器内部网络解析，对终端用户浏览器不可见也通常不可达。

    **运行时 Nginx 生效文件**
    - 前端容器启动时会基于模板渲染配置，最终生效文件路径为 `/etc/nginx/conf.d/default.conf`。

    **部署网络说明（frontend `API_UPSTREAM`）**
    - **同一 Compose 网络（默认）**: 使用 `API_UPSTREAM=backend:28000`，即通过服务名访问后端。
    - **跨网络 / 跨主机**: 将其改为可达地址，例如 `host.docker.internal:28000`、内网域名（`seo-api.internal:28000`）或 LB 地址（`api-lb.example.com:28000`）。

    可通过以下方式覆盖默认值：
    ```bash
    API_UPSTREAM=host.docker.internal:28000 docker compose up -d --build
    ```

    **推荐生产拓扑（统一反向代理入口）**
    - 建议仅暴露一个统一入口（如 `https://seo.example.com`），由外层反向代理（Nginx/Caddy/Traefik）接收所有浏览器请求。
    - 外层代理将静态页面与 `/api/v1` 一并转发到前端容器（例如 `frontend:32000`）。
    - 前端容器内 Nginx 再把 `/api/v1` 转发到后端上游（`API_UPSTREAM`）。
    - 在该拓扑下，`API_UPSTREAM` 应设置为**前端容器可达**的后端地址（例如同网段 `backend:28000`，或内网 LB `seo-api.internal:28000`），而不是浏览器直接访问地址。

3.  **启动服务**

    ```bash
    docker compose up -d --build
    ```

4.  **访问应用**

    服务启动后，您可以通过浏览器访问 `http://localhost:32000`。
    > 如需公网 HTTPS，建议在容器外使用 Caddy、Traefik 或 Nginx 统一终止 TLS 并反向代理到 `32000`。

5.  **最小回归检查（静态说明，可按需手动执行）**

    容器启动后，可在 Compose 网络内验证前端 API 反向代理是否正常：
    ```bash
    docker compose exec frontend curl -fsS http://frontend:32000/api/v1/health
    ```
    预期返回后端健康检查响应（HTTP 200 与 JSON 健康状态）。

### 🛠️ 方式二：从源代码构建


如果您希望进行二次开发或自定义部署，可以按照以下步骤从源代码构建。

**前提条件:**
- Python 3.10+
- Node.js 18+
- npm

**1. 后端设置**

```bash
# 1. 进入后端目录
cd backend

# 2. (可选) 创建并激活 Python 虚拟环境
python -m venv venv
source venv/bin/activate # Linux/macOS
# venv\Scripts\activate # Windows

# 3. 安装依赖
pip install -r requirements.txt

# 4. 创建并配置 .env 文件
cp .env.example .env
# 根据需要编辑 .env 文件，至少确保数据库和CORS配置正确

# 5. 初始化数据库
alembic upgrade heads

# 6. 启动后端服务
uvicorn app.main:app --reload --host 0.0.0.0 --port 28000
```
后端 API 将运行在 `http://localhost:28000`。

**2. 前端设置**

```bash
# 1. 打开新的终端，进入前端目录
cd frontend

# 2. 安装依赖
npm install

# 3. 创建并配置 .env 文件
cp .env.example .env
# 确保 .env 文件中的 VITE_API_URL 指向“浏览器可访问”的后端地址，
# 例如 http://localhost:28000/api/v1（本机开发）或 https://seo.example.com/api/v1（经网关转发）。
# 不要填写仅容器内可解析的服务名（如 backend:28000）。

# 4. 启动前端开发服务器
npm run dev -- --host
```
前端应用将运行在 `http://localhost:32000` (或终端提示的其他地址)。

**3. 访问应用**

在浏览器中打开前端应用的地址即可开始使用。

### 🧯 常见故障：登录后又跳回登录页

若出现“输入账号密码后页面刷新并回到登录页”，通常是 `/api/v1/auth/me` 获取当前用户失败导致。可按以下顺序排查：

1. **检查前端容器到后端容器的连通性**
   ```bash
   docker compose exec frontend sh -lc 'wget -qO- http://backend:28000/api/v1/health || curl -fsS http://backend:28000/api/v1/health'
   ```
   - 若失败，优先检查 Compose 网络、服务名、后端端口监听与容器状态。

2. **检查前端 Nginx 的 `/api/v1` 反代上游配置**
   - 确认 `API_UPSTREAM` 实际生效值正确（目标地址应可从前端容器访问）。
   - 检查前端容器内 Nginx 配置生成结果，确认 `/api/v1` 的 `proxy_pass` 指向期望上游。
   - 如有外层网关（Ingress/Nginx/Caddy），确认未错误改写 `/api/v1` 路径。

3. **使用浏览器开发者工具定位 `/api/v1/auth/me`**
   - 打开 Network 面板，筛选 `/api/v1/auth/me` 请求，关注状态码和错误类型：
     - `401/403`: 多为认证信息缺失、过期或被网关剥离。
     - `404`: 路径转发错误（常见于 `/api/v1` 被错误重写）。
     - `502/504` 或 `(failed)`: 上游不可达、DNS 解析失败或反代超时。
     - CORS 报错：前后端访问域不一致且后端 `ALLOWED_ORIGINS` 未正确配置。

## ⚙️ 配置

应用的关键配置通过环境变量进行管理。

- **后端 (`backend/.env`)**: 控制数据库连接、认证密钥、CORS策略、邮件服务以及与第三方服务（如 GA4, Matomo, AI接口）的集成。
- **前端 (`frontend/.env`)**: 主要用于指定后端 API 的访问地址 (`VITE_API_URL`)。

请参考 `backend/.env.example` 文件了解所有可用的配置选项。

---

## 📋 部署后设置指南

完成上述安装步骤后，请按照以下指南完成生产环境的初始化和安全加固。

### 1. 创建管理员账户

首次使用时需要创建一个管理员（超级用户）账户来管理项目和用户。系统提供两种方式：

#### 方式 A：通过环境变量自动创建（推荐用于 Docker 部署）

在 `backend/.env` 中设置以下变量，服务首次启动时将自动创建管理员：

```bash
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=your-secure-password
INITIAL_ADMIN_NAME=Administrator
```

> **注意**: 此方式仅在数据库中没有任何用户时生效。管理员创建后建议从 `.env` 中移除密码。

#### 方式 B：通过 API 接口手动创建

如果未配置环境变量，可在服务启动后调用 Bootstrap API 创建首位管理员：

```bash
curl -X POST http://localhost:28000/api/v1/auth/bootstrap-admin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "your-secure-password",
    "full_name": "Administrator",
    "organization_name": "My Organization"
  }'
```

> **注意**: 该接口仅在数据库中没有任何用户时可用，创建第一个用户后将自动禁用。

#### 后续用户管理

管理员创建完成后，可通过以下方式管理用户：

- **创建新用户**: `POST /api/v1/users` （需要管理员权限）
- **启用两步验证**: 登录后通过 `POST /api/v1/auth/2fa/bind` 和 `POST /api/v1/auth/2fa/enable` 配置 TOTP
- **重置密码**: 配置 SMTP 后支持通过邮件重置密码

### 2. 配置环境变量

在生产环境中，请务必根据实际需求配置 `backend/.env`。以下是关键配置项：

#### 必须修改的配置

| 变量 | 说明 | 示例 |
|------|------|------|
| `ENV` | 运行环境 | `production` |
| `JWT_SECRET_KEY` | JWT 签名密钥（至少 32 字符） | 见下方生成命令 |
| `ALLOWED_ORIGINS` | CORS 允许的前端域名 | `https://seo.example.com` |
| `PASSWORD_RESET_URL` | 密码重置页面地址 | `https://seo.example.com/reset-password` |

生成安全的 JWT 密钥：

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

#### SMTP 邮件服务配置

配置 SMTP 以启用密码重置和邮件通知功能：

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=noreply@example.com
SMTP_USE_TLS=true
```

#### AI API 密钥配置

配置 AI 助手以获取 SEO 优化建议（支持 OpenAI 兼容接口）：

```bash
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-your-api-key
AI_MODEL=gpt-4o-mini
```

#### 完整配置参考

所有可用的环境变量及说明请参考 [`backend/.env.example`](backend/.env.example)。

### 3. 数据备份策略

SQLite 数据库文件存储在 Docker 卷 `seo-dashboard_db-data` 中，建议制定定期备份策略。

#### 方式 A：使用内置备份脚本（推荐）

项目提供了一键备份脚本 `scripts/backup-db.sh`，支持从 Docker 容器中安全导出数据库并压缩：

```bash
# 手动执行备份
./scripts/backup-db.sh

# 自定义备份保留天数（默认 7 天）
BACKUP_RETAIN_DAYS=14 ./scripts/backup-db.sh
```

配合 cron 实现每日自动备份：

```bash
# 编辑 crontab
crontab -e

# 添加以下行（每天凌晨 2:00 执行备份）
0 2 * * * /path/to/seo-dashboard/scripts/backup-db.sh >> /var/log/seo-backup.log 2>&1
```

#### 方式 B：通过管理 API 备份

系统提供了 RESTful 备份/恢复接口（需要管理员权限）：

```bash
# 创建备份
curl -X POST http://localhost:28000/api/v1/admin/backup \
  -H "Authorization: Bearer <your-access-token>"

# 恢复备份
curl -X POST http://localhost:28000/api/v1/admin/restore \
  -H "Authorization: Bearer <your-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"backup_file": "/data/backups/seo-backup-20260101-020000.db", "confirm_phrase": "RESTORE"}'
```

#### 方式 C：直接复制 Docker 卷数据

```bash
# 查看数据库卷的实际路径
docker volume inspect seo-dashboard_db-data

# 从容器中复制数据库文件
docker compose cp backend:/data/seo_tool.db ./seo_tool_backup_$(date +%Y%m%d).db
```

> **建议**: 将备份文件同步到异地存储（如 S3、OSS），避免单点故障导致数据丢失。

### 4. 监控和日志

#### 内置 Prometheus 指标

后端已集成 `prometheus-client`，暴露以下指标端点：

```
GET http://localhost:28000/metrics
```

主要指标包括：
- `seo_dashboard_http_requests_total` — HTTP 请求总数（按方法/路径/状态码）
- `seo_dashboard_http_request_duration_seconds` — 请求延迟直方图
- `seo_dashboard_crawl_runs_total` — 爬虫运行次数
- `seo_dashboard_crawl_pages_processed_total` — 已处理页面总数
- `seo_dashboard_db_pool_in_use` — 数据库连接池使用数

#### 集成 Prometheus + Grafana

在 `docker-compose.yml` 同级目录创建 Prometheus 配置文件 `prometheus.yml`：

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: "seo-dashboard"
    metrics_path: "/metrics"
    static_configs:
      - targets: ["backend:28000"]
```

然后在 `docker-compose.yml` 中添加 Prometheus 和 Grafana 服务：

```yaml
services:
  # ... 已有的 backend 和 frontend 服务 ...

  prometheus:
    image: prom/prometheus:latest
    restart: unless-stopped
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    restart: unless-stopped
    volumes:
      - grafana-data:/var/lib/grafana
    ports:
      - "3000:3000"
    depends_on:
      - prometheus

volumes:
  # ... 已有卷 ...
  prometheus-data:
  grafana-data:
```

#### 健康检查端点

系统提供两个健康检查端点，可用于负载均衡器或 Kubernetes 探针：

| 端点 | 用途 | 成功状态码 |
|------|------|-----------|
| `GET /api/v1/health` | 整体健康状态（数据库 + 调度器） | `200` |
| `GET /api/v1/health/ready` | 就绪检查（适用于 K8s readiness probe） | `200` / `503` |

#### 日志配置

通过环境变量控制日志行为：

```bash
# 日志级别: DEBUG, INFO, WARNING, ERROR
LOG_LEVEL=INFO

# 日志格式: json（推荐生产环境，便于 ELK/Loki 解析）或 plain
LOG_FORMAT=json
```

**集成 ELK Stack**: 将 `LOG_FORMAT` 设为 `json` 后，可使用 Filebeat 采集容器日志并发送到 Elasticsearch：

```bash
# 查看后端容器的 JSON 日志输出
docker compose logs -f backend
```

### 5. 安全加固

#### HTTPS 配置

生产环境务必启用 HTTPS。推荐在容器外部署反向代理来终止 TLS：

**使用 Caddy（自动 HTTPS，推荐）：**

```
# Caddyfile
seo.example.com {
    reverse_proxy localhost:32000
}
```

**使用 Nginx：**

```nginx
server {
    listen 443 ssl http2;
    server_name seo.example.com;

    ssl_certificate     /etc/ssl/certs/seo.example.com.pem;
    ssl_certificate_key /etc/ssl/private/seo.example.com.key;
    ssl_protocols       TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:32000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name seo.example.com;
    return 301 https://$host$request_uri;
}
```

#### 防火墙规则

仅暴露必要端口，后端 API 端口不应直接对公网开放：

```bash
# UFW 示例：仅允许 HTTP/HTTPS 和 SSH
sudo ufw default deny incoming
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# 确保后端端口 28000 不对外暴露
# 在 docker-compose.yml 中将后端端口绑定为仅本地：
#   ports:
#     - "127.0.0.1:28000:28000"
```

#### 限制数据库访问

- SQLite 数据库文件存储在 Docker 卷中，确保宿主机上的卷目录权限仅限 root 或 Docker 用户访问。
- 备份文件同样包含敏感数据，应设置严格的文件权限：

```bash
# 查看并限制卷目录权限
docker volume inspect seo-dashboard_db-data --format '{{ .Mountpoint }}'
sudo chmod 700 /var/lib/docker/volumes/seo-dashboard_db-data/_data
```

#### 其他安全建议

| 措施 | 说明 |
|------|------|
| **强密码策略** | 管理员密码至少 12 位，包含大小写字母、数字和特殊字符 |
| **启用两步验证** | 为管理员账户启用 TOTP 两步验证 |
| **更新 JWT 密钥** | 使用至少 32 字符的高熵随机密钥，切勿使用默认值 |
| **配置 CORS** | `ALLOWED_ORIGINS` 仅填写实际使用的前端域名 |
| **定期更新** | 定期拉取最新镜像以获取安全补丁 |
| **速率限制** | 系统已内置登录（5次/分钟）和爬虫启动（2次/分钟）的速率限制 |
| **审计日志** | 系统自动记录登录、备份、管理员操作等审计日志 |
