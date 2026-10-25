import { useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import {
  Database, AlertTriangle, AlertCircle, Activity,
  TrendingUp, CheckCircle, Info
} from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import { getSummary, getTrends, getHealth } from '../services/api';
import { Skeleton, EmptyState, ErrorBanner } from '../components/ui';

const COLORS = {
  total: '#3b82f6', errors: '#ef4444', warnings: '#f59e0b', infos: '#10b981'
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '12px 16px', fontSize: '0.82rem'
    }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
        {label}
      </div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 4 }}>
          {p.name}: <strong>{p.value.toLocaleString()}</strong>
        </div>
      ))}
    </div>
  );
};

export default function Overview() {
  const { data: health, loading: hLoading } = useFetch(getHealth, []);
  const { data: summary, loading: sLoading, error: sError, refetch: sRefetch } = useFetch(getSummary, []);
  const { data: trends, loading: tLoading, error: tError } = useFetch(getTrends, []);

  // Format trends data for chart: label by date+hour
  const chartData = (trends?.data || []).map(t => ({
    label: `${t.date_parsed?.slice(5) ?? ''} ${t.hour?.toString().padStart(2, '0') ?? ''}h`,
    total: t.total,
    errors: t.errors,
    warnings: t.warnings,
  }));

  // Pie chart data for level distribution
  const pieData = summary?.data_ready
    ? [
        { name: 'INFO',  value: summary.info_count  ?? 0, color: '#3b82f6' },
        { name: 'WARN',  value: summary.warn_count  ?? 0, color: '#f59e0b' },
        { name: 'ERROR', value: summary.error_count ?? 0, color: '#ef4444' },
        { name: 'FATAL', value: summary.fatal_count ?? 0, color: '#dc2626' },
      ].filter(d => d.value > 0)
    : [];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">📊 Overview</h1>
        <p className="page-subtitle">
          Distributed Log Analytics Dashboard — LogHub HDFS v1 Dataset
        </p>
      </div>

      {/* Health banner */}
      {!hLoading && health && (
        <div className={`alert ${health.status === 'ok' && health.parquet_stats_ready ? 'alert-info' : 'alert-warning'}`}>
          <Info size={16} />
          <span>
            Pipeline data: {health.parquet_stats_ready
              ? '✓ Ready — showing processed results'
              : '⏳ Not yet generated — showing synthetic sample data. Run the pipeline to see real results.'}
          </span>
        </div>
      )}

      {/* Stat cards */}
      {sError && <ErrorBanner message={sError} onRetry={sRefetch} />}
      <div className="stats-grid">
        <StatCard
          loading={sLoading}
          icon={<Database size={20} />}
          label="Total Records"
          value={summary?.total_records}
          colorVar="--accent-blue"
          colorBg="rgba(59,130,246,0.1)"
        />
        <StatCard
          loading={sLoading}
          icon={<AlertCircle size={20} />}
          label="Errors"
          value={summary?.error_count}
          colorVar="--accent-red"
          colorBg="rgba(239,68,68,0.1)"
        />
        <StatCard
          loading={sLoading}
          icon={<AlertTriangle size={20} />}
          label="Warnings"
          value={summary?.warn_count}
          colorVar="--accent-yellow"
          colorBg="rgba(245,158,11,0.1)"
        />
        <StatCard
          loading={sLoading}
          icon={<CheckCircle size={20} />}
          label="Parsed OK"
          value={summary?.parsed_ok}
          colorVar="--accent-green"
          colorBg="rgba(16,185,129,0.1)"
        />
        <StatCard
          loading={sLoading}
          icon={<Activity size={20} />}
          label="Parse Failures"
          value={summary?.parse_failed}
          colorVar="--accent-purple"
          colorBg="rgba(139,92,246,0.1)"
        />
      </div>

      {/* Charts */}
      <div className="charts-grid">
        {/* Time series */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <TrendingUp size={14} style={{ display:'inline', marginRight: 6 }} />
              Log Volume & Error Trends (Hourly)
            </span>
          </div>
          {tLoading ? (
            <Skeleton type="chart" />
          ) : tError ? (
            <ErrorBanner message={tError} />
          ) : chartData.length === 0 ? (
            <EmptyState icon="📈" title="No trend data" text="Run the pipeline to generate time-series data." />
          ) : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gErrors" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,143,255,0.08)" />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickFormatter={v => v.split(' ')[0]} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '0.8rem', color: '#94a3b8' }} />
                  <Area type="monotone" dataKey="total"    name="Total"    stroke={COLORS.total}    fill="url(#gTotal)"  strokeWidth={2} />
                  <Area type="monotone" dataKey="errors"   name="Errors"   stroke={COLORS.errors}   fill="url(#gErrors)" strokeWidth={2} />
                  <Area type="monotone" dataKey="warnings" name="Warnings" stroke={COLORS.warnings} fill="none"          strokeWidth={1.5} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Pie chart */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Log Level Distribution</span>
          </div>
          {sLoading ? (
            <Skeleton type="chart" />
          ) : pieData.length === 0 ? (
            <EmptyState icon="🥧" title="No data" text="Run the pipeline to see distribution." />
          ) : (
            <div className="chart-container" style={{ display: 'flex', alignItems: 'center' }}>
              <ResponsiveContainer width="60%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                    paddingAngle={3} dataKey="value" nameKey="name">
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: unknown) => typeof v === 'number' ? v.toLocaleString() : String(v ?? '')} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 16 }}>
                {pieData.map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{d.name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{d.value.toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  loading: boolean;
  icon: React.ReactNode;
  label: string;
  value?: number;
  colorVar: string;
  colorBg: string;
}

function StatCard({ loading, icon, label, value, colorVar, colorBg }: StatCardProps) {
  return (
    <div className="stat-card" style={{ '--stat-color': `var(${colorVar})`, '--stat-color-bg': colorBg } as React.CSSProperties}>
      <div className="stat-icon">{icon}</div>
      {loading ? (
        <Skeleton type="text" />
      ) : (
        <>
          <div className="stat-value">{value?.toLocaleString() ?? '—'}</div>
          <div className="stat-label">{label}</div>
        </>
      )}
    </div>
  );
}
