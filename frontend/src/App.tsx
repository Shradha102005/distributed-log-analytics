import { useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
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
      case '/logs': return 'Log Explorer';
      case '/anomalies': return 'Anomaly Detection';
      case '/analytics': return 'Component Analytics';
      case '/evaluation': return 'Model Evaluation';
      default: return 'Overview';
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      window.location.reload();
    }, 350);
  };

  return (
    <header className="top-header">
      <div className="top-header-left">
        <span className="header-app-tag">LogAnalytics</span>
        <span className="header-separator">/</span>
        <span className="header-page-title">
          {getPageTitle(location.pathname)}
        </span>
      </div>

      <div className="top-header-right">
        {/* Subtle Live Cluster Indicator */}
        <div className="cluster-live-indicator" title="Connected to PySpark & DuckDB">
          <span className="live-dot" />
          <span className="live-label">Cluster Live</span>
        </div>

        {/* Apple-style Refresh Action */}
        <button
          onClick={handleRefresh}
          className="header-action-btn"
          title="Refresh telemetry"
          aria-label="Refresh telemetry"
        >
          <RefreshCw size={13} className={isRefreshing ? 'spin-icon' : ''} />
          <span>Refresh</span>
        </button>
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
