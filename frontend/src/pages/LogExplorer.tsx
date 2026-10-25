import { useState, useEffect } from 'react';
import { Search, X, Download, Copy, Check, Filter } from 'lucide-react';
import { getLogs, LogRecord } from '../services/api';
import { Skeleton, EmptyState, ErrorBanner, LevelBadge, Pagination, CopyButton, SegmentedControl } from '../components/ui';
import { useDebounce } from '../hooks/useFetch';

export default function LogExplorer() {
  const [records, setRecords] = useState<LogRecord[]>([]);
  const [total, setTotal]     = useState(0);
  const [pages, setPages]     = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Filters
  const [page, setPage]           = useState(1);
  const [pageSize]                 = useState(50);
  const [level, setLevel]          = useState('');
  const [component, setComponent]  = useState('');
  const [search, setSearch]        = useState('');
  const debouncedSearch            = useDebounce(search, 350);

  // Active record inspector modal
  const [selectedLog, setSelectedLog] = useState<LogRecord | null>(null);
  const [copiedRaw, setCopiedRaw] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getLogs({
      page,
      page_size: pageSize,
      level: level || undefined,
      component: component || undefined,
      search: debouncedSearch || undefined,
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
  }, [page, pageSize, level, component, debouncedSearch]);

  // Export current records as JSON
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(records, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `hdfs_logs_page_${page}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const copyLogJSON = () => {
    if (!selectedLog) return;
    navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2));
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 1600);
  };

  const filterByBlock = (blk: string) => {
    setSearch(blk);
    setPage(1);
    setSelectedLog(null);
  };

  return (
    <div className="page page-animated">
      <div className="page-header">
        <h1 className="page-title">Log Explorer</h1>
        <p className="page-subtitle">
          Search, filter, and inspect HDFS cluster events with sub-millisecond DuckDB columnar execution.
        </p>
      </div>

      {/* Filter and Action Bar */}
      <div className="filter-bar">
        {/* Apple Search Input */}
        <div className="search-input-wrapper" style={{ flex: 1, maxWidth: 440 }}>
          <Search size={15} style={{ position: 'absolute', left: 14, color: 'var(--text-muted)' }} />
          <input
            id="log-search"
            className="search-input"
            style={{ width: '100%' }}
            placeholder="Search content or Block ID (e.g. blk_)..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {search && (
            <button
              onClick={() => { setSearch(''); setPage(1); }}
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

        {/* Level Quick Filter Pills using Apple Segmented Control */}
        <SegmentedControl
          value={level}
          onChange={(lvl) => { setLevel(lvl); setPage(1); }}
          options={[
            { value: '', label: 'All Severities' },
            { value: 'INFO', label: 'INFO' },
            { value: 'WARN', label: 'WARN' },
            { value: 'ERROR', label: 'ERROR' },
            { value: 'FATAL', label: 'FATAL' },
          ]}
        />

        {/* Component Filter */}
        <div style={{ position: 'relative' }}>
          <input
            id="log-component-filter"
            className="search-input"
            placeholder="Filter component..."
            value={component}
            onChange={(e) => { setComponent(e.target.value); setPage(1); }}
            style={{ minWidth: 190, paddingLeft: 16 }}
          />
        </div>

        {/* Export Button */}
        <button
          className="btn btn-secondary"
          onClick={handleExportJSON}
          disabled={records.length === 0}
          title="Export current page to JSON"
        >
          <Download size={14} />
          <span>Export Page</span>
        </button>

        {/* Clear Filter Action */}
        {(level || component || search) && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setLevel('');
              setComponent('');
              setSearch('');
              setPage(1);
            }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={() => setPage((p) => p)} />}

      {/* Main Table Card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 100 }}>Level</th>
                <th style={{ width: 140 }}>Timestamp</th>
                <th style={{ width: 80 }}>PID</th>
                <th style={{ width: 180 }}>Component</th>
                <th style={{ width: 200 }}>Block ID</th>
                <th>Content Message</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j}>
                        <div className="skeleton" style={{ height: 16, borderRadius: 6 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<Search size={36} strokeWidth={1.5} color="var(--text-dim)" />}
                      title="No Matching Records"
                      text="No logs match your filter criteria. Try clearing your search or level filters."
                      action={{
                        label: 'Clear All Filters',
                        onClick: () => {
                          setLevel('');
                          setComponent('');
                          setSearch('');
                          setPage(1);
                        },
                      }}
                    />
                  </td>
                </tr>
              ) : (
                records.map((rec, i) => (
                  <tr
                    key={i}
                    onClick={() => setSelectedLog(rec)}
                    title="Click to view detailed record"
                  >
                    <td>
                      <LevelBadge level={rec.level ?? 'INFO'} />
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {rec.date_str} {rec.time_str}
                    </td>
                    <td className="mono" style={{ color: 'var(--text-muted)' }}>
                      {rec.pid ?? '—'}
                    </td>
                    <td
                      style={{
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={rec.component}
                    >
                      {rec.component?.split('.').pop() ?? rec.component ?? '—'}
                    </td>
                    <td>
                      {rec.block_id ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span className="code-pill mono" style={{ fontSize: '0.78rem' }}>
                            {rec.block_id.length > 20 ? rec.block_id.slice(0, 18) + '…' : rec.block_id}
                          </span>
                          <CopyButton text={rec.block_id} />
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-dim)' }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        color: 'var(--text-secondary)',
                        fontFamily: 'Inter',
                        maxWidth: 440,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {rec.content ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Apple Pagination Controls */}
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

      {/* Apple-style Log Detail Modal */}
      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <LevelBadge level={selectedLog.level ?? 'INFO'} />
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700 }}>
                  Log Record Details
                </h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="btn btn-ghost"
                style={{ padding: '6px', borderRadius: '50%' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Metadata Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 14,
                padding: '16px',
                background: 'var(--bg-surface)',
                borderRadius: '14px',
                marginBottom: 20,
              }}
            >
              <div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Timestamp
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                  {selectedLog.date_str} {selectedLog.time_str}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Process ID (PID)
                </div>
                <div className="mono" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                  {selectedLog.pid ?? '—'}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Component
                </div>
                <div className="mono" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: 2 }}>
                  {selectedLog.component ?? '—'}
                </div>
              </div>
              {selectedLog.block_id && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                    HDFS Block ID
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span className="code-pill mono" style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                      {selectedLog.block_id}
                    </span>
                    <CopyButton text={selectedLog.block_id} label="Copy" />
                    <button
                      className="btn btn-secondary"
                      onClick={() => filterByBlock(selectedLog.block_id!)}
                      style={{ padding: '3px 10px', fontSize: '0.76rem' }}
                    >
                      <Filter size={11} />
                      Filter by this Block
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Message Content */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                Full Message Payload
              </div>
              <div
                className="mono"
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '16px',
                  fontSize: '0.85rem',
                  lineHeight: 1.6,
                  color: 'var(--text-primary)',
                  wordBreak: 'break-all',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {selectedLog.content}
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-secondary" onClick={copyLogJSON}>
                {copiedRaw ? <Check size={14} color="var(--accent-green)" /> : <Copy size={14} />}
                <span>{copiedRaw ? 'Copied JSON' : 'Copy JSON'}</span>
              </button>
              <button className="btn btn-primary" onClick={() => setSelectedLog(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
