import { useState } from 'react';
import {
  Target, Award, ShieldCheck, CheckCircle2,
  HelpCircle, ChevronDown, ChevronUp, Layers, Info
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
      border: 'rgba(52, 199, 89, 0.3)',
      text: 'var(--accent-green-text)',
      actual: 'Anomaly',
      predicted: 'Anomaly',
    },
    {
      id: 'fn',
      label: 'False Negative (FN)',
      desc: 'Anomalous blocks missed by the detector',
      value: FN,
      bg: 'var(--accent-red-tint)',
      border: 'rgba(255, 59, 48, 0.3)',
      text: 'var(--accent-red-text)',
      actual: 'Anomaly',
      predicted: 'Normal',
    },
    {
      id: 'fp',
      label: 'False Positive (FP)',
      desc: 'Normal blocks mistakenly flagged as anomaly',
      value: FP,
      bg: 'var(--accent-yellow-tint)',
      border: 'rgba(255, 149, 0, 0.3)',
      text: 'var(--accent-yellow-text)',
      actual: 'Normal',
      predicted: 'Anomaly',
    },
    {
      id: 'tn',
      label: 'True Negative (TN)',
      desc: 'Correctly identified healthy normal blocks',
      value: TN,
      bg: 'var(--accent-green-tint)',
      border: 'rgba(52, 199, 89, 0.3)',
      text: 'var(--accent-green-text)',
      actual: 'Normal',
      predicted: 'Normal',
    },
  ];

  return (
    <div style={{ maxWidth: 440, margin: '0 auto' }}>
      {/* Header labels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8, textAlign: 'center' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Predicted Anomaly
        </div>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
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
              transform: activeCell === cell.id ? 'scale(1.02)' : 'none',
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
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: cell.text, marginTop: 6 }}>
              {cell.label}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
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
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Performance Evaluation</h1>
        <p className="page-subtitle">
          Validation metrics computed against LogHub HDFS ground truth labels (anomaly_label.csv).
        </p>
      </div>

      {/* Block Level Methodology Card */}
      <div
        className="card"
        style={{
          marginBottom: 26,
          background: 'linear-gradient(135deg, rgba(232, 242, 254, 0.5) 0%, rgba(245, 245, 247, 0.8) 100%)',
          borderColor: 'rgba(0, 113, 227, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ display: 'flex', gap: 14 }}>
            <ShieldCheck size={24} color="var(--accent-blue)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1.05rem', fontFamily: 'var(--font-display)' }}>
                Rigorous Block-Level Verification Standard
              </div>
              <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.6 }}>
                LogHub HDFS labels apply to whole <strong>Blocks (BlockId)</strong>, not arbitrary log lines. An anomalous block contains dozens of normal informational operations mixed with faults. Line-level precision is statistically invalid; evaluation is performed on the aggregate <strong>block session matrix</strong>.
              </div>
            </div>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => setShowMethodology(!showMethodology)}
            style={{ flexShrink: 0, fontSize: '0.8rem' }}
          >
            {showMethodology ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span>{showMethodology ? 'Hide Specs' : 'View Formulae'}</span>
          </button>
        </div>

        {showMethodology && (
          <div
            style={{
              marginTop: 18,
              paddingTop: 18,
              borderTop: '1px solid var(--border)',
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
                Measures exactness — of blocks flagged as anomaly, how many are actual faults.
              </div>
            </div>
            <div>
              <strong>Recall:</strong> TP / (TP + FN)
              <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                Measures completeness — of all actual anomalies, how many did the model capture.
              </div>
            </div>
            <div>
              <strong>F1 Score:</strong> 2 &times; (P &times; R) / (P + R)
              <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                Harmonic mean balancing false positives and false negatives.
              </div>
            </div>
            <div>
              <strong>Accuracy:</strong> (TP + TN) / Total
              <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                Overall proportion of correctly classified blocks.
              </div>
            </div>
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={refetch} />}

      {loading ? (
        <div className="card">
          <Skeleton type="chart" />
        </div>
      ) : !data?.data_ready ? (
        <div className="card">
          <EmptyState
            icon="🎯"
            title="Evaluation Ready to Compute"
            text="The evaluation dataset is generated when run_pipeline.py parses the ground truth file (anomaly_label.csv)."
          />
        </div>
      ) : (
        <>
          {/* Key Metric Gauges */}
          <div className="metric-grid" style={{ marginBottom: 28 }}>
            {[
              { label: 'Precision', value: data.precision, desc: 'Exactness (TP / (TP + FP))' },
              { label: 'Recall',    value: data.recall,    desc: 'Sensitivity (TP / (TP + FN))' },
              { label: 'F1 Score',  value: data.f1_score,  desc: 'Harmonic Mean' },
              { label: 'Accuracy',  value: data.accuracy,  desc: 'Global Reliability' },
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
                    <Target size={18} color="var(--accent-blue)" />
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
                    <Award size={18} color="var(--accent-purple)" />
                    <span>Evaluation Statistics</span>
                  </div>
                  <div className="card-subtitle">
                    Block count distribution from PySpark pipeline
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { label: 'Total Evaluated Blocks',  value: data.evaluated_blocks },
                  { label: 'Ground Truth Anomaly Blocks', value: data.gt_anomaly_blocks },
                  { label: 'Ground Truth Normal Blocks',  value: data.gt_normal_blocks },
                  { label: 'True Positives (TP)',    value: data.TP },
                  { label: 'False Positives (FP)',   value: data.FP },
                  { label: 'True Negatives (TN)',    value: data.TN },
                  { label: 'False Negatives (FN)',   value: data.FN },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: 'var(--bg-surface)',
                      borderRadius: '10px',
                    }}
                  >
                    <span style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>{label}</span>
                    <span
                      style={{
                        fontSize: '0.96rem',
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
        </>
      )}
    </div>
  );
}
