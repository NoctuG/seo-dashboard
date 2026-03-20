# Production Readiness Roadmap

This roadmap turns high-impact product and architecture gaps into executable phases so the project can scale beyond demo usage.

## 1) Product Integrations

### 1.1 Google Search Console (GSC)
- Add OAuth2-based GSC account linking per project.
- Persist site/property mapping (`sc-domain:example.com` and URL-prefix variants).
- Ingest Search Analytics dimensions: `query`, `page`, `date`, `country`, `device`.
- Add dashboard widgets for impressions, CTR, average position, and query cannibalization.
- Compare scheduled rank tracker data against actual GSC position to highlight bias.

### 1.2 SERP provider abstraction
- Define `SerpProvider` interface with provider-specific adapters:
  - DataForSEO
  - Serper.dev
  - ValueSERP
- Support provider failover and weighted routing.
- Expose provider and cost attribution in rank history metadata.

### 1.3 Backlink provider abstraction
- Extend backlink snapshot pipeline with real providers:
  - Ahrefs
  - Majestic
  - Moz
- Store provider response metadata, quotas, and fetch status.
- Allow project-level encrypted API keys and per-provider rate controls.

## 2) Crawling & Rendering

### 2.1 JS rendering modes
- Keep `html` mode for lightweight scans.
- Keep `js` mode for SPA rendering using Playwright.
- Add crawl-level render strategy:
  - `html`
  - `js-critical-pages`
  - `js-all-pages`

### 2.2 Structured data capture
- During parse, extract and normalize:
  - JSON-LD blocks
  - Microdata entities
  - OpenGraph/Twitter metadata generated at runtime
- Add issues for missing/invalid schema and dynamic title/description drift.

## 3) Data Layer Upgrades

### 3.1 Async SQLAlchemy migration
- Migrate request path to `AsyncSession` and `create_async_engine`.
- Keep sync migration scripts via Alembic engine bridge.
- Add benchmark target for concurrent crawls and API p95 latency.

### 3.2 JSON column typing
- Replace stringified JSON fields with native JSON/JSONB where supported.
- Prioritize high-value fields:
  - `project.brand_keywords_json`
  - `keyword.serp_features_json`
  - `visibilityhistory.competitor_positions_json`
  - backlink distribution/link payload fields
- Add indexes (GIN for PostgreSQL) for feature lookups.

### 3.3 PostgreSQL-first deployment
- Keep SQLite only for local quick-start.
- Make Postgres default in docker compose for production profile.
- Add DB sizing guidance and retention policies for crawl artifacts.

## 4) Runtime Architecture

### 4.1 Worker isolation
- Move long-running tasks out of API process.
- Adopt queue model:
  - API service: FastAPI only
  - Worker service: crawl/rank/content jobs
  - Redis: broker + transient state
- Add task retries, dead-letter handling, and task-level observability.

### 4.2 Scheduling strategy
- Keep APScheduler as trigger layer only, enqueueing tasks instead of executing inline.
- Support per-project concurrency limits and global back-pressure.

## 5) Frontend data fetching strategy

### 5.1 React Query standardization
- Use `@tanstack/react-query` for server state.
- Define query key conventions and mutation invalidation rules.
- Apply stale-while-revalidate behavior for dashboard cards and heavy tables.
- Add global error boundary + toast integration for mutation failures.

## Suggested implementation order
1. React Query rollout + query key conventions.
2. Worker isolation (queue + scheduler handoff).
3. GSC integration.
4. SERP + backlink providers.
5. Async DB + JSON column migrations + PostgreSQL-first defaults.
