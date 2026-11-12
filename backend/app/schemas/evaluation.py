"""Pydantic schemas for Model Comparison and Synthetic Anomaly Injection Benchmarking."""
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


# ============================================================================
# Observational Model Comparison Schemas
# ============================================================================

class DetectorComparisonMetric(BaseModel):
    detector_name: str = Field(..., description="Machine identifier (e.g. seasonal_zscore)")
    display_name: str = Field(..., description="Human-readable title")
    flag_count: int = Field(..., description="Total points flagged by this detector")
    anomaly_rate_pct: float = Field(..., description="Percentage of valid observations flagged")
    solo_flag_count: int = Field(..., description="Points flagged EXCLUSIVELY by this detector among base detectors")
    solo_rate_pct: float = Field(..., description="Percentage of this detector's flags that are unique/solo")
    corroborated_flag_count: int = Field(..., description="Points flagged by this detector AND at least one other base detector")
    corroborated_rate_pct: float = Field(..., description="Percentage of this detector's flags that are corroborated")
    mean_deviation: Optional[float] = Field(None, description="Mean absolute seasonal deviation of flagged points")
    median_deviation: Optional[float] = Field(None, description="Median absolute seasonal deviation")
    max_deviation: Optional[float] = Field(None, description="Maximum absolute seasonal deviation")
    latency_ms: Optional[float] = Field(None, description="Execution runtime in milliseconds (None if uninstrumented)")


class PairwiseAgreementItem(BaseModel):
    detector_a: str = Field(..., description="First detector identifier")
    detector_b: str = Field(..., description="Second detector identifier")
    shared_count: int = Field(..., description="Observations flagged by BOTH detectors (|A ∩ B|)")
    union_count: int = Field(..., description="Observations flagged by EITHER detector (|A ∪ B|)")
    jaccard_similarity: float = Field(..., description="Jaccard index: |A ∩ B| / |A ∪ B| (0.0 to 1.0)")
    percent_a_in_b: float = Field(..., description="Percentage of A's detections also flagged by B")
    percent_b_in_a: float = Field(..., description="Percentage of B's detections also flagged by A")


class EnsembleComparisonSummary(BaseModel):
    total_records: int = Field(..., description="Total rows in dataset")
    confirmed_count: int = Field(..., description="Confirmed anomalies (≥2 votes)")
    potential_count: int = Field(..., description="Potential anomalies (exactly 1 vote)")
    total_anomalies: int = Field(..., description="Confirmed + Potential")
    anomaly_rate_pct: float = Field(..., description="Overall anomaly percentage")
    confirmed_rate_pct: float = Field(..., description="Confirmed anomaly percentage")
    severity_breakdown: Dict[str, int] = Field(..., description="Count of extreme, high, moderate, none")
    corroboration_ratio: float = Field(..., description="Fraction of anomalies that achieve consensus (confirmed / total)")


class RunComparisonResponse(BaseModel):
    dataset_id: int
    run_id: int
    primary_variable: str
    total_records: int
    detector_names: List[str]
    detectors: List[DetectorComparisonMetric]
    ensemble_summary: EnsembleComparisonSummary
    pairwise_agreement: List[PairwiseAgreementItem]
    jaccard_matrix: Dict[str, Dict[str, float]]
    shared_counts_matrix: Dict[str, Dict[str, int]]


# ============================================================================
# Synthetic Anomaly Injection Benchmark Schemas
# ============================================================================

class SyntheticBenchmarkRequest(BaseModel):
    primary_variable: Optional[str] = Field("temperature", description="Target meteorological variable")
    seed: int = Field(42, description="Random seed for reproducible injection")
    injection_types: List[str] = Field(
        default=["point", "block", "step"],
        description="Types of perturbations to inject: point, block, step"
    )
    point_anomaly_count: int = Field(15, ge=1, le=100, description="Number of isolated spike anomalies")
    block_count: int = Field(3, ge=0, le=10, description="Number of persistent block anomalies (heatwaves/cold-spells)")
    block_length: int = Field(5, ge=2, le=14, description="Duration in days for each block event")
    step_count: int = Field(1, ge=0, le=3, description="Number of calibration drift / step change shifts")
    step_length: int = Field(14, ge=5, le=30, description="Duration in days for step shifts")
    spike_magnitude_sigma: float = Field(4.0, ge=2.0, le=8.0, description="Deviation intensity for point spikes (in std units)")
    block_magnitude_sigma: float = Field(3.0, ge=1.5, le=6.0, description="Deviation intensity for block events")
    step_magnitude_sigma: float = Field(2.5, ge=1.0, le=5.0, description="Deviation intensity for step changes")


class InjectedEventInfo(BaseModel):
    event_id: int
    event_type: str = Field(..., description="point, block, or step")
    start_date: str
    end_date: str
    duration_days: int
    injected_indices: List[int]
    magnitude_applied: float
    direction: str = Field(..., description="positive or negative")
    was_adjusted: bool = Field(default=False, description="Whether the perturbation was adjusted to fit physical limits")


class ConfusionMatrix(BaseModel):
    tp: int = Field(..., description="True Positives (injected anomaly correctly detected)")
    fp: int = Field(..., description="False Positives (clean baseline observation falsely flagged)")
    fn: int = Field(..., description="False Negatives (injected anomaly missed)")
    tn: int = Field(..., description="True Negatives (clean baseline observation correctly unflagged)")


class ModelBenchmarkMetrics(BaseModel):
    detector_name: str
    display_name: str
    is_ensemble: bool = False
    confusion_matrix: ConfusionMatrix
    precision: float = Field(..., description="Positive Predictive Value: TP / (TP + FP)")
    recall: float = Field(..., description="Sensitivity: TP / (TP + FN)")
    f1_score: float = Field(..., description="Harmonic mean of Precision and Recall")
    false_positive_rate: float = Field(..., description="FPR: FP / (FP + TN)")
    event_detection_delay_days: Optional[float] = Field(
        None, description="Average lag in days between event onset and first flag for multi-day events"
    )
    event_detection_rate: float = Field(
        ..., description="Fraction of multi-day events detected at least once during duration"
    )
    latency_ms: float = Field(..., description="Execution time in milliseconds")


class SyntheticBenchmarkResponse(BaseModel):
    dataset_id: int
    dataset_name: str
    primary_variable: str
    total_records: int
    valid_observations: int
    total_injected_points: int
    injection_rate_pct: float
    skipped_injections_count: int = Field(default=0, description="Injections skipped due to physical boundary restrictions")
    adjusted_injections_count: int = Field(default=0, description="Injections where magnitude or direction was adjusted to respect physical limits")
    injected_events: List[InjectedEventInfo]
    models: List[ModelBenchmarkMetrics]
    scientific_disclosure: str = Field(
        default=(
            "Benchmark Assumption: Non-injected baseline observations are treated as true negatives "
            "for controlled evaluation. Any genuine pre-existing natural extremes in the historical "
            "data may be registered as false positives under this mathematical benchmark definition."
        )
    )

