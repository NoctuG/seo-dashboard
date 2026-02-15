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

2.  **创建环境配置文件**

    项目通过 `.env` 文件进行配置。您需要为后端和前端分别创建配置文件。

    - **后端配置**: 复制示例文件并根据需要修改。
      ```bash
      cp backend/.env.example backend/.env
      ```
      > **重要**: 生产环境中，请务必修改 `backend/.env` 文件中的 `JWT_SECRET_KEY` 和 `ALLOWED_ORIGINS` 等默认值以确保安全。

    - **前端配置**: `docker-compose.yml` 已将 API 地址配置为 `/api/v1`，由 Nginx 自动代理到后端，因此前端无需额外配置。

3.  **生成 SSL 证书 (用于 HTTPS)**

    生产环境强烈建议使用 HTTPS。以下命令将生成自签名证书，用于快速测试。

    ```bash
    mkdir -p certs
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout certs/privkey.pem \
      -out certs/fullchain.pem \
      -subj "/CN=localhost"
    ```
    > 对于公网部署，建议使用像 Caddy 或 Traefik 这样的反向代理来自动管理 Let's Encrypt 证书。

4.  **启动服务**

    ```bash
    docker compose up -d --build
    ```

5.  **访问应用**

    服务启动后，您可以通过浏览器访问 `https://localhost`。由于使用的是自签名证书，首次访问时浏览器会提示安全警告，请选择信任即可。

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
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
后端 API 将运行在 `http://localhost:8000`。

**2. 前端设置**

```bash
# 1. 打开新的终端，进入前端目录
cd frontend

# 2. 安装依赖
npm install

# 3. 创建并配置 .env 文件
cp .env.example .env
# 确保 .env 文件中的 VITE_API_URL 指向后端服务地址，默认为 http://localhost:8000/api/v1

# 4. 启动前端开发服务器
npm run dev -- --host
```
前端应用将运行在 `http://localhost:5173` (或终端提示的其他地址)。

**3. 访问应用**

在浏览器中打开前端应用的地址即可开始使用。

## ⚙️ 配置

应用的关键配置通过环境变量进行管理。

- **后端 (`backend/.env`)**: 控制数据库连接、认证密钥、CORS策略、邮件服务以及与第三方服务（如 GA4, Matomo, AI接口）的集成。
- **前端 (`frontend/.env`)**: 主要用于指定后端 API 的访问地址 (`VITE_API_URL`)。

请参考根目录下的 `.env.example` 文件了解所有可用的配置选项。
