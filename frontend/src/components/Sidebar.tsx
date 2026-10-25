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
  { path: '/',           label: 'Overview',      icon: <LayoutDashboard size={18} strokeWidth={1.8} /> },
  { path: '/logs',       label: 'Log Explorer',  icon: <ScrollText size={18} strokeWidth={1.8} /> },
  { path: '/anomalies',  label: 'Anomalies',     icon: <AlertTriangle size={18} strokeWidth={1.8} /> },
  { path: '/analytics',  label: 'Analytics',     icon: <BarChart3 size={18} strokeWidth={1.8} /> },
  { path: '/evaluation', label: 'Evaluation',    icon: <Target size={18} strokeWidth={1.8} /> },
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
            <Activity size={20} color="#ffffff" strokeWidth={2.2} />
          </div>
          <div>
            <div className="sidebar-logo-text">LogAnalytics</div>
            <div className="sidebar-logo-sub">HDFS Cluster Telemetry</div>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="sidebar-nav">
        <div className="nav-section-label">Analytics</div>
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
              <span className="nav-item-label">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
