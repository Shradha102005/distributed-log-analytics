import React, { useState } from 'react';
import { Check, Copy, AlertCircle, RefreshCw } from 'lucide-react';

interface SkeletonProps {
  type?: 'text' | 'card' | 'chart' | 'table-row';
  count?: number;
  style?: React.CSSProperties;
}

export function Skeleton({ type = 'text', count = 1, style }: SkeletonProps) {
  const heights: Record<string, string> = {
    text: '16px',
    card: '130px',
    chart: '320px',
    'table-row': '48px',
  };
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`skeleton skeleton-${type}`}
          style={{ height: heights[type], marginBottom: 10, ...style }}
        />
      ))}
    </>
  );
}

interface EmptyStateProps {
  icon?: string;
  title: string;
  text: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon = '📭', title, text, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-text">{text}</div>
      {action && (
        <button
          className="btn btn-primary"
          onClick={action.onClick}
          style={{ marginTop: 18 }}
        >
          {action.label}
        </button>
      )}
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
      <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>Unable to Load Data</div>
        <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>{message}</div>
      </div>
      {onRetry && (
        <button
          className="btn btn-secondary"
          onClick={onRetry}
          style={{ padding: '6px 14px', fontSize: '0.8rem', flexShrink: 0 }}
        >
          <RefreshCw size={12} />
          Retry
        </button>
      )}
    </div>
  );
}

interface LevelBadgeProps {
  level: string;
}

export function LevelBadge({ level }: LevelBadgeProps) {
  const normalized = level?.toUpperCase() || 'INFO';
  const map: Record<string, string> = {
    INFO: 'info',
    WARN: 'warn',
    WARNING: 'warn',
    ERROR: 'error',
    FATAL: 'fatal',
  };
  const cls = map[normalized] || 'info';
  return <span className={`badge badge-${cls}`}>{normalized}</span>;
}

interface AnomalyBadgeProps {
  type: string;
}

export function AnomalyBadge({ type }: AnomalyBadgeProps) {
  const map: Record<string, string> = {
    spike: 'spike',
    block: 'anomaly',
    Anomaly: 'anomaly',
    Normal: 'normal',
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
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="pagination">
      <span className="pagination-info">
        Showing <strong>{start.toLocaleString()}</strong>–<strong>{end.toLocaleString()}</strong> of <strong>{total.toLocaleString()}</strong> records
      </span>
      <div className="pagination-controls">
        <button
          className="btn btn-secondary"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          ← Prev
        </button>
        <span style={{ padding: '6px 12px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          {page} of {Math.max(1, pages)}
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

/** Interactive one-click copy button with instant checkmark feedback */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      onClick={handleCopy}
      className="btn btn-ghost"
      title="Copy to clipboard"
      style={{
        padding: '3px 8px',
        fontSize: '0.74rem',
        borderRadius: '6px',
        color: copied ? 'var(--accent-green-text)' : 'var(--text-muted)',
      }}
    >
      {copied ? <Check size={12} color="var(--accent-green)" /> : <Copy size={12} />}
      {label && <span>{copied ? 'Copied' : label}</span>}
    </button>
  );
}

/** Apple-style interactive segmented tab switch */
interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (val: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div className="segmented-control">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`segment-btn ${value === opt.value ? 'active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
