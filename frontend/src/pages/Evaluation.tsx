import { useFetch } from '../hooks/useFetch';
import { getMetrics } from '../services/api';
import { Skeleton, EmptyState, ErrorBanner } from '../components/ui';

function ConfusionMatrix({ TP, FP, TN, FN }: { TP: number; FP: number; TN: number; FN: number }) {
  const max = Math.max(TP, FP, TN, FN, 1);
  const opacity = (v: number) => 0.15 + (v / max) * 0.7;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxWidth: 340 }}>
      <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', gridColumn: '1/-1', paddingBottom: 4 }}>
        <span style={{ float: 'left', paddingLeft: 80 }}>Predicted: <strong>Anomaly</strong></span>
        <span style={{ float: 'right', paddingRight: 20 }}>Predicted: <strong>Normal</strong></span>
        <div style={{ clear: 'both' }} />
      </div>
      {([
        { label: 'True\nPositive', value: TP, color: '#10b981', row: 'Anomaly' },
        { label: 'False\nNegative', value: FN, color: '#ef4444', row: '' },
        { label: 'False\nPositive', value: FP, color: '#f59e0b', row: 'Normal' },
        { label: 'True\nNegative', value: TN, color: '#10b981', row: '' },
      ] as Array<{label:string; value:number; color:string; row:string}>).map(({ label, value, color, row }, i) => (
        <div key={i} style={{ position: 'relative' }}>
          {row && (
            <div style={{
              position: 'absolute', left: -70, top: '50%', transform: 'translateY(-50%)',
              fontSize: '0.68rem', color: 'var(--text-muted)', width: 60, textAlign: 'right'
            }}>
              Actual:<br /><strong>{row}</strong>
            </div>
          )}
          <div style={{
            background: color,
            opacity: opacity(value),
            borderRadius: 8,
            padding: '20px 16px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fff', opacity: 1 / opacity(value) * 0.9 }}>
              {value.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#fff', opacity: 1 / opacity(value) * 0.8, whiteSpace: 'pre-line', marginTop: 4 }}>
              {label}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Evaluation() {
  const { data, loading, error, refetch } = useFetch(getMetrics, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">🎯 Evaluation Metrics</h1>
        <p className="page-subtitle">Block-level anomaly detection performance against ground truth</p>
      </div>

      {/* Methodology note */}
      <div className="alert alert-warning" style={{ marginBottom: 20 }}>
        <span>⚠️</span>
        <div>
          <strong>Important: Block-Level Evaluation Only</strong>
          <p style={{ marginTop: 4, fontSize: '0.85rem' }}>
            The LogHub HDFS v1 ground truth (anomaly_label.csv) labels <em>blocks</em> (BlockId),
            not individual log lines. Record-level evaluation is not valid — a single anomalous block
            may contain many INFO messages. All metrics here are computed at the <strong>block level</strong>.
          </p>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={refetch} />}

      {loading ? (
        <div className="card"><Skeleton type="chart" /></div>
      ) : !data?.data_ready ? (
        <div className="card">
          <EmptyState
            icon="📊"
            title="Evaluation not yet run"
            text="Run the pipeline with the anomaly_label.csv ground truth file to see precision, recall, and F1 metrics."
          />
          <div style={{ marginTop: 24, padding: '0 20px 20px' }}>
            <div className="alert alert-info">
              <span>💡</span>
              <div>
                <strong>How to generate evaluation metrics:</strong>
                <ol style={{ marginTop: 8, paddingLeft: 16, fontSize: '0.85rem', lineHeight: 2 }}>
                  <li>Download the full LogHub HDFS v1 dataset (includes anomaly_label.csv)</li>
                  <li>Run: <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: 4 }}>python pipeline/run_pipeline.py --sample</code></li>
                  <li>The anomaly pipeline will automatically detect and load anomaly_label.csv</li>
                  <li>Evaluation metrics will appear here after the pipeline completes</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Key metrics */}
          <div className="metric-grid" style={{ marginBottom: 28 }}>
            {[
              { label: 'Precision', value: data.precision, desc: 'TP / (TP + FP)' },
              { label: 'Recall',    value: data.recall,    desc: 'TP / (TP + FN)' },
              { label: 'F1 Score',  value: data.f1_score,  desc: '2 × P × R / (P + R)' },
              { label: 'Accuracy',  value: data.accuracy,  desc: '(TP + TN) / Total' },
            ].map(({ label, value, desc }) => (
              <div key={label} className="metric-box">
                <div className="metric-value" style={{
                  color: value != null && value > 0.8 ? 'var(--accent-green)' :
                         value != null && value > 0.6 ? 'var(--accent-yellow)' : 'var(--accent-red)'
                }}>
                  {value != null ? (value * 100).toFixed(1) + '%' : '—'}
                </div>
                <div className="metric-label">{label}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{desc}</div>
              </div>
            ))}
          </div>

          <div className="charts-grid">
            {/* Confusion matrix */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Confusion Matrix (Block Level)</span>
              </div>
              <div style={{ paddingLeft: 80, paddingTop: 20, paddingBottom: 10 }}>
                <ConfusionMatrix
                  TP={data.TP ?? 0} FP={data.FP ?? 0}
                  TN={data.TN ?? 0} FN={data.FN ?? 0}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Evaluation Summary</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { label: 'Evaluated Blocks',   value: data.evaluated_blocks },
                  { label: 'GT Anomaly Blocks',  value: data.gt_anomaly_blocks },
                  { label: 'GT Normal Blocks',   value: data.gt_normal_blocks },
                  { label: 'True Positives',     value: data.TP },
                  { label: 'False Positives',    value: data.FP },
                  { label: 'True Negatives',     value: data.TN },
                  { label: 'False Negatives',    value: data.FN },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{label}</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {value?.toLocaleString() ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
              {data.note && (
                <div style={{ marginTop: 20, padding: 12, background: 'var(--bg-surface)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {data.note}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
