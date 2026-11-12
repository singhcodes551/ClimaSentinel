import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  Database,
  FileSpreadsheet,
  Trash2,
  BarChart2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  Sliders,
  ShieldCheck,
  Calendar,
  ArrowRight,
} from 'lucide-react';
import type { DatasetItem, DatasetProfile, WrangleSummary } from '../../types';
import {
  fetchDatasets,
  uploadDataset,
  loadSampleDataset,
  deleteDataset,
  fetchDatasetProfile,
  runWrangling,
  fetchQualitySummary,
} from '../../services/api';

export const DatasetsPage: React.FC = () => {
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Profile modal state
  const [selectedProfile, setSelectedProfile] = useState<DatasetProfile | null>(null);
  const [loadingProfileId, setLoadingProfileId] = useState<number | null>(null);

  // Wrangle modal & runner state
  const [wranglingId, setWranglingId] = useState<number | null>(null);
  const [wrangleSummary, setWrangleSummary] = useState<WrangleSummary | null>(null);
  const [activeWrangleDataset, setActiveWrangleDataset] = useState<DatasetItem | null>(null);
  const [missingStrategy, setMissingStrategy] = useState<'linear' | 'forward_fill' | 'median' | 'none'>('linear');
  const [rainfallStrategy, setRainfallStrategy] = useState<'preserve' | 'zero_fill'>('preserve');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const list = await fetchDatasets();
      setDatasets(list);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to fetch datasets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setErrorMessage('Please select a valid CSV (.csv) file.');
      return;
    }

    try {
      setUploading(true);
      setErrorMessage(null);
      await uploadDataset(file);
      await loadData();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to upload CSV file');
    } finally {
      setUploading(false);
    }
  };

  const handleLoadSample = async (sampleKey: string) => {
    try {
      setLoadingSample(sampleKey);
      setErrorMessage(null);
      await loadSampleDataset(sampleKey);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to load sample ${sampleKey}`);
    } finally {
      setLoadingSample(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this dataset?')) return;
    try {
      await deleteDataset(id);
      await loadData();
      if (selectedProfile?.dataset_id === id) setSelectedProfile(null);
      if (wrangleSummary?.dataset_id === id) setWrangleSummary(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete dataset');
    }
  };

  const handleViewProfile = async (id: number) => {
    try {
      setLoadingProfileId(id);
      setErrorMessage(null);
      const profile = await fetchDatasetProfile(id);
      setSelectedProfile(profile);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load dataset profile');
    } finally {
      setLoadingProfileId(null);
    }
  };

  const handleOpenWrangleDialog = (dataset: DatasetItem) => {
    setActiveWrangleDataset(dataset);
  };

  const handleExecuteWrangle = async () => {
    if (!activeWrangleDataset) return;
    const id = activeWrangleDataset.id;
    try {
      setWranglingId(id);
      setErrorMessage(null);
      const summary = await runWrangling(id, {
        remove_duplicates: true,
        missing_strategy: missingStrategy,
        rainfall_strategy: rainfallStrategy,
        filter_physically_impossible: false,
      });
      setWrangleSummary(summary);
      setActiveWrangleDataset(null);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to execute wrangling pipeline');
    } finally {
      setWranglingId(null);
    }
  };

  const handleViewExistingSummary = async (id: number) => {
    try {
      setWranglingId(id);
      const summary = await fetchQualitySummary(id);
      setWrangleSummary(summary);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to fetch wrangling summary');
    } finally {
      setWranglingId(null);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Datasets & Ingestion Hub
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Ingest real-world weather station series, run deep data profiling, and execute meteorology-compliant data wrangling.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="p-1 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload and Sample Datasets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="p-6 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-sky-500 dark:hover:border-sky-500 bg-white dark:bg-slate-900/40 transition-colors cursor-pointer flex flex-col items-center justify-center text-center group"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".csv"
            className="hidden"
          />
          <div className="p-3.5 rounded-full bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 mb-3 group-hover:scale-105 transition-transform">
            {uploading ? (
              <RefreshCw className="w-6 h-6 animate-spin" />
            ) : (
              <UploadCloud className="w-6 h-6" />
            )}
          </div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
            {uploading ? 'Processing CSV...' : 'Upload Weather CSV'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mb-3">
            Supports date, temperature, humidity, rainfall, pressure, and wind speed columns.
          </p>
          <span className="text-[11px] font-medium text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 px-2.5 py-1 rounded-md border border-sky-200 dark:border-sky-800/60">
            Click to Browse Local CSV
          </span>
        </div>

        {/* Preloaded Synthetic Benchmark Datasets */}
        <div className="lg:col-span-2 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Pre-loaded Synthetic Benchmark Series
              </h3>
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500">Calibrated Climatology Models</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            {/* Delhi Sample */}
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                    Delhi Synthetic Benchmark
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-medium">
                    Subtropical Monsoon
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                  Synthetic 5-year series (2018–2022) mathematically calibrated to Delhi Safdarjung climatology with modeled May heatwaves (&gt;45°C) and monsoon spikes.
                </p>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                  1,829 Synthetic Daily Rows • 6 Weather Parameters
                </div>
              </div>
              <button
                disabled={loadingSample !== null}
                onClick={() => handleLoadSample('delhi_climate')}
                className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs transition-colors cursor-pointer"
              >
                {loadingSample === 'delhi_climate' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                )}
                <span>Load Delhi Benchmark</span>
              </button>
            </div>

            {/* Seattle Sample */}
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                    Seattle Synthetic Benchmark
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 font-medium">
                    Pacific Maritime
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                  Synthetic 4-year series (2019–2022) calibrated to Seattle climatology, including a synthetic recreation of the June 2021 Pacific Heat Dome (42°C).
                </p>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                  1,461 Synthetic Daily Rows • 5 Weather Parameters
                </div>
              </div>
              <button
                disabled={loadingSample !== null}
                onClick={() => handleLoadSample('seattle_weather')}
                className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs transition-colors cursor-pointer"
              >
                {loadingSample === 'seattle_weather' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                )}
                <span>Load Seattle Benchmark</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Registered Datasets Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-sky-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Registered Weather Datasets
            </h3>
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
              {datasets.length} registered
            </span>
          </div>
          <button
            onClick={loadData}
            title="Refresh list"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {datasets.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">
            {loading ? 'Fetching registered datasets...' : 'No datasets registered yet. Upload a CSV or load a synthetic benchmark above.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">ID</th>
                  <th className="py-3 px-4 font-semibold">Station / Dataset Name</th>
                  <th className="py-3 px-4 font-semibold">File Details</th>
                  <th className="py-3 px-4 font-semibold">Dimensions</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {datasets.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-slate-400">#{d.id}</td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{d.name}</div>
                      <div className="text-[11px] text-slate-400 line-clamp-1">{d.description}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-mono text-slate-600 dark:text-slate-300">{d.filename}</div>
                      <div className="text-[10px] text-slate-400">{formatBytes(d.file_size_bytes)}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-800 dark:text-slate-200">{d.row_count.toLocaleString()} rows</div>
                      <div className="text-[11px] text-slate-400">{d.column_count} columns</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                          d.status === 'wrangled'
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : d.status === 'profiled'
                            ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                            : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          d.status === 'wrangled' ? 'bg-emerald-500' : d.status === 'profiled' ? 'bg-sky-500' : 'bg-amber-500'
                        }`} />
                        {d.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        {/* Profile Button */}
                        <button
                          onClick={() => handleViewProfile(d.id)}
                          disabled={loadingProfileId === d.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                        >
                          {loadingProfileId === d.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-500" />
                          ) : (
                            <BarChart2 className="w-3.5 h-3.5 text-sky-500" />
                          )}
                          <span>Profile</span>
                        </button>

                        {/* Wrangle Button */}
                        <button
                          onClick={() => handleOpenWrangleDialog(d)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900 text-sky-700 dark:text-sky-300 transition-colors cursor-pointer"
                        >
                          <Sliders className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                          <span>Wrangle</span>
                        </button>

                        {/* View Cleaning Summary if already wrangled */}
                        {d.status === 'wrangled' && (
                          <button
                            onClick={() => handleViewExistingSummary(d.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
                            title="View Cleaning Audit Summary"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Audit</span>
                          </button>
                        )}

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDelete(d.id)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                          title="Delete dataset"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Profile Modal */}
      {selectedProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                  Meteorological Data Profile
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {selectedProfile.dataset_name}
                </h2>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-xs text-slate-400">Quality Score</div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {selectedProfile.overall_quality_score} / 100
                  </div>
                </div>
                <button
                  onClick={() => setSelectedProfile(null)}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Quick KPI stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
                  <span className="text-[11px] text-slate-400 font-medium">Total Records</span>
                  <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {selectedProfile.total_rows.toLocaleString()}
                  </div>
                </div>
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
                  <span className="text-[11px] text-slate-400 font-medium">Duplicate Rows</span>
                  <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {selectedProfile.duplicate_rows} ({selectedProfile.duplicate_pct}%)
                  </div>
                </div>
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
                  <span className="text-[11px] text-slate-400 font-medium">Temporal Cadence</span>
                  <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {selectedProfile.temporal_profile.frequency || 'Unknown'}
                  </div>
                </div>
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
                  <span className="text-[11px] text-slate-400 font-medium">Duration</span>
                  <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {selectedProfile.temporal_profile.duration_days ?? '--'} days
                  </div>
                </div>
              </div>

              {/* Date Range Info */}
              {selectedProfile.temporal_profile.start_date && (
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-sky-500 shrink-0" />
                  <div className="text-xs text-slate-700 dark:text-slate-300">
                    <span className="font-semibold">Observation Period:</span>{' '}
                    {selectedProfile.temporal_profile.start_date} to {selectedProfile.temporal_profile.end_date}
                    {selectedProfile.temporal_profile.has_gaps && (
                      <span className="ml-2 text-amber-600 dark:text-amber-400 font-medium">
                        (Contains temporal gaps)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Standardized Column Mapping Tags */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Detected Column Mapping
                </h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(selectedProfile.detected_mapping).map(([std, raw]) => (
                    <div
                      key={std}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40"
                    >
                      <span className="font-semibold text-sky-600 dark:text-sky-400">{std}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span className="font-mono text-slate-700 dark:text-slate-300">{raw}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Physical Impossibility Flags */}
              {selectedProfile.invalid_values.length > 0 && (
                <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-950/60 bg-amber-50/60 dark:bg-amber-950/20">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-xs font-semibold mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Physical Bounds Violations (Sensor Glitches)
                  </div>
                  <div className="space-y-1.5 text-xs text-amber-900/80 dark:text-amber-300/80">
                    {selectedProfile.invalid_values.map((inv, idx) => (
                      <div key={idx} className="flex justify-between items-center py-1 border-b border-amber-200/50 dark:border-amber-900/40">
                        <span>
                          <strong className="font-semibold">{inv.column}</strong>: {inv.invalid_count} records violate '{inv.rule}'
                        </span>
                        <span className="font-mono text-[11px]">
                          Sample: {inv.sample_values.join(', ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Column Statistics Table */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Per-Column Distribution & Missingness
                </h4>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">Column</th>
                        <th className="py-2.5 px-3 font-semibold">Type</th>
                        <th className="py-2.5 px-3 font-semibold">Missing</th>
                        <th className="py-2.5 px-3 font-semibold">Unique</th>
                        <th className="py-2.5 px-3 font-semibold">Min</th>
                        <th className="py-2.5 px-3 font-semibold">Max</th>
                        <th className="py-2.5 px-3 font-semibold">Mean</th>
                        <th className="py-2.5 px-3 font-semibold">Median</th>
                        <th className="py-2.5 px-3 font-semibold">Std Dev</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedProfile.column_stats.map((stat, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">
                            {stat.column}
                            {stat.standard_name && (
                              <span className="ml-1 text-[10px] text-sky-600 dark:text-sky-400 font-mono">
                                [{stat.standard_name}]
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500">{stat.dtype}</td>
                          <td className="py-2 px-3">
                            <span className={stat.missing_count > 0 ? 'text-amber-600 font-semibold' : 'text-slate-400'}>
                              {stat.missing_count} ({stat.missing_pct}%)
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono">{stat.unique_count}</td>
                          <td className="py-2 px-3 font-mono">{stat.min ?? '--'}</td>
                          <td className="py-2 px-3 font-mono">{stat.max ?? '--'}</td>
                          <td className="py-2 px-3 font-mono">{stat.mean ?? '--'}</td>
                          <td className="py-2 px-3 font-mono">{stat.median ?? '--'}</td>
                          <td className="py-2 px-3 font-mono">{stat.std ?? '--'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex justify-end">
              <button
                onClick={() => setSelectedProfile(null)}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wrangle Pipeline Config Modal */}
      {activeWrangleDataset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Configure Data Wrangling Pipeline
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Target: {activeWrangleDataset.name}
                </p>
              </div>
              <button
                onClick={() => setActiveWrangleDataset(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Rainfall Strategy Option */}
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Precipitation / Rainfall Missing Value Policy:
                </label>
                <select
                  value={rainfallStrategy}
                  onChange={(e: any) => setRainfallStrategy(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="preserve">
                    Preserve Missing NaN (Recommended: Prevents False Dry Days)
                  </option>
                  <option value="zero_fill">
                    Zero-Fill (Explicit Choice: Fill with 0.0 mm without interpolation)
                  </option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Rainfall is strictly never interpolated with linear, polynomial, or spline algorithms.
                </p>
              </div>

              {/* Continuous Missing Strategy Option */}
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Continuous Variables Imputation (Temperature, Pressure, Wind, Humidity):
                </label>
                <select
                  value={missingStrategy}
                  onChange={(e: any) => setMissingStrategy(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="linear">Linear Temporal Interpolation (Recommended for Continuous)</option>
                  <option value="forward_fill">Forward / Backward Propagation</option>
                  <option value="median">Column Median Replacement</option>
                  <option value="none">Preserve Missing (Do Not Impute)</option>
                </select>
              </div>

              <div className="space-y-2 pt-1 text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Deduplicate timestamps (earliest reading preserved)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Parse timestamps and sort chronological order</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Preserve original raw dataset in isolated storage</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setActiveWrangleDataset(null)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={wranglingId !== null}
                onClick={handleExecuteWrangle}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-xs cursor-pointer"
              >
                {wranglingId !== null ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sliders className="w-3.5 h-3.5" />}
                <span>Execute Wrangling</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wrangle Summary Audit Modal */}
      {wrangleSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Data Cleaning & Quality Audit Summary
                  </h3>
                  <div className="text-xs text-slate-400">
                    Run Completed: {new Date(wrangleSummary.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setWrangleSummary(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* Rain Non-Interpolation Badge */}
              <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-semibold">Meteorological Invariant Verified:</span>{' '}
                    <span>
                      Rainfall interpolation prohibited. Policy applied:{' '}
                      <strong>
                        {wrangleSummary.rainfall_treatment_applied === 'preserved_nan'
                          ? 'Preserved as NaN (No false dry days created)'
                          : 'Zero-filled (Explicit Choice)'}
                      </strong>
                    </span>
                  </div>
                </div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 shrink-0 ml-2">
                  Enforced
                </span>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-center">
                  <div className="text-slate-400 text-[11px]">Rows Before &gt; After</div>
                  <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {wrangleSummary.rows_before} &rarr; {wrangleSummary.rows_after}
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-center">
                  <div className="text-slate-400 text-[11px]">Duplicates Removed</div>
                  <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {wrangleSummary.duplicates_removed}
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-center">
                  <div className="text-slate-400 text-[11px]">Temporal Gaps</div>
                  <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {wrangleSummary.temporal_gaps_identified}
                  </div>
                </div>
              </div>

              {/* Audit Log Table */}
              <div>
                <h4 className="font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] mb-2">
                  Transformation Log
                </h4>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                  {wrangleSummary.operations_log.map((op, i) => (
                    <div key={i} className="p-3 flex items-start justify-between bg-slate-50/50 dark:bg-slate-900/40">
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {op.step}: <span className="font-normal text-sky-600 dark:text-sky-400">{op.action}</span>
                        </div>
                        <div className="text-slate-500 mt-0.5">{op.details}</div>
                      </div>
                      <span className="font-mono text-slate-400 text-[11px]">
                        {op.records_affected} records
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex justify-end">
              <button
                onClick={() => setWrangleSummary(null)}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
