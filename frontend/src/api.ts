import axios, { AxiosError } from "axios";
import type { InternalAxiosRequestConfig } from "axios";

export const API_URL = import.meta.env.VITE_API_URL || "/api/v1";
const TOKEN_STORAGE_KEY = "seo.auth.token";

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

type AuthFailureHandler = (() => void) | null;

let accessToken: string | null = null;
let refreshToken: string | null = null;
let authFailureHandler: AuthFailureHandler = null;
let refreshPromise: Promise<TokenPair> | null = null;

const cachedTokensRaw = localStorage.getItem(TOKEN_STORAGE_KEY);
if (cachedTokensRaw) {
  try {
    const cached = JSON.parse(cachedTokensRaw) as TokenPair;
    accessToken = cached.accessToken ?? null;
    refreshToken = cached.refreshToken ?? null;
  } catch {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

function persistTokens(tokens: TokenPair | null) {
  if (!tokens) {
    accessToken = null;
    refreshToken = null;
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    return;
  }

  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

export function setAuthTokens(tokens: TokenPair | null) {
  persistTokens(tokens);
}

export function clearAuthTokens() {
  persistTokens(null);
}

export function getAccessToken() {
  return accessToken;
}

export function getAuthToken() {
  return accessToken;
}

export function getRefreshToken() {
  return refreshToken;
}

export function registerAuthFailureHandler(handler: AuthFailureHandler | null) {
  authFailureHandler = handler;
}

export const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

export interface LoginResponse {
  access_token?: string;
  refresh_token?: string;
  token_type: string;
  requires_2fa?: boolean;
  two_factor_token?: string;
}

export interface TwoFactorBindResponse {
  secret: string;
  otpauth_url: string;
}

export interface TwoFactorEnableResponse {
  message: string;
  backup_codes: string[];
}

export interface UserProfile {
  id: number;
  email: string;
  full_name: string;
  is_superuser: boolean;
}

async function requestTokenRefresh(): Promise<TokenPair> {
  if (!refreshToken) {
    throw new Error("missing refresh token");
  }

  const res = await api.post<LoginResponse>(
    "/auth/refresh",
    { refresh_token: refreshToken },
    { headers: { Authorization: "" } },
  );
  if (!res.data.access_token || !res.data.refresh_token) {
    throw new Error('missing tokens in refresh response');
  }

  const tokens = {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token,
  };
  setAuthTokens(tokens);
  return tokens;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;
    const shouldRefresh =
      error.response?.status === 401 &&
      !!originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/login") &&
      !originalRequest.url?.includes("/auth/refresh");

    if (!shouldRefresh) {
      throw error;
    }

    if (!refreshToken) {
      clearAuthTokens();
      authFailureHandler?.();
      throw error;
    }

    originalRequest._retry = true;

    try {
      refreshPromise = refreshPromise ?? requestTokenRefresh();
      const tokens = await refreshPromise;
      originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      clearAuthTokens();
      authFailureHandler?.();
      throw refreshError;
    } finally {
      refreshPromise = null;
    }
  },
);

export interface ManagedUser {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
}

export interface CreateUserPayload {
  email: string;
  full_name?: string;
  password: string;
  is_active?: boolean;
  is_superuser?: boolean;
}

export interface UpdateUserPayload {
  email?: string;
  full_name?: string;
  password?: string;
  is_active?: boolean;
  is_superuser?: boolean;
}

export async function getUsers(): Promise<ManagedUser[]> {
  const res = await api.get<ManagedUser[]>("/users");
  return res.data;
}

export async function createUser(
  payload: CreateUserPayload,
): Promise<ManagedUser> {
  const res = await api.post<ManagedUser>("/users", payload);
  return res.data;
}

export async function updateUser(
  id: number,
  payload: UpdateUserPayload,
): Promise<ManagedUser> {
  const res = await api.patch<ManagedUser>(`/users/${id}`, payload);
  return res.data;
}

export async function deleteUser(id: number): Promise<void> {
  await api.delete(`/users/${id}`);
}

export interface ProjectPermissions {
  role: "admin" | "viewer";
}

export interface ProjectApiKey {
  id: number;
  project_id: number;
  name: string;
  key_prefix: string;
  scopes: string[];
  expires_at?: string | null;
  revoked_at?: string | null;
  created_by_user_id?: number | null;
  created_at: string;
}

export interface CreateProjectApiKeyPayload {
  name: string;
  scopes: string[];
  expires_at?: string | null;
}

export interface CreateProjectApiKeyResponse extends ProjectApiKey {
  plain_key: string;
}

export async function listProjectApiKeys(
  projectId: string | number,
): Promise<ProjectApiKey[]> {
  const res = await api.get<ProjectApiKey[]>(`/projects/${projectId}/api-keys`);
  return res.data;
}

export async function createProjectApiKey(
  projectId: string | number,
  payload: CreateProjectApiKeyPayload,
): Promise<CreateProjectApiKeyResponse> {
  const res = await api.post<CreateProjectApiKeyResponse>(
    `/projects/${projectId}/api-keys`,
    payload,
  );
  return res.data;
}

export async function revokeProjectApiKey(
  projectId: string | number,
  apiKeyId: number,
): Promise<void> {
  await api.post(`/projects/${projectId}/api-keys/${apiKeyId}/revoke`);
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>("/auth/login", { email, password });
  return res.data;
}

export async function verifyTwoFactorLogin(twoFactorToken: string, code: string): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>('/auth/2fa/verify', {
    two_factor_token: twoFactorToken,
    code,
  });
  return res.data;
}

export async function getTwoFactorStatus(): Promise<{ enabled: boolean }> {
  const res = await api.get<{ enabled: boolean }>('/auth/2fa/status');
  return res.data;
}

export async function bindTwoFactor(): Promise<TwoFactorBindResponse> {
  const res = await api.post<TwoFactorBindResponse>('/auth/2fa/bind');
  return res.data;
}

export async function enableTwoFactor(code: string): Promise<TwoFactorEnableResponse> {
  const res = await api.post<TwoFactorEnableResponse>('/auth/2fa/enable', { code });
  return res.data;
}

export async function getCurrentUser(): Promise<UserProfile> {
  const res = await api.get<UserProfile>("/auth/me");
  return res.data;
}

export async function changePassword(
  oldPassword: string,
  newPassword: string,
): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>("/auth/change-password", {
    old_password: oldPassword,
    new_password: newPassword,
  });
  return res.data;
}

export async function forgotPassword(
  email: string,
): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>("/auth/forgot-password", {
    email,
  });
  return res.data;
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>("/auth/reset-password", {
    token,
    new_password: newPassword,
  });
  return res.data;
}

export async function getProjectPermissions(
  projectId: string | number,
): Promise<ProjectPermissions> {
  const res = await api.get<ProjectPermissions>(
    `/projects/${projectId}/permissions`,
  );
  return res.data;
}

export interface Project {
  id: number;
  name: string;
  domain: string;
  brand_keywords: string[];
  brand_regex?: string;
  default_gl: string;
  default_hl: string;
  created_at: string;
}

export async function updateProjectSettings(
  projectId: string | number,
  payload: { default_gl?: string; default_hl?: string },
): Promise<Project> {
  const res = await api.patch<Project>(
    `/projects/${projectId}/settings`,
    payload,
  );
  return res.data;
}

export interface Crawl {
  id: number;
  project_id: number;
  status: "pending" | "running" | "completed" | "failed";
  start_time: string;
  end_time?: string;
  total_pages: number;
  issues_count: number;
}

export interface Page {
  id: number;
  crawl_id: number;
  url: string;
  status_code: number;
  title?: string;
  description?: string;
  h1?: string;
  load_time_ms?: number;
  size_bytes?: number;
}

export interface Issue {
  id: number;
  crawl_id: number;
  page_id?: number;
  issue_type: string;
  category: "technical_seo" | "accessibility" | "content";
  severity: "critical" | "warning" | "info";
  status: "open" | "ignored" | "resolved";
  description?: string;
  fix_template?: string;
}

export interface AnalyticsData {
  provider: string;
  source: "live" | "sample";
  period: {
    daily_average: number;
    monthly_total: number;
    previous_month_total: number;
    growth_pct: number;
    meaningful_growth: boolean;
  };
  totals: {
    sessions: number;
    bounce_rate: number;
    conversions: number;
    assisted_conversions: number;
    revenue: number;
    pipeline_value: number;
    roi: number | null;
  };
  quality_metrics: {
    engaged_sessions: number | null;
    avg_engagement_time: number | null;
    pages_per_session: number | null;
    key_events: number | null;
  };
  brand_rules: {
    keywords: string[];
    regex: string | null;
  };
  brand_split: {
    brand: { sessions: number; conversions: number };
    non_brand: { sessions: number; conversions: number };
  };
  daily_brand_segments: Array<{
    date: string;
    brand_sessions: number;
    non_brand_sessions: number;
    brand_conversions: number;
    non_brand_conversions: number;
  }>;
  audience: {
    top_countries: Array<{ country: string; sessions: number }>;
    devices: Array<{ device: string; sessions: number }>;
  };
  top_assets: Array<{
    path: string;
    sessions: number;
    conversions: number;
    conversion_rate: number;
    ab_test_variant?: string;
  }>;
  daily_sessions: Array<{ date: string; sessions: number }>;
  notes: string[];
}

export interface DashboardStats {
  last_crawl?: Crawl | null;
  total_pages: number;
  issues_count: number;
  site_health_score: number;
  site_health_band: "red" | "yellow" | "green";
  category_scores?: Array<{
    key?: string;
    name: string;
    score: number;
    issue_count: number;
  }>;
  issues_breakdown: {
    critical: number;
    warning: number;
    info: number;
  };
  technical_health: {
    pass_rate: number;
    failed_items: number;
    trend: Array<{ crawl_id: number; date: string; pass_rate: number }>;
    cwv_scorecard: {
      good: number;
      needs_improvement: number;
      poor: number;
      missing: number;
    };
    indexability_anomalies: Array<{ issue_type: string; count: number }>;
    structured_data_errors: Array<{ issue_type: string; count: number }>;
  };
  analytics: AnalyticsData;
}

export interface SiteAuditOverview {
  last_crawl?: Crawl | null;
  issues_count: number;
  site_health_score: number;
  category_scores: Array<{
    name: string;
    score: number;
    issue_count: number;
  }>;
}

export async function getSiteAuditOverview(projectId: string) {
  const { data } = await api.get<SiteAuditOverview>(`/projects/${projectId}/site-audit/overview`);
  return data;
}

export interface SiteAuditHistoryPoint {
  project_id: number;
  crawl_id: number;
  score: number;
  calculated_at: string;
}

export async function getSiteAuditHistory(projectId: string) {
  const { data } = await api.get<SiteAuditHistoryPoint[]>(`/projects/${projectId}/site-audit/history`);
  return data;
}

export interface KeywordItem {
  id: number;
  project_id: number;
  term: string;
  target_url?: string;
  locale?: string;
  market?: string;
  current_rank?: number;
  last_checked?: string;
  serp_features_json?: string;
  ranking_history?: Array<{
    checked_at: string;
    rank?: number | null;
  }>;
}



export type KeywordScheduleFrequency = "daily" | "weekly";

export interface KeywordRankSchedule {
  id: number;
  project_id: number;
  frequency: KeywordScheduleFrequency;
  day_of_week?: number | null;
  hour: number;
  timezone: string;
  active: boolean;
  last_run_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface KeywordRankSchedulePayload {
  frequency: KeywordScheduleFrequency;
  day_of_week?: number | null;
  hour: number;
  timezone: string;
  active: boolean;
}

export interface KeywordResearchRequest {
  seed_term: string;
  locale?: string;
  market?: string;
  limit?: number;
}

export interface KeywordResearchItem {
  keyword: string;
  search_volume: number;
  cpc: number;
  difficulty: number;
  intent: string;
  provider_raw: Record<string, unknown>;
}

export interface KeywordResearchResponse {
  provider: string;
  items: KeywordResearchItem[];
}

export interface KeywordBulkCreateRequest {
  keywords: string[];
  locale?: string;
  market?: string;
}

export interface KeywordBulkCreateResponse {
  created: KeywordItem[];
  skipped_existing: string[];
}

export interface RankHistoryItem {
  id: number;
  keyword_id: number;
  rank?: number;
  url?: string;
  gl?: string;
  hl?: string;
  checked_at: string;
}

export interface RankingDistributionPoint {
  bucket_start: string;
  top3_count: number;
  top10_count: number;
  top100_count: number;
}

export interface RankingDistributionSummary {
  top3_count: number;
  top10_count: number;
  top100_count: number;
  top3_change: number;
  top10_change: number;
  top100_change: number;
}

export interface RankingDistributionResponse {
  project_id: number;
  bucket: "day" | "week";
  window_days: 7 | 30 | 90;
  summary: RankingDistributionSummary;
  series: RankingDistributionPoint[];
}

export interface CompetitorDomainItem {
  id: number;
  project_id: number;
  domain: string;
  created_at: string;
}

export interface KeywordGapRow {
  keyword: string;
  search_volume?: number | null;
  my_rank?: number | null;
  competitor_a_rank?: number | null;
  competitor_b_rank?: number | null;
  competitor_c_rank?: number | null;
  difficulty?: number | null;
  opportunity_score: number;
}

export interface KeywordGapResponse {
  project_id: number;
  competitor_ids: number[];
  competitor_domains: string[];
  data_source: string;
  stats: {
    common: number;
    gap: number;
    unique: number;
  };
  common: KeywordGapRow[];
  gap: KeywordGapRow[];
  unique: KeywordGapRow[];
}

export interface TrafficOverviewTrendPoint {
  month: string;
  my_site: number;
  competitor: number;
}

export interface TrafficOverviewTopKeyword {
  keyword: string;
  rank?: number | null;
  search_volume: number;
  estimated_clicks: number;
}

export interface CompetitorTrafficOverviewResponse {
  project_id: number;
  competitor_id: number;
  data_source: string;
  monthly_trend: TrafficOverviewTrendPoint[];
  top_keywords: TrafficOverviewTopKeyword[];
  notes: string[];
}

export interface VisibilityGroup {
  group: string;
  visibility_score: number;
}

export interface VisibilityTrendPoint {
  date: string;
  visibility_score: number;
}

export interface VisibilityResponse {
  project_id: number;
  overall_visibility: number;
  groups: VisibilityGroup[];
  trend: VisibilityTrendPoint[];
  serp_feature_coverage: Record<string, number>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface VisibilityHistoryItem {
  keyword_id?: number;
  keyword_term: string;
  source_domain: string;
  rank?: number;
  visibility_score: number;
  result_type: string;
  serp_features: string[];
  competitor_positions: Record<string, number | null>;
  checked_at: string;
}

export interface ContentPerformanceItem {
  url: string;
  keyword_count: number;
  avg_rank?: number;
  estimated_click_contribution: number;
  sessions: number;
  conversions: number;
  conversion_rate: number;
  change_7d: number;
  change_30d: number;
  decay_flag: boolean;
  suggested_action?: string;
}

export interface ContentPerformanceResponse {
  window: "7d" | "30d" | "90d";
  sort: "traffic" | "conversion_rate" | "decay";
  items: ContentPerformanceItem[];
  top_content: ContentPerformanceItem[];
  top_conversion: ContentPerformanceItem[];
  decaying_content: ContentPerformanceItem[];
}

export async function getProjectContentPerformance(
  projectId: string | number,
  window: "7d" | "30d" | "90d" = "30d",
  sort: "traffic" | "conversion_rate" | "decay" = "traffic",
): Promise<ContentPerformanceResponse> {
  const res = await api.get<ContentPerformanceResponse>(
    `/projects/${projectId}/content-performance`,
    {
      params: { window, sort },
    },
  );
  return res.data;
}

export interface AiAnalyzeResponse {
  result: string;
}

export async function analyzeSeoWithAi(
  content: string,
): Promise<AiAnalyzeResponse> {
  const res = await api.post<AiAnalyzeResponse>("/ai/analyze", { content });
  return res.data;
}

export interface AiGenerateArticleRequest {
  topic: string;
  keywords?: string[];
  tone?: string;
  language?: string;
  word_count?: number;
  outline?: string;
}

export interface AiContentBlock {
  type: "heading" | "paragraph" | "list" | "cta" | "hashtag" | string;
  text: string;
  level?: number | null;
  meta?: Record<string, unknown>;
}

export interface AiGenerateArticleResponse {
  title: string;
  content: string;
  meta_description: string;
  keywords_used: string[];
  blocks?: AiContentBlock[];
}

export async function generateSeoArticle(
  payload: AiGenerateArticleRequest,
): Promise<AiGenerateArticleResponse> {
  const res = await api.post<AiGenerateArticleResponse>("/ai/generate-article", payload);
  return res.data;
}

export interface AiGenerateSocialRequest {
  topic: string;
  platform?: string;
  tone?: string;
  language?: string;
  include_hashtags?: boolean;
  count?: number;
}

export interface AiSocialPost {
  content: string;
  hashtags: string[];
  platform: string;
  blocks?: AiContentBlock[];
}

export interface AiGenerateSocialResponse {
  posts: AiSocialPost[];
}

export async function generateSocialContent(
  payload: AiGenerateSocialRequest,
): Promise<AiGenerateSocialResponse> {
  const res = await api.post<AiGenerateSocialResponse>("/ai/generate-social", payload);
  return res.data;
}

export interface AiRewriteRequest {
  content: string;
  instruction?: string;
  language?: string;
}

export interface AiRewriteResponse {
  result: string;
}

export async function rewriteContent(
  payload: AiRewriteRequest,
): Promise<AiRewriteResponse> {
  const res = await api.post<AiRewriteResponse>("/ai/rewrite", payload);
  return res.data;
}


export type AiDraftContentType = "article" | "social";

export interface AiContentDraft {
  id: number;
  project_id: number;
  lineage_id: string;
  content_type: AiDraftContentType;
  title: string;
  canvas_document_json: Record<string, unknown>;
  export_text: string;
  version: number;
  updated_by: number;
  updated_at: string;
}

export interface CreateAiContentDraftPayload {
  content_type: AiDraftContentType;
  title: string;
  canvas_document_json: Record<string, unknown>;
  export_text: string;
}

export interface UpdateAiContentDraftPayload {
  title?: string;
  canvas_document_json?: Record<string, unknown>;
  export_text?: string;
  expected_version: number;
  save_as_new_version?: boolean;
  rollback_to_version?: number;
}

export async function createAiContentDraft(
  projectId: string | number,
  payload: CreateAiContentDraftPayload,
): Promise<AiContentDraft> {
  const res = await api.post<AiContentDraft>(`/projects/${projectId}/ai-drafts`, payload);
  return res.data;
}

export async function listAiContentDrafts(
  projectId: string | number,
  params?: { content_type?: AiDraftContentType; lineage_id?: string },
): Promise<AiContentDraft[]> {
  const res = await api.get<{ drafts: AiContentDraft[] }>(`/projects/${projectId}/ai-drafts`, { params });
  return res.data.drafts;
}

export async function updateAiContentDraft(
  draftId: number,
  payload: UpdateAiContentDraftPayload,
): Promise<AiContentDraft> {
  const res = await api.put<AiContentDraft>(`/ai-drafts/${draftId}`, payload);
  return res.data;
}
export interface AuthorityResponse {
  project_id: number;
  provider: string;
  domain_authority: number;
  ahrefs_rank?: number | null;
  last_fetched_at?: string | null;
  fetch_status?: string;
  history: Array<{ date: string; domain_authority: number }>;
  notes: string[];
}

export interface BacklinkResponse {
  project_id: number;
  provider: string;
  backlinks_total: number;
  ref_domains: number;
  ahrefs_rank?: number | null;
  top_backlinks?: Array<{ url: string; source?: string; anchor?: string; date?: string }>;
  last_fetched_at?: string | null;
  fetch_status?: string;
  anchor_distribution: Record<string, number>;
  history: Array<{
    date: string;
    backlinks_total: number;
    ref_domains: number;
  }>;
  notes: string[];
}

export interface BacklinkStatusResponse {
  project_id: number;
  provider: string;
  last_fetched_at?: string | null;
  fetch_status: string;
}

export interface RefDomainListItem {
  domain: string;
  backlinks_count: number;
  da?: number | null;
  first_seen?: string | null;
  last_seen?: string | null;
  backlinks_history?: Array<{
    date: string;
    backlinks_count: number;
  }>;
}

export interface RefDomainDetailItem {
  source_url?: string | null;
  target_url?: string | null;
  anchor?: string | null;
  first_seen?: string | null;
  lost_seen?: string | null;
  status: string;
}

export interface RefDomainDetailResponse {
  project_id: number;
  domain: string;
  total: number;
  items: RefDomainDetailItem[];
}

export interface BacklinkChangesResponse {
  project_id: number;
  provider: string;
  new_links: Array<{
    url: string;
    source?: string;
    anchor?: string;
    date?: string;
  }>;
  lost_links: Array<{
    url: string;
    source?: string;
    anchor?: string;
    date?: string;
  }>;
  notes: string[];
}

export async function getProjectAuthority(
  projectId: string | number,
): Promise<AuthorityResponse> {
  const res = await api.get<AuthorityResponse>(
    `/projects/${projectId}/authority`,
  );
  return res.data;
}

export async function getProjectBacklinks(
  projectId: string | number,
): Promise<BacklinkResponse> {
  const res = await api.get<BacklinkResponse>(
    `/projects/${projectId}/backlinks`,
  );
  return res.data;
}

export async function getProjectBacklinkStatus(
  projectId: string | number,
): Promise<BacklinkStatusResponse> {
  const res = await api.get<BacklinkStatusResponse>(
    `/projects/${projectId}/backlinks/status`,
  );
  return res.data;
}

export async function getProjectBacklinkChanges(
  projectId: string | number,
): Promise<BacklinkChangesResponse> {
  const res = await api.get<BacklinkChangesResponse>(
    `/projects/${projectId}/backlinks/changes`,
  );
  return res.data;
}

export async function getProjectRefDomains(
  projectId: string | number,
  params?: {
    page?: number;
    page_size?: number;
    search?: string;
    sort_by?: 'backlinks_count' | 'da' | 'first_seen' | 'last_seen';
    sort_order?: 'asc' | 'desc';
  },
): Promise<PaginatedResponse<RefDomainListItem>> {
  const res = await api.get<PaginatedResponse<RefDomainListItem>>(
    `/projects/${projectId}/backlinks/ref-domains`,
    { params },
  );
  return res.data;
}

export async function getProjectRefDomainDetail(
  projectId: string | number,
  domain: string,
): Promise<RefDomainDetailResponse> {
  const res = await api.get<RefDomainDetailResponse>(
    `/projects/${projectId}/backlinks/ref-domains/${encodeURIComponent(domain)}`,
  );
  return res.data;
}

export async function getProjectCompetitors(
  projectId: string | number,
  page = 1,
  pageSize = 20,
): Promise<PaginatedResponse<CompetitorDomainItem>> {
  const res = await api.get<PaginatedResponse<CompetitorDomainItem>>(
    `/projects/${projectId}/competitors`,
    { params: { page, page_size: pageSize } },
  );
  return res.data;
}

export async function addProjectCompetitor(
  projectId: string | number,
  domain: string,
): Promise<CompetitorDomainItem> {
  const res = await api.post<CompetitorDomainItem>(
    `/projects/${projectId}/competitors`,
    { domain },
  );
  return res.data;
}

export async function deleteProjectCompetitor(
  projectId: string | number,
  competitorId: number,
): Promise<void> {
  await api.delete(`/projects/${projectId}/competitors/${competitorId}`);
}

export async function updateProjectCompetitor(
  projectId: string | number,
  competitorId: number,
  domain: string,
): Promise<CompetitorDomainItem> {
  const res = await api.put<CompetitorDomainItem>(
    `/projects/${projectId}/competitors/${competitorId}`,
    { domain },
  );
  return res.data;
}

export async function getProjectKeywordGap(
  projectId: string | number,
  competitorId: number,
  competitorIds?: number[],
): Promise<KeywordGapResponse> {
  const params = new URLSearchParams();
  (competitorIds ?? []).forEach((id) => params.append("competitor_ids", String(id)));
  const res = await api.get<KeywordGapResponse>(
    `/projects/${projectId}/competitors/${competitorId}/keyword-gap`,
    { params },
  );
  return res.data;
}

export async function getProjectCompetitorList(
  projectId: string | number,
  page = 1,
  pageSize = 100,
): Promise<PaginatedResponse<CompetitorDomainItem>> {
  return getProjectCompetitors(projectId, page, pageSize);
}

export async function getProjectCompetitorTrafficOverview(
  projectId: string | number,
  competitorId: number,
): Promise<CompetitorTrafficOverviewResponse> {
  const res = await api.get<CompetitorTrafficOverviewResponse>(
    `/projects/${projectId}/competitors/${competitorId}/traffic-overview`,
  );
  return res.data;
}


export async function getKeywordRankSchedule(
  projectId: string | number,
): Promise<KeywordRankSchedule | null> {
  const res = await api.get<KeywordRankSchedule | null>(
    `/projects/${projectId}/keyword-rank-schedule`,
  );
  return res.data;
}

export async function upsertKeywordRankSchedule(
  projectId: string | number,
  payload: KeywordRankSchedulePayload,
): Promise<KeywordRankSchedule> {
  const res = await api.post<KeywordRankSchedule>(
    `/projects/${projectId}/keyword-rank-schedule`,
    payload,
  );
  return res.data;
}

export async function toggleKeywordRankSchedule(
  projectId: string | number,
  active: boolean,
): Promise<KeywordRankSchedule> {
  const res = await api.post<KeywordRankSchedule>(
    `/projects/${projectId}/keyword-rank-schedule/toggle`,
    null,
    { params: { active } },
  );
  return res.data;
}

export async function runKeywordResearch(
  projectId: string | number,
  payload: KeywordResearchRequest,
): Promise<KeywordResearchResponse> {
  const res = await api.post<KeywordResearchResponse>(
    `/projects/${projectId}/keyword-research`,
    payload,
  );
  return res.data;
}

export async function bulkCreateProjectKeywords(
  projectId: string | number,
  payload: KeywordBulkCreateRequest,
): Promise<KeywordBulkCreateResponse> {
  const res = await api.post<KeywordBulkCreateResponse>(
    `/projects/${projectId}/keywords/bulk-create`,
    payload,
  );
  return res.data;
}

export async function runProjectKeywordCompare(
  projectId: string | number,
): Promise<VisibilityHistoryItem[]> {
  const res = await api.post<VisibilityHistoryItem[]>(
    `/projects/${projectId}/keywords/check-all-compare`,
  );
  return res.data;
}

export async function getProjectRankingsDistribution(
  projectId: string | number,
  windowDays: 7 | 30 | 90 = 30,
  bucket: "day" | "week" = "day",
): Promise<RankingDistributionResponse> {
  const res = await api.get<RankingDistributionResponse>(
    `/projects/${projectId}/rankings/distribution`,
    {
      params: { window_days: windowDays, bucket },
    },
  );
  return res.data;
}

export async function getProjectVisibility(
  projectId: string | number,
): Promise<VisibilityResponse> {
  const res = await api.get<VisibilityResponse>(
    `/projects/${projectId}/visibility`,
  );
  return res.data;
}

export interface SearchInsightsHeatmapCell {
  date: string;
  rank: number | null;
}

export interface SearchInsightsHeatmapRow {
  keyword: string;
  cells: SearchInsightsHeatmapCell[];
}

export interface SearchInsightsResponse {
  project_id: number;
  keyword_heatmap: {
    dates: string[];
    rows: SearchInsightsHeatmapRow[];
    paging: {
      page: number;
      page_size: number;
      total_keywords: number;
      has_more: boolean;
    };
    sampling: {
      days: number;
      keyword_sample_step: number;
    };
  };
  geo_distribution: {
    rows: Array<{
      country: string;
      region: string;
      sessions: number;
      share: number;
      rank: number;
    }>;
    total_sessions: number;
    provider: string;
  };
  legend: {
    rank_thresholds: number[];
    palette: Record<string, string>;
    tooltip_fields: string[];
  };
}

export async function getProjectSearchInsights(
  projectId: string | number,
  params?: {
    days?: number;
    page?: number;
    pageSize?: number;
    keywordSampleStep?: number;
  },
): Promise<SearchInsightsResponse> {
  const res = await api.get<SearchInsightsResponse>(
    `/projects/${projectId}/search-insights`,
    {
      params: {
        days: params?.days,
        page: params?.page,
        page_size: params?.pageSize,
        keyword_sample_step: params?.keywordSampleStep,
      },
    },
  );
  return res.data;
}

export interface RoiBreakdownResponse {
  project_id: number;
  provider: string;
  time_range: "30d" | "90d" | "12m";
  attribution_model: "linear" | "first_click" | "last_click";
  assisted_conversions: number;
  conversions: number;
  revenue: number;
  pipeline_value: number;
  gain: number;
  cost: {
    monthly_human_cost: number;
    monthly_tool_cost: number;
    monthly_outsourcing_cost: number;
    monthly_content_cost: number;
    monthly_total_cost: number;
    currency: string;
  };
  roi: number;
  roi_pct: number;
  formula: Record<string, string>;
}

export async function getProjectRoi(
  projectId: string | number,
  timeRange: "30d" | "90d" | "12m" = "30d",
  attributionModel: "linear" | "first_click" | "last_click" = "linear",
): Promise<RoiBreakdownResponse> {
  const res = await api.get<RoiBreakdownResponse>(
    `/projects/${projectId}/roi`,
    {
      params: { time_range: timeRange, attribution_model: attributionModel },
    },
  );
  return res.data;
}

export interface ReportTemplate {
  id: number;
  project_id: number;
  name: string;
  indicators: string[];
  brand_styles: Record<string, string>;
  time_range: string;
  locale: string;
  created_at: string;
  updated_at: string;
}

export interface ReportSchedule {
  id: number;
  project_id: number;
  template_id: number;
  cron_expression: string;
  timezone: string;
  recipient_email: string;
  active: boolean;
  retry_limit: number;
  created_at: string;
  updated_at: string;
}

export interface ReportDeliveryLog {
  id: number;
  project_id: number;
  template_id?: number;
  schedule_id?: number;
  format: string;
  status: string;
  retries: number;
  recipient_email?: string;
  error_message?: string;
  created_at: string;
}

export async function getReportTemplates(
  projectId: string | number,
): Promise<ReportTemplate[]> {
  const res = await api.get<ReportTemplate[]>(
    `/projects/${projectId}/reports/templates`,
  );
  return res.data;
}

export async function createReportTemplate(
  projectId: string | number,
  payload: Pick<
    ReportTemplate,
    "name" | "indicators" | "brand_styles" | "time_range" | "locale"
  >,
): Promise<ReportTemplate> {
  const res = await api.post<ReportTemplate>(
    `/projects/${projectId}/reports/templates`,
    payload,
  );
  return res.data;
}

export async function exportProjectReport(
  projectId: string | number,
  payload: { template_id: number; format: "csv" | "pdf"; locale?: string },
): Promise<Blob> {
  const res = await api.post(`/projects/${projectId}/reports/export`, payload, {
    responseType: "blob",
  });
  return res.data;
}

export async function getReportSchedules(
  projectId: string | number,
): Promise<ReportSchedule[]> {
  const res = await api.get<ReportSchedule[]>(
    `/projects/${projectId}/reports/schedules`,
  );
  return res.data;
}

export async function createReportSchedule(
  projectId: string | number,
  payload: Pick<
    ReportSchedule,
    | "template_id"
    | "cron_expression"
    | "timezone"
    | "recipient_email"
    | "active"
    | "retry_limit"
  >,
): Promise<ReportSchedule> {
  const res = await api.post<ReportSchedule>(
    `/projects/${projectId}/reports/schedules`,
    payload,
  );
  return res.data;
}

export async function deleteReportSchedule(
  projectId: string | number,
  scheduleId: number,
): Promise<void> {
  await api.delete(`/projects/${projectId}/reports/schedules/${scheduleId}`);
}

export async function getReportLogs(
  projectId: string | number,
): Promise<ReportDeliveryLog[]> {
  const res = await api.get<ReportDeliveryLog[]>(
    `/projects/${projectId}/reports/logs`,
  );
  return res.data;
}

export interface WebhookConfig {
  id: number;
  url: string;
  secret: string;
  subscribed_events: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookConfigPayload {
  url: string;
  secret: string;
  subscribed_events: string[];
  enabled: boolean;
}

export async function listWebhookEvents(): Promise<string[]> {
  const res = await api.get<string[]>("/webhooks/events");
  return res.data;
}

export async function listWebhookConfigs(): Promise<WebhookConfig[]> {
  const res = await api.get<WebhookConfig[]>("/webhooks");
  return res.data;
}

export async function createWebhookConfig(
  payload: WebhookConfigPayload,
): Promise<WebhookConfig> {
  const res = await api.post<WebhookConfig>("/webhooks", payload);
  return res.data;
}

export async function updateWebhookConfig(
  id: number,
  payload: Partial<WebhookConfigPayload>,
): Promise<WebhookConfig> {
  const res = await api.put<WebhookConfig>(`/webhooks/${id}`, payload);
  return res.data;
}

export async function deleteWebhookConfig(id: number): Promise<void> {
  await api.delete(`/webhooks/${id}`);
}
