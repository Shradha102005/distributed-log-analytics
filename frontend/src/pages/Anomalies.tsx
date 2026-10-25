import { useState, useEffect } from 'react';
import {
  AlertTriangle, Search, X, Eye, ShieldAlert
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
    <div className="page page-animated">
      <div className="page-header">
        <h1 className="page-title">Anomaly Detection</h1>
        <p className="page-subtitle">
          Statistical 3σ error spikes and block-level HDFS failure classification compared against ground truth.
        </p>
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
        <SegmentedControl
          value={gtConfirmed === undefined ? 'all' : gtConfirmed ? 'verified' : 'fp'}
          onChange={(val) => {
            if (val === 'all') setGtConfirmed(undefined);
            else if (val === 'verified') setGtConfirmed(true);
            else setGtConfirmed(false);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All GT' },
            { value: 'verified', label: 'Verified Anomaly' },
            { value: 'fp', label: 'False Positives' },
          ]}
        />

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

        {(typeFilter !== 'all' || gtConfirmed !== undefined || searchBlock) && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setTypeFilter('all');
              setGtConfirmed(undefined);
              setSearchBlock('');
              setPage(1);
            }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={() => setPage((p) => p)} />}

      {/* Anomalies Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 130 }}>Classification</th>
                <th style={{ width: 220 }}>Identifier / Timestamp</th>
                <th style={{ width: 100 }}>Hour</th>
                <th style={{ width: 100 }}>Errors</th>
                <th style={{ width: 160 }}>Metric / Z-Score</th>
                <th style={{ width: 150 }}>Model Prediction</th>
                <th style={{ width: 150 }}>Ground Truth</th>
                <th style={{ width: 90, textAlign: 'center' }}>Inspect</th>
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
                      icon={<ShieldAlert size={38} strokeWidth={1.5} color="var(--text-dim)" />}
                      title="No Anomalies Match Filters"
                      text="No records matched your current classification criteria or search query."
                      action={{
                        label: 'Reset Filters',
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
                displayedRecords.map((r, i) => (
                  <tr
                    key={r.block_id || `${r.date_parsed}-${r.hour}-${i}`}
                    onClick={() => setInspectRecord(r)}
                  >
                    <td>
                      <AnomalyBadge type={r.anomaly_type ?? 'anomaly'} />
                    </td>

                    <td>
                      {r.block_id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="mono" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                            {r.block_id.length > 20 ? `${r.block_id.slice(0, 20)}…` : r.block_id}
                          </span>
                          <CopyButton text={r.block_id} />
                        </div>
                      ) : (
                        <span className="mono" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          {r.date_parsed ?? '—'}
                        </span>
                      )}
                    </td>

                    <td style={{ color: 'var(--text-muted)' }}>
                      {r.hour != null ? `${r.hour.toString().padStart(2, '0')}:00` : '—'}
                    </td>

                    <td>
                      <span
                        style={{
                          fontWeight: 700,
                          color: (r.errors ?? r.error_count ?? 0) > 0 ? 'var(--accent-red-text)' : 'inherit',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {r.errors ?? r.error_count ?? 0}
                      </span>
                    </td>

                    <td>
                      {r.z_score != null ? (
                        <span
                          className="code-pill mono"
                          style={{
                            color: 'var(--accent-red-text)',
                            background: 'var(--accent-red-tint)',
                            borderColor: 'rgba(255, 59, 48, 0.2)',
                          }}
                        >
                          {r.z_score.toFixed(2)}σ
                        </span>
                      ) : r.total_count != null ? (
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          {r.total_count} total logs
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td>
                      <span className="badge badge-error">
                        {r.predicted_label ?? 'Anomaly'}
                      </span>
                    </td>

                    <td>
                      {r.gt_label ? (
                        r.gt_label === 'Anomaly' ? (
                          <span className="badge badge-normal">Verified Anomaly</span>
                        ) : (
                          <span className="badge badge-warn">Normal (FP)</span>
                        )
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Unlabeled</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn btn-ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectRecord(r);
                        }}
                        style={{ padding: '4px 8px', borderRadius: '6px' }}
                        title="View diagnosis"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Server Pagination */}
        <div style={{ padding: '0 20px 16px' }}>
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
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 600 }}>
                  Diagnostic Anomaly Report
                </h3>
              </div>
              <button onClick={() => setInspectRecord(null)} className="modal-close-btn" aria-label="Close">
                <X size={16} />
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
              <button className="btn btn-secondary" onClick={() => setInspectRecord(null)}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
