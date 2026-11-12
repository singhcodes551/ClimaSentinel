from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, ConfigDict


class ColumnMapping(BaseModel):
    date: Optional[str] = None
    temperature: Optional[str] = None
    humidity: Optional[str] = None
    rainfall: Optional[str] = None
    pressure: Optional[str] = None
    wind_speed: Optional[str] = None
    extra_features: Optional[List[str]] = Field(default_factory=list)


class DatasetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    filename: str
    file_size_bytes: int
    row_count: int
    column_count: int
    status: str
    column_mapping: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


class ColumnStat(BaseModel):
    column: str
    dtype: str
    standard_name: Optional[str] = None
    missing_count: int
    missing_pct: float
    unique_count: int
    min: Optional[float] = None
    max: Optional[float] = None
    mean: Optional[float] = None
    median: Optional[float] = None
    std: Optional[float] = None


class InvalidValueStat(BaseModel):
    column: str
    standard_name: str
    rule: str
    invalid_count: int
    invalid_pct: float
    sample_values: List[float]


class TemporalProfile(BaseModel):
    date_column: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    duration_days: Optional[float] = None
    frequency: Optional[str] = None
    has_gaps: bool = False
    missing_dates_count: int = 0


class DatasetProfileResponse(BaseModel):
    dataset_id: int
    dataset_name: str
    total_rows: int
    total_columns: int
    duplicate_rows: int
    duplicate_pct: float
    temporal_profile: TemporalProfile
    column_stats: List[ColumnStat]
    invalid_values: List[InvalidValueStat]
    detected_mapping: Dict[str, str]
    overall_quality_score: float  # 0 to 100 based on completeness and physical validity
