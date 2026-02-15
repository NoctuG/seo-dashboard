import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const TOKEN_STORAGE_KEY = 'seo.auth.token';

let authToken: string | null = localStorage.getItem(TOKEN_STORAGE_KEY);

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function getAuthToken() {
  return authToken;
}

export const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});


export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface UserProfile {
  id: number;
  email: string;
  full_name: string;
  is_superuser: boolean;
}



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
  const res = await api.get<ManagedUser[]>('/users');
  return res.data;
}

export async function createUser(payload: CreateUserPayload): Promise<ManagedUser> {
  const res = await api.post<ManagedUser>('/users', payload);
  return res.data;
}

export async function updateUser(id: number, payload: UpdateUserPayload): Promise<ManagedUser> {
  const res = await api.patch<ManagedUser>(`/users/${id}`, payload);
  return res.data;
}

export async function deleteUser(id: number): Promise<void> {
  await api.delete(`/users/${id}`);
}

export interface ProjectPermissions {
  role: 'admin' | 'viewer';
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>('/auth/login', { email, password });
  return res.data;
}

export async function getCurrentUser(): Promise<UserProfile> {
  const res = await api.get<UserProfile>('/auth/me');
  return res.data;
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>('/auth/change-password', {
    old_password: oldPassword,
    new_password: newPassword,
  });
  return res.data;
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>('/auth/forgot-password', { email });
  return res.data;
}

export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>('/auth/reset-password', {
    token,
    new_password: newPassword,
  });
  return res.data;
}

export async function getProjectPermissions(projectId: string | number): Promise<ProjectPermissions> {
  const res = await api.get<ProjectPermissions>(`/projects/${projectId}/permissions`);
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
  const res = await api.patch<Project>(`/projects/${projectId}/settings`, payload);
  return res.data;
}

export interface Crawl {
  id: number;
  project_id: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
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
  category: 'technical_seo' | 'accessibility' | 'content';
  severity: 'critical' | 'warning' | 'info';
  status: 'open' | 'ignored' | 'resolved';
  description?: string;
  fix_template?: string;
}


export interface AnalyticsData {
  provider: string;
  source: 'live' | 'sample';
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

export interface KeywordItem {
  id: number;
  project_id: number;
  term: string;
  target_url?: string;
  locale?: string;
  market?: string;
  current_rank?: number;
  last_checked?: string;
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



export interface CompetitorDomainItem {
  id: number;
  project_id: number;
  domain: string;
  created_at: string;
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
  window: '7d' | '30d' | '90d';
  sort: 'traffic' | 'conversion_rate' | 'decay';
  items: ContentPerformanceItem[];
  top_content: ContentPerformanceItem[];
  top_conversion: ContentPerformanceItem[];
  decaying_content: ContentPerformanceItem[];
}

export async function getProjectContentPerformance(
  projectId: string | number,
  window: '7d' | '30d' | '90d' = '30d',
  sort: 'traffic' | 'conversion_rate' | 'decay' = 'traffic',
): Promise<ContentPerformanceResponse> {
  const res = await api.get<ContentPerformanceResponse>(`/projects/${projectId}/content-performance`, {
    params: { window, sort },
  });
  return res.data;
}

export interface AiAnalyzeResponse {
  result: string;
}

export async function analyzeSeoWithAi(content: string): Promise<AiAnalyzeResponse> {
  const res = await api.post<AiAnalyzeResponse>('/ai/analyze', { content });
  return res.data;
}

export interface AuthorityResponse {
  project_id: number;
  provider: string;
  domain_authority: number;
  history: Array<{ date: string; domain_authority: number }>;
  notes: string[];
}

export interface BacklinkResponse {
  project_id: number;
  provider: string;
  backlinks_total: number;
  ref_domains: number;
  anchor_distribution: Record<string, number>;
  history: Array<{ date: string; backlinks_total: number; ref_domains: number }>;
  notes: string[];
}

export interface BacklinkChangesResponse {
  project_id: number;
  provider: string;
  new_links: Array<{ url: string; source?: string; anchor?: string; date?: string }>;
  lost_links: Array<{ url: string; source?: string; anchor?: string; date?: string }>;
  notes: string[];
}

export async function getProjectAuthority(projectId: string | number): Promise<AuthorityResponse> {
  const res = await api.get<AuthorityResponse>(`/projects/${projectId}/authority`);
  return res.data;
}

export async function getProjectBacklinks(projectId: string | number): Promise<BacklinkResponse> {
  const res = await api.get<BacklinkResponse>(`/projects/${projectId}/backlinks`);
  return res.data;
}

export async function getProjectBacklinkChanges(projectId: string | number): Promise<BacklinkChangesResponse> {
  const res = await api.get<BacklinkChangesResponse>(`/projects/${projectId}/backlinks/changes`);
  return res.data;
}


export async function getProjectCompetitors(projectId: string | number): Promise<CompetitorDomainItem[]> {
  const res = await api.get<CompetitorDomainItem[]>(`/projects/${projectId}/competitors`);
  return res.data;
}

export async function addProjectCompetitor(projectId: string | number, domain: string): Promise<CompetitorDomainItem> {
  const res = await api.post<CompetitorDomainItem>(`/projects/${projectId}/competitors`, { domain });
  return res.data;
}

export async function deleteProjectCompetitor(projectId: string | number, competitorId: number): Promise<void> {
  await api.delete(`/projects/${projectId}/competitors/${competitorId}`);
}

export async function runProjectKeywordCompare(projectId: string | number): Promise<VisibilityHistoryItem[]> {
  const res = await api.post<VisibilityHistoryItem[]>(`/projects/${projectId}/keywords/check-all-compare`);
  return res.data;
}

export async function getProjectVisibility(projectId: string | number): Promise<VisibilityResponse> {
  const res = await api.get<VisibilityResponse>(`/projects/${projectId}/visibility`);
  return res.data;
}


export interface RoiBreakdownResponse {
  project_id: number;
  provider: string;
  time_range: '30d' | '90d' | '12m';
  attribution_model: 'linear' | 'first_click' | 'last_click';
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
  timeRange: '30d' | '90d' | '12m' = '30d',
  attributionModel: 'linear' | 'first_click' | 'last_click' = 'linear',
): Promise<RoiBreakdownResponse> {
  const res = await api.get<RoiBreakdownResponse>(`/projects/${projectId}/roi`, {
    params: { time_range: timeRange, attribution_model: attributionModel },
  });
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

export async function getReportTemplates(projectId: string | number): Promise<ReportTemplate[]> {
  const res = await api.get<ReportTemplate[]>(`/projects/${projectId}/reports/templates`);
  return res.data;
}

export async function createReportTemplate(
  projectId: string | number,
  payload: Pick<ReportTemplate, 'name' | 'indicators' | 'brand_styles' | 'time_range' | 'locale'>,
): Promise<ReportTemplate> {
  const res = await api.post<ReportTemplate>(`/projects/${projectId}/reports/templates`, payload);
  return res.data;
}

export async function exportProjectReport(
  projectId: string | number,
  payload: { template_id: number; format: 'csv' | 'pdf'; locale?: string },
): Promise<Blob> {
  const res = await api.post(`/projects/${projectId}/reports/export`, payload, { responseType: 'blob' });
  return res.data;
}

export async function getReportSchedules(projectId: string | number): Promise<ReportSchedule[]> {
  const res = await api.get<ReportSchedule[]>(`/projects/${projectId}/reports/schedules`);
  return res.data;
}

export async function createReportSchedule(
  projectId: string | number,
  payload: Pick<ReportSchedule, 'template_id' | 'cron_expression' | 'timezone' | 'recipient_email' | 'active' | 'retry_limit'>,
): Promise<ReportSchedule> {
  const res = await api.post<ReportSchedule>(`/projects/${projectId}/reports/schedules`, payload);
  return res.data;
}

export async function deleteReportSchedule(projectId: string | number, scheduleId: number): Promise<void> {
  await api.delete(`/projects/${projectId}/reports/schedules/${scheduleId}`);
}

export async function getReportLogs(projectId: string | number): Promise<ReportDeliveryLog[]> {
  const res = await api.get<ReportDeliveryLog[]>(`/projects/${projectId}/reports/logs`);
  return res.data;
}
