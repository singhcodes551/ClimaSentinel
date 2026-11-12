import type {
  HealthStatus,
  DatasetItem,
  DatasetProfile,
  WrangleSummary,
  AnomalySummary,
  AnomalyListResponse,
  AnomalyRunListResponse,
  AnomalyTimelineResponse,
  VariableDistribution,
  CorrelationMatrixResponse,
  SeasonalityResponse,
  TimeseriesResponse,
  MissingnessResponse,
  RunComparisonResponse,
  SyntheticBenchmarkRequest,
  SyntheticBenchmarkResponse,
  DatasetInsightsResponse,
  ComprehensiveReportResponse,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

async function apiRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${endpoint}`, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    res = await fetch(`${API_BASE}/api/v1${endpoint}`, options);
  }

  if (!res.ok) {
    let errorDetail = `Request failed (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch {}
    throw new Error(errorDetail);
  }

  if (res.status === 204) {
    return null as T;
  }
  return res.json();
}

export async function fetchHealth(): Promise<HealthStatus> {
  const startTime = performance.now();
  try {
    const data = await apiRequest<HealthStatus>('/health');
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      ...data,
      latencyMs,
    };
  } catch {
    return {
      status: 'error',
      project: 'ClimaSentinel',
      version: '0.1.0',
      database: 'disconnected',
      environment: 'offline',
      latencyMs: Math.round(performance.now() - startTime),
    };
  }
}

// Datasets API
export async function fetchDatasets(): Promise<DatasetItem[]> {
  return apiRequest<DatasetItem[]>('/datasets');
}

export async function uploadDataset(file: File, name?: string): Promise<DatasetItem> {
  const formData = new FormData();
  formData.append('file', file);
  if (name) formData.append('name', name);

  let res: Response;
  try {
    res = await fetch('/api/v1/datasets/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error();
  } catch {
    res = await fetch(`${API_BASE}/api/v1/datasets/upload`, {
      method: 'POST',
      body: formData,
    });
  }

  if (!res.ok) {
    let errorDetail = `Upload failed (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch {}
    throw new Error(errorDetail);
  }
  return res.json();
}

export async function loadSampleDataset(sampleKey: string): Promise<DatasetItem> {
  return apiRequest<DatasetItem>(`/datasets/sample/${sampleKey}`, {
    method: 'POST',
  });
}

export async function deleteDataset(id: number): Promise<void> {
  return apiRequest<void>(`/datasets/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchDatasetProfile(id: number, refresh: boolean = false): Promise<DatasetProfile> {
  return apiRequest<DatasetProfile>(`/datasets/${id}/profile${refresh ? '?refresh=true' : ''}`);
}

export async function runWrangling(
  id: number,
  config: {
    remove_duplicates?: boolean;
    missing_strategy?: string;
    rainfall_strategy?: string;
    filter_physically_impossible?: boolean;
  } = {}
): Promise<WrangleSummary> {
  return apiRequest<WrangleSummary>(`/datasets/${id}/wrangle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      remove_duplicates: config.remove_duplicates ?? true,
      missing_strategy: config.missing_strategy ?? 'linear',
      rainfall_strategy: config.rainfall_strategy ?? 'preserve',
      filter_physically_impossible: config.filter_physically_impossible ?? false,
      sort_chronologically: true,
    }),
  });
}

export async function fetchQualitySummary(id: number): Promise<WrangleSummary> {
  return apiRequest<WrangleSummary>(`/datasets/${id}/quality-summary`);
}

// Anomaly Detection API
export async function runAnomalyDetection(
  datasetId: number,
  config: {
    primary_variable?: string;
    z_threshold?: number;
    mad_threshold?: number;
    iforest_contamination?: number;
    lof_contamination?: number;
  } = {}
): Promise<AnomalySummary> {
  return apiRequest<AnomalySummary>(`/datasets/${datasetId}/detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      primary_variable: config.primary_variable ?? 'temperature',
      z_threshold: config.z_threshold ?? 3.0,
      mad_threshold: config.mad_threshold ?? 3.0,
      iforest_contamination: config.iforest_contamination ?? 0.03,
      lof_contamination: config.lof_contamination ?? 0.03,
    }),
  });
}

export async function fetchAnomalySummary(datasetId: number, runId?: number): Promise<AnomalySummary> {
  const query = runId ? `?run_id=${runId}` : '';
  return apiRequest<AnomalySummary>(`/datasets/${datasetId}/anomalies/summary${query}`);
}

export async function fetchAnomalyRuns(datasetId: number): Promise<AnomalyRunListResponse> {
  return apiRequest<AnomalyRunListResponse>(`/datasets/${datasetId}/runs`);
}

export async function deleteAnomalyRun(datasetId: number, runId: number): Promise<void> {
  return apiRequest<void>(`/datasets/${datasetId}/runs/${runId}`, {
    method: 'DELETE',
  });
}

export async function fetchAnomalies(
  datasetId: number,
  filters: {
    run_id?: number;
    classification?: string;
    severity?: string;
    variable?: string;
    detector?: string;
    start_date?: string;
    end_date?: string;
    sort_by?: string;
    sort_order?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<AnomalyListResponse> {
  const params = new URLSearchParams();
  if (filters.run_id) params.append('run_id', String(filters.run_id));
  if (filters.classification) params.append('classification', filters.classification);
  if (filters.severity) params.append('severity', filters.severity);
  if (filters.variable) params.append('variable', filters.variable);
  if (filters.detector) params.append('detector', filters.detector);
  if (filters.start_date) params.append('start_date', filters.start_date);
  if (filters.end_date) params.append('end_date', filters.end_date);
  if (filters.sort_by) params.append('sort_by', filters.sort_by);
  if (filters.sort_order) params.append('sort_order', filters.sort_order);
  if (filters.limit) params.append('limit', String(filters.limit));
  if (filters.offset) params.append('offset', String(filters.offset));

  const query = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<AnomalyListResponse>(`/datasets/${datasetId}/anomalies${query}`);
}

export async function fetchAnomalyTimeline(
  datasetId: number,
  options: {
    run_id?: number;
    interval?: 'monthly' | 'yearly';
  } = {}
): Promise<AnomalyTimelineResponse> {
  const params = new URLSearchParams();
  if (options.run_id) params.append('run_id', String(options.run_id));
  if (options.interval) params.append('interval', options.interval);
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<AnomalyTimelineResponse>(`/datasets/${datasetId}/anomalies/timeline${query}`);
}

export function getAnomalyExportUrl(
  datasetId: number,
  options: {
    format?: 'csv' | 'json';
    run_id?: number;
    classification?: string;
    severity?: string;
    sort_by?: string;
    sort_order?: string;
  } = {}
): string {
  const params = new URLSearchParams();
  params.append('format', options.format || 'csv');
  if (options.run_id) params.append('run_id', String(options.run_id));
  if (options.classification) params.append('classification', options.classification);
  if (options.severity) params.append('severity', options.severity);
  if (options.sort_by) params.append('sort_by', options.sort_by);
  if (options.sort_order) params.append('sort_order', options.sort_order);

  return `/api/v1/datasets/${datasetId}/anomalies/export?${params.toString()}`;
}

// ============================================================================
// Exploratory Data Analysis (EDA) API
// ============================================================================

export async function fetchEDADistribution(
  datasetId: number,
  variable?: string,
  bins: number = 20
): Promise<VariableDistribution> {
  const params = new URLSearchParams();
  if (variable) params.append('variable', variable);
  if (bins) params.append('bins', String(bins));
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<VariableDistribution>(`/datasets/${datasetId}/eda/distribution${query}`);
}

export async function fetchEDACorrelations(
  datasetId: number
): Promise<CorrelationMatrixResponse> {
  return apiRequest<CorrelationMatrixResponse>(`/datasets/${datasetId}/eda/correlations`);
}

export async function fetchEDASeasonality(
  datasetId: number
): Promise<SeasonalityResponse> {
  return apiRequest<SeasonalityResponse>(`/datasets/${datasetId}/eda/seasonality`);
}

export async function fetchEDATimeseries(
  datasetId: number,
  variable?: string,
  maxPoints: number = 600
): Promise<TimeseriesResponse> {
  const params = new URLSearchParams();
  if (variable) params.append('variable', variable);
  if (maxPoints) params.append('max_points', String(maxPoints));
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<TimeseriesResponse>(`/datasets/${datasetId}/eda/timeseries${query}`);
}

export async function fetchEDAMissingness(
  datasetId: number
): Promise<MissingnessResponse> {
  return apiRequest<MissingnessResponse>(`/datasets/${datasetId}/eda/missingness`);
}

// ============================================================================
// Model Comparison & Synthetic Evaluation API (Phase 6)
// ============================================================================

export async function fetchRunComparison(
  datasetId: number,
  runId: number
): Promise<RunComparisonResponse> {
  return apiRequest<RunComparisonResponse>(`/datasets/${datasetId}/runs/${runId}/compare`);
}

export async function runSyntheticBenchmark(
  datasetId: number,
  request: SyntheticBenchmarkRequest = {}
): Promise<SyntheticBenchmarkResponse> {
  return apiRequest<SyntheticBenchmarkResponse>(`/datasets/${datasetId}/evaluate/benchmark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
}

// ============================================================================
// Climatological Insights & Reporting API (Phase 7)
// ============================================================================

export async function fetchDatasetInsights(
  datasetId: number,
  runId?: number,
  category?: string
): Promise<DatasetInsightsResponse> {
  const params = new URLSearchParams();
  if (runId) params.append('run_id', String(runId));
  if (category) params.append('category', category);
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<DatasetInsightsResponse>(`/datasets/${datasetId}/insights${query}`);
}

export async function fetchReportSummary(
  datasetId: number,
  runId?: number
): Promise<ComprehensiveReportResponse> {
  const query = runId ? `?run_id=${runId}` : '';
  return apiRequest<ComprehensiveReportResponse>(`/datasets/${datasetId}/reports/summary${query}`);
}

export function getReportExportUrl(
  datasetId: number,
  format: 'json' | 'csv' = 'json',
  runId?: number,
  includeInsights: boolean = true
): string {
  const params = new URLSearchParams();
  params.append('format', format);
  if (runId) params.append('run_id', String(runId));
  params.append('include_insights', String(includeInsights));
  return `/api/v1/datasets/${datasetId}/reports/export?${params.toString()}`;
}

export async function downloadReportExport(
  datasetId: number,
  format: 'json' | 'csv' = 'json',
  runId?: number,
  includeInsights: boolean = true
): Promise<void> {
  const params = new URLSearchParams();
  params.append('format', format);
  if (runId) params.append('run_id', String(runId));
  params.append('include_insights', String(includeInsights));

  let res: Response;
  const endpoint = `/api/v1/datasets/${datasetId}/reports/export?${params.toString()}`;
  try {
    res = await fetch(endpoint);
    if (!res.ok) throw new Error();
  } catch {
    res = await fetch(`${API_BASE}${endpoint}`);
  }

  if (!res.ok) {
    let errorDetail = `Export failed (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch {}
    throw new Error(errorDetail);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const filename =
    format === 'json'
      ? `climasentinel_report_ds${datasetId}${runId ? `_run${runId}` : ''}.json`
      : `climasentinel_report_ds${datasetId}${runId ? `_run${runId}` : ''}.csv`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}



