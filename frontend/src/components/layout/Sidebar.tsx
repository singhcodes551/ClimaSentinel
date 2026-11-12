import React from 'react';
import {
  LayoutDashboard,
  Database,
  GitBranch,
  BarChart3,
  AlertTriangle,
  GitCompare,
  Lightbulb,
  FileText,
  Settings,
  ShieldAlert,
} from 'lucide-react';
import type { PageId, HealthStatus } from '../../types';

interface SidebarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  health: HealthStatus;
}

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Data & Wrangling',
    items: [
      { id: 'datasets', label: 'Datasets', icon: Database },
      { id: 'pipeline', label: 'Pipeline', icon: GitBranch },
      { id: 'eda', label: 'EDA Profiling', icon: BarChart3 },
    ],
  },
  {
    title: 'Detection & ML',
    items: [
      { id: 'anomalies', label: 'Anomalies', icon: AlertTriangle },
      { id: 'compare', label: 'Algorithm Bench', icon: GitCompare },
      { id: 'insights', label: 'Insights', icon: Lightbulb },
    ],
  },
  {
    title: 'System & Reports',
    items: [
      { id: 'reports', label: 'Reports & Export', icon: FileText },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, health }) => {
  return (
    <aside className="w-64 border-r border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/90 flex flex-col h-screen sticky top-0 shrink-0 select-none">
      {/* Brand Header */}
      <div className="h-16 px-6 border-b border-slate-200 dark:border-slate-800/80 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-500 flex items-center justify-center text-white shadow-xs">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div>
          <div className="font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            ClimaSentinel
            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300">
              v{health.version}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500">
            Climate Intelligence Platform
          </div>
        </div>
      </div>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {navSections.map((section, idx) => (
          <div key={idx} className="space-y-1">
            <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              {section.title}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer Info Box */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800/80">
        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Project: <span className="font-semibold text-slate-700 dark:text-slate-300">Data Mining</span>
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center justify-between">
            <span>DB: {health.database}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          </div>
        </div>
      </div>
    </aside>
  );
};
