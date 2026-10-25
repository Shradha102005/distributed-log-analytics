import { useState, useEffect } from 'react';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { getLogs } from '../services/api';
import { LogRecord } from '../services/api';
import { Skeleton, EmptyState, ErrorBanner, LevelBadge, Pagination } from '../components/ui';
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
  const debouncedSearch            = useDebounce(search, 400);

  // Expanded row
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getLogs({ page, page_size: pageSize, level: level || undefined, component: component || undefined, search: debouncedSearch || undefined })
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
  }, [page, pageSize, level, component, debouncedSearch]);

  const handleFilterChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    setter(e.target.value);
    setPage(1);
    setExpandedIdx(null);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">🔍 Log Explorer</h1>
        <p className="page-subtitle">Browse, search and filter processed log records</p>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            id="log-search"
            className="search-input"
            style={{ paddingLeft: 30 }}
            placeholder="Search log content…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <select id="log-level-filter" className="filter-select" value={level} onChange={handleFilterChange(setLevel)}>
          <option value="">All Levels</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
          <option value="FATAL">FATAL</option>
        </select>

        <input
          id="log-component-filter"
          className="search-input"
          placeholder="Filter by component…"
          value={component}
          onChange={handleFilterChange(setComponent)}
          style={{ minWidth: 180 }}
        />

        {(level || component || search) && (
          <button className="btn btn-secondary" onClick={() => { setLevel(''); setComponent(''); setSearch(''); setPage(1); }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {error && <ErrorBanner message={error} onRetry={() => setPage(p => p)} />}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Level</th>
                <th>Component</th>
                <th>Block ID</th>
                <th style={{ minWidth: 300 }}>Content</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 14, borderRadius: 4 }} /></td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon="📄" title="No logs found"
                      text={total === 0 ? "Run the pipeline to generate log data." : "No records match the current filters."} />
                  </td>
                </tr>
              ) : (
                records.map((rec, i) => (
                  <>
                    <tr key={i} onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}>
                      <td className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {rec.ts_raw ?? '—'}
                      </td>
                      <td><LevelBadge level={rec.level ?? ''} /></td>
                      <td className="mono" style={{ fontSize: '0.78rem', color: 'var(--accent-cyan)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rec.component ?? '—'}
                      </td>
                      <td className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {rec.block_id ? rec.block_id.slice(0, 20) + '…' : '—'}
                      </td>
                      <td style={{ maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {rec.content}
                      </td>
                      <td style={{ width: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                        {expandedIdx === i ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                    </tr>
                    {expandedIdx === i && (
                      <tr key={`exp-${i}`}>
                        <td colSpan={6} style={{ padding: '8px 16px' }}>
                          <div className="expanded-detail">
                            <div><span className="field-label">Timestamp:</span> {rec.ts_raw}</div>
                            <div><span className="field-label">PID:</span> {rec.pid}</div>
                            <div><span className="field-label">Level:</span> {rec.level}</div>
                            <div><span className="field-label">Component:</span> {rec.component}</div>
                            <div><span className="field-label">Block ID:</span> {rec.block_id ?? 'N/A'}</div>
                            <div style={{ marginTop: 8 }}><span className="field-label">Content:</span><br />{rec.content}</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
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
