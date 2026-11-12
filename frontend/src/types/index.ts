export type PageId =
  | 'dashboard'
  | 'datasets'
  | 'pipeline'
  | 'eda'
  | 'anomalies'
  | 'compare'
  | 'insights'
  | 'reports'
  | 'settings';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'error' | 'connecting';
  project: string;
  version: string;
  timestamp?: string;
  database?: string;
  environment?: string;
  latencyMs?: number;
}

export interface DatasetItem {
  id: number;
  name: string;
  description?: string;
  filename: string;
  file_size_bytes: number;
  row_count: number;
  column_count: number;
  status: 'raw' | 'profiled' | 'wrangled' | 'error';
  column_mapping?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface ColumnStat {
  column: string;
  dtype: string;
  standard_name?: string;
  missing_count: number;
  missing_pct: number;
  unique_count: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  std?: number;
}

export interface InvalidValueStat {
  column: string;
  standard_name: string;
  rule: string;
  invalid_count: number;
  invalid_pct: number;
  sample_values: number[];
  description?: string;
}

export interface TemporalProfile {
  date_column?: string;
  start_date?: string;
  end_date?: string;
  duration_days?: number;
  frequency?: string;
  has_gaps: boolean;
  missing_dates_count: number;
}

export interface DatasetProfile {
  dataset_id: number;
  dataset_name: string;
  total_rows: number;
  total_columns: number;
  duplicate_rows: number;
  duplicate_pct: number;
  temporal_profile: TemporalProfile;
  column_stats: ColumnStat[];
  invalid_values: InvalidValueStat[];
  detected_mapping: Record<string, string>;
  overall_quality_score: number;
}

export interface QualityLogItem {
  step: string;
  action: string;
  details: string;
  records_affected: number;
}

export interface WrangleSummary {
  dataset_id: number;
  rows_before: number;
  rows_after: number;
  duplicates_removed: number;
  missing_treated: Record<string, number>;
  invalid_flagged: Record<string, number>;
  rainfall_non_interpolated: boolean;
  rainfall_treatment_applied: string;
  temporal_gaps_identified: number;
  operations_log: QualityLogItem[];
  created_at: string;
}

export interface AnomalyRecord {
  index: number;
  date: string;
  variable: string;
  observed_value: number | null;
  expected_value: number | null;
  deviation: number | null;
  z_score: number;
  modified_z_score: number;
  iforest_score: number;
  lof_score: number;
  flag_count: number;
  flagged_by: string[];
  classification: 'confirmed' | 'potential' | 'normal';
  severity: 'extreme' | 'high' | 'moderate' | 'none';
}

export interface SeverityBreakdown {
  extreme: number;
  high: number;
  moderate: number;
  none: number;
}

export interface DetectorBreakdown {
  seasonal_zscore: number;
  modified_zscore: number;
  isolation_forest: number;
  lof: number;
}

export interface AnomalySummary {
  id: number;
  dataset_id: number;
  primary_variable: string;
  config: {
    primary_variable: string;
    z_threshold: number;
    mad_threshold: number;
    iforest_contamination: number;
    lof_contamination: number;
  };
  total_records: number;
  confirmed_count: number;
  potential_count: number;
  normal_count: number;
  severity_breakdown: SeverityBreakdown;
  detector_breakdown: DetectorBreakdown;
  created_at: string;
}

export interface AnomalyListResponse {
  dataset_id: number;
  run_id: number;
  total_anomalies: number;
  filtered_count: number;
  anomalies: AnomalyRecord[];
}

export interface AnomalyRunItem {
  id: number;
  dataset_id: number;
  primary_variable: string;
  config: {
    primary_variable: string;
    z_threshold: number;
    mad_threshold: number;
    iforest_contamination: number;
    lof_contamination: number;
  };
  total_records: number;
  confirmed_count: number;
  potential_count: number;
  normal_count: number;
  created_at: string;
}

export interface AnomalyRunListResponse {
  dataset_id: number;
  total_runs: number;
  runs: AnomalyRunItem[];
}

export interface TimelineBucket {
  period: string;
  confirmed: number;
  potential: number;
  total_anomalies: number;
  extreme: number;
  high: number;
  moderate: number;
}

export interface AnomalyTimelineResponse {
  dataset_id: number;
  run_id: number;
  interval: 'monthly' | 'yearly';
  total_anomalies: number;
  buckets: TimelineBucket[];
}

export interface HistogramBin {
  bin_start: number;
  bin_end: number;
  count: number;
  percentage: number;
}

export interface VariableDistribution {
  variable: string;
  unit?: string | null;
  valid_count: number;
  missing_count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  std: number | null;
  skewness: number | null;
  kurtosis: number | null;
  physical_limits?: {
    min: number;
    max: number;
    unit: string;
    description: string;
  } | null;
  bins: HistogramBin[];
}

export interface CorrelationMatrixResponse {
  variables: string[];
  variable_labels: Record<string, string>;
  matrix: (number | null)[][];
  sample_sizes: number[][];
}

export interface MonthlyClimatologyItem {
  month: number;
  month_name: string;
  record_count: number;
  metrics: Record<
    string,
    {
      mean: number | null;
      std: number | null;
      min: number | null;
      max: number | null;
      median: number | null;
    }
  >;
}

export interface SeasonalClimatologyItem {
  season_name: string;
  months: number[];
  record_count: number;
  metrics: Record<
    string,
    {
      mean: number | null;
      std: number | null;
      min: number | null;
      max: number | null;
      median: number | null;
    }
  >;
}

export interface SeasonalityResponse {
  available_variables: string[];
  monthly_profile: MonthlyClimatologyItem[];
  seasonal_profile: SeasonalClimatologyItem[];
}

export interface TimeseriesPoint {
  date: string;
  value: number | null;
  rolling_mean_7d: number | null;
}

export interface TimeseriesResponse {
  variable: string;
  unit?: string | null;
  total_points: number;
  sampled: boolean;
  points: TimeseriesPoint[];
}

export interface MissingnessCell {
  period: string;
  total_records: number;
  missing_counts: Record<string, number>;
  missing_percentages: Record<string, number>;
}

export interface MissingnessResponse {
  periods: string[];
  variables: string[];
  cells: MissingnessCell[];
  overall_missing_pct: Record<string, number>;
  total_observations: number;
}

// ============================================================================
// Model Comparison & Synthetic Evaluation Types (Phase 6)
// ============================================================================

export interface DetectorComparisonMetric {
  detector_name: string;
  display_name: string;
  flag_count: number;
  anomaly_rate_pct: number;
  solo_flag_count: number;
  solo_rate_pct: number;
  corroborated_flag_count: number;
  corroborated_rate_pct: number;
  mean_deviation: number | null;
  median_deviation: number | null;
  max_deviation: number | null;
  latency_ms: number | null;
}

export interface PairwiseAgreementItem {
  detector_a: string;
  detector_b: string;
  shared_count: number;
  union_count: number;
  jaccard_similarity: number;
  percent_a_in_b: number;
  percent_b_in_a: number;
}

export interface EnsembleComparisonSummary {
  total_records: number;
  confirmed_count: number;
  potential_count: number;
  total_anomalies: number;
  anomaly_rate_pct: number;
  confirmed_rate_pct: number;
  severity_breakdown: Record<string, number>;
  corroboration_ratio: number;
}

export interface RunComparisonResponse {
  dataset_id: number;
  run_id: number;
  primary_variable: string;
  total_records: number;
  detector_names: string[];
  detectors: DetectorComparisonMetric[];
  ensemble_summary: EnsembleComparisonSummary;
  pairwise_agreement: PairwiseAgreementItem[];
  jaccard_matrix: Record<string, Record<string, number>>;
  shared_counts_matrix: Record<string, Record<string, number>>;
}

export interface SyntheticBenchmarkRequest {
  primary_variable?: string;
  seed?: number;
  injection_types?: string[];
  point_anomaly_count?: number;
  block_count?: number;
  block_length?: number;
  step_count?: number;
  step_length?: number;
  spike_magnitude_sigma?: number;
  block_magnitude_sigma?: number;
  step_magnitude_sigma?: number;
}

export interface InjectedEventInfo {
  event_id: number;
  event_type: 'point' | 'block' | 'step';
  start_date: string;
  end_date: string;
  duration_days: number;
  injected_indices: number[];
  magnitude_applied: number;
  direction: 'positive' | 'negative';
  was_adjusted?: boolean;
}

export interface ConfusionMatrix {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

export interface ModelBenchmarkMetrics {
  detector_name: string;
  display_name: string;
  is_ensemble: boolean;
  confusion_matrix: ConfusionMatrix;
  precision: number;
  recall: number;
  f1_score: number;
  false_positive_rate: number;
  event_detection_delay_days: number | null;
  event_detection_rate: number;
  latency_ms: number;
}

export interface SyntheticBenchmarkResponse {
  dataset_id: number;
  dataset_name: string;
  primary_variable: string;
  total_records: number;
  valid_observations: number;
  total_injected_points: number;
  injection_rate_pct: number;
  skipped_injections_count?: number;
  adjusted_injections_count?: number;
  injected_events: InjectedEventInfo[];
  models: ModelBenchmarkMetrics[];
  scientific_disclosure: string;
}

// ============================================================================
// Climatological Insights & Reporting Types (Phase 7)
// ============================================================================

export interface InsightItem {
  id: string;
  category: 'meteorological' | 'distribution' | 'seasonal' | 'consensus' | 'quality' | string;
  severity: 'critical' | 'warning' | 'info' | string;
  title: string;
  summary: string;
  variable?: string | null;
  evidence: Record<string, any>;
  observation_period?: {
    start?: string | null;
    end?: string | null;
  } | null;
  supporting_dates: string[];
  scientific_caveat: string;
}

export interface CategoryInsights {
  category: string;
  display_name: string;
  count: number;
  items: InsightItem[];
}

export interface DatasetInsightsResponse {
  dataset_id: number;
  dataset_name: string;
  run_id: number;
  primary_variable: string;
  generated_at: string;
  total_insights: number;
  severity_counts: {
    critical: number;
    warning: number;
    info: number;
    [key: string]: number;
  };
  categories: CategoryInsights[];
  all_insights: InsightItem[];
  methodology_disclosure: string;
}

export interface ReportExecutiveSummary {
  dataset_id: number;
  dataset_name: string;
  run_id: number;
  primary_variable: string;
  observation_start?: string | null;
  observation_end?: string | null;
  total_records: number;
  total_anomalies: number;
  confirmed_count: number;
  potential_count: number;
  anomaly_rate_pct: number;
  confirmed_rate_pct: number;
  corroboration_ratio: number;
  overall_quality_assessment: string;
  primary_driver_summary: string;
}

export interface ReportDataQualitySection {
  overall_missing_pct: number;
  missingness_by_variable: Record<string, number>;
  duplicate_rows_detected: number;
  temporal_gaps_identified: number;
  rainfall_strategy: string;
  data_quality_score?: number | null;
  quality_warnings: string[];
}

export interface ReportDetectionConfigSection {
  primary_variable: string;
  algorithms_used: string[];
  z_threshold: number;
  mad_threshold: number;
  iforest_contamination: number;
  lof_contamination: number;
  detector_timings_ms: Record<string, number | null>;
}

export interface ReportVariableAnomalyBreakdown {
  variable: string;
  anomaly_count: number;
  confirmed_count: number;
  potential_count: number;
  max_positive_deviation?: number | null;
  max_negative_deviation?: number | null;
  mean_abs_deviation?: number | null;
}

export interface ReportSeasonalPattern {
  season_name: string;
  months: number[];
  record_count: number;
  anomaly_count: number;
  anomaly_rate_pct: number | null;
  dominant_severity: string;
}

export interface ReportTemporalTrend {
  period_label: string;
  record_count: number;
  anomaly_count: number;
  anomaly_rate_pct: number | null;
}

export interface ReportKeyAnomalyEvent {
  index: number;
  date: string;
  variable: string;
  observed_value?: number | null;
  expected_value?: number | null;
  deviation?: number | null;
  z_score: number;
  flag_count: number;
  flagged_by: string[];
  classification: string;
  severity: string;
}

export interface ReportDetectorAgreementSection {
  detectors: Record<string, any>[];
  corroboration_ratio: number;
  top_pairwise_agreements: Record<string, any>[];
}

export interface ReportScientificDisclosure {
  methodology_summary: string;
  scientific_limitations: string[];
  rainfall_policy_disclosure: string;
  attribution_disclaimer: string;
}

export interface ComprehensiveReportResponse {
  report_id: string;
  dataset_id: number;
  dataset_name: string;
  run_id: number;
  generated_at: string;
  executive_summary: ReportExecutiveSummary;
  data_quality: ReportDataQualitySection;
  detection_config: ReportDetectionConfigSection;
  variable_breakdown: ReportVariableAnomalyBreakdown[];
  seasonal_patterns: ReportSeasonalPattern[];
  temporal_trends: ReportTemporalTrend[];
  key_anomaly_events: ReportKeyAnomalyEvent[];
  detector_comparison: ReportDetectorAgreementSection;
  insights: InsightItem[];
  scientific_disclosure: ReportScientificDisclosure;
}




