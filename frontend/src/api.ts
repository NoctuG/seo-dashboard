import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const api = axios.create({
    baseURL: API_URL,
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
