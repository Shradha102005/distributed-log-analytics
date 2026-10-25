/**
 * API service layer — all backend calls go through here.
 * Never fetches more data than needed; uses server-side pagination.
 */
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
});

// ── Types ──────────────────────────────────────────────────────────────────

export interface HealthData {
  status: string;
  parquet_logs_ready: boolean;
  parquet_stats_ready: boolean;
  parquet_anomalies_ready: boolean;
  parquet_metrics_ready: boolean;
}

export interface SummaryData {
  data_ready: boolean;
  total_records?: number;
  parsed_ok?: number;
  parse_failed?: number;
  info_count?: number;
  warn_count?: number;
  error_count?: number;
  fatal_count?: number;
}

export interface TrendPoint {
  date_parsed?: string;
  hour?: number;
  total: number;
  errors: number;
  warnings: number;
}

export interface TrendsData {
  data: TrendPoint[];
  data_ready: boolean;
}

export interface ComponentStat {
  component: string;
  total: number;
  errors: number;
  warnings: number;
  infos: number;
}

export interface ComponentsData {
  data: ComponentStat[];
  data_ready: boolean;
}

export interface EventPattern {
  event_pattern: string;
  level: string;
  count: number;
  fraction?: number;
  is_rare?: string;
}

export interface EventsData {
  data: EventPattern[];
  data_ready: boolean;
}

export interface LogRecord {
  date_str?: string;
  time_str?: string;
  pid?: string;
  level?: string;
  component?: string;
  content?: string;
  block_id?: string;
  ts_raw?: string;
}

export interface PaginatedLogs {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  records: LogRecord[];
  data_ready: boolean;
}

export interface AnomalyRecord {
  anomaly_type?: string;
  date_parsed?: string;
  hour?: number;
  errors?: number;
  z_score?: number;
  is_spike?: string;
  block_id?: string;
  error_count?: number;
  total_count?: number;
  predicted_label?: string;
  gt_label?: string | null;
}

export interface PaginatedAnomalies {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  records: AnomalyRecord[];
  data_ready: boolean;
}

export interface MetricsData {
  data_ready: boolean;
  evaluation_level?: string;
  note?: string;
  TP?: number;
  FP?: number;
  TN?: number;
  FN?: number;
  precision?: number;
  recall?: number;
  f1_score?: number;
  accuracy?: number;
  evaluated_blocks?: number;
  gt_anomaly_blocks?: number;
  gt_normal_blocks?: number;
}

// ── API calls ─────────────────────────────────────────────────────────────

export async function getHealth(): Promise<HealthData> {
  const r = await api.get('/api/health');
  return r.data;
}

export async function getSummary(): Promise<SummaryData> {
  const r = await api.get('/api/summary');
  return r.data;
}

export async function getTrends(params?: { date_from?: string; date_to?: string }): Promise<TrendsData> {
  const r = await api.get('/api/trends', { params });
  return r.data;
}

export async function getComponents(params?: { limit?: number; order_by?: string }): Promise<ComponentsData> {
  const r = await api.get('/api/components', { params });
  return r.data;
}

export async function getEvents(params?: { level?: string; is_rare?: boolean; limit?: number }): Promise<EventsData> {
  const r = await api.get('/api/events', { params });
  return r.data;
}

export async function getLogs(params: {
  page?: number;
  page_size?: number;
  level?: string;
  component?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
}): Promise<PaginatedLogs> {
  const filtered = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );
  const r = await api.get('/api/logs', { params: filtered });
  return r.data;
}

export async function getAnomalies(params?: {
  page?: number;
  page_size?: number;
  anomaly_type?: string;
  is_confirmed?: boolean;
}): Promise<PaginatedAnomalies> {
  const r = await api.get('/api/anomalies', { params });
  return r.data;
}

export async function getMetrics(): Promise<MetricsData> {
  const r = await api.get('/api/metrics');
  return r.data;
}
