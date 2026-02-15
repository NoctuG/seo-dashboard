import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const API_USERNAME = import.meta.env.VITE_API_USERNAME as string | undefined;
const API_PASSWORD = import.meta.env.VITE_API_PASSWORD as string | undefined;

const authHeader = (() => {
  if (!API_USERNAME || !API_PASSWORD) return undefined;
  return `Basic ${btoa(`${API_USERNAME}:${API_PASSWORD}`)}`;
})();

export const api = axios.create({
  baseURL: API_URL,
  headers: authHeader ? { Authorization: authHeader } : undefined,
});

export interface Project {
  id: number;
  name: string;
  domain: string;
  created_at: string;
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
  severity: 'critical' | 'warning' | 'info';
  status: 'open' | 'ignored' | 'resolved';
  description?: string;
}

export interface DashboardStats {
  last_crawl?: Crawl;
  total_pages: number;
  issues_count: number;
  issues_breakdown: {
    critical: number;
    warning: number;
    info: number;
  };
}

export interface KeywordItem {
  id: number;
  project_id: number;
  term: string;
  target_url?: string;
  current_rank?: number;
  last_checked?: string;
}

export interface RankHistoryItem {
  id: number;
  keyword_id: number;
  rank?: number;
  url?: string;
  checked_at: string;
}

export interface AiAnalyzeResponse {
  result: string;
}

export async function analyzeSeoWithAi(content: string): Promise<AiAnalyzeResponse> {
  const res = await api.post<AiAnalyzeResponse>('/ai/analyze', { content });
  return res.data;
}
