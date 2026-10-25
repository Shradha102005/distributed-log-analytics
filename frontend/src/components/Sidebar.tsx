import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ScrollText, AlertTriangle,
  BarChart3, Target, Activity
} from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { path: '/',            label: 'Overview',      icon: <LayoutDashboard size={16} /> },
  { path: '/logs',        label: 'Log Explorer',  icon: <ScrollText size={16} /> },
  { path: '/anomalies',   label: 'Anomalies',     icon: <AlertTriangle size={16} /> },
  { path: '/analytics',   label: 'Analytics',     icon: <BarChart3 size={16} /> },
  { path: '/evaluation',  label: 'Evaluation',    icon: <Target size={16} /> },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Activity size={20} color="#fff" />
          </div>
          <div>
            <div className="sidebar-logo-text">LogAnalytics</div>
            <div className="sidebar-logo-sub">Distributed · HDFS · Spark</div>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Navigation</div>
        {navItems.map(item => (
          <button
            key={item.path}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
            id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-status">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          <span className="status-dot" />
          API Connected
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
          localhost:8000
        </div>
      </div>
    </aside>
  );
}
