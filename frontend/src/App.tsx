import { useState, useEffect, useCallback } from 'react';
import type { PageId, HealthStatus } from './types';
import { fetchHealth } from './services/api';
import { useTheme } from './hooks/useTheme';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';

import { DashboardPage } from './features/dashboard/DashboardPage';
import { DatasetsPage } from './features/datasets/DatasetsPage';
import { PipelinePage } from './features/pipeline/PipelinePage';
import { EDAPage } from './features/eda/EDAPage';
import { AnomaliesPage } from './features/anomalies/AnomaliesPage';
import { ComparePage } from './features/compare/ComparePage';
import { InsightsPage } from './features/insights/InsightsPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { SettingsPage } from './features/settings/SettingsPage';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [health, setHealth] = useState<HealthStatus>({
    status: 'connecting',
    project: 'ClimaSentinel',
    version: '0.1.0',
    database: 'connecting',
    environment: 'development',
  });

  const loadHealth = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetchHealth();
      setHealth(res);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
    // Refresh backend health every 30 seconds
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, [loadHealth]);

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return (
          <DashboardPage
            health={health}
            onNavigate={setCurrentPage}
            selectedDatasetId={selectedDatasetId}
            onSelectDataset={setSelectedDatasetId}
          />
        );
      case 'datasets':
        return <DatasetsPage />;
      case 'pipeline':
        return <PipelinePage onNavigate={setCurrentPage} />;
      case 'eda':
        return (
          <EDAPage
            selectedDatasetId={selectedDatasetId}
            onSelectDataset={setSelectedDatasetId}
          />
        );
      case 'anomalies':
        return (
          <AnomaliesPage
            selectedDatasetId={selectedDatasetId}
            onSelectDataset={setSelectedDatasetId}
          />
        );
      case 'compare':
        return (
          <ComparePage
            selectedDatasetId={selectedDatasetId}
            onSelectDataset={setSelectedDatasetId}
          />
        );
      case 'insights':
        return (
          <InsightsPage
            selectedDatasetId={selectedDatasetId}
            onSelectDataset={setSelectedDatasetId}
          />
        );
      case 'reports':
        return (
          <ReportsPage
            selectedDatasetId={selectedDatasetId}
            onSelectDataset={setSelectedDatasetId}
          />
        );
      case 'settings':
        return <SettingsPage health={health} />;
      default:
        return (
          <DashboardPage
            health={health}
            onNavigate={setCurrentPage}
            selectedDatasetId={selectedDatasetId}
            onSelectDataset={setSelectedDatasetId}
          />
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        health={health}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          currentPage={currentPage}
          health={health}
          theme={theme}
          onToggleTheme={toggleTheme}
          onRefreshHealth={loadHealth}
          isRefreshing={isRefreshing}
        />
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
