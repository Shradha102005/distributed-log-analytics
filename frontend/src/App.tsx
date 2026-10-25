import { useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { RefreshCw, Sparkles, Terminal } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Overview from './pages/Overview';
import LogExplorer from './pages/LogExplorer';
import Anomalies from './pages/Anomalies';
import Analytics from './pages/Analytics';
import Evaluation from './pages/Evaluation';
import './index.css';

function TopHeader() {
  const location = useLocation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getPageTitle = (pathname: string) => {
    switch (pathname) {
      case '/': return 'Cluster Overview';
      case '/logs': return 'Log Record Explorer';
      case '/anomalies': return 'Anomaly Intelligence';
      case '/analytics': return 'Component Analytics';
      case '/evaluation': return 'Performance Evaluation';
      default: return 'LogAnalytics';
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      window.location.reload();
    }, 400);
  };

  return (
    <header className="top-header">
      <div className="top-header-left">
        <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)', fontWeight: 500 }}>
          HDFS Analytics
        </span>
        <span style={{ color: 'var(--border-strong)' }}>/</span>
        <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {getPageTitle(location.pathname)}
        </span>
      </div>

      <div className="top-header-right">
        {/* Real-time system indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            padding: '5px 12px',
            borderRadius: '9999px',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            fontWeight: 500,
          }}
        >
          <Sparkles size={13} color="var(--accent-blue)" />
          <span>PySpark Active</span>
        </div>

        {/* Quick reload action */}
        <button
          onClick={handleRefresh}
          className="btn btn-secondary"
          title="Refresh view"
          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
        >
          <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
          <span>Sync</span>
        </button>

        {/* Port info badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            padding: '4px 8px',
          }}
        >
          <Terminal size={12} />
          <span>API: 8000</span>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <TopHeader />
          <Routes>
            <Route path="/"           element={<Overview />} />
            <Route path="/logs"       element={<LogExplorer />} />
            <Route path="/anomalies"  element={<Anomalies />} />
            <Route path="/analytics"  element={<Analytics />} />
            <Route path="/evaluation" element={<Evaluation />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
