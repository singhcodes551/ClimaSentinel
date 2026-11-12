import React from 'react';
import { Sun, Moon, AlertCircle, RefreshCw } from 'lucide-react';
import type { PageId, HealthStatus } from '../../types';

interface HeaderProps {
  currentPage: PageId;
  health: HealthStatus;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onRefreshHealth: () => void;
  isRefreshing: boolean;
}

const pageTitles: Record<PageId, { title: string; category: string }> = {
  dashboard: { title: 'Executive Overview', category: 'Overview' },
  datasets: { title: 'Datasets & Weather Stations', category: 'Ingestion' },
  pipeline: { title: 'Data Wrangling Pipeline', category: 'Preprocessing' },
  eda: { title: 'Exploratory Data Analysis', category: 'Profiling' },
  anomalies: { title: 'Anomaly Detections', category: 'Inference' },
  compare: { title: 'Algorithm Benchmarking', category: 'Model Analytics' },
  insights: { title: 'Domain Insights', category: 'Analysis' },
  reports: { title: 'Audit & Reports', category: 'Documentation' },
  settings: { title: 'System Configuration', category: 'Preferences' },
};

export const Header: React.FC<HeaderProps> = ({
  currentPage,
  health,
  theme,
  onToggleTheme,
  onRefreshHealth,
  isRefreshing,
}) => {
  const meta = pageTitles[currentPage] || { title: 'ClimaSentinel', category: 'Platform' };
  const isHealthy = health.status === 'healthy';

  return (
    <header className="h-16 px-6 border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/60 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between">
      {/* Breadcrumb & Title */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {meta.category}
        </span>
        <span className="text-slate-300 dark:text-slate-700">/</span>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {meta.title}
        </h2>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Backend API Connection Indicator */}
        <div
          onClick={onRefreshHealth}
          title="Click to check backend health"
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium cursor-pointer transition-all ${
            isHealthy
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-950/60'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60 hover:bg-rose-100 dark:hover:bg-rose-950/60'
          }`}
        >
          {isHealthy ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>API Connected</span>
              {health.latencyMs !== undefined && (
                <span className="text-[10px] text-emerald-600/70 dark:text-emerald-400/60 pl-0.5 font-mono">
                  ({health.latencyMs}ms)
                </span>
              )}
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
              <span>API Disconnected</span>
            </>
          )}

          <RefreshCw
            className={`w-3 h-3 text-slate-400 ml-1 ${isRefreshing ? 'animate-spin' : ''}`}
          />
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
