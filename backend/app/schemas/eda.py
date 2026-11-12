from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field


class HistogramBin(BaseModel):
    bin_start: float = Field(..., description="Start value of the bin interval")
    bin_end: float = Field(..., description="End value of the bin interval")
    count: int = Field(..., description="Number of observations within this bin")
    percentage: float = Field(..., description="Percentage of valid observations within this bin")


class VariableDistributionResponse(BaseModel):
    variable: str = Field(..., description="Standard or column variable name")
    unit: Optional[str] = Field(None, description="Physical measurement unit")
    valid_count: int = Field(..., description="Number of valid (non-null) observations")
    missing_count: int = Field(..., description="Number of missing observations")
    min: Optional[float] = Field(None, description="Minimum observed value")
    max: Optional[float] = Field(None, description="Maximum observed value")
    mean: Optional[float] = Field(None, description="Arithmetic mean")
    median: Optional[float] = Field(None, description="Median (50th percentile)")
    std: Optional[float] = Field(None, description="Standard deviation")
    skewness: Optional[float] = Field(None, description="Sample skewness")
    kurtosis: Optional[float] = Field(None, description="Sample excess kurtosis (Fisher)")
    physical_limits: Optional[Dict[str, Any]] = Field(None, description="Physical bounds definition if available")
    bins: List[HistogramBin] = Field(default_factory=list, description="Binned histogram frequencies")


class CorrelationMatrixResponse(BaseModel):
    variables: List[str] = Field(..., description="List of meteorological variables analyzed")
    variable_labels: Dict[str, str] = Field(default_factory=dict, description="Display labels / raw column names")
    matrix: List[List[Optional[float]]] = Field(..., description="N x N symmetric correlation matrix (None if insufficient data)")
    sample_sizes: List[List[int]] = Field(..., description="N x N matrix of pairwise complete observation counts")


class MonthlyClimatologyItem(BaseModel):
    month: int = Field(..., description="Month number 1 to 12")
    month_name: str = Field(..., description="Abbreviated month name (Jan, Feb, ...)")
    record_count: int = Field(..., description="Number of records in this calendar month")
    metrics: Dict[str, Dict[str, Optional[float]]] = Field(
        ...,
        description="Per-variable summary statistics: mean, std, min, max, median"
    )


class SeasonalClimatologyItem(BaseModel):
    season_name: str = Field(..., description="Meteorological season name")
    months: List[int] = Field(..., description="Month numbers included in season")
    record_count: int = Field(..., description="Total observations in season")
    metrics: Dict[str, Dict[str, Optional[float]]] = Field(
        ...,
        description="Per-variable summary statistics for this season"
    )


class SeasonalityResponse(BaseModel):
    available_variables: List[str] = Field(..., description="List of meteorological variables profiled")
    monthly_profile: List[MonthlyClimatologyItem] = Field(..., description="12-month climatological profiles")
    seasonal_profile: List[SeasonalClimatologyItem] = Field(..., description="4-season climatological profiles")


class TimeseriesPoint(BaseModel):
    date: str = Field(..., description="ISO 8601 date (YYYY-MM-DD)")
    value: Optional[float] = Field(None, description="Observed value (null if missing)")
    rolling_mean_7d: Optional[float] = Field(None, description="7-day rolling mean")


class TimeseriesResponse(BaseModel):
    variable: str = Field(..., description="Target variable name")
    unit: Optional[str] = Field(None, description="Physical measurement unit")
    total_points: int = Field(..., description="Total chronological observations in dataset")
    sampled: bool = Field(..., description="Whether downsampling was applied for rendering")
    points: List[TimeseriesPoint] = Field(..., description="Chronological time series points")


class MissingnessCell(BaseModel):
    period: str = Field(..., description="Year-month identifier (YYYY-MM)")
    total_records: int = Field(..., description="Total expected or recorded observations in period")
    missing_counts: Dict[str, int] = Field(..., description="Count of missing entries per variable")
    missing_percentages: Dict[str, float] = Field(..., description="Percentage of missing entries per variable")


class MissingnessResponse(BaseModel):
    periods: List[str] = Field(..., description="Sorted list of period labels (YYYY-MM)")
    variables: List[str] = Field(..., description="List of variables inspected")
    cells: List[MissingnessCell] = Field(..., description="Chronological missingness data per period")
    overall_missing_pct: Dict[str, float] = Field(..., description="Overall missing percentage per variable")
    total_observations: int = Field(..., description="Total rows in dataset")

