import { useState, useEffect } from 'react';
import {
  AlertTriangle, Activity, Search, X, CheckCircle,
  HelpCircle, Eye, ShieldAlert, Sparkles
} from 'lucide-react';
import { getAnomalies, AnomalyRecord } from '../services/api';
import { Skeleton, EmptyState, ErrorBanner, AnomalyBadge, Pagination, CopyButton, SegmentedControl } from '../components/ui';

export default function Anomalies() {
  const [records, setRecords] = useState<AnomalyRecord[]>([]);
  const [total, setTotal]     = useState(0);
  const [pages, setPages]     = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [page, setPage]               = useState(1);
  const [pageSize]                     = useState(50);
  const [typeFilter, setTypeFilter]   = useState<'all' | 'spike' | 'block'>('all');
  const [gtConfirmed, setGtConfirmed] = useState<boolean | undefined>(undefined);
  const [searchBlock, setSearchBlock] = useState('');

  // Selected anomaly inspection
  const [inspectRecord, setInspectRecord] = useState<AnomalyRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAnomalies({
      page,
      page_size: pageSize,
      anomaly_type: typeFilter === 'all' ? undefined : typeFilter,
      is_confirmed: gtConfirmed,
    })
      .then((res) => {
        if (!cancelled) {
          setRecords(res.records || []);
          setTotal(res.total || 0);
          setPages(res.pages || 1);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, typeFilter, gtConfirmed]);

  // Client-side block search filter if user searches
  const displayedRecords = searchBlock.trim()
    ? records.filter((r) => r.block_id?.toLowerCase().includes(searchBlock.toLowerCase()))
    : records;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Anomaly Intelligence</h1>
        <p className="page-subtitle">
          Statistical 3σ error spike detection and block-level HDFS failure classification compared against ground truth.
        </p>
      </div>

      {/* Apple Info Guide Banner */}
      <div
        className="alert"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '18px',
          boxShadow: 'var(--shadow-subtle)',
          padding: '18px 22px',
        }}
      >
        <Sparkles size={20} color="var(--accent-blue)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            Dual-Layer Anomaly Detection Model
          </div>
          <div style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong>1. Hourly Error Spikes:</strong> Calculates rolling Z-score across 1-hour temporal bins. Flags intervals exceeding <strong>3.0σ</strong> above baseline.
            <br />
            <strong>2. HDFS Block Sessions:</strong> Correlates all log operations tied to each unique <code className="code-pill">blk_*</code> ID. Identifies abnormal block lifecycles and validates with <code className="code-pill">anomaly_label.csv</code>.
          </div>
        </div>
      </div>

      {/* Filter and Switcher Controls */}
      <div className="filter-bar">
        {/* Segmented Type Filter */}
        <SegmentedControl
          value={typeFilter}
          onChange={(val) => {
            setTypeFilter(val);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All Anomalies' },
            { value: 'spike', label: 'Error Spikes (3σ)' },
            { value: 'block', label: 'Block Failures' },
          ]}
        />

        {/* Ground Truth Filter */}
        <div className="segmented-control">
          <button
            className={`segment-btn ${gtConfirmed === undefined ? 'active' : ''}`}
            onClick={() => { setGtConfirmed(undefined); setPage(1); }}
          >
            All GT
          </button>
          <button
            className={`segment-btn ${gtConfirmed === true ? 'active' : ''}`}
            onClick={() => { setGtConfirmed(true); setPage(1); }}
          >
            Verified Anomaly
          </button>
          <button
            className={`segment-btn ${gtConfirmed === false ? 'active' : ''}`}
            onClick={() => { setGtConfirmed(false); setPage(1); }}
          >
            False Positives
          </button>
        </div>

        {/* Search Block ID */}
        <div className="search-input-wrapper" style={{ flex: 1, maxWidth: 320 }}>
          <Search size={15} style={{ position: 'absolute', left: 14, color: 'var(--text-muted)' }} />
          <input
            className="search-input"
            style={{ width: '100%' }}
            placeholder="Search block ID..."
            value={searchBlock}
            onChange={(e) => setSearchBlock(e.target.value)}
          />
          {searchBlock && (
            <button
              onClick={() => setSearchBlock('')}
              style={{
                position: 'absolute',
                right: 12,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => setPage((p) => p)} />}

      {/* Main Anomalies Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 130 }}>Classification</th>
                <th style={{ width: 220 }}>Identifier / Timestamp</th>
                <th style={{ width: 100 }}>Hour</th>
                <th style={{ width: 110 }}>Errors</th>
                <th style={{ width: 140 }}>Metric / Z-Score</th>
                <th style={{ width: 130 }}>Model Prediction</th>
                <th style={{ width: 130 }}>Ground Truth</th>
                <th style={{ width: 80, textAlign: 'center' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j}>
                        <div className="skeleton" style={{ height: 16, borderRadius: 6 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : displayedRecords.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon="🛡️"
                      title="No Anomalies Match Criteria"
                      text="No anomalies were detected matching your current filters. Try selecting 'All Anomalies' or resetting your filters."
                      action={{
                        label: 'Show All Anomalies',
                        onClick: () => {
                          setTypeFilter('all');
                          setGtConfirmed(undefined);
                          setSearchBlock('');
                          setPage(1);
                        },
                      }}
                    />
                  </td>
                </tr>
              ) : (
                displayedRecords.map((rec, i) => (
                  <tr
                    key={i}
                    onClick={() => setInspectRecord(rec)}
                    title="Click to view detailed diagnostics"
                  >
                    <td>
                      <AnomalyBadge type={rec.anomaly_type ?? 'anomaly'} />
                    </td>
                    <td>
                      {rec.anomaly_type === 'spike' ? (
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {rec.date_parsed ?? '—'}
                        </span>
                      ) : (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span className="code-pill mono" style={{ fontSize: '0.78rem' }}>
                            {rec.block_id ? (rec.block_id.length > 18 ? rec.block_id.slice(0, 16) + '…' : rec.block_id) : '—'}
                          </span>
                          {rec.block_id && <CopyButton text={rec.block_id} />}
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {rec.hour != null ? `${rec.hour.toString().padStart(2, '0')}:00` : '—'}
                    </td>
                    <td>
                      <span
                        style={{
                          fontWeight: 700,
                          color: (rec.errors || rec.error_count) ? 'var(--accent-red)' : 'var(--text-primary)',
                        }}
                      >
                        {rec.errors ?? rec.error_count ?? 0}
                      </span>
                    </td>
                    <td>
                      {rec.z_score != null ? (
                        <span className="mono" style={{ fontWeight: 600, color: rec.z_score > 3 ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                          {rec.z_score.toFixed(2)}σ
                        </span>
                      ) : rec.total_count != null ? (
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          {rec.total_count} total logs
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: rec.predicted_label === 'Anomaly' ? 'var(--accent-red-tint)' : 'var(--accent-green-tint)',
                          color: rec.predicted_label === 'Anomaly' ? 'var(--accent-red-text)' : 'var(--accent-green-text)',
                        }}
                      >
                        {rec.predicted_label ?? (rec.is_spike ? 'Spike' : 'Normal')}
                      </span>
                    </td>
                    <td>
                      {rec.gt_label ? (
                        <span
                          className="badge"
                          style={{
                            background: rec.gt_label === 'Anomaly' ? 'var(--accent-red-tint)' : 'var(--accent-green-tint)',
                            color: rec.gt_label === 'Anomaly' ? 'var(--accent-red-text)' : 'var(--accent-green-text)',
                          }}
                        >
                          {rec.gt_label}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>Unlabeled</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="btn btn-ghost" style={{ padding: '4px' }}>
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
          <Pagination
            page={page}
            pages={pages}
            total={total}
            pageSize={pageSize}
            onPageChange={(p) => setPage(p)}
          />
        </div>
      </div>

      {/* Apple-style Inspection Dialog */}
      {inspectRecord && (
        <div className="modal-overlay" onClick={() => setInspectRecord(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AnomalyBadge type={inspectRecord.anomaly_type ?? 'anomaly'} />
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700 }}>
                  Diagnostic Anomaly Report
                </h3>
              </div>
              <button onClick={() => setInspectRecord(null)} className="btn btn-ghost" style={{ padding: 6, borderRadius: '50%' }}>
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 14,
                padding: '20px',
                background: 'var(--bg-surface)',
                borderRadius: '16px',
                marginBottom: 20,
              }}
            >
              <div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Anomaly Type
                </div>
                <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                  {inspectRecord.anomaly_type === 'spike' ? 'Temporal Z-Score Spike' : 'Block Lifecycle Failure'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Error Count
                </div>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--accent-red)', marginTop: 2 }}>
                  {inspectRecord.errors ?? inspectRecord.error_count ?? 0} errors
                </div>
              </div>

              {inspectRecord.block_id && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                    HDFS Block Identifier
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span className="code-pill mono" style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                      {inspectRecord.block_id}
                    </span>
                    <CopyButton text={inspectRecord.block_id} label="Copy" />
                  </div>
                </div>
              )}

              {inspectRecord.z_score != null && (
                <div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Z-Score Deviation
                  </div>
                  <div className="mono" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-red)', marginTop: 2 }}>
                    {inspectRecord.z_score.toFixed(3)}σ (Threshold: &gt; 3.0σ)
                  </div>
                </div>
              )}

              <div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Ground Truth Comparison
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: 2 }}>
                  {inspectRecord.gt_label ? (
                    inspectRecord.gt_label === 'Anomaly' ? (
                      <span style={{ color: 'var(--accent-green-text)' }}>✓ Confirmed True Positive</span>
                    ) : (
                      <span style={{ color: 'var(--accent-yellow-text)' }}>⚠️ False Positive vs Ground Truth</span>
                    )
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>No Ground Truth Label Available</span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-primary" onClick={() => setInspectRecord(null)}>
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
