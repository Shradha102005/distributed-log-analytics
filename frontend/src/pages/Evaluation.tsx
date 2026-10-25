import { useState } from 'react';
import {
  Target, Award, ChevronDown, ChevronUp, Info, HelpCircle
} from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import { getMetrics } from '../services/api';
import { Skeleton, EmptyState, ErrorBanner } from '../components/ui';

interface ConfusionMatrixProps {
  TP: number;
  FP: number;
  TN: number;
  FN: number;
}

function AppleConfusionMatrix({ TP, FP, TN, FN }: ConfusionMatrixProps) {
  const [activeCell, setActiveCell] = useState<string | null>(null);

  const cells = [
    {
      id: 'tp',
      label: 'True Positive (TP)',
      desc: 'Correctly identified anomalous HDFS blocks',
      value: TP,
      bg: 'var(--accent-green-tint)',
      border: 'rgba(52, 199, 89, 0.25)',
      text: 'var(--accent-green-text)',
      actual: 'Anomaly',
      predicted: 'Anomaly',
    },
    {
      id: 'fn',
      label: 'False Negative (FN)',
      desc: 'Anomalous blocks missed by detector',
      value: FN,
      bg: 'var(--accent-red-tint)',
      border: 'rgba(255, 59, 48, 0.25)',
      text: 'var(--accent-red-text)',
      actual: 'Anomaly',
      predicted: 'Normal',
    },
    {
      id: 'fp',
      label: 'False Positive (FP)',
      desc: 'Normal blocks mistakenly flagged',
      value: FP,
      bg: 'var(--accent-yellow-tint)',
      border: 'rgba(255, 149, 0, 0.25)',
      text: 'var(--accent-yellow-text)',
      actual: 'Normal',
      predicted: 'Anomaly',
    },
    {
      id: 'tn',
      label: 'True Negative (TN)',
      desc: 'Correctly identified normal blocks',
      value: TN,
      bg: 'var(--accent-green-tint)',
      border: 'rgba(52, 199, 89, 0.25)',
      text: 'var(--accent-green-text)',
      actual: 'Normal',
      predicted: 'Normal',
    },
  ];

  return (
    <div style={{ maxWidth: 440, margin: '0 auto' }}>
      {/* Header labels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8, textAlign: 'center' }}>
        <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Predicted Anomaly
        </div>
        <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Predicted Normal
        </div>
      </div>

      {/* 2x2 Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {cells.map((cell) => (
          <div
            key={cell.id}
            onMouseEnter={() => setActiveCell(cell.id)}
            onMouseLeave={() => setActiveCell(null)}
            style={{
              background: cell.bg,
              border: `1px solid ${cell.border}`,
              borderRadius: '16px',
              padding: '20px 16px',
              textAlign: 'center',
              boxShadow: activeCell === cell.id ? 'var(--shadow-hover)' : 'var(--shadow-subtle)',
              transform: activeCell === cell.id ? 'translateY(-2px)' : 'none',
              transition: 'var(--transition)',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '2.2rem',
                fontWeight: 700,
                color: cell.text,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {cell.value.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: cell.text, marginTop: 8 }}>
              {cell.label}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Actual: <strong>{cell.actual}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Evaluation() {
  const { data, loading, error, refetch } = useFetch(getMetrics, []);
  const [showMethodology, setShowMethodology] = useState(false);

  return (
    <div className="page page-animated">
      <div className="page-header">
        <h1 className="page-title">Model Evaluation</h1>
        <p className="page-subtitle">
          Validation metrics computed against LogHub HDFS ground truth labels (anomaly_label.csv).
        </p>
      </div>

      {error && <ErrorBanner message={error} onRetry={refetch} />}

      {loading ? (
        <div className="card">
          <Skeleton type="chart" />
        </div>
      ) : !data?.data_ready ? (
        <div className="card">
          <EmptyState
            icon={<Target size={38} strokeWidth={1.5} color="var(--text-dim)" />}
            title="Evaluation Dataset Ready"
            text="The evaluation dataset is computed when run_pipeline.py parses ground truth labels."
          />
        </div>
      ) : (
        <>
          {/* Key Metric Gauges (Apple Bento Top) */}
          <div className="metric-grid" style={{ marginBottom: 28 }}>
            {[
              { label: 'Precision', value: data.precision, desc: 'Exactness (TP / (TP + FP))' },
              { label: 'Recall',    value: data.recall,    desc: 'Sensitivity (TP / (TP + FN))' },
              { label: 'F1 Score',  value: data.f1_score,  desc: 'Harmonic Mean' },
              { label: 'Accuracy',  value: data.accuracy,  desc: 'Overall Correctness' },
            ].map(({ label, value, desc }) => {
              const isHigh = value != null && value >= 0.8;
              const isMed  = value != null && value >= 0.6;
              const color = isHigh ? 'var(--accent-green-text)' : isMed ? 'var(--accent-yellow-text)' : 'var(--accent-red-text)';
              return (
                <div key={label} className="metric-box">
                  <div className="metric-value" style={{ color }}>
                    {value != null ? (value * 100).toFixed(1) + '%' : '—'}
                  </div>
                  <div className="metric-label">{label}</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {desc}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="charts-grid">
            {/* Interactive Confusion Matrix */}
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">
                    <Target size={18} color="var(--accent-blue)" strokeWidth={2} />
                    <span>Confusion Matrix</span>
                  </div>
                  <div className="card-subtitle">
                    Hover over quadrants to inspect individual classification splits
                  </div>
                </div>
              </div>

              <div style={{ padding: '16px 0 20px' }}>
                <AppleConfusionMatrix
                  TP={data.TP ?? 0}
                  FP={data.FP ?? 0}
                  TN={data.TN ?? 0}
                  FN={data.FN ?? 0}
                />
              </div>
            </div>

            {/* Evaluation Summary Metrics */}
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">
                    <Award size={18} color="var(--accent-purple)" strokeWidth={2} />
                    <span>Evaluation Statistics</span>
                  </div>
                  <div className="card-subtitle">
                    Block count distribution from PySpark pipeline
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Total Evaluated Blocks',      value: data.evaluated_blocks },
                  { label: 'Ground Truth Anomaly Blocks', value: data.gt_anomaly_blocks },
                  { label: 'Ground Truth Normal Blocks',  value: data.gt_normal_blocks },
                  { label: 'True Positives (TP)',         value: data.TP },
                  { label: 'False Positives (FP)',        value: data.FP },
                  { label: 'True Negatives (TN)',         value: data.TN },
                  { label: 'False Negatives (FN)',        value: data.FN },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      background: 'var(--bg-surface)',
                      borderRadius: '10px',
                    }}
                  >
                    <span style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>{label}</span>
                    <span
                      style={{
                        fontSize: '0.94rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {value?.toLocaleString() ?? '—'}
                    </span>
                  </div>
                ))}
              </div>

              {data.note && (
                <div
                  style={{
                    marginTop: 18,
                    padding: 14,
                    background: 'var(--bg-secondary)',
                    borderRadius: '12px',
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                    lineHeight: 1.6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    <Info size={14} />
                    <span>Model Note</span>
                  </div>
                  {data.note}
                </div>
              )}
            </div>
          </div>

          {/* Collapsible Methodology Note (Subtle Apple Footer) */}
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <button
              onClick={() => setShowMethodology(!showMethodology)}
              className="btn btn-ghost"
              style={{ fontSize: '0.82rem', gap: 6 }}
            >
              <HelpCircle size={14} />
              <span>{showMethodology ? 'Hide Evaluation Specs' : 'View Evaluation Formulas & Standards'}</span>
              {showMethodology ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showMethodology && (
              <div
                className="card"
                style={{
                  marginTop: 16,
                  textAlign: 'left',
                  background: 'var(--bg-card)',
                  animation: 'fadeIn 0.25s var(--ease-apple)',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, fontSize: '0.94rem' }}>
                  Block-Level Verification Standard
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
                  LogHub HDFS labels apply to complete <strong>Blocks (BlockId)</strong>, not individual log lines. An anomalous block contains dozens of normal informational operations mixed with fault events. Evaluation is performed on the aggregate block session matrix.
                </p>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 16,
                    fontSize: '0.82rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <div>
                    <strong>Precision:</strong> TP / (TP + FP)
                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                      Measures exactness — proportion of flagged blocks that are true faults.
                    </div>
                  </div>
                  <div>
                    <strong>Recall:</strong> TP / (TP + FN)
                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                      Measures completeness — proportion of true anomalies detected.
                    </div>
                  </div>
                  <div>
                    <strong>F1 Score:</strong> 2 &times; (P &times; R) / (P + R)
                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                      Harmonic mean balancing precision and recall.
                    </div>
                  </div>
                  <div>
                    <strong>Accuracy:</strong> (TP + TN) / Total
                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                      Overall fraction of correctly classified blocks.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
