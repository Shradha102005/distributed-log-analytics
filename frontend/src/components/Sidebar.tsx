import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ScrollText, AlertTriangle,
  BarChart3, Target, Activity, Cpu, Database
} from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

const navItems: NavItem[] = [
  { path: '/',           label: 'Overview',      icon: <LayoutDashboard size={18} /> },
  { path: '/logs',       label: 'Log Explorer',  icon: <ScrollText size={18} /> },
  { path: '/anomalies',  label: 'Anomalies',     icon: <AlertTriangle size={18} />, badge: '3σ' },
  { path: '/analytics',  label: 'Analytics',     icon: <BarChart3 size={18} /> },
  { path: '/evaluation', label: 'Evaluation',    icon: <Target size={18} />, badge: 'GT' },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="sidebar">
      {/* Apple-style Brand Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Activity size={22} color="#ffffff" strokeWidth={2.2} />
          </div>
          <div>
            <div className="sidebar-logo-text">LogAnalytics</div>
            <div className="sidebar-logo-sub">Apache Spark &middot; HDFS</div>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="sidebar-nav">
        <div className="nav-section-label">Intelligence</div>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
              id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {item.icon}
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span
                  style={{
                    fontSize: '0.68rem',
                    padding: '2px 6px',
                    borderRadius: '9999px',
                    background: isActive ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg-surface)',
                    color: isActive ? '#ffffff' : 'var(--text-muted)',
                    fontWeight: 600,
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Cluster Hardware & Engine Card */}
      <div className="sidebar-status">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            <span className="status-dot" />
            <span>Local Cluster</span>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--accent-green-text)', fontWeight: 600, background: 'var(--accent-green-tint)', padding: '2px 6px', borderRadius: '4px' }}>
            Ready
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.74rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Cpu size={12} />
            <span>Spark 3.5.3 (WSL)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Database size={12} />
            <span>DuckDB on Parquet</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
