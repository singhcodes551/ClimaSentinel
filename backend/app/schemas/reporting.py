"""Pydantic schemas for Comprehensive Research & Audit Reporting Engine."""
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field

from app.schemas.insights import InsightItem


class ReportExecutiveSummary(BaseModel):
    """High-level summary of the dataset and detection outcomes."""
    dataset_id: int
    dataset_name: str
    run_id: int
    primary_variable: str
    observation_start: Optional[str] = None
    observation_end: Optional[str] = None
    total_records: int
    total_anomalies: int
    confirmed_count: int
    potential_count: int
    anomaly_rate_pct: float
    confirmed_rate_pct: float
    corroboration_ratio: float
    overall_quality_assessment: str
    primary_driver_summary: str


class ReportDataQualitySection(BaseModel):
    """Detailed data integrity and pre-processing quality metrics."""
    overall_missing_pct: float
    missingness_by_variable: Dict[str, float]
    duplicate_rows_detected: int
    temporal_gaps_identified: int
    rainfall_strategy: str
    data_quality_score: Optional[float] = None
    quality_warnings: List[str] = Field(default_factory=list)


class ReportDetectionConfigSection(BaseModel):
    """Hyperparameters and configuration used for anomaly detection."""
    primary_variable: str
    algorithms_used: List[str]
    z_threshold: float
    mad_threshold: float
    iforest_contamination: float
    lof_contamination: float
    detector_timings_ms: Dict[str, Optional[float]] = Field(default_factory=dict)


class ReportVariableAnomalyBreakdown(BaseModel):
    """Per-variable anomaly counts, deviation statistics, and extremes."""
    variable: str
    anomaly_count: int
    confirmed_count: int
    potential_count: int
    max_positive_deviation: Optional[float] = None
    max_negative_deviation: Optional[float] = None
    mean_abs_deviation: Optional[float] = None


class ReportSeasonalPattern(BaseModel):
    """Seasonal distribution of anomalies across meteorological quarters."""
    season_name: str
    months: List[int]
    record_count: int
    anomaly_count: int
    anomaly_rate_pct: Optional[float] = None
    dominant_severity: str


class ReportTemporalTrend(BaseModel):
    """Yearly anomaly counts and rates across the dataset span."""
    period_label: str
    record_count: int
    anomaly_count: int
    anomaly_rate_pct: Optional[float] = None


class ReportKeyAnomalyEvent(BaseModel):
    """Top-ranked individual anomaly event for portfolio analysis."""
    index: int
    date: str
    variable: str
    observed_value: Optional[float] = None
    expected_value: Optional[float] = None
    deviation: Optional[float] = None
    z_score: float = 0.0
    flag_count: int
    flagged_by: List[str]
    classification: str
    severity: str


class ReportDetectorAgreementSection(BaseModel):
    """Cross-detector agreement, Jaccard overlap, and corroboration ratio."""
    detectors: List[Dict[str, Any]]
    corroboration_ratio: float
    top_pairwise_agreements: List[Dict[str, Any]] = Field(default_factory=list)


class ReportScientificDisclosure(BaseModel):
    """Required academic qualifications, scientific assumptions, and limitations."""
    methodology_summary: str
    scientific_limitations: List[str]
    rainfall_policy_disclosure: str
    attribution_disclaimer: str


class ComprehensiveReportResponse(BaseModel):
    """Complete multi-section analytical report payload."""
    report_id: str
    dataset_id: int
    dataset_name: str
    run_id: int
    generated_at: str
    executive_summary: ReportExecutiveSummary
    data_quality: ReportDataQualitySection
    detection_config: ReportDetectionConfigSection
    variable_breakdown: List[ReportVariableAnomalyBreakdown]
    seasonal_patterns: List[ReportSeasonalPattern]
    temporal_trends: List[ReportTemporalTrend]
    key_anomaly_events: List[ReportKeyAnomalyEvent]
    detector_comparison: ReportDetectorAgreementSection
    insights: List[InsightItem]
    scientific_disclosure: ReportScientificDisclosure

