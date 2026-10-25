import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import {
  Database, AlertCircle, AlertTriangle, CheckCircle2,
  Activity, ArrowUpRight, CheckCircle, BarChart2, TrendingUp, Layers
} from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import { getSummary, getTrends, getHealth } from '../services/api';
import { Skeleton, EmptyState, ErrorBanner, SegmentedControl } from '../components/ui';

const COLORS = {
  total: '#0071e3',     // Apple Blue
  errors: '#ff3b30',    // Apple Red
  warnings: '#ff9500',  // Apple Orange
  infos: '#34c759',     // Apple Green
};

interface TooltipPayloadItem {
  dataKey: string;
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

const AppleCustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="apple-tooltip">
      <div className="apple-tooltip-title">
        Time Window: {label}
      </div>
      {payload.map((p) => (
        <div key={p.dataKey} className="apple-tooltip-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
            <span style={{ color: 'var(--text-secondary)' }}>{p.name}</span>
          </div>
          <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {p.value.toLocaleString()}
          </strong>
        </div>
      ))}
    </div>
  );
};

export default function Overview() {
  const navigate = useNavigate();
  const { data: health, loading: hLoading } = useFetch(getHealth, []);
  const { data: summary, loading: sLoading, error: sError, refetch: sRefetch } = useFetch(getSummary, []);
  const { data: trends, loading: tLoading, error: tError } = useFetch(getTrends, []);

  // Interactive controls
  const [chartType, setChartType] = useState<'area' | 'bar'>('area');
  const [filterMode, setFilterMode] = useState<'all' | 'errors' | 'total'>('all');

  // Format trends data for chart: label by date+hour
  const chartData = (trends?.data || []).map((t) => ({
    label: `${t.date_parsed ? t.date_parsed.slice(5) : ''} ${t.hour != null ? t.hour.toString().padStart(2, '0') + ':00' : ''}`,
    total: t.total,
    errors: t.errors,
    warnings: t.warnings,
  }));

  // Pie chart data for level distribution
  const pieData = summary?.data_ready
    ? [
        { name: 'INFO',  value: summary.info_count  ?? 0, color: COLORS.total },
        { name: 'WARN',  value: summary.warn_count  ?? 0, color: COLORS.warnings },
        { name: 'ERROR', value: summary.error_count ?? 0, color: COLORS.errors },
        { name: 'FATAL', value: summary.fatal_count ?? 0, color: '#d70015' },
      ].filter((d) => d.value > 0)
    : [];

  const parseRate = summary?.total_records && summary?.parsed_ok
    ? ((summary.parsed_ok / summary.total_records) * 100).toFixed(1)
    : '100.0';

  return (
    <div className="page">
      {/* Apple-style Hero Title */}
      <div className="page-header">
        <h1 className="page-title">Cluster Overview</h1>
        <p className="page-subtitle">
          Real-time distributed telemetry, parsing integrity, and temporal anomaly patterns across the LogHub HDFS cluster.
        </p>
      </div>

      {/* Pipeline Health Alert (Apple Style) */}
      {!hLoading && health && (
        <div
          className="alert alert-info"
          style={{
            background: 'var(--accent-blue-tint)',
            border: '1px solid rgba(0, 113, 227, 0.15)',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-subtle)',
          }}
        >
          <CheckCircle size={18} color="var(--accent-blue)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Parquet Data Layer Synchronized: </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {health.parquet_stats_ready
                  ? 'Processed PySpark datasets active. Sub-millisecond DuckDB columnar query engine online.'
                  : 'Sample data loaded. Run pipeline for full cluster aggregation.'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="code-pill">PySpark 3.5.3</span>
              <span className="code-pill">DuckDB Engine</span>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Stat Cards */}
      {sError && <ErrorBanner message={sError} onRetry={sRefetch} />}
      <div className="stats-grid">
        <div className="stat-card" onClick={() => navigate('/logs')}>
          <div className="stat-top">
            <div className="stat-icon" style={{ background: 'var(--accent-blue-tint)', color: 'var(--accent-blue)' }}>
              <Database size={22} />
            </div>
            <div className="stat-pill" style={{ background: 'var(--accent-blue-tint)', color: 'var(--accent-blue)' }}>
              <span>Live Dataset</span>
              <ArrowUpRight size={12} />
            </div>
          </div>
          {sLoading ? (
            <Skeleton type="text" />
          ) : (
            <div>
              <div className="stat-value">{summary?.total_records?.toLocaleString() ?? '—'}</div>
              <div className="stat-label">
                <span>Total Processed Records</span>
              </div>
            </div>
          )}
        </div>

        <div className="stat-card" onClick={() => navigate('/anomalies')}>
          <div className="stat-top">
            <div className="stat-icon" style={{ background: 'var(--accent-red-tint)', color: 'var(--accent-red)' }}>
              <AlertCircle size={22} />
            </div>
            <div className="stat-pill" style={{ background: 'var(--accent-red-tint)', color: 'var(--accent-red)' }}>
              <span>Anomalies</span>
              <ArrowUpRight size={12} />
            </div>
          </div>
          {sLoading ? (
            <Skeleton type="text" />
          ) : (
            <div>
              <div className="stat-value" style={{ color: summary?.error_count ? 'var(--accent-red)' : 'inherit' }}>
                {summary?.error_count?.toLocaleString() ?? '0'}
              </div>
              <div className="stat-label">
                <span>Error Log Records</span>
              </div>
            </div>
          )}
        </div>

        <div className="stat-card" onClick={() => navigate('/logs')}>
          <div className="stat-top">
            <div className="stat-icon" style={{ background: 'var(--accent-yellow-tint)', color: 'var(--accent-yellow-text)' }}>
              <AlertTriangle size={22} />
            </div>
            <div className="stat-pill" style={{ background: 'var(--accent-yellow-tint)', color: 'var(--accent-yellow-text)' }}>
              <span>Attention</span>
              <ArrowUpRight size={12} />
            </div>
          </div>
          {sLoading ? (
            <Skeleton type="text" />
          ) : (
            <div>
              <div className="stat-value">{summary?.warn_count?.toLocaleString() ?? '0'}</div>
              <div className="stat-label">
                <span>Warning Events</span>
              </div>
            </div>
          )}
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon" style={{ background: 'var(--accent-green-tint)', color: 'var(--accent-green-text)' }}>
              <CheckCircle2 size={22} />
            </div>
            <div className="stat-pill" style={{ background: 'var(--accent-green-tint)', color: 'var(--accent-green-text)' }}>
              <span>{parseRate}% Pass</span>
            </div>
          </div>
          {sLoading ? (
            <Skeleton type="text" />
          ) : (
            <div>
              <div className="stat-value">{summary?.parsed_ok?.toLocaleString() ?? '—'}</div>
              <div className="stat-label">
                <span>Schema Validated Logs</span>
              </div>
            </div>
          )}
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon" style={{ background: 'var(--accent-purple-tint)', color: 'var(--accent-purple-text)' }}>
              <Activity size={22} />
            </div>
            <div className="stat-pill" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
              <span>0.0% Loss</span>
            </div>
          </div>
          {sLoading ? (
            <Skeleton type="text" />
          ) : (
            <div>
              <div className="stat-value">{summary?.parse_failed?.toLocaleString() ?? '0'}</div>
              <div className="stat-label">
                <span>Regex Parse Failures</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Charts Section */}
      <div className="charts-grid">
        {/* Time-Series Trend Card with Segmented Controls */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                <TrendingUp size={18} color="var(--accent-blue)" />
                <span>Log Volume & Activity Trends</span>
              </div>
              <div className="card-subtitle">
                Hourly throughput aggregation and error spike detection
              </div>
            </div>

            {/* Apple Segmented Controls */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <SegmentedControl
                value={filterMode}
                onChange={setFilterMode}
                options={[
                  { value: 'all', label: 'All Series' },
                  { value: 'errors', label: 'Errors Only' },
                  { value: 'total', label: 'Volume' },
                ]}
              />
              <SegmentedControl
                value={chartType}
                onChange={setChartType}
                options={[
                  { value: 'area', label: 'Area', icon: <TrendingUp size={12} /> },
                  { value: 'bar', label: 'Column', icon: <BarChart2 size={12} /> },
                ]}
              />
            </div>
          </div>

          {tLoading ? (
            <Skeleton type="chart" />
          ) : tError ? (
            <ErrorBanner message={tError} />
          ) : chartData.length === 0 ? (
            <EmptyState icon="📈" title="No Trend Data" text="Run the pipeline to generate time-series metrics." />
          ) : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'area' ? (
                  <AreaChart data={chartData} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="appleBlueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.total} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={COLORS.total} stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="appleRedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.errors} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={COLORS.errors} stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#86868b', fontSize: 12, fontFamily: 'Inter' }}
                      axisLine={{ stroke: '#e5e5ea' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#86868b', fontSize: 12, fontFamily: 'Inter' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<AppleCustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '0.82rem', paddingTop: '10px' }} />

                    {(filterMode === 'all' || filterMode === 'total') && (
                      <Area
                        type="monotone"
                        dataKey="total"
                        name="Total Logs"
                        stroke={COLORS.total}
                        fill="url(#appleBlueGradient)"
                        strokeWidth={2.5}
                      />
                    )}
                    {(filterMode === 'all' || filterMode === 'errors') && (
                      <Area
                        type="monotone"
                        dataKey="errors"
                        name="Errors"
                        stroke={COLORS.errors}
                        fill="url(#appleRedGradient)"
                        strokeWidth={2.5}
                      />
                    )}
                    {filterMode === 'all' && (
                      <Area
                        type="monotone"
                        dataKey="warnings"
                        name="Warnings"
                        stroke={COLORS.warnings}
                        fill="none"
                        strokeWidth={2}
                        strokeDasharray="4 3"
                      />
                    )}
                  </AreaChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#86868b', fontSize: 12 }}
                      axisLine={{ stroke: '#e5e5ea' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#86868b', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<AppleCustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '0.82rem', paddingTop: '10px' }} />

                    {(filterMode === 'all' || filterMode === 'total') && (
                      <Bar dataKey="total" name="Total Logs" fill={COLORS.total} radius={[6, 6, 0, 0]} />
                    )}
                    {(filterMode === 'all' || filterMode === 'errors') && (
                      <Bar dataKey="errors" name="Errors" fill={COLORS.errors} radius={[6, 6, 0, 0]} />
                    )}
                    {filterMode === 'all' && (
                      <Bar dataKey="warnings" name="Warnings" fill={COLORS.warnings} radius={[6, 6, 0, 0]} />
                    )}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Level Distribution Donut Card */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                <Layers size={18} color="var(--accent-purple)" />
                <span>Log Severity Distribution</span>
              </div>
              <div className="card-subtitle">
                Proportional breakdown of log event severities
              </div>
            </div>
          </div>

          {sLoading ? (
            <Skeleton type="chart" />
          ) : pieData.length === 0 ? (
            <EmptyState icon="🥧" title="No Severity Data" text="Run the processing pipeline to see severity distributions." />
          ) : (
            <div className="chart-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ResponsiveContainer width="55%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={68}
                    outerRadius={105}
                    paddingAngle={4}
                    dataKey="value"
                    nameKey="name"
                    stroke="#ffffff"
                    strokeWidth={2}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: unknown) =>
                      typeof v === 'number' ? `${v.toLocaleString()} logs` : String(v ?? '')
                    }
                  />
                </PieChart>
              </ResponsiveContainer>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 24, flex: 1 }}>
                {pieData.map((d) => {
                  const total = summary?.total_records || 1;
                  const pct = ((d.value / total) * 100).toFixed(1);
                  return (
                    <div
                      key={d.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: 'var(--bg-surface)',
                        borderRadius: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: d.color }} />
                        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {d.name}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          {d.value.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {pct}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
