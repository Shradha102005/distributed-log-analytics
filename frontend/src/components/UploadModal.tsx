import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { Upload, X, CheckCircle, AlertCircle, Loader2, FileText } from 'lucide-react';

const API = 'http://localhost:8000';

interface Job {
  job_id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  message: string;
  progress: number;
  filename?: string;
  error?: string;
}

interface UploadModalProps {
  onClose: () => void;
}

export default function UploadModal({ onClose }: UploadModalProps) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollStatus = useCallback((jobId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await axios.get<Job>(`${API}/api/pipeline/status/${jobId}`);
        setJob(res.data);
        if (res.data.status === 'done' || res.data.status === 'failed') {
          stopPolling();
        }
      } catch {
        stopPolling();
      }
    }, 2000);
  }, []);

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(log|txt|gz)$/i)) {
      setError('Only .log, .txt, or .gz files are supported.');
      return;
    }
    setError(null);
    setFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await axios.post<{ job_id: string; filename: string; status: string }>(
        `${API}/api/pipeline/upload`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setJob({ job_id: res.data.job_id, status: 'queued', message: 'Queued…', progress: 0, filename: res.data.filename });
      pollStatus(res.data.job_id);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Upload failed. Is the backend running?');
    } finally {
      setUploading(false);
    }
  };

  const isDone = job?.status === 'done';
  const isFailed = job?.status === 'failed';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.35)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.2s ease',
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: 20,
        boxShadow: '0 32px 80px rgba(0,0,0,0.18)',
        width: '100%', maxWidth: 480,
        padding: '2rem',
        position: 'relative',
        animation: 'slideUp 0.25s ease',
      }}>
        {/* Close */}
        <button
          onClick={() => { stopPolling(); onClose(); }}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'var(--bg-surface)', border: 'none',
            borderRadius: '50%', width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-muted)',
          }}
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--accent-blue)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Upload size={18} color="#fff" />
            </div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Upload Log File
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Upload a <code>.log</code> or <code>.txt</code> file to run the Spark pipeline and see anomalies.
          </p>
        </div>

        {/* Drop zone — only shown before job starts */}
        {!job && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? 'var(--accent-blue)' : file ? '#34c759' : '#d1d5db'}`,
                borderRadius: 14,
                padding: '2rem 1rem',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragging ? 'rgba(0,113,227,0.04)' : file ? 'rgba(52,199,89,0.04)' : 'var(--bg-surface)',
                transition: 'all 0.2s ease',
                marginBottom: '1rem',
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".log,.txt,.gz"
                style={{ display: 'none' }}
                onChange={onInputChange}
              />
              {file ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <FileText size={28} color="#34c759" />
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{file.name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {(file.size / 1024 / 1024).toFixed(2)} MB — click to change
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <Upload size={28} color="var(--text-muted)" />
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    Drop your log file here or <span style={{ color: 'var(--accent-blue)' }}>browse</span>
                  </span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>.log · .txt · .gz</span>
                </div>
              )}
            </div>

            {error && (
              <div style={{
                background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)',
                borderRadius: 10, padding: '0.6rem 0.8rem', marginBottom: '1rem',
                fontSize: '0.8rem', color: '#c0392b', display: 'flex', gap: 6, alignItems: 'center',
              }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <button
              onClick={upload}
              disabled={!file || uploading}
              style={{
                width: '100%', padding: '0.75rem',
                background: !file ? 'var(--bg-surface)' : 'var(--accent-blue)',
                color: !file ? 'var(--text-muted)' : '#fff',
                border: 'none', borderRadius: 12,
                fontSize: '0.9rem', fontWeight: 600,
                cursor: !file ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s ease',
              }}
            >
              {uploading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Uploading…</> : <><Upload size={16} /> Run Pipeline</>}
            </button>
          </>
        )}

        {/* Job progress */}
        {job && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Status icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {isDone && <CheckCircle size={24} color="#34c759" />}
              {isFailed && <AlertCircle size={24} color="#ff3b30" />}
              {!isDone && !isFailed && (
                <Loader2 size={24} color="var(--accent-blue)" style={{ animation: 'spin 1s linear infinite' }} />
              )}
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  {isDone ? 'Pipeline Complete!' : isFailed ? 'Pipeline Failed' : 'Processing…'}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2 }}>{job.filename}</div>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ background: 'var(--bg-surface)', borderRadius: 999, height: 6, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${job.progress}%`,
                background: isDone ? '#34c759' : isFailed ? '#ff3b30' : 'var(--accent-blue)',
                borderRadius: 999,
                transition: 'width 0.5s ease',
              }} />
            </div>

            {/* Message */}
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              {job.message}
            </p>

            {/* Error detail */}
            {isFailed && job.error && (
              <pre style={{
                background: '#fff5f5', border: '1px solid #fecaca',
                borderRadius: 8, padding: '0.6rem', fontSize: '0.7rem',
                color: '#c0392b', maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap',
              }}>
                {job.error}
              </pre>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              {isDone && (
                <button
                  onClick={() => { stopPolling(); onClose(); window.location.reload(); }}
                  style={{
                    flex: 1, padding: '0.7rem',
                    background: '#34c759', color: '#fff',
                    border: 'none', borderRadius: 10,
                    fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer',
                  }}
                >
                  View Results ↗
                </button>
              )}
              {(isDone || isFailed) && (
                <button
                  onClick={() => { stopPolling(); setJob(null); setFile(null); }}
                  style={{
                    flex: 1, padding: '0.7rem',
                    background: 'var(--bg-surface)', color: 'var(--text-secondary)',
                    border: '1px solid var(--border-color)', borderRadius: 10,
                    fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer',
                  }}
                >
                  Upload Another
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
