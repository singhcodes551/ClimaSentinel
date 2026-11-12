import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3,
  LineChart as LineChartIcon,
  Calendar,
  Grid,
  Activity,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  Info,
  Droplets,
  Thermometer,
  Wind,
  Gauge,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import type {
  DatasetItem,
  VariableDistribution,
  CorrelationMatrixResponse,
  SeasonalityResponse,
  TimeseriesResponse,
  MissingnessResponse,
} from '../../types';
import {
  fetchDatasets,
  fetchEDADistribution,
  fetchEDACorrelations,
  fetchEDASeasonality,
  fetchEDATimeseries,
  fetchEDAMissingness,
} from '../../services/api';

interface EDAPageProps {
  selectedDatasetId?: number | null;
  onSelectDataset?: (id: number) => void;
}

type TabType = 'distributions' | 'seasonality' | 'correlations' | 'timeseries';

export const EDAPage: React.FC<EDAPageProps> = ({
  selectedDatasetId: externalDatasetId,
  onSelectDataset,
}) => {
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(externalDatasetId ?? null);
  const [activeTab, setActiveTab] = useState<TabType>('distributions');
  const [globalLoading, setGlobalLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Tab 1: Distributions State
  const [distribution, setDistribution] = useState<VariableDistribution | null>(null);
  const [distVariable, setDistVariable] = useState<string>('temperature');
  const [binCount, setBinCount] = useState<number>(20);
  const [distLoading, setDistLoading] = useState<boolean>(false);

  // Tab 2: Seasonality State
  const [seasonality, setSeasonality] = useState<SeasonalityResponse | null>(null);
  const [seasonVariable, setSeasonVariable] = useState<string>('temperature');
  const [seasonLoading, setSeasonLoading] = useState<boolean>(false);

  // Tab 3: Correlations State
  const [correlations, setCorrelations] = useState<CorrelationMatrixResponse | null>(null);
  const [corrLoading, setCorrLoading] = useState<boolean>(false);
  const [selectedPair, setSelectedPair] = useState<{
    varX: string;
    varY: string;
    r: number | null;
    n: number;
  } | null>(null);
  const [scatterPoints, setScatterPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [scatterLoading, setScatterLoading] = useState<boolean>(false);

  // Tab 4: Time Series & Missingness State
  const [timeseries, setTimeseries] = useState<TimeseriesResponse | null>(null);
  const [tsVariable, setTsVariable] = useState<string>('temperature');
  const [missingness, setMissingness] = useState<MissingnessResponse | null>(null);
  const [tsLoading, setTsLoading] = useState<boolean>(false);
  const [missingLoading, setMissingLoading] = useState<boolean>(false);

  // Synchronize internal selection with external prop
  useEffect(() => {
    if (externalDatasetId !== undefined && externalDatasetId !== null) {
      setSelectedId(externalDatasetId);
    }
  }, [externalDatasetId]);

  // Initial load of registered datasets
  const loadDatasets = useCallback(async () => {
    setGlobalLoading(true);
    setError(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to backend datasets.');
    } finally {
      setGlobalLoading(false);
    }
  }, [selectedId, onSelectDataset]);

  useEffect(() => {
    loadDatasets();
  }, []);

  const handleSelectDataset = (id: number) => {
    setSelectedId(id);
    onSelectDataset?.(id);
    setSelectedPair(null);
    setScatterPoints([]);
  };

  // Determine available meteorological variables from dataset
  const activeDataset = useMemo(
    () => datasets.find((d) => d.id === selectedId),
    [datasets, selectedId]
  );

  const availableVariables = useMemo(() => {
    if (!activeDataset) return ['temperature'];
    if (activeDataset.column_mapping) {
      const mapped = Object.keys(activeDataset.column_mapping).filter((k) => k !== 'date');
      if (mapped.length > 0) return mapped;
    }
    return ['temperature', 'humidity', 'rainfall', 'wind_speed', 'pressure'];
  }, [activeDataset]);

  // Make sure selected variable exists in available list
  useEffect(() => {
    if (availableVariables.length > 0) {
      if (!availableVariables.includes(distVariable)) {
        setDistVariable(availableVariables[0]);
      }
      if (!availableVariables.includes(seasonVariable)) {
        setSeasonVariable(availableVariables[0]);
      }
      if (!availableVariables.includes(tsVariable)) {
        setTsVariable(availableVariables[0]);
      }
    }
  }, [availableVariables, distVariable, seasonVariable, tsVariable]);

  // ============================================================================
  // Tab 1: Load Distribution Data
  // ============================================================================
  const loadDistribution = useCallback(async () => {
    if (!selectedId) return;
    setDistLoading(true);
    try {
      const data = await fetchEDADistribution(selectedId, distVariable, binCount);
      setDistribution(data);
    } catch (err) {
      console.error('Failed to load distribution:', err);
    } finally {
      setDistLoading(false);
    }
  }, [selectedId, distVariable, binCount]);

  useEffect(() => {
    if (activeTab === 'distributions' && selectedId) {
      loadDistribution();
    }
  }, [activeTab, selectedId, distVariable, binCount, loadDistribution]);

  // ============================================================================
  // Tab 2: Load Seasonality Data
  // ============================================================================
  const loadSeasonality = useCallback(async () => {
    if (!selectedId) return;
    setSeasonLoading(true);
    try {
      const data = await fetchEDASeasonality(selectedId);
      setSeasonality(data);
    } catch (err) {
      console.error('Failed to load seasonality:', err);
    } finally {
      setSeasonLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    if (activeTab === 'seasonality' && selectedId) {
      loadSeasonality();
    }
  }, [activeTab, selectedId, loadSeasonality]);

  // ============================================================================
  // Tab 3: Load Correlation Data & Scatter Data
  // ============================================================================
  const loadCorrelations = useCallback(async () => {
    if (!selectedId) return;
    setCorrLoading(true);
    try {
      const data = await fetchEDACorrelations(selectedId);
      setCorrelations(data);
      if (data.variables.length >= 2 && !selectedPair) {
        setSelectedPair({
          varX: data.variables[0],
          varY: data.variables[1],
          r: data.matrix[0][1],
          n: data.sample_sizes[0][1],
        });
      }
    } catch (err) {
      console.error('Failed to load correlations:', err);
    } finally {
      setCorrLoading(false);
    }
  }, [selectedId, selectedPair]);

  useEffect(() => {
    if (activeTab === 'correlations' && selectedId) {
      loadCorrelations();
    }
  }, [activeTab, selectedId, loadCorrelations]);

  // Load scatter data when a pair is selected in Tab 3
  useEffect(() => {
    if (activeTab === 'correlations' && selectedId && selectedPair) {
      let isMounted = true;
      setScatterLoading(true);
      Promise.all([
        fetchEDATimeseries(selectedId, selectedPair.varX, 800),
        fetchEDATimeseries(selectedId, selectedPair.varY, 800),
      ])
        .then(([resX, resY]) => {
          if (!isMounted) return;
          const yMap = new Map<string, number>();
          resY.points.forEach((p) => {
            if (p.value !== null) yMap.set(p.date, p.value);
          });
          const points: Array<{ x: number; y: number }> = [];
          resX.points.forEach((p) => {
            if (p.value !== null && yMap.has(p.date)) {
              points.push({ x: p.value, y: yMap.get(p.date)! });
            }
          });
          setScatterPoints(points);
        })
        .catch((err) => console.error('Failed to load scatter data:', err))
        .finally(() => {
          if (isMounted) setScatterLoading(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [activeTab, selectedId, selectedPair]);

  // ============================================================================
  // Tab 4: Load Timeseries & Missingness Data
  // ============================================================================
  const loadTimeseriesAndMissingness = useCallback(async () => {
    if (!selectedId) return;
    setTsLoading(true);
    setMissingLoading(true);
    try {
      const [tsRes, missRes] = await Promise.all([
        fetchEDATimeseries(selectedId, tsVariable, 700),
        fetchEDAMissingness(selectedId),
      ]);
      setTimeseries(tsRes);
      setMissingness(missRes);
    } catch (err) {
      console.error('Failed to load timeseries or missingness:', err);
    } finally {
      setTsLoading(false);
      setMissingLoading(false);
    }
  }, [selectedId, tsVariable]);

  useEffect(() => {
    if (activeTab === 'timeseries' && selectedId) {
      loadTimeseriesAndMissingness();
    }
  }, [activeTab, selectedId, tsVariable, loadTimeseriesAndMissingness]);

  // Format Helper for Variables
  const getVariableIcon = (varName: string) => {
    const v = varName.toLowerCase();
    if (v.includes('temp')) return <Thermometer className="w-4 h-4 text-rose-500 inline mr-1" />;
    if (v.includes('hum') || v.includes('rain')) return <Droplets className="w-4 h-4 text-sky-500 inline mr-1" />;
    if (v.includes('wind')) return <Wind className="w-4 h-4 text-emerald-500 inline mr-1" />;
    if (v.includes('press')) return <Gauge className="w-4 h-4 text-indigo-500 inline mr-1" />;
    return <Activity className="w-4 h-4 text-slate-400 inline mr-1" />;
  };

  const getSkewnessBadge = (skew: number | null) => {
    if (skew === null) return { text: 'N/A', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };
    const absS = Math.abs(skew);
    if (absS < 0.5) return { text: 'Approximately Symmetric', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' };
    if (skew > 0) {
      return absS < 1.0
        ? { text: 'Moderate Positive Skew (Right-Tailed)', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800' }
        : { text: 'Heavy Positive Skew (Long Right Tail)', color: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800' };
    }
    return absS < 1.0
      ? { text: 'Moderate Negative Skew (Left-Tailed)', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800' }
      : { text: 'Heavy Negative Skew (Long Left Tail)', color: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800' };
  };

  const getKurtosisBadge = (kurt: number | null) => {
    if (kurt === null) return { text: 'N/A', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };
    if (Math.abs(kurt) < 0.5) {
      return { text: 'Mesokurtic (Normal Tail Weight)', color: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800' };
    }
    if (kurt > 0.5) {
      return { text: 'Leptokurtic (Heavy Tails / Outlier-Prone)', color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' };
    }
    return { text: 'Platykurtic (Thin Tails / Flat Peak)', color: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800' };
  };

  const getCorrelationColor = (r: number | null) => {
    if (r === null) return 'bg-slate-100 dark:bg-slate-800 text-slate-400';
    if (r === 1.0) return 'bg-sky-600 text-white font-bold';
    if (r > 0.7) return 'bg-sky-500/80 text-white font-medium';
    if (r > 0.4) return 'bg-sky-500/50 text-slate-900 dark:text-slate-100';
    if (r > 0.1) return 'bg-sky-500/20 text-slate-800 dark:text-slate-200';
    if (r >= -0.1) return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
    if (r >= -0.4) return 'bg-rose-500/20 text-slate-800 dark:text-slate-200';
    if (r >= -0.7) return 'bg-rose-500/50 text-slate-900 dark:text-slate-100';
    return 'bg-rose-500/80 text-white font-medium';
  };

  return (
    <div className="space-y-6">
      {/* ====================================================================== */}
      {/* Header and Dataset Selector                                            */}
      {/* ====================================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Exploratory Data Analysis (EDA)
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
              Climatology & Profiling Suite
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Deep meteorological profiling: distribution moments, seasonal climatology, inter-variable correlation, and sensor missingness.
          </p>
        </div>

        {/* Dataset Selector Dropdown */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Station / Dataset:</span>
            <select
              value={selectedId ?? ''}
              onChange={(e) => handleSelectDataset(Number(e.target.value))}
              className="bg-transparent text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
              disabled={globalLoading || datasets.length === 0}
            >
              {globalLoading ? (
                <option value="">Loading datasets...</option>
              ) : datasets.length === 0 ? (
                <option value="">No datasets available</option>
              ) : (
                datasets.map((d) => (
                  <option key={d.id} value={d.id} className="dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    {d.name} ({d.row_count?.toLocaleString()} rows)
                  </option>
                ))
              )}
            </select>
            {activeDataset && (
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  activeDataset.status === 'wrangled'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                }`}
              >
                {activeDataset.status}
              </span>
            )}
          </div>

          <button
            onClick={() => {
              loadDatasets();
              if (activeTab === 'distributions') loadDistribution();
              if (activeTab === 'seasonality') loadSeasonality();
              if (activeTab === 'correlations') loadCorrelations();
              if (activeTab === 'timeseries') loadTimeseriesAndMissingness();
            }}
            title="Refresh Analysis"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition"
            disabled={globalLoading}
          >
            <RefreshCw className={`w-4 h-4 ${globalLoading ? 'animate-spin text-sky-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-500" />
          <div>
            <span className="font-semibold">Backend Connection Notice: </span>
            {error}
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* 4 Interactive Tabs Navigation                                          */}
      {/* ====================================================================== */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-2">
        <button
          onClick={() => setActiveTab('distributions')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'distributions'
              ? 'border-sky-500 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Overview & Distributions
        </button>

        <button
          onClick={() => setActiveTab('seasonality')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'seasonality'
              ? 'border-sky-500 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Seasonal Climatology
        </button>

        <button
          onClick={() => setActiveTab('correlations')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'correlations'
              ? 'border-sky-500 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Grid className="w-4 h-4" />
          Correlation Matrix & Bivariate
        </button>

        <button
          onClick={() => setActiveTab('timeseries')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'timeseries'
              ? 'border-sky-500 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <LineChartIcon className="w-4 h-4" />
          Time Series & Missingness
        </button>
      </div>

      {/* ====================================================================== */}
      {/* TAB 1: OVERVIEW & DISTRIBUTIONS                                        */}
      {/* ====================================================================== */}
      {activeTab === 'distributions' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Variable:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {availableVariables.map((v) => (
                  <button
                    key={v}
                    onClick={() => setDistVariable(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                      distVariable === v
                        ? 'bg-sky-500 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {getVariableIcon(v)}
                    {v.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Histogram Bins:</span>
              <div className="flex gap-1">
                {[10, 15, 20, 25, 30].map((b) => (
                  <button
                    key={b}
                    onClick={() => setBinCount(b)}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition ${
                      binCount === b
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Statistical Moments Summary Cards */}
          {distribution && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Valid Sample</div>
                <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {distribution.valid_count.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {distribution.missing_count > 0 ? `${distribution.missing_count} missing` : '100% complete'}
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Range (Min — Max)</div>
                <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {distribution.min !== null ? distribution.min : '—'} to {distribution.max !== null ? distribution.max : '—'}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Unit: {distribution.unit || 'Standard'}
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Central Tendency</div>
                <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {distribution.mean !== null ? distribution.mean : '—'}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Median: {distribution.median !== null ? distribution.median : '—'}
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Standard Deviation</div>
                <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                  ±{distribution.std !== null ? distribution.std : '—'}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Sample variability</div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Skewness Moment</div>
                <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {distribution.skewness !== null ? distribution.skewness : '—'}
                </div>
                <div className="mt-1">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${
                      getSkewnessBadge(distribution.skewness).color
                    }`}
                  >
                    {distribution.skewness !== null && Math.abs(distribution.skewness) < 0.5 ? 'Symmetric' : 'Asymmetric'}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Excess Kurtosis</div>
                <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {distribution.kurtosis !== null ? distribution.kurtosis : '—'}
                </div>
                <div className="mt-1">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${
                      getKurtosisBadge(distribution.kurtosis).color
                    }`}
                  >
                    {distribution.kurtosis !== null && distribution.kurtosis > 0.5 ? 'Fat Tails' : 'Normal Tails'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Histogram Chart */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Empirical Frequency Distribution ({distVariable.replace('_', ' ')})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Binned histogram with sample proportions and non-Gaussian tail behavior.
                </p>
              </div>
              {distribution?.physical_limits && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  Physical Bounds: [{distribution.physical_limits.min} to {distribution.physical_limits.max} {distribution.unit}]
                </div>
              )}
            </div>

            {distLoading ? (
              <div className="h-72 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
              </div>
            ) : distribution && distribution.bins.length > 0 ? (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distribution.bins} margin={{ top: 10, right: 20, left: 0, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                    <XAxis
                      dataKey="bin_start"
                      tickFormatter={(val) => `${val}`}
                      stroke="#94a3b8"
                      fontSize={11}
                      label={{
                        value: `${distVariable} (${distribution.unit || 'units'})`,
                        position: 'insideBottom',
                        offset: -15,
                        fill: '#94a3b8',
                        fontSize: 12,
                      }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={11}
                      label={{ value: 'Observations', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl text-xs space-y-1 border border-slate-700">
                              <p className="font-semibold text-sky-400">
                                Interval: [{data.bin_start} to {data.bin_end} {distribution.unit}]
                              </p>
                              <p>Count: {data.count.toLocaleString()} observations</p>
                              <p>Share: {data.percentage}% of sample</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="count" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                No distribution data available for this variable.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* TAB 2: SEASONAL CLIMATOLOGY                                            */}
      {/* ====================================================================== */}
      {activeTab === 'seasonality' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Climatology Variable:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(seasonality?.available_variables || availableVariables).map((v) => (
                  <button
                    key={v}
                    onClick={() => setSeasonVariable(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                      seasonVariable === v
                        ? 'bg-sky-500 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {getVariableIcon(v)}
                    {v.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-sky-500" />
              Calculated across all historical observations in dataset
            </div>
          </div>

          {/* 12-Month Calendar Climatology Chart */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              12-Month Annual Climatological Cycle ({seasonVariable.replace('_', ' ')})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">
              Monthly mean baseline values with historical minimum, maximum, and standard deviation bounds.
            </p>

            {seasonLoading ? (
              <div className="h-72 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
              </div>
            ) : seasonality ? (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={seasonality.monthly_profile.map((m) => {
                      const vStats = m.metrics[seasonVariable] || {};
                      return {
                        month_name: m.month_name,
                        record_count: m.record_count,
                        mean: vStats.mean ?? 0,
                        min: vStats.min ?? 0,
                        max: vStats.max ?? 0,
                        std: vStats.std ?? 0,
                      };
                    })}
                    margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                    <XAxis dataKey="month_name" stroke="#94a3b8" fontSize={12} />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={12}
                      label={{ value: 'Mean Value', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl text-xs space-y-1 border border-slate-700">
                              <p className="font-semibold text-sky-400">{data.month_name} Climatology</p>
                              <p>Mean: {data.mean}</p>
                              <p>Std Dev (±): {data.std}</p>
                              <p>Historical Min: {data.min}</p>
                              <p>Historical Max: {data.max}</p>
                              <p className="text-slate-400 text-[10px] pt-1">Sample: {data.record_count} days</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="mean" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                No seasonal data available.
              </div>
            )}
          </div>

          {/* 4-Season Comparative Cards */}
          {seasonality && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {seasonality.seasonal_profile.map((s) => {
                  const sStats = s.metrics[seasonVariable] || {};
                  return (
                    <div
                      key={s.season_name}
                      className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{s.season_name}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {s.record_count} days
                        </span>
                      </div>

                      <div className="space-y-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">Mean:</span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {sStats.mean !== null && sStats.mean !== undefined ? sStats.mean : '—'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">Variability (±Std):</span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {sStats.std !== null && sStats.std !== undefined ? sStats.std : '—'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">Extreme Range:</span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {sStats.min !== null && sStats.min !== undefined ? sStats.min : '—'} to{' '}
                            {sStats.max !== null && sStats.max !== undefined ? sStats.max : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 text-xs text-slate-500 dark:text-slate-400 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-sky-500 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Northern Hemisphere Meteorological Conventions:
                  </span>{' '}
                  Seasons use standard WMO calendar quarter groupings: Winter (DJF: Dec–Feb), Spring (MAM: Mar–May), Summer (JJA: Jun–Aug), and Autumn (SON: Sep–Nov). These fixed meteorological groupings provide uniform comparative baselines across years and do not imply universal regional microclimate seasons.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================== */}
      {/* TAB 3: CORRELATION MATRIX & BIVARIATE                                   */}
      {/* ====================================================================== */}
      {activeTab === 'correlations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Heatmap Matrix (Left / 7 cols) */}
            <div className="lg:col-span-7 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Pairwise Complete Pearson Correlation
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Click any cell to inspect the bivariate relationship and scatter plot.
                  </p>
                </div>
              </div>

              {corrLoading ? (
                <div className="h-72 flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
                </div>
              ) : correlations && correlations.variables.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-center border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="p-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-left font-semibold text-slate-600 dark:text-slate-300">
                          Variable
                        </th>
                        {correlations.variables.map((v) => (
                          <th
                            key={v}
                            className="p-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 font-semibold text-slate-700 dark:text-slate-300 capitalize"
                          >
                            {v.replace('_', ' ')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {correlations.variables.map((rowVar, rIdx) => (
                        <tr key={rowVar}>
                          <td className="p-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-left font-semibold text-slate-700 dark:text-slate-300 capitalize">
                            {rowVar.replace('_', ' ')}
                          </td>
                          {correlations.variables.map((colVar, cIdx) => {
                            const rVal = correlations.matrix[rIdx][cIdx];
                            const nVal = correlations.sample_sizes[rIdx][cIdx];
                            const isSelected =
                              selectedPair &&
                              ((selectedPair.varX === rowVar && selectedPair.varY === colVar) ||
                                (selectedPair.varX === colVar && selectedPair.varY === rowVar));

                            return (
                              <td
                                key={colVar}
                                onClick={() =>
                                  setSelectedPair({
                                    varX: rowVar,
                                    varY: colVar,
                                    r: rVal,
                                    n: nVal,
                                  })
                                }
                                className={`p-3 border border-slate-200 dark:border-slate-800 cursor-pointer transition-all hover:ring-2 hover:ring-sky-500 ${getCorrelationColor(
                                  rVal
                                )} ${isSelected ? 'ring-2 ring-indigo-500 shadow-md scale-95' : ''}`}
                                title={`${rowVar} vs ${colVar} | r = ${rVal !== null ? rVal : 'N/A'} (N = ${nVal})`}
                              >
                                <div className="font-semibold">
                                  {rVal !== null ? rVal.toFixed(2) : '—'}
                                </div>
                                <div className="text-[10px] opacity-75">N={nVal}</div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Legend */}
                  <div className="flex items-center justify-between mt-4 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-rose-500/80 inline-block"></span>
                      Strong Inverse (-1.0)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-slate-200 dark:bg-slate-700 inline-block"></span>
                      Zero Correlation (0.0)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-sky-600 inline-block"></span>
                      Strong Direct (+1.0)
                    </span>
                  </div>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                  Insufficient numeric variables for correlation matrix.
                </div>
              )}
            </div>

            {/* Bivariate Scatter Plot (Right / 5 cols) */}
            <div className="lg:col-span-5 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Bivariate Scatter Exploration
                  </h3>
                  {selectedPair && selectedPair.r !== null && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-bold">
                      r = {selectedPair.r.toFixed(3)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  {selectedPair
                    ? `Scatter of ${selectedPair.varX.replace('_', ' ')} (X) vs ${selectedPair.varY.replace('_', ' ')} (Y)`
                    : 'Select a cell from the correlation matrix to render scatter'}
                </p>

                {scatterLoading ? (
                  <div className="h-64 flex items-center justify-center">
                    <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
                  </div>
                ) : scatterPoints.length > 0 && selectedPair ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                        <XAxis
                          type="number"
                          dataKey="x"
                          name={selectedPair.varX}
                          stroke="#94a3b8"
                          fontSize={11}
                          label={{ value: selectedPair.varX, position: 'insideBottom', offset: -10, fill: '#94a3b8', fontSize: 11 }}
                        />
                        <YAxis
                          type="number"
                          dataKey="y"
                          name={selectedPair.varY}
                          stroke="#94a3b8"
                          fontSize={11}
                          label={{ value: selectedPair.varY, angle: -90, position: 'insideLeft', offset: 15, fill: '#94a3b8', fontSize: 11 }}
                        />
                        <Tooltip
                          cursor={{ strokeDasharray: '3 3' }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              return (
                                <div className="bg-slate-900 text-white p-2.5 rounded-lg shadow-xl text-xs space-y-0.5 border border-slate-700">
                                  <p>{selectedPair.varX}: {d.x}</p>
                                  <p>{selectedPair.varY}: {d.y}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Scatter name="Observations" data={scatterPoints} fill="#38bdf8" fillOpacity={0.6} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                    No pairwise points available.
                  </div>
                )}
              </div>

              {selectedPair && (
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>Pairwise Sample Size: <strong>{selectedPair.n.toLocaleString()} valid observations</strong></span>
                    <span>Method: <strong>Pairwise Complete</strong></span>
                  </div>
                  <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Displaying <strong>{scatterPoints.length.toLocaleString()}</strong> sampled pairs from{' '}
                    <strong>{selectedPair.n.toLocaleString()}</strong> total valid observations. Observations are uniformly sampled to ensure responsive client rendering; the full population of {selectedPair.n.toLocaleString()} pairwise observations is evaluated for the Pearson <em>r</em> correlation coefficient.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* TAB 4: TIME SERIES & MISSINGNESS                                       */}
      {/* ====================================================================== */}
      {activeTab === 'timeseries' && (
        <div className="space-y-6">
          {/* Section A: Chronological Time Series with 7-Observation Moving Baseline */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Chronological Time Series & 7-Observation Moving Baseline
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Raw daily sensor readings with 7-observation smoothed baseline. Missing values and intermittent zeros are preserved.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Target:</span>
                <div className="flex gap-1">
                  {availableVariables.map((v) => (
                    <button
                      key={v}
                      onClick={() => setTsVariable(v)}
                      className={`px-2.5 py-1 text-xs rounded-md font-semibold capitalize transition ${
                        tsVariable === v
                          ? 'bg-sky-500 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {v.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {tsLoading ? (
              <div className="h-72 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
              </div>
            ) : timeseries && timeseries.points.length > 0 ? (
              <div className="space-y-3">
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timeseries.points} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                      <XAxis
                        dataKey="date"
                        stroke="#94a3b8"
                        fontSize={11}
                        minTickGap={40}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={11}
                        label={{
                          value: `${tsVariable} (${timeseries.unit || 'units'})`,
                          angle: -90,
                          position: 'insideLeft',
                          fill: '#94a3b8',
                          fontSize: 12,
                        }}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl text-xs space-y-1 border border-slate-700">
                                <p className="font-semibold text-sky-400">Date: {d.date}</p>
                                <p>Observed: {d.value !== null ? `${d.value} ${timeseries.unit || ''}` : 'Missing / Gap'}</p>
                                <p>7-Obs Moving Baseline: {d.rolling_mean_7d !== null ? `${d.rolling_mean_7d} ${timeseries.unit || ''}` : 'N/A'}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend verticalAlign="top" height={36} />
                      <Line
                        type="monotone"
                        dataKey="value"
                        name="Observed Value"
                        stroke="#38bdf8"
                        strokeWidth={1.5}
                        dot={false}
                        connectNulls={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="rolling_mean_7d"
                        name="7-Observation Moving Baseline"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span>
                    Total Points: <strong>{timeseries.total_points.toLocaleString()}</strong>
                    {timeseries.sampled && (
                      <span className="ml-2 px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-semibold">
                        Uniformly Downsampled for Smooth Rendering
                      </span>
                    )}
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    Strict Preservation: Rainfall & gaps never artificially interpolated.
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                  <strong>Baseline Note:</strong> The 7-observation moving baseline is calculated across seven consecutive recorded observations. On continuous daily sequences, this corresponds to seven calendar days; across multi-day temporal gaps, it averages the available chronological records without artificial interpolation.
                </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                No time series data available for {tsVariable}.
              </div>
            )}
          </div>

          {/* Section B: Sensor Missingness Heatmap */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Monthly Sensor Missingness Breakdown
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Percentage of missing entries per variable across chronological calendar months.
                </p>
              </div>
            </div>

            <div className="mb-4 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 text-xs text-slate-500 dark:text-slate-400 flex items-start gap-2">
              <Info className="w-4 h-4 text-sky-500 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Data Completeness Scope:</strong> This matrix measures attribute-level missing values (null sensor readings) within recorded observations. Completely absent calendar dates (temporal gaps resulting from station offline periods) are tracked independently in the dataset temporal profile.
              </span>
            </div>

            {missingLoading ? (
              <div className="h-56 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
              </div>
            ) : missingness && missingness.periods.length > 0 ? (
              <div className="space-y-4">
                {/* Overall Summary Bar */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {missingness.variables.map((v) => {
                    const pct = missingness.overall_missing_pct[v] ?? 0;
                    return (
                      <div
                        key={v}
                        className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40"
                      >
                        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 capitalize">
                          {v.replace('_', ' ')}
                        </div>
                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                          {pct}%
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {pct === 0 ? 'No missing values' : 'Missing rate'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Monthly Matrix Grid */}
                <div className="overflow-x-auto max-h-96 border border-slate-200 dark:border-slate-800 rounded-lg">
                  <table className="w-full text-center border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10">
                      <tr>
                        <th className="p-2 border border-slate-200 dark:border-slate-700 text-left font-semibold text-slate-700 dark:text-slate-300">
                          Month (YYYY-MM)
                        </th>
                        <th className="p-2 border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300">
                          Logged Records
                        </th>
                        {missingness.variables.map((v) => (
                          <th
                            key={v}
                            className="p-2 border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300 capitalize"
                          >
                            {v.replace('_', ' ')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {missingness.cells.map((cell) => (
                        <tr key={cell.period} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="p-2 border border-slate-200 dark:border-slate-800 text-left font-mono font-medium text-slate-800 dark:text-slate-200">
                            {cell.period}
                          </td>
                          <td className="p-2 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                            {cell.total_records}
                          </td>
                          {missingness.variables.map((v) => {
                            const pct = cell.missing_percentages[v] ?? 0;
                            const count = cell.missing_counts[v] ?? 0;
                            const isClean = count === 0;
                            const isLow = pct > 0 && pct <= 10;

                            return (
                              <td
                                key={v}
                                className={`p-2 border border-slate-200 dark:border-slate-800 font-medium ${
                                  isClean
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                    : isLow
                                    ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300 font-bold'
                                    : 'bg-rose-500/30 text-rose-800 dark:text-rose-300 font-bold'
                                }`}
                                title={`${cell.period} ${v}: ${count} missing (${pct}%)`}
                              >
                                {isClean ? '0%' : `${pct}% (${count})`}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                No missingness profile available.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
