import React from 'react';

interface SkeletonProps {
  type?: 'text' | 'card' | 'chart' | 'table-row';
  count?: number;
  style?: React.CSSProperties;
}

export function Skeleton({ type = 'text', count = 1, style }: SkeletonProps) {
  const heights: Record<string, string> = {
    text: '14px',
    card: '120px',
    chart: '300px',
    'table-row': '44px',
  };
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`skeleton skeleton-${type}`}
          style={{ height: heights[type], marginBottom: 8, ...style }}
        />
      ))}
    </>
  );
}

interface EmptyStateProps {
  icon?: string;
  title: string;
  text: string;
}

export function EmptyState({ icon = '📭', title, text }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-text">{text}</div>
    </div>
  );
}

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="alert alert-error" role="alert">
      <span>⚠️</span>
      <div style={{ flex: 1 }}>
        <strong>Error:</strong> {message}
        {onRetry && (
          <button
            className="btn btn-secondary"
            onClick={onRetry}
            style={{ marginLeft: 12, padding: '4px 10px', fontSize: '0.8rem' }}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

interface LevelBadgeProps { level: string }
export function LevelBadge({ level }: LevelBadgeProps) {
  const map: Record<string, string> = {
    INFO: 'info', WARN: 'warn', WARNING: 'warn',
    ERROR: 'error', FATAL: 'fatal',
  };
  const cls = map[level?.toUpperCase()] || 'info';
  return <span className={`badge badge-${cls}`}>{level}</span>;
}

interface AnomalyBadgeProps { type: string }
export function AnomalyBadge({ type }: AnomalyBadgeProps) {
  const map: Record<string, string> = {
    spike: 'spike', block: 'anomaly',
    Anomaly: 'anomaly', Normal: 'normal',
  };
  const cls = map[type] || 'anomaly';
  return <span className={`badge badge-${cls}`}>{type}</span>;
}

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}

export function Pagination({ page, pages, total, pageSize, onPageChange }: PaginationProps) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="pagination">
      <span className="pagination-info">
        Showing {start}–{end} of {total.toLocaleString()} records
      </span>
      <div className="pagination-controls">
        <button
          className="btn btn-secondary"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          ← Prev
        </button>
        <span style={{ padding: '8px 12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {page} / {pages}
        </span>
        <button
          className="btn btn-secondary"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
