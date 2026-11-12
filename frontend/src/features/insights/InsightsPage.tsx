import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Lightbulb,
  AlertCircle,
  AlertTriangle,
  Info,
  RefreshCw,
  Calendar,
  Layers,
  Sparkles,
  ShieldCheck,
  Thermometer,
  CloudRain,
  Compass,
} from 'lucide-react';
import type {
  DatasetItem,
  AnomalyRunItem,
  DatasetInsightsResponse,
  InsightItem,
} from '../../types';
import {
  fetchDatasets,
  fetchAnomalyRuns,
  fetchDatasetInsights,
} from '../../services/api';

interface InsightsPageProps {
  selectedDatasetId?: number | null;
  onSelectDataset?: (id: number) => void;
}

const CATEGORY_TABS = [
  { id: 'all', label: 'All Insights' },
  { id: 'meteorological', label: 'Meteorological' },
  { id: 'distribution', label: 'Distribution' },
  { id: 'seasonal', label: 'Seasonal' },
  { id: 'consensus', label: 'Consensus' },
  { id: 'quality', label: 'Data Quality' },
];

export const InsightsPage: React.FC<InsightsPageProps> = ({
  selectedDatasetId: externalDatasetId,
  onSelectDataset,
}) => {
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(externalDatasetId ?? null);
  const [runs, setRuns] = useState<AnomalyRunItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const [insightsData, setInsightsData] = useState<DatasetInsightsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Sync with external dataset prop
  useEffect(() => {
    if (externalDatasetId !== undefined && externalDatasetId !== null) {
      setSelectedId(externalDatasetId);
    }
  }, [externalDatasetId]);

  // Load available datasets
  const loadDatasets = useCallback(async () => {
    try {
      const items = await fetchDatasets();
      setDatasets(items);
      if (items.length > 0) {
        if (!selectedId || !items.some((d) => d.id === selectedId)) {
          const defaultId = items[0].id;
          setSelectedId(defaultId);
          onSelectDataset?.(defaultId);
        }
      } else {
        setSelectedId(null);
      }
    } catch (err: any) {
      console.error('Failed to load datasets:', err);
      setError(err.message || 'Failed to load datasets');
    }
  }, [selectedId, onSelectDataset]);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  // Load detection runs when selected dataset changes
  const loadRuns = useCallback(async (datasetId: number) => {
    try {
      const res = await fetchAnomalyRuns(datasetId);
      setRuns(res.runs);
      if (res.runs.length > 0) {
        setSelectedRunId(res.runs[0].id);
      } else {
        setSelectedRunId(null);
        setInsightsData(null);
      }
    } catch (err: any) {
      console.error('Failed to load anomaly detection runs:', err);
      setRuns([]);
      setSelectedRunId(null);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadRuns(selectedId);
    }
  }, [selectedId, loadRuns]);

  // Load insights data
  const loadInsights = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    try {
      const catParam = activeCategory === 'all' ? undefined : activeCategory;
      const data = await fetchDatasetInsights(
        selectedId,
        selectedRunId ?? undefined,
        catParam
      );
      setInsightsData(data);
    } catch (err: any) {
      console.error('Failed to fetch dataset insights:', err);
      setError(err.message || 'Failed to fetch insights');
      setInsightsData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedId, selectedRunId, activeCategory]);

  useEffect(() => {
    if (selectedId) {
      loadInsights();
    }
  }, [loadInsights]);

  // Filtered insights list
  const displayedInsights: InsightItem[] = useMemo(() => {
    if (!insightsData) return [];
    if (activeCategory === 'all') {
      return insightsData.all_insights;
    }
    const catGroup = insightsData.categories.find(
      (c) => c.category.toLowerCase() === activeCategory.toLowerCase()
    );
    return catGroup ? catGroup.items : insightsData.all_insights.filter(
      (item) => item.category.toLowerCase() === activeCategory.toLowerCase()
    );
  }, [insightsData, activeCategory]);

  // Helper formatting for evidence keys
  const formatEvidenceKey = (key: string): string => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const formatEvidenceVal = (val: any): string => {
    if (val === null || val === undefined) return 'N/A';
    if (typeof val === 'number') {
      return Number.isInteger(val) ? val.toLocaleString() : val.toFixed(2);
    }
    if (typeof val === 'boolean') {
      return val ? 'Yes' : 'No';
    }
    if (Array.isArray(val)) {
      return val.join(', ');
    }
    return String(val);
  };

  const getSeverityBadge = (severity: string) => {
    const sev = severity.toLowerCase();
    switch (sev) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
            <AlertCircle className="w-3.5 h-3.5" />
            Critical
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
            <AlertTriangle className="w-3.5 h-3.5" />
            Warning
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-200 dark:border-sky-900">
            <Info className="w-3.5 h-3.5" />
            Info
          </span>
        );
    }
  };

  const getCategoryBadge = (category: string) => {
    const cat = category.toLowerCase();
    let colorClass =
      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    if (cat === 'meteorological') {
      colorClass =
        'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
    } else if (cat === 'distribution') {
      colorClass =
        'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200 dark:border-purple-800';
    } else if (cat === 'seasonal') {
      colorClass =
        'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    } else if (cat === 'consensus') {
      colorClass =
        'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    } else if (cat === 'quality') {
      colorClass =
        'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    }

    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}
      >
        <Compass className="w-3 h-3" />
        {category.charAt(0).toUpperCase() + category.slice(1)}
      </span>
    );
  };

  const selectedDataset = datasets.find((d) => d.id === selectedId);

  return (
    <div className="space-y-6">
      {/* Top Header & Context Selectors */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Lightbulb className="w-7 h-7 text-amber-500" />
            Climatological Insights & Patterns
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Data-grounded meteorological and observational insights synthesized from confirmed anomaly clusters.
          </p>
        </div>

        {/* Global Selectors */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Dataset Selector */}
          <div className="relative">
            <select
              value={selectedId ?? ''}
              onChange={(e) => {
                const id = Number(e.target.value);
                setSelectedId(id);
                onSelectDataset?.(id);
              }}
              className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {datasets.length === 0 && <option value="">No datasets available</option>}
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} (#{d.id})
                </option>
              ))}
            </select>
          </div>

          {/* Run Selector */}
          <div className="relative">
            <select
              value={selectedRunId ?? ''}
              disabled={runs.length === 0}
              onChange={(e) => setSelectedRunId(Number(e.target.value))}
              className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50"
            >
              {runs.length === 0 && <option value="">No detection runs</option>}
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  Run #{r.id} ({r.primary_variable} • {r.confirmed_count} confirmed)
                </option>
              ))}
            </select>
          </div>

          {/* Refresh Action */}
          <button
            onClick={() => {
              if (selectedId) {
                loadRuns(selectedId);
                loadInsights();
              }
            }}
            disabled={loading || !selectedId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Dataset / Run Overview & Severity Counts */}
      {insightsData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Insights
              </span>
              <Sparkles className="w-4 h-4 text-sky-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {insightsData.total_insights}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Generated for {insightsData.primary_variable} run #{insightsData.run_id}
            </p>
          </div>

          <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-950/60 bg-rose-50/50 dark:bg-rose-950/20 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-700 dark:text-rose-400">
                Critical Findings
              </span>
              <AlertCircle className="w-4 h-4 text-rose-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-rose-700 dark:text-rose-300">
              {insightsData.severity_counts.critical ?? 0}
            </div>
            <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-400/80">
              Severe multi-sigma deviations & prolonged clusters
            </p>
          </div>

          <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-950/60 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                Warnings
              </span>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-700 dark:text-amber-300">
              {insightsData.severity_counts.warning ?? 0}
            </div>
            <p className="mt-1 text-xs text-amber-600/80 dark:text-amber-400/80">
              Elevated seasonal shifts or detector divergences
            </p>
          </div>

          <div className="p-4 rounded-xl border border-sky-200 dark:border-sky-950/60 bg-sky-50/50 dark:bg-sky-950/20 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-sky-700 dark:text-sky-400">
                Informational
              </span>
              <Info className="w-4 h-4 text-sky-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-sky-700 dark:text-sky-300">
              {insightsData.severity_counts.info ?? 0}
            </div>
            <p className="mt-1 text-xs text-sky-600/80 dark:text-sky-400/80">
              Baseline distribution characteristics & quality logs
            </p>
          </div>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto">
        {CATEGORY_TABS.map((tab) => {
          const isActive = activeCategory === tab.id;
          let count = 0;
          if (insightsData) {
            if (tab.id === 'all') {
              count = insightsData.total_insights;
            } else {
              const catObj = insightsData.categories.find(
                (c) => c.category.toLowerCase() === tab.id
              );
              count = catObj ? catObj.count : 0;
            }
          }

          return (
            <button
              key={tab.id}
              onClick={() => setActiveCategory(tab.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span>{tab.label}</span>
              {insightsData && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isActive
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="p-12 text-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
          <RefreshCw className="w-8 h-8 text-sky-500 animate-spin mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Synthesizing Insights...
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Evaluating meteorological departures, consecutive clusters, and detector agreement.
          </p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-200">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <AlertCircle className="w-5 h-5 text-rose-500" />
            Unable to Generate Insights
          </div>
          <p className="text-xs mt-1">{error}</p>
        </div>
      ) : !selectedId ? (
        <div className="p-12 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-slate-500">
          <Layers className="w-8 h-8 mx-auto mb-2 text-slate-400" />
          <p className="text-sm font-medium">No dataset selected</p>
          <p className="text-xs mt-1">Select an active dataset above to view synthesized insights.</p>
        </div>
      ) : runs.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-slate-500">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            No Detection Runs Available
          </p>
          <p className="text-xs mt-1 text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Insights are derived from historical ensemble detection runs. Run anomaly detection on{' '}
            <span className="font-semibold">{selectedDataset?.name || 'this dataset'}</span> to generate
            insights.
          </p>
        </div>
      ) : displayedInsights.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-slate-500">
          <Info className="w-8 h-8 mx-auto mb-2 text-slate-400" />
          <p className="text-sm font-medium">No insights found</p>
          <p className="text-xs mt-1">
            No findings met the criteria for the &ldquo;{activeCategory}&rdquo; category in this run.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayedInsights.map((insight) => (
            <div
              key={insight.id}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm transition-all hover:border-slate-300 dark:hover:border-slate-700"
            >
              {/* Card Header: Severity, Category, Variable */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {getSeverityBadge(insight.severity)}
                  {getCategoryBadge(insight.category)}
                  {insight.variable && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {insight.variable.toLowerCase().includes('temp') ? (
                        <Thermometer className="w-3 h-3 text-rose-500" />
                      ) : (
                        <CloudRain className="w-3 h-3 text-sky-500" />
                      )}
                      {insight.variable}
                    </span>
                  )}
                </div>

                {insight.observation_period && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      {insight.observation_period.start || 'Start'} &rarr;{' '}
                      {insight.observation_period.end || 'End'}
                    </span>
                  </div>
                )}
              </div>

              {/* Title & Summary */}
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {insight.title}
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {insight.summary}
              </p>

              {/* Supporting Evidence Metrics Grid */}
              {insight.evidence && Object.keys(insight.evidence).length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Supporting Observational Evidence
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                    {Object.entries(insight.evidence).map(([key, val]) => (
                      <div
                        key={key}
                        className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800"
                      >
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {formatEvidenceKey(key)}
                        </div>
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5 font-mono truncate">
                          {formatEvidenceVal(val)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Supporting Key Dates */}
              {insight.supporting_dates && insight.supporting_dates.length > 0 && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Key Dates:
                  </span>
                  {insight.supporting_dates.slice(0, 8).map((d) => (
                    <span
                      key={d}
                      className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                    >
                      {d}
                    </span>
                  ))}
                  {insight.supporting_dates.length > 8 && (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      +{insight.supporting_dates.length - 8} more
                    </span>
                  )}
                </div>
              )}

              {/* Scientific Caveat / Attribution Guardrail */}
              {insight.scientific_caveat && (
                <div className="mt-3.5 flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-slate-300 mr-1">
                      Scientific Caveat:
                    </span>
                    {insight.scientific_caveat}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Methodology & Academic Disclosure */}
      {insightsData?.methodology_disclosure && (
        <div className="p-4 rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/50 dark:bg-sky-950/20 text-xs text-sky-900 dark:text-sky-200 leading-relaxed">
          <div className="font-semibold flex items-center gap-1.5 mb-1 text-sky-800 dark:text-sky-300">
            <ShieldCheck className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            ClimaSentinel Automated Insights Methodology
          </div>
          <p>{insightsData.methodology_disclosure}</p>
        </div>
      )}
    </div>
  );
};
