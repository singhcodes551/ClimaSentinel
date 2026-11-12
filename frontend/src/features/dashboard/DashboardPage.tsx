import React, { useState, useEffect } from 'react';
import {
  Activity,
  CloudRain,
  Cpu,
  ArrowUpRight,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  RefreshCw,
  Download,
  Calendar,
  AlertCircle,
  X,
  Sparkles,
  ArrowRight,
  Layers,
  Flame,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import type {
  PageId,
  HealthStatus,
  DatasetItem,
  DatasetProfile,
  AnomalySummary,
  AnomalyRecord,
  AnomalyTimelineResponse,
} from '../../types';
import {
  fetchDatasets,
  fetchDatasetProfile,
  fetchAnomalySummary,
  fetchAnomalyTimeline,
  fetchAnomalies,
  loadSampleDataset,
  getAnomalyExportUrl,
} from '../../services/api';

interface DashboardPageProps {
  health: HealthStatus;
  onNavigate: (page: PageId) => void;
  selectedDatasetId?: number | null;
  onSelectDataset?: (id: number) => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  extreme: '#f43f5e', // Rose-500
  high: '#f59e0b',    // Amber-500
  moderate: '#38bdf8',// Sky-400
  none: '#94a3b8',    // Slate-400
};

const DETECTOR_COLORS: Record<string, string> = {
  'Seasonal Z-score': '#f43f5e',
  'Modified Z (MAD)': '#f59e0b',
  'Isolation Forest': '#6366f1',
  'LOF': '#a855f7',
};

export const DashboardPage: React.FC<DashboardPageProps> = ({
  health,
  onNavigate,
  selectedDatasetId: externalDatasetId,
  onSelectDataset,
}) => {
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<number | null>(externalDatasetId ?? null);
  const [profile, setProfile] = useState<DatasetProfile | null>(null);
  const [summary, setSummary] = useState<AnomalySummary | null>(null);
  const [timeline, setTimeline] = useState<AnomalyTimelineResponse | null>(null);
  const [timelineInterval, setTimelineInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [extremeEvents, setExtremeEvents] = useState<AnomalyRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inspectedRecord, setInspectedRecord] = useState<AnomalyRecord | null>(null);

  // 1. Initial load: fetch registered datasets
  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        setErrorMessage(null);
        const list = await fetchDatasets();
        setDatasets(list);
        if (list.length > 0) {
          const initialId = externalDatasetId && list.some(d => d.id === externalDatasetId)
            ? externalDatasetId
            : list[0].id;
          setActiveDatasetId(initialId);
          onSelectDataset?.(initialId);
        } else {
          setActiveDatasetId(null);
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to fetch datasets');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Sync with external selectedDatasetId if changed outside
  useEffect(() => {
    if (externalDatasetId && externalDatasetId !== activeDatasetId) {
      setActiveDatasetId(externalDatasetId);
    }
  }, [externalDatasetId]);

  // 2. When active dataset changes, fetch profile, summary, timeline, and top extreme events
  useEffect(() => {
    if (!activeDatasetId) {
      setProfile(null);
      setSummary(null);
      setTimeline(null);
      setExtremeEvents([]);
      return;
    }

    loadDashboardMetrics(activeDatasetId, timelineInterval);
  }, [activeDatasetId, timelineInterval]);

  const loadDashboardMetrics = async (datasetId: number, interval: 'monthly' | 'yearly') => {
    setLoading(true);
    setErrorMessage(null);

    try {
      // A. Fetch profile
      try {
        const profData = await fetchDatasetProfile(datasetId);
        setProfile(profData);
      } catch {
        setProfile(null);
      }

      // B. Fetch anomaly summary
      let hasSummary = false;
      try {
        const sumData = await fetchAnomalySummary(datasetId);
        setSummary(sumData);
        hasSummary = true;
      } catch {
        setSummary(null);
        setTimeline(null);
        setExtremeEvents([]);
      }

      // C. If summary exists, fetch timeline and top extreme events
      if (hasSummary) {
        try {
          const tlData = await fetchAnomalyTimeline(datasetId, { interval });
          setTimeline(tlData);
        } catch {
          setTimeline(null);
        }

        try {
          const anomData = await fetchAnomalies(datasetId, {
            sort_by: 'deviation',
            sort_order: 'desc',
            limit: 5,
          });
          setExtremeEvents(anomData.anomalies);
        } catch {
          setExtremeEvents([]);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error loading dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  const handleDatasetChange = (id: number) => {
    setActiveDatasetId(id);
    onSelectDataset?.(id);
  };

  const handleLoadSample = async (sampleKey: string) => {
    try {
      setLoadingSample(sampleKey);
      setErrorMessage(null);
      const newDataset = await loadSampleDataset(sampleKey);
      const list = await fetchDatasets();
      setDatasets(list);
      setActiveDatasetId(newDataset.id);
      onSelectDataset?.(newDataset.id);
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to load sample ${sampleKey}`);
    } finally {
      setLoadingSample(null);
    }
  };

  const selectedDataset = datasets.find(d => d.id === activeDatasetId);
  const totalSystemRecords = datasets.reduce((acc, d) => acc + (d.row_count || 0), 0);

  // Chart data formatting
  const timelineChartData = timeline?.buckets.map(b => ({
    period: b.period,
    Confirmed: b.confirmed,
    Potential: b.potential,
    total: b.total_anomalies,
    extreme: b.extreme,
  })) || [];

  const severityChartData = summary ? [
    { name: 'Extreme', count: summary.severity_breakdown.extreme, color: SEVERITY_COLORS.extreme },
    { name: 'High', count: summary.severity_breakdown.high, color: SEVERITY_COLORS.high },
    { name: 'Moderate', count: summary.severity_breakdown.moderate, color: SEVERITY_COLORS.moderate },
  ].filter(d => d.count > 0) : [];

  const detectorChartData = summary ? [
    { algorithm: 'Seasonal Z', count: summary.detector_breakdown.seasonal_zscore, fill: DETECTOR_COLORS['Seasonal Z-score'] },
    { algorithm: 'Modified Z (MAD)', count: summary.detector_breakdown.modified_zscore, fill: DETECTOR_COLORS['Modified Z (MAD)'] },
    { algorithm: 'Isolation Forest', count: summary.detector_breakdown.isolation_forest, fill: DETECTOR_COLORS['Isolation Forest'] },
    { algorithm: 'LOF', count: summary.detector_breakdown.lof, fill: DETECTOR_COLORS['LOF'] },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Overview Banner & Quick Actions */}
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs backdrop-blur-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Climate Intelligence Suite
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Command Center Overview
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Real-time meteorological monitoring, data quality auditing, seasonal climatological baselines, and multi-detector consensus anomaly tracking.
            </p>
          </div>

          {/* Dataset Selector & Quick Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {datasets.length > 0 && (
              <div className="relative">
                <select
                  value={activeDatasetId ?? ''}
                  onChange={(e) => handleDatasetChange(Number(e.target.value))}
                  className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                >
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      #{d.id} - {d.name} ({d.row_count.toLocaleString()} rows)
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
            )}

            <button
              onClick={() => onNavigate('datasets')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <CloudRain className="w-3.5 h-3.5 text-sky-500" />
              <span>Datasets</span>
            </button>

            <button
              onClick={() => onNavigate('anomalies')}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition-colors cursor-pointer"
            >
              <span>Explore Anomalies</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>

            {selectedDataset && summary && (
              <a
                href={getAnomalyExportUrl(selectedDataset.id, { format: 'csv' })}
                download
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
                title="Download CSV export of detected anomalies"
              >
                <Download className="w-3.5 h-3.5 text-emerald-500" />
                <span>Export CSV</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="p-1 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 5 Live KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* KPI 1: Monitored Observations */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Observations</span>
            <Layers className="w-4 h-4 text-sky-500" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono">
              {loading ? (
                <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ) : selectedDataset ? (
                selectedDataset.row_count.toLocaleString()
              ) : (
                '0'
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Active series | Total: <span className="font-semibold text-slate-700 dark:text-slate-300">{totalSystemRecords.toLocaleString()}</span> in DB
            </p>
          </div>
        </div>

        {/* KPI 2: Confirmed Anomalies */}
        <div className="p-5 rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/20 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Confirmed
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">
              ≥2 Agree
            </span>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono">
              {loading ? (
                <div className="h-7 w-16 bg-rose-200 dark:bg-rose-950 rounded animate-pulse" />
              ) : summary ? (
                summary.confirmed_count.toLocaleString()
              ) : (
                '--'
              )}
            </div>
            <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-1">
              {summary && selectedDataset && selectedDataset.row_count > 0 ? (
                `${((summary.confirmed_count / selectedDataset.row_count) * 100).toFixed(1)}% of observations`
              ) : (
                'Multi-detector consensus'
              )}
            </p>
          </div>
        </div>

        {/* KPI 3: Potential Anomalies */}
        <div className="p-5 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/20 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Potential
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
              1 Detector
            </span>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono">
              {loading ? (
                <div className="h-7 w-16 bg-amber-200 dark:bg-amber-950 rounded animate-pulse" />
              ) : summary ? (
                summary.potential_count.toLocaleString()
              ) : (
                '--'
              )}
            </div>
            <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-1">
              {summary && selectedDataset && selectedDataset.row_count > 0 ? (
                `${((summary.potential_count / selectedDataset.row_count) * 100).toFixed(1)}% of observations`
              ) : (
                'Single algorithm departures'
              )}
            </p>
          </div>
        </div>

        {/* KPI 4: Data Quality Score */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Quality Score</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono">
              {loading ? (
                <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ) : profile ? (
                `${Math.round(profile.overall_quality_score)}/100`
              ) : (
                '--'
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              {profile ? (
                profile.overall_quality_score >= 80 ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">Optimal Completeness</span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">Imputation Recommended</span>
                )
              ) : (
                'Physical consistency metric'
              )}
            </p>
          </div>
        </div>

        {/* KPI 5: Engine & Database Health */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Climate Engine</span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 capitalize">
              {health.status}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              SQLite: <span className="font-medium text-emerald-600 dark:text-emerald-400">{health.database}</span>
              {health.latencyMs !== undefined && (
                <span className="text-slate-400 pl-1 font-mono">({health.latencyMs}ms)</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Empty State: No Datasets Registered */}
      {datasets.length === 0 && !loading && (
        <div className="p-10 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/30 text-center">
          <CloudRain className="w-12 h-12 text-sky-500 mx-auto mb-3 opacity-80" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            No Meteorological Datasets Registered
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1 mb-5">
            Ingest historical weather CSVs or load mathematically calibrated synthetic benchmark stations to begin exploratory analysis and ensemble anomaly detection.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              disabled={loadingSample !== null}
              onClick={() => handleLoadSample('delhi_climate')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {loadingSample === 'delhi_climate' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>Load Delhi Benchmark (Heatwave/Monsoon)</span>
            </button>
            <button
              disabled={loadingSample !== null}
              onClick={() => handleLoadSample('seattle_weather')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              {loadingSample === 'seattle_weather' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>Load Seattle Benchmark (Heat Dome)</span>
            </button>
            <button
              onClick={() => onNavigate('datasets')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              <span>Upload Custom CSV</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Empty State: Dataset Selected But No Detection Run Executed */}
      {selectedDataset && !summary && !loading && (
        <div className="p-8 rounded-2xl border border-dashed border-amber-300 dark:border-amber-900/60 bg-amber-50/30 dark:bg-amber-950/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Anomaly Detection Pipeline Pending for {selectedDataset.name}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl">
                The 4-algorithm consensus ensemble (Seasonal Z-score, Modified Z/MAD, Isolation Forest, and LOF) has not been run on this dataset yet. Run detection now to compute climatological baselines and identify anomalies.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('anomalies')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            <Cpu className="w-4 h-4" />
            <span>Run Anomaly Detection</span>
          </button>
        </div>
      )}

      {/* Main Visualizations Grid */}
      {summary && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart 1: Anomaly Frequency Timeline (Spans 2 columns) */}
          <div className="lg:col-span-2 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-500" />
                  <span>Temporal Anomaly Distribution</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Monthly frequency of confirmed vs. potential departures over time
                </p>
              </div>

              {/* Interval Switcher */}
              <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 text-xs bg-slate-50 dark:bg-slate-950">
                <button
                  onClick={() => setTimelineInterval('monthly')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    timelineInterval === 'monthly'
                      ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-2xs font-semibold'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setTimelineInterval('yearly')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    timelineInterval === 'yearly'
                      ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-2xs font-semibold'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Yearly
                </button>
              </div>
            </div>

            {/* Recharts Timeline */}
            <div className="h-64 w-full">
              {timelineChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timelineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1', opacity: 0.3 }}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1', opacity: 0.3 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        const conf = payload.find(p => p.dataKey === 'Confirmed')?.value || 0;
                        const pot = payload.find(p => p.dataKey === 'Potential')?.value || 0;
                        return (
                          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg text-xs space-y-1">
                            <div className="font-bold text-slate-800 dark:text-slate-100">{label}</div>
                            <div className="flex items-center justify-between gap-4 text-rose-600 font-medium">
                              <span>Confirmed (≥2):</span>
                              <span className="font-mono font-bold">{conf}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 text-amber-600 font-medium">
                              <span>Potential (1):</span>
                              <span className="font-mono font-bold">{pot}</span>
                            </div>
                            <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 font-bold text-slate-900 dark:text-slate-100">
                              <span>Total Departures:</span>
                              <span className="font-mono">{Number(conf) + Number(pot)}</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      wrapperStyle={{ paddingBottom: 10, fontSize: 11 }}
                    />
                    <Bar dataKey="Confirmed" fill="#f43f5e" stackId="a" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Potential" fill="#f59e0b" stackId="a" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No timeline records available
                </div>
              )}
            </div>
          </div>

          {/* Chart 2: Severity Distribution Donut */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span>Severity Classification</span>
                </h3>
                <span className="text-[11px] font-mono text-slate-400">
                  {summary.confirmed_count + summary.potential_count} total
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Categorised by consensus votes and departure magnitude
              </p>
            </div>

            <div className="h-44 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={severityChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="count"
                  >
                    {severityChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const item = payload[0];
                      const totalAnomalies = summary.confirmed_count + summary.potential_count;
                      const pct = totalAnomalies > 0 ? ((Number(item.value) / totalAnomalies) * 100).toFixed(1) : '0';
                      return (
                        <div className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-md text-xs">
                          <span className="font-semibold text-slate-800 dark:text-slate-100">{item.name}: </span>
                          <span className="font-mono font-bold">{item.value} ({pct}%)</span>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-extrabold text-slate-900 dark:text-slate-100 font-mono">
                  {summary.severity_breakdown.extreme}
                </span>
                <span className="text-[10px] text-rose-500 font-medium uppercase tracking-wider">
                  Extreme
                </span>
              </div>
            </div>

            {/* Severity Legend */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="p-1.5 rounded bg-rose-50/50 dark:bg-rose-950/20">
                <div className="text-[10px] text-rose-600 font-semibold uppercase">Extreme</div>
                <div className="text-sm font-bold text-rose-700 dark:text-rose-400 font-mono">{summary.severity_breakdown.extreme}</div>
              </div>
              <div className="p-1.5 rounded bg-amber-50/50 dark:bg-amber-950/20">
                <div className="text-[10px] text-amber-600 font-semibold uppercase">High</div>
                <div className="text-sm font-bold text-amber-700 dark:text-amber-400 font-mono">{summary.severity_breakdown.high}</div>
              </div>
              <div className="p-1.5 rounded bg-sky-50/50 dark:bg-sky-950/20">
                <div className="text-[10px] text-sky-600 font-semibold uppercase">Moderate</div>
                <div className="text-sm font-bold text-sky-700 dark:text-sky-400 font-mono">{summary.severity_breakdown.moderate}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detector Consensus Breakdown Bar & Meteorological Profile Summary */}
      {summary && profile && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart 3: Detector Agreement Counts */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-500" />
                  <span>Ensemble Voting Power</span>
                </h3>
                <span className="text-[11px] text-slate-400">Target: {summary.primary_variable}</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Observation flags attributed to each constituent algorithm
              </p>
            </div>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={detectorChartData} layout="vertical" margin={{ top: 5, right: 20, left: 25, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="algorithm" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={85} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const item = payload[0];
                      return (
                        <div className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-md text-xs">
                          <span className="font-semibold text-slate-800 dark:text-slate-100">{item.payload.algorithm}: </span>
                          <span className="font-mono font-bold text-sky-600">{item.value} flags</span>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {detectorChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Meteorological Station Profile Card */}
          <div className="lg:col-span-2 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span>Station Meteorological Profile</span>
                </h3>
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {profile.invalid_values?.length === 0 ? '100% physically valid' : `${profile.invalid_values?.length || 0} consistency rules checked`}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Temporal coverage, physical consistency boundaries, and station attributes
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
                <div className="text-[10px] text-slate-400">Start Date</div>
                <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                  {profile.temporal_profile?.start_date || '--'}
                </div>
              </div>
              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
                <div className="text-[10px] text-slate-400">End Date</div>
                <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                  {profile.temporal_profile?.end_date || '--'}
                </div>
              </div>
              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
                <div className="text-[10px] text-slate-400">Time Span</div>
                <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                  {profile.temporal_profile?.duration_days ? `${profile.temporal_profile.duration_days} days` : '--'}
                </div>
              </div>
              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
                <div className="text-[10px] text-slate-400">Frequency</div>
                <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                  {profile.temporal_profile?.frequency || 'Daily'}
                </div>
              </div>
            </div>

            {/* Variable Health Pills */}
            <div className="flex items-center gap-2 flex-wrap text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-400">Tracked Variables:</span>
              {profile.column_stats?.filter(c => c.standard_name && c.standard_name !== 'date').map((c) => (
                <span
                  key={c.column}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono"
                >
                  <span className="font-medium capitalize">{c.standard_name || c.column}</span>
                  <span className="text-slate-400 text-[10px]">({c.mean !== undefined && c.mean !== null ? c.mean.toFixed(1) : '--'})</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top 5 Extreme Weather Events Feed */}
      {summary && extremeEvents.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Top 5 Severe Meteorological Departures
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Most extreme deviations relative to seasonal expected climatology
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('anomalies')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-500 cursor-pointer"
            >
              <span>View All Anomalies</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/90 dark:bg-slate-900/90 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Date</th>
                  <th className="py-2.5 px-3 font-semibold">Variable</th>
                  <th className="py-2.5 px-3 font-semibold">Observed</th>
                  <th className="py-2.5 px-3 font-semibold">Expected Seasonal</th>
                  <th className="py-2.5 px-3 font-semibold">Net Departure</th>
                  <th className="py-2.5 px-3 font-semibold">Z / MAD</th>
                  <th className="py-2.5 px-3 font-semibold">Consensus Agreement</th>
                  <th className="py-2.5 px-3 font-semibold">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {extremeEvents.map((a, idx) => (
                  <tr
                    key={idx}
                    onClick={() => setInspectedRecord(a)}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                      {a.date}
                    </td>
                    <td className="py-2.5 px-3 capitalize text-slate-600 dark:text-slate-300">
                      {a.variable}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                      {a.observed_value ?? '--'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">
                      {a.expected_value ?? '--'}
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      <span className={a.deviation && a.deviation > 0 ? 'text-rose-600 font-semibold' : 'text-sky-600 font-semibold'}>
                        {a.deviation && a.deviation > 0 ? `+${a.deviation}` : a.deviation ?? '--'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                      Z: {a.z_score} | M: {a.modified_z_score}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                            a.flagged_by.includes('seasonal_zscore')
                              ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                          }`}
                        >
                          Z
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                            a.flagged_by.includes('modified_zscore')
                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                          }`}
                        >
                          MAD
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                            a.flagged_by.includes('isolation_forest')
                              ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                          }`}
                        >
                          IF
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                            a.flagged_by.includes('lof')
                              ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                          }`}
                        >
                          LOF
                        </span>
                        <span className="text-[11px] text-slate-400 pl-1">
                          ({a.flag_count}/4)
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          a.severity === 'extreme'
                            ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40'
                            : a.severity === 'high'
                            ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
                            : 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40'
                        }`}
                      >
                        {a.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Individual Anomaly Diagnostic Inspection Modal */}
      {inspectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Anomaly Diagnostic #{inspectedRecord.index}
                </h3>
                <p className="text-xs text-slate-500">Date: {inspectedRecord.date}</p>
              </div>
              <button
                onClick={() => setInspectedRecord(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
                  <div className="text-[10px] text-slate-500">Observed Value</div>
                  <div className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                    {inspectedRecord.observed_value ?? '--'}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
                  <div className="text-[10px] text-slate-500">Seasonal Climatology</div>
                  <div className="text-sm font-bold font-mono text-slate-600 dark:text-slate-300 mt-0.5">
                    {inspectedRecord.expected_value ?? '--'}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
                  <div className="text-[10px] text-slate-500">Net Deviation</div>
                  <div className={`text-sm font-bold font-mono mt-0.5 ${
                    inspectedRecord.deviation && inspectedRecord.deviation > 0 ? 'text-rose-600' : 'text-sky-600'
                  }`}>
                    {inspectedRecord.deviation && inspectedRecord.deviation > 0
                      ? `+${inspectedRecord.deviation}`
                      : inspectedRecord.deviation ?? '--'}
                  </div>
                </div>
              </div>

              {/* Multi-algorithm Voting Breakdown */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  Multi-Detector Consensus Votes ({inspectedRecord.flag_count}/4)
                </div>
                <div className="space-y-1.5">
                  {[
                    { key: 'seasonal_zscore', name: 'Seasonal Z-score', score: `Z = ${inspectedRecord.z_score}` },
                    { key: 'modified_zscore', name: 'Modified Z-score (MAD)', score: `M = ${inspectedRecord.modified_z_score}` },
                    { key: 'isolation_forest', name: 'Isolation Forest', score: `Score = ${inspectedRecord.iforest_score}` },
                    { key: 'lof', name: 'Local Outlier Factor', score: `Score = ${inspectedRecord.lof_score}` },
                  ].map((det) => {
                    const isFlagged = inspectedRecord.flagged_by.includes(det.key);
                    return (
                      <div
                        key={det.key}
                        className={`p-2.5 rounded-lg border flex items-center justify-between ${
                          isFlagged
                            ? 'border-rose-200 dark:border-rose-950 bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isFlagged ? 'bg-rose-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
                          <span className="font-medium">{det.name}</span>
                        </div>
                        <span className="font-mono text-[11px] font-semibold">{det.score}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-400">Consensus Classification</div>
                  <div className="font-bold capitalize text-slate-800 dark:text-slate-200">
                    {inspectedRecord.classification} ({inspectedRecord.severity} severity)
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full font-bold uppercase text-[10px] ${
                    inspectedRecord.classification === 'confirmed'
                      ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                      : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {inspectedRecord.classification}
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setInspectedRecord(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
