from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


class AnomalyDetectRequest(BaseModel):
    primary_variable: str = Field(default="temperature", description="Target meteorological variable for seasonal baseline")
    z_threshold: float = Field(default=3.0, ge=1.5, le=6.0, description="Seasonal Z-score threshold (|Z| >= threshold)")
    mad_threshold: float = Field(default=3.0, ge=1.5, le=6.0, description="Modified Z-score (MAD) threshold")
    iforest_contamination: float = Field(default=0.03, ge=0.005, le=0.20, description="Expected contamination for Isolation Forest")
    lof_contamination: float = Field(default=0.03, ge=0.005, le=0.20, description="Expected contamination for Local Outlier Factor")


class AnomalyRecord(BaseModel):
    index: int
    date: str
    variable: str
    observed_value: Optional[float] = None
    expected_value: Optional[float] = None
    deviation: Optional[float] = None
    z_score: float = 0.0
    modified_z_score: float = 0.0
    iforest_score: float = 0.0
    lof_score: float = 0.0
    flag_count: int
    flagged_by: List[str]
    classification: str  # 'confirmed' | 'potential' | 'normal'
    severity: str        # 'extreme' | 'high' | 'moderate' | 'none'


class SeverityBreakdown(BaseModel):
    extreme: int = 0
    high: int = 0
    moderate: int = 0
    none: int = 0


class DetectorBreakdown(BaseModel):
    seasonal_zscore: int = 0
    modified_zscore: int = 0
    isolation_forest: int = 0
    lof: int = 0


class AnomalySummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    dataset_id: int
    primary_variable: str
    config: Dict[str, Any]
    total_records: int
    confirmed_count: int
    potential_count: int
    normal_count: int
    severity_breakdown: SeverityBreakdown
    detector_breakdown: DetectorBreakdown
    created_at: datetime


class AnomalyListResponse(BaseModel):
    dataset_id: int
    run_id: int
    total_anomalies: int
    filtered_count: int
    anomalies: List[AnomalyRecord]


class AnomalyRunItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    dataset_id: int
    primary_variable: str
    config: Dict[str, Any]
    total_records: int
    confirmed_count: int
    potential_count: int
    normal_count: int
    created_at: datetime


class AnomalyRunListResponse(BaseModel):
    dataset_id: int
    total_runs: int
    runs: List[AnomalyRunItem]


class TimelineBucket(BaseModel):
    period: str
    confirmed: int = 0
    potential: int = 0
    total_anomalies: int = 0
    extreme: int = 0
    high: int = 0
    moderate: int = 0


class AnomalyTimelineResponse(BaseModel):
    dataset_id: int
    run_id: int
    interval: str
    total_anomalies: int
    buckets: List[TimelineBucket]


