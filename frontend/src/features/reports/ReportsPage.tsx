import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Download,
  Printer,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  Layers,
  FileSpreadsheet,
  CheckCircle2,
} from 'lucide-react';
import type {
  DatasetItem,
  AnomalyRunItem,
  ComprehensiveReportResponse,
} from '../../types';
import {
  fetchDatasets,
  fetchAnomalyRuns,
  fetchReportSummary,
  downloadReportExport,
} from '../../services/api';

interface ReportsPageProps {
  selectedDatasetId?: number | null;
  onSelectDataset?: (id: number) => void;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({
  selectedDatasetId: externalDatasetId,
  onSelectDataset,
}) => {
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(externalDatasetId ?? null);
  const [runs, setRuns] = useState<AnomalyRunItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const [report, setReport] = useState<ComprehensiveReportResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [exportingJson, setExportingJson] = useState<boolean>(false);
  const [exportingCsv, setExportingCsv] = useState<boolean>(false);
  const [includeInsightsInExport, setIncludeInsightsInExport] = useState<boolean>(true);

  // Sync external dataset ID
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

  // Load runs for selected dataset
  const loadRuns = useCallback(async (datasetId: number) => {
    try {
      const res = await fetchAnomalyRuns(datasetId);
      setRuns(res.runs);
      if (res.runs.length > 0) {
        setSelectedRunId(res.runs[0].id);
      } else {
        setSelectedRunId(null);
        setReport(null);
      }
    } catch (err: any) {
      console.error('Failed to load runs:', err);
      setRuns([]);
      setSelectedRunId(null);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadRuns(selectedId);
    }
  }, [selectedId, loadRuns]);

  // Load comprehensive report
  const loadReport = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReportSummary(selectedId, selectedRunId ?? undefined);
      setReport(data);
    } catch (err: any) {
      console.error('Failed to fetch report summary:', err);
      setError(err.message || 'Failed to generate comprehensive report');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [selectedId, selectedRunId]);

  useEffect(() => {
    if (selectedId) {
      loadReport();
    }
  }, [loadReport]);

  // Export handlers
  const handleExportJson = async () => {
    if (!selectedId) return;
    setExportingJson(true);
    try {
      await downloadReportExport(
        selectedId,
        'json',
        selectedRunId ?? undefined,
        includeInsightsInExport
      );
    } catch (err: any) {
      alert(`Export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setExportingJson(false);
    }
  };

  const handleExportCsv = async () => {
    if (!selectedId) return;
    setExportingCsv(true);
    try {
      await downloadReportExport(
        selectedId,
        'csv',
        selectedRunId ?? undefined,
        includeInsightsInExport
      );
    } catch (err: any) {
      alert(`Export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setExportingCsv(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const selectedDataset = datasets.find((d) => d.id === selectedId);

  // Helper formatting
  const formatRate = (rate: number | null | undefined): string => {
    if (rate === null || rate === undefined) {
      return 'N/A';
    }
    return `${rate.toFixed(2)}%`;
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev.toLowerCase()) {
      case 'extreme':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
            Extreme
          </span>
        );
      case 'high':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">
            High
          </span>
        );
      case 'moderate':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            Moderate
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {sev}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Context Actions (hidden on print) */}
      <div className="no-print flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <FileText className="w-7 h-7 text-sky-500" />
            Comprehensive Research & Audit Reports
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Complete multi-section analytical audit integrating data wrangling, detector agreements, and scientific disclosures.
          </p>
        </div>

        {/* Action Bar */}
        <div className="flex items-center gap-2 flex-wrap">
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
                  Run #{r.id} ({r.primary_variable})
                </option>
              ))}
            </select>
          </div>

          {/* Refresh */}
          <button
            onClick={() => {
              if (selectedId) {
                loadRuns(selectedId);
                loadReport();
              }
            }}
            disabled={loading || !selectedId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50"
            title="Refresh Report"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Include Insights Toggle for Exports */}
          <label className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeInsightsInExport}
              onChange={(e) => setIncludeInsightsInExport(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500 h-3.5 w-3.5"
            />
            <span>Include Insights</span>
          </label>

          {/* Export JSON */}
          <button
            onClick={handleExportJson}
            disabled={!report || exportingJson}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50"
          >
            <Download className={`w-3.5 h-3.5 ${exportingJson ? 'animate-spin' : 'text-sky-500'}`} />
            Export JSON
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCsv}
            disabled={!report || exportingCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50"
          >
            <FileSpreadsheet className={`w-3.5 h-3.5 ${exportingCsv ? 'animate-spin' : 'text-emerald-500'}`} />
            Export CSV
          </button>

          {/* Native Print / Save PDF */}
          <button
            onClick={handlePrint}
            disabled={!report}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors shadow-sm disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* Main Content States */}
      {loading ? (
        <div className="p-12 text-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
          <RefreshCw className="w-8 h-8 text-sky-500 animate-spin mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Generating Comprehensive Audit Report...
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Aggregating executive summaries, seasonal trends, data quality metrics, and scientific disclosures.
          </p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-200">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <AlertCircle className="w-5 h-5 text-rose-500" />
            Failed to Generate Report
          </div>
          <p className="text-xs mt-1">{error}</p>
        </div>
      ) : !selectedId ? (
        <div className="p-12 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-slate-500">
          <Layers className="w-8 h-8 mx-auto mb-2 text-slate-400" />
          <p className="text-sm font-medium">No dataset selected</p>
          <p className="text-xs mt-1">Select an active dataset above to compile its research report.</p>
        </div>
      ) : runs.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-slate-500">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            No Detection Runs Available
          </p>
          <p className="text-xs mt-1 text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Comprehensive audit reports require at least one anomaly detection run. Execute anomaly detection on{' '}
            <span className="font-semibold">{selectedDataset?.name || 'this dataset'}</span> first.
          </p>
        </div>
      ) : !report ? null : (
        <div className="space-y-8 print:space-y-6">
          {/* Printable Report Header */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm print:border-b-2 print:border-slate-900 print:shadow-none print:p-0 print:pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
              <div>
                <span className="text-[10px] font-mono tracking-wider uppercase text-sky-600 dark:text-sky-400 font-bold">
                  ClimaSentinel Research & Audit Report
                </span>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {report.dataset_name}
                </h2>
              </div>
              <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                <div>Report ID: <span className="font-mono">{report.report_id}</span></div>
                <div>Generated: <span className="font-mono">{new Date(report.generated_at).toLocaleString()}</span></div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
              <div>Dataset ID: <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono">#{report.dataset_id}</span></div>
              <div>Run ID: <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono">#{report.run_id}</span></div>
              <div>Primary Variable: <span className="font-semibold text-slate-900 dark:text-slate-100 capitalize">{report.executive_summary.primary_variable}</span></div>
              {report.executive_summary.observation_start && report.executive_summary.observation_end && (
                <div>
                  Temporal Span: <span className="font-semibold text-slate-900 dark:text-slate-100">{report.executive_summary.observation_start} &rarr; {report.executive_summary.observation_end}</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 1: Executive Summary */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm print:border print:shadow-none print-break-inside-avoid">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-sky-500" />
              1. Executive Summary & Core Metrics
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Total Records</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                  {report.executive_summary.total_records.toLocaleString()}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Total Anomalies</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                  {report.executive_summary.total_anomalies.toLocaleString()}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Anomaly Rate</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                  {report.executive_summary.anomaly_rate_pct.toFixed(2)}%
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Confirmed Rate</div>
                <div className="text-lg font-bold text-sky-600 dark:text-sky-400 font-mono mt-0.5">
                  {report.executive_summary.confirmed_rate_pct.toFixed(2)}%
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Corroboration Ratio</div>
                <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400 font-mono mt-0.5">
                  {report.executive_summary.corroboration_ratio.toFixed(2)}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Quality Assessment</div>
                <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 capitalize mt-1.5">
                  {report.executive_summary.overall_quality_assessment}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              <span className="font-semibold text-slate-900 dark:text-slate-100 mr-1.5">
                Primary Driver:
              </span>
              {report.executive_summary.primary_driver_summary}
            </div>
          </div>

          {/* Section 2: Data Quality & Wrangling Audit */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm print:border print:shadow-none print-break-inside-avoid">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              2. Data Quality & Wrangling Audit
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Overall Missingness</div>
                <div className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                  {report.data_quality.overall_missing_pct.toFixed(2)}%
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Duplicates Detected</div>
                <div className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                  {report.data_quality.duplicate_rows_detected}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Temporal Gaps Identified</div>
                <div className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                  {report.data_quality.temporal_gaps_identified}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Rainfall Strategy</div>
                <div className="text-base font-bold text-slate-900 dark:text-slate-100 capitalize mt-0.5">
                  {report.data_quality.rainfall_strategy}
                </div>
              </div>
            </div>

            {/* Variable Missingness breakdown */}
            {Object.keys(report.data_quality.missingness_by_variable).length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
                  Missingness Rate by Variable:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries(report.data_quality.missingness_by_variable).map(([col, pct]) => (
                    <div
                      key={col}
                      className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-800/40 text-xs"
                    >
                      <span className="text-slate-600 dark:text-slate-400 font-mono truncate">{col}</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono">{pct.toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quality warnings */}
            {report.data_quality.quality_warnings.length > 0 ? (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300">
                <div className="font-semibold flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Data Quality Warnings ({report.data_quality.quality_warnings.length})
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {report.data_quality.quality_warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                No data quality warnings or critical data gaps identified.
              </div>
            )}
          </div>

          {/* Section 3: Detection Algorithm Configuration */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm print:border print:shadow-none print-break-inside-avoid">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              3. Detection Algorithms & Hyperparameter Configuration
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Seasonal Z-Threshold</div>
                <div className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                  &plusmn;{report.detection_config.z_threshold.toFixed(1)}&sigma;
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Modified Z (MAD) Threshold</div>
                <div className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                  {report.detection_config.mad_threshold.toFixed(1)}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">IForest Contamination</div>
                <div className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                  {(report.detection_config.iforest_contamination * 100).toFixed(1)}%
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">LOF Contamination</div>
                <div className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                  {(report.detection_config.lof_contamination * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Algorithms Applied:
              </span>
              {report.detection_config.algorithms_used.map((alg) => (
                <span
                  key={alg}
                  className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800"
                >
                  {alg}
                </span>
              ))}
            </div>
          </div>

          {/* Section 4: Variable Anomaly Breakdown */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm print:border print:shadow-none print-break-inside-avoid">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              4. Variable-Level Anomaly Breakdown
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2 px-3 font-semibold">Variable</th>
                    <th className="py-2 px-3 font-semibold">Total Anomalies</th>
                    <th className="py-2 px-3 font-semibold">Confirmed</th>
                    <th className="py-2 px-3 font-semibold">Potential</th>
                    <th className="py-2 px-3 font-semibold">Max (+) Dev</th>
                    <th className="py-2 px-3 font-semibold">Max (&minus;) Dev</th>
                    <th className="py-2 px-3 font-semibold">Mean |Dev|</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {report.variable_breakdown.map((row) => (
                    <tr key={row.variable} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-sans font-medium text-slate-900 dark:text-slate-100 capitalize">
                        {row.variable}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200">{row.anomaly_count}</td>
                      <td className="py-2.5 px-3 text-sky-600 dark:text-sky-400 font-semibold">{row.confirmed_count}</td>
                      <td className="py-2.5 px-3 text-amber-600 dark:text-amber-400">{row.potential_count}</td>
                      <td className="py-2.5 px-3 text-rose-600 dark:text-rose-400">
                        {row.max_positive_deviation !== null && row.max_positive_deviation !== undefined
                          ? `+${row.max_positive_deviation.toFixed(2)}`
                          : 'N/A'}
                      </td>
                      <td className="py-2.5 px-3 text-blue-600 dark:text-blue-400">
                        {row.max_negative_deviation !== null && row.max_negative_deviation !== undefined
                          ? `${row.max_negative_deviation.toFixed(2)}`
                          : 'N/A'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                        {row.mean_abs_deviation !== null && row.mean_abs_deviation !== undefined
                          ? row.mean_abs_deviation.toFixed(2)
                          : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 5: Seasonal Patterns (Meteorological Quarters) */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm print:border print:shadow-none print-break-inside-avoid">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              5. Seasonal Anomaly Patterns (Meteorological Quarters)
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2 px-3 font-semibold">Season</th>
                    <th className="py-2 px-3 font-semibold">Months Included</th>
                    <th className="py-2 px-3 font-semibold">Valid Observations</th>
                    <th className="py-2 px-3 font-semibold">Anomaly Count</th>
                    <th className="py-2 px-3 font-semibold">Anomaly Rate</th>
                    <th className="py-2 px-3 font-semibold">Dominant Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {report.seasonal_patterns.map((sp) => (
                    <tr key={sp.season_name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-sans font-medium text-slate-900 dark:text-slate-100">
                        {sp.season_name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                        {sp.months.join(', ')}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                        {sp.record_count.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200">
                        {sp.anomaly_count}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                        {formatRate(sp.anomaly_rate_pct)}
                      </td>
                      <td className="py-2.5 px-3 font-sans capitalize">
                        {getSeverityBadge(sp.dominant_severity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
              * Rates are computed strictly over valid, non-null observations of the primary variable. Unresolved variables or unobserved quarters display N/A.
            </p>
          </div>

          {/* Section 6: Multi-Year Temporal Trends */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm print:border print:shadow-none print-break-inside-avoid">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              6. Multi-Year Temporal Trends (Annual Incidence)
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2 px-3 font-semibold">Period / Calendar Year</th>
                    <th className="py-2 px-3 font-semibold">Valid Observations</th>
                    <th className="py-2 px-3 font-semibold">Anomaly Count</th>
                    <th className="py-2 px-3 font-semibold">Anomaly Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {report.temporal_trends.map((tt) => (
                    <tr key={tt.period_label} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-sans font-medium text-slate-900 dark:text-slate-100">
                        {tt.period_label}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                        {tt.record_count.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200">
                        {tt.anomaly_count}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                        {formatRate(tt.anomaly_rate_pct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
              * Annual comparisons require sufficient calendar year coverage (&ge;180 valid observations). Partial or unobserved years display N/A.
            </p>
          </div>

          {/* Section 7: Key Anomaly Events Portfolio */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm print:border print:shadow-none print-break-inside-avoid">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              7. Key Anomaly Events Portfolio (Top Corroborated Extremes)
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2 px-3 font-semibold">Date</th>
                    <th className="py-2 px-3 font-semibold">Variable</th>
                    <th className="py-2 px-3 font-semibold">Observed</th>
                    <th className="py-2 px-3 font-semibold">Expected</th>
                    <th className="py-2 px-3 font-semibold">Deviation</th>
                    <th className="py-2 px-3 font-semibold">Z-Score</th>
                    <th className="py-2 px-3 font-semibold">Flags</th>
                    <th className="py-2 px-3 font-semibold">Flagged By</th>
                    <th className="py-2 px-3 font-semibold">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {report.key_anomaly_events.map((ev) => (
                    <tr key={`${ev.date}-${ev.variable}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {ev.date}
                      </td>
                      <td className="py-2.5 px-3 font-sans capitalize text-slate-700 dark:text-slate-300">
                        {ev.variable}
                      </td>
                      <td className="py-2.5 px-3 text-slate-900 dark:text-slate-100">
                        {ev.observed_value !== null && ev.observed_value !== undefined ? ev.observed_value.toFixed(2) : 'N/A'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">
                        {ev.expected_value !== null && ev.expected_value !== undefined ? ev.expected_value.toFixed(2) : 'N/A'}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-rose-600 dark:text-rose-400">
                        {ev.deviation !== null && ev.deviation !== undefined ? (ev.deviation >= 0 ? `+${ev.deviation.toFixed(2)}` : ev.deviation.toFixed(2)) : 'N/A'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200">
                        {ev.z_score.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200">
                        {ev.flag_count}/4
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <div className="flex gap-1 flex-wrap">
                          {ev.flagged_by.map((f) => (
                            <span key={f} className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {f.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        {getSeverityBadge(ev.severity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 8: Detector Agreement & Corroboration */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm print:border print:shadow-none print-break-inside-avoid">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-cyan-500" />
              8. Cross-Detector Agreement & Corroboration
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {report.detector_comparison.detectors.map((det) => (
                <div
                  key={det.detector_name}
                  className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800"
                >
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {det.display_name || det.detector_name}
                  </div>
                  <div className="mt-2 text-xs space-y-1 text-slate-600 dark:text-slate-400 font-mono">
                    <div className="flex justify-between">
                      <span>Flags:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{det.flag_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Rate:</span>
                      <span>{(det.anomaly_rate_pct ?? 0).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Solo Flags:</span>
                      <span>{det.solo_flag_count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/50 text-xs text-sky-900 dark:text-sky-200">
              <span className="font-semibold">Ensemble Corroboration Ratio:</span>{' '}
              <span className="font-mono font-bold text-sky-700 dark:text-sky-300">
                {report.detector_comparison.corroboration_ratio.toFixed(2)}
              </span>{' '}
              &bull; Ratio of multi-algorithm consensus flags relative to single-detector solo anomalies.
            </div>
          </div>

          {/* Section 9: Automated Insights Summary */}
          {report.insights.length > 0 && (
            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm print:border print:shadow-none print-break-inside-avoid">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-teal-500" />
                9. Synthesized Climatological Insights ({report.insights.length})
              </h3>

              <div className="space-y-3">
                {report.insights.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-xs"
                  >
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      {getSeverityBadge(item.severity)}
                      <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                        {item.title}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-2">
                      {item.summary}
                    </p>
                    {item.scientific_caveat && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                        Caveat: {item.scientific_caveat}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 10: Scientific Disclosures & Limitations */}
          <div className="p-6 rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/50 dark:bg-sky-950/20 shadow-sm print:border print:shadow-none print-break-inside-avoid">
            <h3 className="text-sm font-bold uppercase tracking-wider text-sky-900 dark:text-sky-300 flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              10. Scientific Disclosures & Methodological Limitations
            </h3>

            <div className="space-y-3 text-xs text-sky-900/90 dark:text-sky-200/90 leading-relaxed">
              <div>
                <span className="font-semibold text-sky-950 dark:text-sky-100">Methodology Overview: </span>
                {report.scientific_disclosure.methodology_summary}
              </div>

              {report.scientific_disclosure.scientific_limitations.length > 0 && (
                <div>
                  <span className="font-semibold text-sky-950 dark:text-sky-100">Known Scientific Limitations:</span>
                  <ul className="list-disc list-inside mt-1 space-y-0.5 pl-1">
                    {report.scientific_disclosure.scientific_limitations.map((lim, i) => (
                      <li key={i}>{lim}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <span className="font-semibold text-sky-950 dark:text-sky-100">Rainfall Handling Policy: </span>
                {report.scientific_disclosure.rainfall_policy_disclosure}
              </div>

              <div>
                <span className="font-semibold text-sky-950 dark:text-sky-100">Attribution Disclaimer: </span>
                {report.scientific_disclosure.attribution_disclaimer}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
