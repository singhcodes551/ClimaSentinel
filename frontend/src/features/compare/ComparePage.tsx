import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Columns3,
  FlaskConical,
  Activity,
  AlertCircle,
  Info,
  RefreshCw,
  Play,
  SlidersHorizontal,
  ShieldCheck,
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
} from 'recharts';
import type {
  DatasetItem,
  AnomalyRunItem,
  RunComparisonResponse,
  SyntheticBenchmarkRequest,
  SyntheticBenchmarkResponse,
} from '../../types';
import {
  fetchDatasets,
  fetchAnomalyRuns,
  fetchRunComparison,
  runSyntheticBenchmark,
} from '../../services/api';

interface ComparePageProps {
  selectedDatasetId?: number | null;
  onSelectDataset?: (id: number) => void;
}

type TabType = 'observational' | 'synthetic';

export const ComparePage: React.FC<ComparePageProps> = ({
  selectedDatasetId: externalDatasetId,
  onSelectDataset,
}) => {
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(externalDatasetId ?? null);
  const [activeTab, setActiveTab] = useState<TabType>('observational');
  const [runs, setRuns] = useState<AnomalyRunItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  // Tab 1: Observational Comparison State
  const [comparison, setComparison] = useState<RunComparisonResponse | null>(null);
  const [loadingCompare, setLoadingCompare] = useState<boolean>(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  // Tab 2: Synthetic Benchmark State
  const [benchConfig, setBenchConfig] = useState<SyntheticBenchmarkRequest>({
    primary_variable: 'temperature',
    seed: 42,
    point_anomaly_count: 15,
    block_count: 3,
    block_length: 5,
    step_count: 1,
    step_length: 14,
    spike_magnitude_sigma: 4.0,
    block_magnitude_sigma: 3.0,
    step_magnitude_sigma: 2.5,
  });
  const [benchmarkResult, setBenchmarkResult] = useState<SyntheticBenchmarkResponse | null>(null);
  const [loadingBenchmark, setLoadingBenchmark] = useState<boolean>(false);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);

  // Sync with external dataset prop
  useEffect(() => {
    if (externalDatasetId !== undefined && externalDatasetId !== null) {
      setSelectedId(externalDatasetId);
    }
  }, [externalDatasetId]);

  // Load registered datasets
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
    } catch (err) {
      console.error('Failed to load datasets:', err);
    }
  }, [selectedId, onSelectDataset]);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  // Load detection runs when dataset changes
  const loadRuns = useCallback(async (datasetId: number) => {
    try {
      const res = await fetchAnomalyRuns(datasetId);
      setRuns(res.runs);
      if (res.runs.length > 0) {
        setSelectedRunId(res.runs[0].id);
      } else {
        setSelectedRunId(null);
        setComparison(null);
      }
    } catch (err) {
      console.error('Failed to load anomaly runs:', err);
      setRuns([]);
      setSelectedRunId(null);
      setComparison(null);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadRuns(selectedId);
    }
  }, [selectedId, loadRuns]);

  // Load Tab 1 Observational Comparison Data
  const loadComparison = useCallback(async () => {
    if (!selectedId || !selectedRunId) return;
    setLoadingCompare(true);
    setCompareError(null);
    try {
      const data = await fetchRunComparison(selectedId, selectedRunId);
      setComparison(data);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Failed to load model comparison.');
      setComparison(null);
    } finally {
      setLoadingCompare(false);
    }
  }, [selectedId, selectedRunId]);

  useEffect(() => {
    if (activeTab === 'observational' && selectedId && selectedRunId) {
      loadComparison();
    }
  }, [activeTab, selectedId, selectedRunId, loadComparison]);

  // Handle Tab 2 Synthetic Benchmark Execution
  const handleExecuteBenchmark = async () => {
    if (!selectedId) return;
    setLoadingBenchmark(true);
    setBenchmarkError(null);
    try {
      const res = await runSyntheticBenchmark(selectedId, benchConfig);
      setBenchmarkResult(res);
    } catch (err) {
      setBenchmarkError(err instanceof Error ? err.message : 'Benchmark execution failed.');
    } finally {
      setLoadingBenchmark(false);
    }
  };

  const handleSelectDataset = (id: number) => {
    setSelectedId(id);
    onSelectDataset?.(id);
    setBenchmarkResult(null);
  };

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

  const getJaccardColor = (val: number) => {
    if (val === 1.0) return 'bg-sky-600 text-white font-bold';
    if (val >= 0.7) return 'bg-sky-500/80 text-white font-semibold';
    if (val >= 0.4) return 'bg-sky-500/40 text-slate-900 dark:text-slate-100 font-medium';
    if (val >= 0.1) return 'bg-sky-500/15 text-slate-800 dark:text-slate-200';
    return 'bg-slate-100 dark:bg-slate-800 text-slate-400';
  };

  return (
    <div className="space-y-6">
      {/* ====================================================================== */}
      {/* Header & Controls                                                      */}
      {/* ====================================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Model Comparison & Evaluation
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
              Consensus & Benchmark Suite
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Cross-detector agreement, Jaccard overlap matrices, execution latency, and controlled ground-truth synthetic benchmarks.
          </p>
        </div>

        {/* Dataset and Run Selector */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Dataset Dropdown */}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm text-xs">
            <span className="font-medium text-slate-500 dark:text-slate-400">Station:</span>
            <select
              value={selectedId ?? ''}
              onChange={(e) => handleSelectDataset(Number(e.target.value))}
              className="bg-transparent font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
              disabled={datasets.length === 0}
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id} className="dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Run Dropdown (for Tab 1) */}
          {activeTab === 'observational' && (
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm text-xs">
              <span className="font-medium text-slate-500 dark:text-slate-400">Run:</span>
              <select
                value={selectedRunId ?? ''}
                onChange={(e) => setSelectedRunId(Number(e.target.value))}
                className="bg-transparent font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
                disabled={runs.length === 0}
              >
                {runs.length === 0 ? (
                  <option value="">No runs available</option>
                ) : (
                  runs.map((r) => (
                    <option key={r.id} value={r.id} className="dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                      Run #{r.id} ({r.primary_variable} · {new Date(r.created_at).toLocaleDateString()})
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          <button
            onClick={() => {
              loadDatasets();
              if (selectedId) loadRuns(selectedId);
              if (activeTab === 'observational') loadComparison();
            }}
            title="Refresh"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ====================================================================== */}
      {/* 2 Tabs Navigation                                                      */}
      {/* ====================================================================== */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-2">
        <button
          onClick={() => setActiveTab('observational')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'observational'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
        >
          <Columns3 className="w-4 h-4" />
          Observational Model Comparison
        </button>

        <button
          onClick={() => setActiveTab('synthetic')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'synthetic'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
        >
          <FlaskConical className="w-4 h-4" />
          Synthetic Anomaly Benchmark (Ground Truth)
        </button>
      </div>

      {/* ====================================================================== */}
      {/* TAB 1: OBSERVATIONAL MODEL COMPARISON                                  */}
      {/* ====================================================================== */}
      {activeTab === 'observational' && (
        <div className="space-y-6">
          {compareError && (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-500" />
              <div>{compareError}</div>
            </div>
          )}

          {loadingCompare ? (
            <div className="h-64 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
          ) : !comparison ? (
            <div className="p-12 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-center">
              <Columns3 className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                No Detection Run Selected
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                Execute an anomaly detection run from the Dashboard or Anomalies page to compare detector agreement.
              </p>
            </div>
          ) : (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Observations</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {comparison.total_records.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">Variable: {comparison.primary_variable}</div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Ensemble Total Flags</div>
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                    {comparison.ensemble_summary.total_anomalies.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Rate: {comparison.ensemble_summary.anomaly_rate_pct}% of series
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Confirmed Consensus (≥2)</div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {comparison.ensemble_summary.confirmed_count.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {comparison.ensemble_summary.potential_count} potential (1 detector)
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Corroboration Ratio</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {(comparison.ensemble_summary.corroboration_ratio * 100).toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">Multi-algorithm consensus rate</div>
                </div>
              </div>

              {/* Main Detector Comparison Table */}
              <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      Base Detectors vs. Consensus Breakdown
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Corroboration arithmetic is evaluated across the 4 base detectors. Ensemble output is reported separately.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300">
                        <th className="p-3 font-semibold">Algorithm</th>
                        <th className="p-3 font-semibold text-right">Flags</th>
                        <th className="p-3 font-semibold text-right">Rate (%)</th>
                        <th className="p-3 font-semibold text-right">Solo Flags (Unique)</th>
                        <th className="p-3 font-semibold text-right">Corroborated Flags</th>
                        <th className="p-3 font-semibold text-right">Mean Dev</th>
                        <th className="p-3 font-semibold text-right">Max Dev</th>
                        <th className="p-3 font-semibold text-right">Latency (ms)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {comparison.detectors.map((d) => (
                        <tr key={d.detector_name} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="p-3 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <Activity className="w-3.5 h-3.5 text-indigo-500" />
                            {d.display_name}
                          </td>
                          <td className="p-3 text-right font-mono font-medium">{d.flag_count.toLocaleString()}</td>
                          <td className="p-3 text-right font-mono">{d.anomaly_rate_pct}%</td>
                          <td className="p-3 text-right font-mono text-amber-600 dark:text-amber-400">
                            {d.solo_flag_count} <span className="text-[10px] opacity-75">({d.solo_rate_pct}%)</span>
                          </td>
                          <td className="p-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                            {d.corroborated_flag_count} <span className="text-[10px] opacity-75">({d.corroborated_rate_pct}%)</span>
                          </td>
                          <td className="p-3 text-right font-mono">{d.mean_deviation !== null ? d.mean_deviation : '—'}</td>
                          <td className="p-3 text-right font-mono">{d.max_deviation !== null ? d.max_deviation : '—'}</td>
                          <td className="p-3 text-right font-mono text-slate-500">
                            {d.latency_ms !== null ? `${d.latency_ms} ms` : 'Unrecorded (N/A)'}
                          </td>
                        </tr>
                      ))}

                      {/* Separate Ensemble Comparison Row */}
                      <tr className="bg-indigo-50/50 dark:bg-indigo-950/20 font-bold border-t-2 border-indigo-200 dark:border-indigo-900/60">
                        <td className="p-3 text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          Consensus Ensemble (Reference)
                        </td>
                        <td className="p-3 text-right font-mono text-indigo-700 dark:text-indigo-300">
                          {comparison.ensemble_summary.total_anomalies.toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono text-indigo-700 dark:text-indigo-300">
                          {comparison.ensemble_summary.anomaly_rate_pct}%
                        </td>
                        <td className="p-3 text-right font-mono text-slate-500">
                          {comparison.ensemble_summary.potential_count} (Potential)
                        </td>
                        <td className="p-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                          {comparison.ensemble_summary.confirmed_count} (Confirmed)
                        </td>
                        <td className="p-3 text-right font-mono text-slate-400">—</td>
                        <td className="p-3 text-right font-mono text-slate-400">—</td>
                        <td className="p-3 text-right font-mono text-slate-500">Pipeline Total</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                  <strong>Corroboration Invariance Verified:</strong> For each base detector, Solo Flags + Corroborated Flags strictly equals Total Flags. Historical latencies are reported from instrumented run profiles; uninstrumented historical runs display &ldquo;Unrecorded (N/A)&rdquo;.
                </div>
              </div>

              {/* Grid: Jaccard Agreement Heatmap & Solo vs Corroborated Chart */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Jaccard Matrix (Left 6 cols) */}
                <div className="lg:col-span-6 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-sm">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
                    Pairwise Jaccard Similarity Matrix
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Jaccard Index: J(A, B) = |A ∩ B| / |A ∪ B|. Measures the mutual overlap of flagged anomalies.
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full text-center border-collapse text-xs">
                      <thead>
                        <tr>
                          <th className="p-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-left font-semibold">
                            Detector
                          </th>
                          {comparison.detector_names.map((d) => (
                            <th
                              key={d}
                              className="p-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 font-semibold"
                            >
                              {d.split('_')[0].toUpperCase()}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.detector_names.map((d1) => (
                          <tr key={d1}>
                            <td className="p-2.5 border border-slate-200 dark:border-slate-800 text-left font-semibold text-slate-700 dark:text-slate-300 capitalize">
                              {d1.replace('_', ' ')}
                            </td>
                            {comparison.detector_names.map((d2) => {
                              const jVal = comparison.jaccard_matrix[d1][d2];
                              const shared = comparison.shared_counts_matrix[d1][d2];
                              return (
                                <td
                                  key={d2}
                                  className={`p-2.5 border border-slate-200 dark:border-slate-800 ${getJaccardColor(
                                    jVal
                                  )}`}
                                  title={`${d1} ∩ ${d2} = ${shared} shared observations (Jaccard = ${jVal})`}
                                >
                                  <div className="font-bold">{jVal.toFixed(3)}</div>
                                  <div className="text-[10px] opacity-75">{shared} shared</div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between mt-4 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>0.0 (Zero Overlap)</span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-sky-500/20 inline-block"></span> Low
                      <span className="w-3 h-3 rounded bg-sky-500/60 inline-block ml-1"></span> Moderate
                      <span className="w-3 h-3 rounded bg-sky-600 inline-block ml-1"></span> High
                    </span>
                    <span>1.0 (Identical)</span>
                  </div>
                </div>

                {/* Solo vs Corroborated Stacked Chart (Right 6 cols) */}
                <div className="lg:col-span-6 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-sm">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
                    Solo vs. Corroborated Detections
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Compares flags supported by at least one other detector vs. unique single-detector flags.
                  </p>

                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={comparison.detectors.map((d) => ({
                          name: d.display_name.split(' ')[0],
                          fullName: d.display_name,
                          solo: d.solo_flag_count,
                          corroborated: d.corroborated_flag_count,
                        }))}
                        margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={11} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              return (
                                <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl text-xs space-y-1 border border-slate-700">
                                  <p className="font-semibold text-sky-400">{d.fullName}</p>
                                  <p className="text-emerald-400">Corroborated: {d.corroborated}</p>
                                  <p className="text-amber-400">Solo (Unique): {d.solo}</p>
                                  <p className="text-slate-300 text-[10px]">Total: {d.corroborated + d.solo}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Legend verticalAlign="top" height={36} />
                        <Bar dataKey="corroborated" name="Corroborated (≥2 detectors)" fill="#10b981" stackId="a" />
                        <Bar dataKey="solo" name="Solo (1 detector only)" fill="#f59e0b" stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Scientific Disclosure */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 text-xs text-slate-500 dark:text-slate-400 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Scientific Observational Evaluation Disclosure:
                  </span>{' '}
                  Observational meteorological series do not contain objective ground-truth anomaly labels. Evaluating detector agreement (Jaccard Index) and consensus corroboration provides insight into mutual consistency and unique model sensitivities without fabricating ungrounded precision/recall metrics. For true ground-truth evaluation, switch to the Synthetic Anomaly Benchmark tab.
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ====================================================================== */}
      {/* TAB 2: SYNTHETIC ANOMALY BENCHMARK (GROUND TRUTH)                     */}
      {/* ====================================================================== */}
      {activeTab === 'synthetic' && (
        <div className="space-y-6">
          {/* Configuration Card */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-indigo-500" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Controlled Synthetic Anomaly Injection Configuration
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Injects calibrated perturbations with exact timestamp ground truth into a copy of the dataset. Original records remain unaltered.
                </p>
              </div>

              <button
                onClick={handleExecuteBenchmark}
                disabled={loadingBenchmark || !selectedId}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
              >
                {loadingBenchmark ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 fill-white" />
                )}
                {loadingBenchmark ? 'Evaluating Models...' : 'Execute Benchmark'}
              </button>
            </div>

            {benchmarkError && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {benchmarkError}
              </div>
            )}

            {/* Parameter Inputs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Target Variable:
                </label>
                <select
                  value={benchConfig.primary_variable}
                  onChange={(e) => setBenchConfig({ ...benchConfig, primary_variable: e.target.value })}
                  className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium capitalize"
                >
                  {availableVariables.map((v) => (
                    <option key={v} value={v}>
                      {v.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Point Spikes (Count / Magnitude):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={benchConfig.point_anomaly_count}
                    onChange={(e) => setBenchConfig({ ...benchConfig, point_anomaly_count: Number(e.target.value) })}
                    className="w-1/2 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                    title="Number of isolated spike points"
                  />
                  <span className="text-slate-400">@</span>
                  <input
                    type="number"
                    step={0.5}
                    min={2.0}
                    max={8.0}
                    value={benchConfig.spike_magnitude_sigma}
                    onChange={(e) => setBenchConfig({ ...benchConfig, spike_magnitude_sigma: Number(e.target.value) })}
                    className="w-1/2 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                    title="Deviation magnitude (in std units)"
                  />
                  <span className="text-slate-400">&sigma;</span>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Block Heatwaves (Count / Days):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={benchConfig.block_count}
                    onChange={(e) => setBenchConfig({ ...benchConfig, block_count: Number(e.target.value) })}
                    className="w-1/2 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                    title="Number of block events"
                  />
                  <span className="text-slate-400">&times;</span>
                  <input
                    type="number"
                    min={2}
                    max={14}
                    value={benchConfig.block_length}
                    onChange={(e) => setBenchConfig({ ...benchConfig, block_length: Number(e.target.value) })}
                    className="w-1/2 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                    title="Duration in days"
                  />
                  <span className="text-slate-400">d</span>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Random Seed:
                </label>
                <input
                  type="number"
                  value={benchConfig.seed}
                  onChange={(e) => setBenchConfig({ ...benchConfig, seed: Number(e.target.value) })}
                  className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Benchmark Results Display */}
          {benchmarkResult && (
            <div className="space-y-6">
              {/* Benchmark Summary KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Ground-Truth Injected</div>
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                    {benchmarkResult.total_injected_points} points
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Rate: {benchmarkResult.injection_rate_pct}% of valid data
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Injected Events</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {benchmarkResult.injected_events.length} events
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {(benchmarkResult.adjusted_injections_count ?? 0) > 0 || (benchmarkResult.skipped_injections_count ?? 0) > 0
                      ? `Adj: ${benchmarkResult.adjusted_injections_count ?? 0} · Skip: ${benchmarkResult.skipped_injections_count ?? 0}`
                      : 'Point spikes + blocks + steps'}
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Best F1-Score Model</div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {(
                      Math.max(...benchmarkResult.models.map((m) => m.f1_score)) * 100
                    ).toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {benchmarkResult.models.reduce((best, m) => (m.f1_score > best.f1_score ? m : best)).display_name}
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Ensemble F1-Score</div>
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                    {(
                      (benchmarkResult.models.find((m) => m.is_ensemble)?.f1_score ?? 0) * 100
                    ).toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">Consensus Voting Rule</div>
                </div>
              </div>

              {/* Grouped Bar Chart: Precision, Recall, and F1-Score Side-by-Side */}
              <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  Empirical Model Performance: Precision, Recall, and F1-Score
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Benchmarked strictly against the known synthetic ground truth. Higher values denote superior detection balance.
                </p>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={benchmarkResult.models.map((m) => ({
                        name: m.display_name.split(' ')[0],
                        fullName: m.display_name,
                        precision: Number((m.precision * 100).toFixed(1)),
                        recall: Number((m.recall * 100).toFixed(1)),
                        f1: Number((m.f1_score * 100).toFixed(1)),
                      }))}
                      margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={11} unit="%" domain={[0, 100]} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl text-xs space-y-1 border border-slate-700">
                                <p className="font-semibold text-indigo-400">{d.fullName}</p>
                                <p className="text-sky-400">Precision: {d.precision}%</p>
                                <p className="text-emerald-400">Recall: {d.recall}%</p>
                                <p className="text-amber-400">F1-Score: {d.f1}%</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend verticalAlign="top" height={36} />
                      <Bar dataKey="precision" name="Precision (%)" fill="#0284c7" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="recall" name="Recall (%)" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="f1" name="F1-Score (%)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Confusion Matrices Grid */}
              <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  Point-Level Confusion Matrices & Detection Delay
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  True Positives (TP), False Positives (FP), False Negatives (FN), True Negatives (TN), and lag in detecting multi-day events.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {benchmarkResult.models.map((m) => (
                    <div
                      key={m.detector_name}
                      className={`p-4 rounded-xl border ${m.is_ensemble
                          ? 'border-indigo-300 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40'
                        }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100">{m.display_name}</span>
                        {m.is_ensemble && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                            Ensemble
                          </span>
                        )}
                      </div>

                      {/* 2x2 Matrix */}
                      <div className="grid grid-cols-2 gap-1.5 text-center font-mono text-xs my-2">
                        <div className="p-2 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">TP</div>
                          <div className="font-bold">{m.confusion_matrix.tp}</div>
                        </div>
                        <div className="p-2 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">FP</div>
                          <div className="font-bold">{m.confusion_matrix.fp}</div>
                        </div>
                        <div className="p-2 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">FN</div>
                          <div className="font-bold">{m.confusion_matrix.fn}</div>
                        </div>
                        <div className="p-2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">TN</div>
                          <div className="font-bold">{m.confusion_matrix.tn}</div>
                        </div>
                      </div>

                      <div className="space-y-1 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Precision:</span>
                          <span className="font-semibold">{(m.precision * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Recall:</span>
                          <span className="font-semibold">{(m.recall * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">F1-Score:</span>
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">
                            {(m.f1_score * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Event Lag:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {m.event_detection_delay_days !== null ? `${m.event_detection_delay_days} days` : '0 days'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Runtime:</span>
                          <span className="font-mono text-slate-500">{m.latency_ms} ms</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scientific Disclosure Callout */}
              <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-semibold">Scientific Ground-Truth Disclosure: </span>
                  {benchmarkResult.scientific_disclosure}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
