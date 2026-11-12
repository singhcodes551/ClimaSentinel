import React from 'react';
import { Database, Server } from 'lucide-react';
import type { HealthStatus } from '../../types';

interface Props {
  health: HealthStatus;
}

export const SettingsPage: React.FC<Props> = ({ health }) => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          System Configuration & Settings
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage backend endpoints, algorithmic hyperparameters, and database settings.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
          <div className="flex items-center gap-2 mb-4 text-sky-600 dark:text-sky-400 font-semibold text-sm">
            <Server className="w-4 h-4" />
            Backend Connection
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">API Host</span>
              <span className="font-mono text-xs text-slate-800 dark:text-slate-200">http://127.0.0.1:8000</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Health Endpoint</span>
              <span className="font-mono text-xs text-slate-800 dark:text-slate-200">/api/v1/health</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Status</span>
              <span className="text-xs font-semibold uppercase text-emerald-600 dark:text-emerald-400">{health.status}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500 dark:text-slate-400">Server Time</span>
              <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                {health.timestamp ? new Date(health.timestamp).toLocaleTimeString() : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
          <div className="flex items-center gap-2 mb-4 text-sky-600 dark:text-sky-400 font-semibold text-sm">
            <Database className="w-4 h-4" />
            Database & Storage
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Engine</span>
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200">SQLite 3 / SQLAlchemy 2.0</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Status</span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{health.database}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500 dark:text-slate-400">Environment</span>
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200 capitalize">{health.environment || 'development'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
