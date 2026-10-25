import { useState, useEffect } from 'react';
import { getAnomalies } from '../services/api';
import { AnomalyRecord } from '../services/api';
import { Skeleton, EmptyState, ErrorBanner, AnomalyBadge, Pagination } from '../components/ui';

export default function Anomalies() {
  const [records, setRecords] = useState<AnomalyRecord[]>([]);
  const [total, setTotal]     = useState(0);
  const [pages, setPages]     = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [page, setPage]         = useState(1);
  const [pageSize]               = useState(50);
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAnomalies({ page, page_size: pageSize, anomaly_type: typeFilter || undefined })
      .then(res => {
        if (!cancelled) {
          setRecords(res.records);
          setTotal(res.total);
          setPages(res.pages);
        }
      })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, pageSize, typeFilter]);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">⚠️ Anomaly Explorer</h1>
        <p className="page-subtitle">Detected error spikes and anomalous block patterns</p>
      </div>

      <div className="alert alert-info" style={{ marginBottom: 20 }}>
        <span>ℹ️</span>
        <div>
          <strong>Two types of anomalies:</strong>
          <ul style={{ marginTop: 4, paddingLeft: 16, fontSize: '0.85rem' }}>
            <li><strong>Error Spikes</strong> — hourly windows where error count z-score exceeds threshold (3σ)</li>
            <li><strong>Block Anomalies</strong> — HDFS blocks containing at least one ERROR/FATAL log record</li>
          </ul>
        </div>
      </div>

      <div className="filter-bar">
        <select id="anomaly-type-filter" className="filter-select" value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
          <option value="">All Types</option>
          <option value="spike">Error Spikes</option>
          <option value="block">Block Anomalies</option>
        </select>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => setPage(p => p)} />}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Date/Block</th>
                <th>Hour</th>
                <th>Errors</th>
                <th>Z-Score / Total</th>
                <th>Prediction</th>
                <th>Ground Truth</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 14, borderRadius: 4 }} /></td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr><td colSpan={8}>
                  <EmptyState icon="🔍" title="No anomalies found"
                    text="Run the anomaly pipeline to detect error spikes and block anomalies." />
                </td></tr>
              ) : records.map((rec, i) => (
                <tr key={i}>
                  <td><AnomalyBadge type={rec.anomaly_type ?? ''} /></td>
                  <td className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {rec.anomaly_type === 'spike'
                      ? rec.date_parsed ?? '—'
                      : (rec.block_id ? rec.block_id.slice(0, 22) + '…' : '—')}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{rec.hour ?? '—'}</td>
                  <td style={{ color: rec.errors && rec.errors > 0 ? 'var(--accent-red)' : 'var(--text-primary)', fontWeight: 600 }}>
                    {rec.errors ?? rec.error_count ?? '—'}
                  </td>
                  <td className="mono" style={{ fontSize: '0.8rem' }}>
                    {rec.z_score != null
                      ? <span style={{ color: rec.z_score > 3 ? '#ef4444' : 'var(--text-secondary)' }}>{rec.z_score.toFixed(3)}</span>
                      : rec.total_count ?? '—'}
                  </td>
                  <td>
                    {rec.predicted_label
                      ? <AnomalyBadge type={rec.predicted_label} />
                      : (rec.is_spike === 'true' ? <AnomalyBadge type="Anomaly" /> : <AnomalyBadge type="Normal" />)}
                  </td>
                  <td>
                    {rec.gt_label
                      ? <AnomalyBadge type={rec.gt_label} />
                      : <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>N/A</span>}
                  </td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {rec.anomaly_type === 'spike'
                      ? `z-score > 3σ (hourly error spike)`
                      : `Block contains ERROR/FATAL logs`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && total > 0 && (
          <div style={{ padding: '0 16px 16px' }}>
            <Pagination page={page} pages={pages} total={total} pageSize={pageSize} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
