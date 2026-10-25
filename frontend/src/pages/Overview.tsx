import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import {
  Database, AlertCircle, AlertTriangle, CheckCircle2,
  Activity, BarChart2, TrendingUp, Layers
} from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import { getSummary, getTrends } from '../services/api';
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
        {label}
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

  const errorRate = summary?.total_records && summary?.error_count
    ? ((summary.error_count / summary.total_records) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="page page-animated">
      {/* Apple-style Page Title */}
      <div className="page-header">
        <h1 className="page-title">Cluster Overview</h1>
        <p className="page-subtitle">
          Real-time metrics, anomaly patterns, and stream health across your HDFS cluster.
        </p>
      </div>

      {sError && <ErrorBanner message={sError} onRetry={sRefetch} />}

      {/* Apple-style Metric Cards */}
      <div className="stats-grid">
        {/* Card 1: Total Records */}
        <div className="stat-card" onClick={() => navigate('/logs')} role="button" tabIndex={0}>
          <div className="stat-header">
            <span className="stat-title">Total Records</span>
            <div className="stat-icon-wrapper blue">
              <Database size={16} strokeWidth={2} />
            </div>
          </div>
          {sLoading ? (
            <Skeleton type="text" />
          ) : (
            <div>
              <div className="stat-value">{summary?.total_records?.toLocaleString() ?? '—'}</div>
              <div className="stat-caption">Parsed HDFS events</div>
            </div>
          )}
        </div>

        {/* Card 2: Error Records */}
        <div className="stat-card" onClick={() => navigate('/anomalies')} role="button" tabIndex={0}>
          <div className="stat-header">
            <span className="stat-title">Error Logs</span>
            <div className="stat-icon-wrapper red">
              <AlertCircle size={16} strokeWidth={2} />
            </div>
          </div>
          {sLoading ? (
            <Skeleton type="text" />
          ) : (
            <div>
              <div className="stat-value text-red">
                {summary?.error_count?.toLocaleString() ?? '0'}
              </div>
              <div className="stat-caption">{errorRate}% cluster error rate</div>
            </div>
          )}
        </div>

        {/* Card 3: Warning Events */}
        <div className="stat-card" onClick={() => navigate('/logs')} role="button" tabIndex={0}>
          <div className="stat-header">
            <span className="stat-title">Warning Events</span>
            <div className="stat-icon-wrapper orange">
              <AlertTriangle size={16} strokeWidth={2} />
            </div>
          </div>
          {sLoading ? (
            <Skeleton type="text" />
          ) : (
            <div>
              <div className="stat-value text-orange">{summary?.warn_count?.toLocaleString() ?? '0'}</div>
              <div className="stat-caption">Non-critical notices</div>
            </div>
          )}
        </div>

        {/* Card 4: Schema Validated */}
        <div className="stat-card" role="button" tabIndex={0}>
          <div className="stat-header">
            <span className="stat-title">Schema Integrity</span>
            <div className="stat-icon-wrapper green">
              <CheckCircle2 size={16} strokeWidth={2} />
            </div>
          </div>
          {sLoading ? (
            <Skeleton type="text" />
          ) : (
            <div>
              <div className="stat-value text-green">{parseRate}%</div>
              <div className="stat-caption">{summary?.parsed_ok?.toLocaleString() ?? '—'} valid records</div>
            </div>
          )}
        </div>

        {/* Card 5: Parse Failures */}
        <div className="stat-card" role="button" tabIndex={0}>
          <div className="stat-header">
            <span className="stat-title">Parse Failures</span>
            <div className="stat-icon-wrapper purple">
              <Activity size={16} strokeWidth={2} />
            </div>
          </div>
          {sLoading ? (
            <Skeleton type="text" />
          ) : (
            <div>
              <div className="stat-value">{summary?.parse_failed?.toLocaleString() ?? '0'}</div>
              <div className="stat-caption">Zero syntax dropouts</div>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Charts Section */}
      <div className="charts-grid">
        {/* Time-Series Trend Card */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                <TrendingUp size={18} color="var(--accent-blue)" strokeWidth={2} />
                <span>Log Volume & Activity Trends</span>
              </div>
              <div className="card-subtitle">
                Hourly throughput aggregation and error spike detection
              </div>
            </div>

            {/* Apple Segmented Controls */}
            <div className="card-controls">
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
                  { value: 'area', label: 'Area', icon: <TrendingUp size={12} strokeWidth={2} /> },
                  { value: 'bar', label: 'Column', icon: <BarChart2 size={12} strokeWidth={2} /> },
                ]}
              />
            </div>
          </div>

          {tLoading ? (
            <Skeleton type="chart" />
          ) : tError ? (
            <ErrorBanner message={tError} />
          ) : chartData.length === 0 ? (
            <EmptyState
              icon={<TrendingUp size={36} strokeWidth={1.5} color="var(--text-dim)" />}
              title="No Trend Data"
              text="Run the pipeline to generate time-series metrics."
            />
          ) : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'area' ? (
                  <AreaChart data={chartData} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="appleBlueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.total} stopOpacity={0.18} />
                        <stop offset="95%" stopColor={COLORS.total} stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="appleRedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.errors} stopOpacity={0.22} />
                        <stop offset="95%" stopColor={COLORS.errors} stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f4" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#86868b', fontSize: 12, fontFamily: 'Inter' }}
                      axisLine={{ stroke: 'rgba(0,0,0,0.06)' }}
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
                        strokeWidth={2}
                      />
                    )}
                    {(filterMode === 'all' || filterMode === 'errors') && (
                      <Area
                        type="monotone"
                        dataKey="errors"
                        name="Errors"
                        stroke={COLORS.errors}
                        fill="url(#appleRedGradient)"
                        strokeWidth={2}
                      />
                    )}
                    {filterMode === 'all' && (
                      <Area
                        type="monotone"
                        dataKey="warnings"
                        name="Warnings"
                        stroke={COLORS.warnings}
                        fill="none"
                        strokeWidth={1.8}
                        strokeDasharray="4 3"
                      />
                    )}
                  </AreaChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f4" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#86868b', fontSize: 12 }}
                      axisLine={{ stroke: 'rgba(0,0,0,0.06)' }}
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
                <Layers size={18} color="var(--accent-purple)" strokeWidth={2} />
                <span>Severity Distribution</span>
              </div>
              <div className="card-subtitle">
                Proportional breakdown of log event severities
              </div>
            </div>
          </div>

          {sLoading ? (
            <Skeleton type="chart" />
          ) : pieData.length === 0 ? (
            <EmptyState
              icon={<Layers size={36} strokeWidth={1.5} color="var(--text-dim)" />}
              title="No Severity Data"
              text="Run the processing pipeline to see severity distributions."
            />
          ) : (
            <div className="donut-chart-layout">
              <div className="donut-chart-container">
                <ResponsiveContainer width="100%" height="100%">
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
                      strokeWidth={3}
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
              </div>

              <div className="donut-legend-container">
                {pieData.map((d) => {
                  const total = summary?.total_records || 1;
                  const pct = ((d.value / total) * 100).toFixed(1);
                  return (
                    <div key={d.name} className="donut-legend-item">
                      <div className="donut-legend-left">
                        <div className="donut-legend-dot" style={{ background: d.color }} />
                        <span className="donut-legend-name">{d.name}</span>
                      </div>
                      <div className="donut-legend-right">
                        <span className="donut-legend-val">{d.value.toLocaleString()}</span>
                        <span className="donut-legend-pct">{pct}%</span>
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
