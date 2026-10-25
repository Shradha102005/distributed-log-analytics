import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, ScatterChart, Scatter
} from 'recharts';
import { useFetch } from '../hooks/useFetch';
import { getComponents, getEvents } from '../services/api';
import { Skeleton, EmptyState, ErrorBanner, LevelBadge } from '../components/ui';

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '12px 16px', fontSize: '0.82rem'
    }}>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 4 }}>
          {p.name}: <strong>{p.value?.toLocaleString()}</strong>
        </div>
      ))}
    </div>
  );
};

export default function Analytics() {
  const { data: comps, loading: cLoading, error: cError, refetch: cRefetch } = useFetch(
    () => getComponents({ limit: 15, order_by: 'errors' }), []
  );
  const { data: events, loading: eLoading, error: eError } = useFetch(
    () => getEvents({ limit: 30 }), []
  );

  // Shorten component names for chart readability
  const compChartData = (comps?.data ?? []).map(c => ({
    name: c.component.split('.').pop() ?? c.component,
    fullName: c.component,
    errors: c.errors,
    warnings: c.warnings,
    infos: c.infos,
    total: c.total,
  }));

  const radarData = (comps?.data ?? []).slice(0, 6).map(c => ({
    subject: c.component.split('.').pop() ?? c.component,
    errors: c.errors,
    warnings: c.warnings,
  }));

  const eventsData = (events?.data ?? []).slice(0, 15).map(e => ({
    pattern: e.event_pattern.slice(0, 40) + (e.event_pattern.length > 40 ? '…' : ''),
    count: e.count,
    level: e.level,
    is_rare: e.is_rare,
  }));

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">📊 Component & Event Analytics</h1>
        <p className="page-subtitle">Error distribution by component and frequent event patterns</p>
      </div>

      {/* Component error bar chart */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Most Error-Prone Components</span>
        </div>
        {cLoading ? <Skeleton type="chart" /> :
         cError   ? <ErrorBanner message={cError} onRetry={cRefetch} /> :
         compChartData.length === 0 ? <EmptyState icon="📦" title="No component data" text="Run the pipeline first." /> : (
          <div className="chart-container" style={{ height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compChartData} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,143,255,0.08)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={160} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="errors"   name="Errors"   fill="#ef4444" radius={[0,4,4,0]} />
                <Bar dataKey="warnings" name="Warnings" fill="#f59e0b" radius={[0,4,4,0]} />
                <Bar dataKey="infos"    name="Info"     fill="#3b82f6" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="charts-grid">
        {/* Radar chart */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Error vs Warning Radar (Top 6 Components)</span>
          </div>
          {cLoading ? <Skeleton type="chart" /> :
           radarData.length === 0 ? <EmptyState icon="🕸️" title="No data" text="Run the pipeline." /> : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(99,143,255,0.12)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <PolarRadiusAxis tick={{ fill: '#4a5568', fontSize: 9 }} />
                  <Radar name="Errors" dataKey="errors" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
                  <Radar name="Warnings" dataKey="warnings" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                  <Tooltip content={<CustomTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Event frequency table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-header" style={{ padding: '20px 24px 0' }}>
            <span className="card-title">Top Event Patterns</span>
          </div>
          {eLoading ? (
            <div style={{ padding: 20 }}><Skeleton type="text" count={8} /></div>
          ) : eError ? (
            <div style={{ padding: 20 }}><ErrorBanner message={eError} /></div>
          ) : eventsData.length === 0 ? (
            <EmptyState icon="🎯" title="No event data" text="Run the pipeline." />
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Event Pattern</th>
                    <th>Level</th>
                    <th>Count</th>
                    <th>Rare?</th>
                  </tr>
                </thead>
                <tbody>
                  {eventsData.map((ev, i) => (
                    <tr key={i}>
                      <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.82rem' }}>
                        {ev.pattern}
                      </td>
                      <td><LevelBadge level={ev.level} /></td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {ev.count.toLocaleString()}
                      </td>
                      <td>
                        {ev.is_rare === 'true'
                          ? <span className="badge badge-error">rare</span>
                          : <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>common</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
