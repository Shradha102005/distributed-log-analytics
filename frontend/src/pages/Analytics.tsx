import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Legend
} from 'recharts';
import {
  Package, Search, SlidersHorizontal, Layers
} from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import { getComponents, getEvents } from '../services/api';
import { Skeleton, EmptyState, ErrorBanner, LevelBadge, SegmentedControl, CopyButton } from '../components/ui';

interface TooltipPayloadItem {
  dataKey: string;
  name: string;
  value: number;
  color: string;
}

const AppleCustomTooltip = ({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="apple-tooltip">
      {payload.map((p) => (
        <div key={p.dataKey} className="apple-tooltip-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
            <span style={{ color: 'var(--text-secondary)' }}>{p.name}</span>
          </div>
          <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {p.value?.toLocaleString()}
          </strong>
        </div>
      ))}
    </div>
  );
};

export default function Analytics() {
  const [componentOrder, setComponentOrder] = useState<'errors' | 'warnings' | 'total'>('errors');
  const [compSearch, setCompSearch] = useState('');
  const [eventSearch, setEventSearch] = useState('');
  const [isRareFilter, setIsRareFilter] = useState<boolean | undefined>(undefined);

  const { data: comps, loading: cLoading, error: cError, refetch: cRefetch } = useFetch(
    () => getComponents({ limit: 20, order_by: componentOrder }),
    [componentOrder]
  );

  const { data: events, loading: eLoading, error: eError } = useFetch(
    () => getEvents({ limit: 40, is_rare: isRareFilter }),
    [isRareFilter]
  );

  // Shorten and filter component names
  const rawComps = comps?.data ?? [];
  const filteredComps = compSearch.trim()
    ? rawComps.filter((c) => c.component.toLowerCase().includes(compSearch.toLowerCase()))
    : rawComps;

  const compChartData = filteredComps.slice(0, 14).map((c) => ({
    name: c.component.split('.').pop() ?? c.component,
    fullName: c.component,
    errors: c.errors,
    warnings: c.warnings,
    infos: c.infos,
    total: c.total,
  }));

  const radarData = (comps?.data ?? []).slice(0, 6).map((c) => ({
    subject: c.component.split('.').pop() ?? c.component,
    errors: c.errors,
    warnings: c.warnings,
  }));

  // Filter events
  const rawEvents = events?.data ?? [];
  const filteredEvents = eventSearch.trim()
    ? rawEvents.filter((e) => e.event_pattern.toLowerCase().includes(eventSearch.toLowerCase()))
    : rawEvents;

  return (
    <div className="page page-animated">
      <div className="page-header">
        <h1 className="page-title">Component Analytics</h1>
        <p className="page-subtitle">
          Decompose failures across HDFS subsystem modules, daemon threads, and frequent regex event clusters.
        </p>
      </div>

      {/* Component Breakdown Card */}
      <div className="card" style={{ marginBottom: 26 }}>
        <div className="card-header" style={{ flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div className="card-title">
              <Package size={18} color="var(--accent-blue)" strokeWidth={2} />
              <span>Subsystem Component Rankings</span>
            </div>
            <div className="card-subtitle">
              Ranked by error frequency, warning counts, or total message volume
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Search Component */}
            <div className="search-input-wrapper">
              <Search size={14} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)' }} />
              <input
                className="search-input"
                style={{ padding: '8px 14px 8px 32px', minWidth: 200, fontSize: '0.82rem' }}
                placeholder="Filter component..."
                value={compSearch}
                onChange={(e) => setCompSearch(e.target.value)}
              />
            </div>

            {/* Segmented Ordering */}
            <SegmentedControl
              value={componentOrder}
              onChange={setComponentOrder}
              options={[
                { value: 'errors', label: 'Top Errors' },
                { value: 'warnings', label: 'Top Warnings' },
                { value: 'total', label: 'Volume' },
              ]}
            />
          </div>
        </div>

        {cLoading ? (
          <Skeleton type="chart" />
        ) : cError ? (
          <ErrorBanner message={cError} onRetry={cRefetch} />
        ) : compChartData.length === 0 ? (
          <EmptyState
            icon={<Package size={38} strokeWidth={1.5} color="var(--text-dim)" />}
            title="No Component Data Found"
            text="Try clearing your search or running the pipeline."
          />
        ) : (
          <div className="chart-container" style={{ height: 380 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compChartData} layout="vertical" margin={{ left: 30, right: 25, top: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f4" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: '#86868b', fontSize: 12 }}
                  axisLine={{ stroke: 'rgba(0,0,0,0.06)' }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: '#1d1d1f', fontSize: 12, fontWeight: 500 }}
                  width={170}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<AppleCustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '0.82rem', paddingTop: '10px' }} />
                <Bar dataKey="errors"   name="Errors"   fill="#ff3b30" radius={[0, 6, 6, 0]} />
                <Bar dataKey="warnings" name="Warnings" fill="#ff9500" radius={[0, 6, 6, 0]} />
                <Bar dataKey="infos"    name="Info"     fill="#0071e3" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Grid: Radar vs Event Patterns */}
      <div className="charts-grid">
        {/* Radar Comparison Card */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                <SlidersHorizontal size={18} color="var(--accent-purple)" strokeWidth={2} />
                <span>Error vs Warning Radar Profile</span>
              </div>
              <div className="card-subtitle">
                Multi-axis comparison across top active subsystems
              </div>
            </div>
          </div>

          {cLoading ? (
            <Skeleton type="chart" />
          ) : radarData.length === 0 ? (
            <EmptyState
              icon={<SlidersHorizontal size={38} strokeWidth={1.5} color="var(--text-dim)" />}
              title="No Radar Profile"
              text="Pipeline dataset needed."
            />
          ) : (
            <div className="chart-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e5e5ea" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#424245', fontSize: 11, fontWeight: 500 }} />
                  <PolarRadiusAxis stroke="#d2d2d7" angle={30} domain={[0, 'auto']} />
                  <Radar name="Errors" dataKey="errors" stroke="#ff3b30" fill="#ff3b30" fillOpacity={0.25} />
                  <Radar name="Warnings" dataKey="warnings" stroke="#ff9500" fill="#ff9500" fillOpacity={0.2} />
                  <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Frequent and Rare Event Patterns */}
        <div className="card">
          <div className="card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div className="card-title">
                <Layers size={18} color="var(--accent-blue)" strokeWidth={2} />
                <span>Event Pattern Clusters</span>
              </div>
              <div className="card-subtitle">
                Template signatures extracted by Spark regex tokenizer
              </div>
            </div>

            {/* Rare toggle */}
            <SegmentedControl
              value={isRareFilter === undefined ? 'all' : isRareFilter ? 'rare' : 'frequent'}
              onChange={(val) => {
                if (val === 'all') setIsRareFilter(undefined);
                else if (val === 'rare') setIsRareFilter(true);
                else setIsRareFilter(false);
              }}
              options={[
                { value: 'all', label: 'All Patterns' },
                { value: 'rare', label: 'Rare Only' },
                { value: 'frequent', label: 'Frequent' },
              ]}
            />
          </div>

          {/* Quick Pattern Search */}
          <div style={{ marginBottom: 16 }}>
            <div className="search-input-wrapper" style={{ width: '100%' }}>
              <Search size={14} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)' }} />
              <input
                className="search-input"
                style={{ width: '100%', padding: '8px 14px 8px 32px', fontSize: '0.82rem' }}
                placeholder="Search template patterns..."
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
              />
            </div>
          </div>

          {eLoading ? (
            <Skeleton type="chart" />
          ) : filteredEvents.length === 0 ? (
            <EmptyState
              icon={<Layers size={38} strokeWidth={1.5} color="var(--text-dim)" />}
              title="No Patterns Found"
              text="No event templates match your filter."
            />
          ) : (
            <div style={{ maxHeight: 290, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
              {filteredEvents.map((ev, i) => (
                <div
                  key={i}
                  style={{
                    padding: '12px 14px',
                    background: 'var(--bg-surface)',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    transition: 'var(--transition)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <LevelBadge level={ev.level} />
                      {ev.is_rare === 'true' && (
                        <span className="badge" style={{ background: 'var(--accent-purple-tint)', color: 'var(--accent-purple-text)' }}>
                          Rare Template
                        </span>
                      )}
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <strong>{ev.count.toLocaleString()}</strong> events ({((ev.fraction || 0) * 100).toFixed(2)}%)
                      </span>
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={ev.event_pattern}
                    >
                      {ev.event_pattern}
                    </div>
                  </div>
                  <CopyButton text={ev.event_pattern} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
