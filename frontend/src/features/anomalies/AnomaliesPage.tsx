import React, { useState, useEffect } from 'react';
import {
  Filter,
  CheckCircle2,
  Cpu,
  RefreshCw,
  Sliders,
  ChevronDown,
  X,
  Flame,
  AlertCircle,
  Download,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  History,
} from 'lucide-react';
import type {
  DatasetItem,
  AnomalyRecord,
  AnomalySummary,
  AnomalyRunItem,
} from '../../types';
import {
  fetchDatasets,
  runAnomalyDetection,
  fetchAnomalySummary,
  fetchAnomalies,
  fetchAnomalyRuns,
  deleteAnomalyRun,
  getAnomalyExportUrl,
} from '../../services/api';

interface AnomaliesPageProps {
  selectedDatasetId?: number | null;
  onSelectDataset?: (id: number) => void;
}

export const AnomaliesPage: React.FC<AnomaliesPageProps> = ({
  selectedDatasetId: externalDatasetId,
  onSelectDataset,
}) => {
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(externalDatasetId ?? null);
  const [runs, setRuns] = useState<AnomalyRunItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [summary, setSummary] = useState<AnomalySummary | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [classificationFilter, setClassificationFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [detectorFilter, setDetectorFilter] = useState<string>('all');

  // Sorting
  const [sortBy, setSortBy] = useState<string>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Parameters Configuration modal
  const [showConfig, setShowConfig] = useState(false);
  const [primaryVariable, setPrimaryVariable] = useState<string>('temperature');
  const [zThreshold, setZThreshold] = useState<number>(3.0);
  const [madThreshold, setMadThreshold] = useState<number>(3.0);
  const [iforestContamination, setIforestContamination] = useState<number>(0.03);
  const [lofContamination, setLofContamination] = useState<number>(0.03);

  // Detail inspection modal
  const [inspectedRecord, setInspectedRecord] = useState<AnomalyRecord | null>(null);

  // 1. Load registered datasets
  useEffect(() => {
    async function loadInitial() {
      try {
        const list = await fetchDatasets();
        setDatasets(list);
        if (list.length > 0) {
          const initialId = externalDatasetId && list.some(d => d.id === externalDatasetId)
            ? externalDatasetId
            : list[0].id;
          setSelectedDatasetId(initialId);
          onSelectDataset?.(initialId);
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to fetch datasets');
      }
    }
    loadInitial();
  }, []);

  // Sync externalDatasetId
  useEffect(() => {
    if (externalDatasetId && externalDatasetId !== selectedDatasetId) {
      setSelectedDatasetId(externalDatasetId);
    }
  }, [externalDatasetId]);

  // 2. Load historical runs when selected dataset changes
  useEffect(() => {
    if (!selectedDatasetId) return;
    loadRunsForDataset(selectedDatasetId);
  }, [selectedDatasetId]);

  const loadRunsForDataset = async (datasetId: number) => {
    try {
      const res = await fetchAnomalyRuns(datasetId);
      setRuns(res.runs);
      if (res.runs.length > 0) {
        // If current selectedRunId is not in the new dataset's runs, default to newest run
        if (!selectedRunId || !res.runs.some(r => r.id === selectedRunId)) {
          setSelectedRunId(res.runs[0].id);
        }
      } else {
        setSelectedRunId(null);
        setSummary(null);
        setAnomalies([]);
      }
    } catch {
      setRuns([]);
      setSelectedRunId(null);
      setSummary(null);
      setAnomalies([]);
    }
  };

  // 3. Load summary and anomalies when selected dataset, run, or filters/sorting change
  useEffect(() => {
    if (!selectedDatasetId) return;
    loadDatasetAnomalies(selectedDatasetId, selectedRunId);
  }, [selectedDatasetId, selectedRunId, classificationFilter, severityFilter, detectorFilter, sortBy, sortOrder]);

  const loadDatasetAnomalies = async (datasetId: number, runId: number | null) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      let existingSummary: AnomalySummary | null = null;
      try {
        existingSummary = await fetchAnomalySummary(datasetId, runId ?? undefined);
        setSummary(existingSummary);
      } catch {
        setSummary(null);
        setAnomalies([]);
        setLoading(false);
        return;
      }

      // Fetch anomalies with active filters and sorting
      const filters: any = {
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      if (runId) filters.run_id = runId;
      if (classificationFilter !== 'all') filters.classification = classificationFilter;
      if (severityFilter !== 'all') filters.severity = severityFilter;
      if (detectorFilter !== 'all') filters.detector = detectorFilter;

      const listRes = await fetchAnomalies(datasetId, filters);
      setAnomalies(listRes.anomalies);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error fetching anomaly results');
    } finally {
      setLoading(false);
    }
  };

  const handleRunDetection = async () => {
    if (!selectedDatasetId) return;
    setDetecting(true);
    setErrorMessage(null);
    try {
      const newSummary = await runAnomalyDetection(selectedDatasetId, {
        primary_variable: primaryVariable,
        z_threshold: zThreshold,
        mad_threshold: madThreshold,
        iforest_contamination: iforestContamination,
        lof_contamination: lofContamination,
      });
      setSummary(newSummary);
      setShowConfig(false);
      // Reload runs list and set newly created run
      await loadRunsForDataset(selectedDatasetId);
      setSelectedRunId(newSummary.id);
    } catch (err: any) {
      setErrorMessage(err.message || 'Anomaly detection failed');
    } finally {
      setDetecting(false);
    }
  };

  const handleDeleteRun = async (runIdToDelete: number) => {
    if (!selectedDatasetId) return;
    if (!confirm(`Delete historical detection run #${runIdToDelete}?`)) return;

    try {
      await deleteAnomalyRun(selectedDatasetId, runIdToDelete);
      // Refresh runs
      await loadRunsForDataset(selectedDatasetId);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete detection run');
    }
  };

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc'); // Default to descending when switching to a metric
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 inline ml-1" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-sky-500 inline ml-1 font-bold" />
    ) : (
      <ArrowDown className="w-3 h-3 text-sky-500 inline ml-1 font-bold" />
    );
  };

  const selectedDataset = datasets.find(d => d.id === selectedDatasetId);

  return (
    <div className="space-y-6">
      {/* Top Header & Dataset Selection Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            Weather & Climate Anomaly Detection
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Consensus ensemble voting combining Seasonal Z-score, Modified Z (MAD), Isolation Forest, and Local Outlier Factor (LOF).
          </p>
        </div>

        {/* Dataset selector, Run selector & Action triggers */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Dataset selector */}
          <div className="relative">
            <select
              value={selectedDatasetId ?? ''}
              onChange={(e) => {
                const id = Number(e.target.value);
                setSelectedDatasetId(id);
                onSelectDataset?.(id);
              }}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-sky-500"
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  #{d.id} - {d.name} ({d.row_count} rows)
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>

          {/* Historical Run Selector (if runs exist) */}
          {runs.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <select
                  value={selectedRunId ?? ''}
                  onChange={(e) => setSelectedRunId(Number(e.target.value))}
                  className="appearance-none pl-7 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                >
                  {runs.map((r, idx) => (
                    <option key={r.id} value={r.id}>
                      Run #{r.id} {idx === 0 ? '(Latest)' : ''} — {r.confirmed_count} Confirmed
                    </option>
                  ))}
                </select>
                <History className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2.5 pointer-events-none" />
              </div>

              {selectedRunId && (
                <button
                  onClick={() => handleDeleteRun(selectedRunId)}
                  title="Delete this historical run"
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => setShowConfig(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            title="Configure hyperparameter thresholds"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-500" />
            <span>Parameters</span>
          </button>

          <button
            disabled={detecting || !selectedDatasetId}
            onClick={handleRunDetection}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {detecting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Running Ensemble...</span>
              </>
            ) : (
              <>
                <Cpu className="w-3.5 h-3.5" />
                <span>Run Detection</span>
              </>
            )}
          </button>
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

      {/* Ensemble Summary Metric Cards */}
      {summary ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Confirmed Anomalies */}
          <div className="p-5 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                Confirmed Anomalies
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">
                High Confidence
              </span>
            </div>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
              {summary.confirmed_count.toLocaleString()}
            </div>
            <p className="text-xs text-rose-600/80 dark:text-rose-400/80 mt-1">
              Consensus: $\ge 2$ algorithms agreed
            </p>
          </div>

          {/* Potential Anomalies */}
          <div className="p-5 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                Potential Anomalies
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                Moderate / Edge
              </span>
            </div>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
              {summary.potential_count.toLocaleString()}
            </div>
            <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">
              Flagged by exactly 1 detector
            </p>
          </div>

          {/* Normal Weather Days */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Normal Baseline
              </span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
              {summary.normal_count.toLocaleString()}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Within expected seasonal tolerances
            </p>
          </div>

          {/* Severity Distribution */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Severity Breakdown
              </span>
              <Flame className="w-4 h-4 text-orange-500" />
            </div>
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-rose-600 font-semibold">Extreme: {summary.severity_breakdown.extreme}</span>
              <span className="text-amber-600 font-semibold">High: {summary.severity_breakdown.high}</span>
              <span className="text-sky-600 font-semibold">Mod: {summary.severity_breakdown.moderate}</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden flex mt-2">
              <div
                style={{ width: `${(summary.severity_breakdown.extreme / Math.max(1, summary.confirmed_count + summary.potential_count)) * 100}%` }}
                className="bg-rose-500 h-full"
              />
              <div
                style={{ width: `${(summary.severity_breakdown.high / Math.max(1, summary.confirmed_count + summary.potential_count)) * 100}%` }}
                className="bg-amber-500 h-full"
              />
              <div
                style={{ width: `${(summary.severity_breakdown.moderate / Math.max(1, summary.confirmed_count + summary.potential_count)) * 100}%` }}
                className="bg-sky-500 h-full"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/20 text-center">
          <Cpu className="w-10 h-10 text-sky-500 mx-auto mb-2 opacity-80" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            No Detection Run Recorded
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1 mb-4">
            Execute the multi-algorithm detection pipeline to discover confirmed and potential meteorological anomalies in {selectedDataset?.name || 'the selected dataset'}.
          </p>
          <button
            disabled={detecting || !selectedDatasetId}
            onClick={handleRunDetection}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Run Anomaly Detection Now</span>
          </button>
        </div>
      )}

      {/* Individual Detector Agreement Bar */}
      {summary && (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
            <span>Individual Algorithm Detections (Run #{summary.id})</span>
            <span className="text-[11px] font-normal text-slate-400">Target: {summary.primary_variable} | Z-threshold: {summary.config.z_threshold}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
              <div className="text-slate-500">Seasonal Z-score</div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                {summary.detector_breakdown.seasonal_zscore} flagged
              </div>
            </div>
            <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
              <div className="text-slate-500">Modified Z-score (MAD)</div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                {summary.detector_breakdown.modified_zscore} flagged
              </div>
            </div>
            <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
              <div className="text-slate-500">Isolation Forest</div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                {summary.detector_breakdown.isolation_forest} flagged
              </div>
            </div>
            <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
              <div className="text-slate-500">Local Outlier Factor (LOF)</div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                {summary.detector_breakdown.lof} flagged
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Results Table & Anomaly Explorer */}
      {summary && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden shadow-xs">
          {/* Filter Bar & Export Actions */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-sky-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Detected Anomalies ({anomalies.length})
              </h3>
            </div>

            {/* Filter controls & Export Buttons */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {/* Classification filter */}
              <select
                value={classificationFilter}
                onChange={(e) => setClassificationFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
              >
                <option value="all">All Classifications</option>
                <option value="confirmed">Confirmed Only (2+ detectors)</option>
                <option value="potential">Potential Only (1 detector)</option>
              </select>

              {/* Severity filter */}
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
              >
                <option value="all">All Severities</option>
                <option value="extreme">Extreme Severity</option>
                <option value="high">High Severity</option>
                <option value="moderate">Moderate Severity</option>
              </select>

              {/* Detector filter */}
              <select
                value={detectorFilter}
                onChange={(e) => setDetectorFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
              >
                <option value="all">All Detectors</option>
                <option value="seasonal_zscore">Seasonal Z-score</option>
                <option value="modified_zscore">Modified Z-score</option>
                <option value="isolation_forest">Isolation Forest</option>
                <option value="lof">Local Outlier Factor</option>
              </select>

              {/* Export CSV Button */}
              {selectedDatasetId && (
                <a
                  href={getAnomalyExportUrl(selectedDatasetId, {
                    format: 'csv',
                    run_id: selectedRunId ?? undefined,
                    classification: classificationFilter !== 'all' ? classificationFilter : undefined,
                    severity: severityFilter !== 'all' ? severityFilter : undefined,
                    sort_by: sortBy,
                    sort_order: sortOrder,
                  })}
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs font-medium cursor-pointer"
                  title="Download filtered anomalies as CSV"
                >
                  <Download className="w-3.5 h-3.5 text-sky-500" />
                  <span>Export CSV</span>
                </a>
              )}

              {/* Export JSON Button */}
              {selectedDatasetId && (
                <a
                  href={getAnomalyExportUrl(selectedDatasetId, {
                    format: 'json',
                    run_id: selectedRunId ?? undefined,
                    classification: classificationFilter !== 'all' ? classificationFilter : undefined,
                    severity: severityFilter !== 'all' ? severityFilter : undefined,
                    sort_by: sortBy,
                    sort_order: sortOrder,
                  })}
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs font-medium cursor-pointer"
                  title="Download filtered anomalies as JSON"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Export JSON</span>
                </a>
              )}
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-sky-500" />
              Loading detected anomalies...
            </div>
          ) : anomalies.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              No anomalies match the current filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/90 dark:bg-slate-900/90 text-slate-500 border-b border-slate-200 dark:border-slate-800 sticky top-0 backdrop-blur-xs select-none">
                  <tr>
                    <th
                      onClick={() => toggleSort('date')}
                      className="py-2.5 px-3 font-semibold cursor-pointer hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      <span>Date</span>
                      {renderSortIcon('date')}
                    </th>
                    <th className="py-2.5 px-3 font-semibold">Variable</th>
                    <th className="py-2.5 px-3 font-semibold">Observed</th>
                    <th className="py-2.5 px-3 font-semibold">Seasonal Exp.</th>
                    <th
                      onClick={() => toggleSort('deviation')}
                      className="py-2.5 px-3 font-semibold cursor-pointer hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      <span>Deviation</span>
                      {renderSortIcon('deviation')}
                    </th>
                    <th
                      onClick={() => toggleSort('z_score')}
                      className="py-2.5 px-3 font-semibold cursor-pointer hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      <span>Z / MAD</span>
                      {renderSortIcon('z_score')}
                    </th>
                    <th
                      onClick={() => toggleSort('flag_count')}
                      className="py-2.5 px-3 font-semibold cursor-pointer hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      <span>Consensus Agreement</span>
                      {renderSortIcon('flag_count')}
                    </th>
                    <th className="py-2.5 px-3 font-semibold">Classification</th>
                    <th
                      onClick={() => toggleSort('severity')}
                      className="py-2.5 px-3 font-semibold cursor-pointer hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      <span>Severity</span>
                      {renderSortIcon('severity')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {anomalies.map((a, idx) => (
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
                            title="Seasonal Z-score"
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                              a.flagged_by.includes('seasonal_zscore')
                                ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                            }`}
                          >
                            Z
                          </span>
                          <span
                            title="Modified Z-score (MAD)"
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                              a.flagged_by.includes('modified_zscore')
                                ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                            }`}
                          >
                            MAD
                          </span>
                          <span
                            title="Isolation Forest"
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                              a.flagged_by.includes('isolation_forest')
                                ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                            }`}
                          >
                            IF
                          </span>
                          <span
                            title="Local Outlier Factor"
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
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                            a.classification === 'confirmed'
                              ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                              : 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                          }`}
                        >
                          {a.classification}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            a.severity === 'extreme'
                              ? 'text-rose-600 dark:text-rose-400'
                              : a.severity === 'high'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-sky-600 dark:text-sky-400'
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
          )}
        </div>
      )}

      {/* Hyperparameter Configuration Modal */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Configure Detection Thresholds
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Calibrate statistical and unsupervised machine learning parameters
                </p>
              </div>
              <button
                onClick={() => setShowConfig(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Primary Meteorological Variable:
                </label>
                <select
                  value={primaryVariable}
                  onChange={(e) => setPrimaryVariable(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="temperature">Temperature (°C)</option>
                  <option value="rainfall">Rainfall / Precipitation (mm)</option>
                  <option value="humidity">Relative Humidity (%)</option>
                  <option value="pressure">Atmospheric Pressure (hPa)</option>
                  <option value="wind_speed">Wind Speed (km/h)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Seasonal Z-score Threshold:
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1.5"
                    max="6.0"
                    value={zThreshold}
                    onChange={(e) => setZThreshold(parseFloat(e.target.value) || 3.0)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                  <span className="text-[10px] text-slate-400">Default: 3.0</span>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Modified Z-score (MAD) Threshold:
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1.5"
                    max="6.0"
                    value={madThreshold}
                    onChange={(e) => setMadThreshold(parseFloat(e.target.value) || 3.0)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                  <span className="text-[10px] text-slate-400">Default: 3.0</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Isolation Forest Contamination:
                  </label>
                  <input
                    type="number"
                    step="0.005"
                    min="0.005"
                    max="0.20"
                    value={iforestContamination}
                    onChange={(e) => setIforestContamination(parseFloat(e.target.value) || 0.03)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                  <span className="text-[10px] text-slate-400">Default: 0.03 (3%)</span>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Local Outlier Factor Contamination:
                  </label>
                  <input
                    type="number"
                    step="0.005"
                    min="0.005"
                    max="0.20"
                    value={lofContamination}
                    onChange={(e) => setLofContamination(parseFloat(e.target.value) || 0.03)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                  <span className="text-[10px] text-slate-400">Default: 0.03 (3%)</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setShowConfig(false)}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRunDetection}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
              >
                Save & Run Detection
              </button>
            </div>
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
