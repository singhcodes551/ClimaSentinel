"""Pydantic schemas for Data-Driven Climatological Insights Engine."""
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class InsightItem(BaseModel):
    """Individual data-driven insight grounded in actual observational evidence."""
    id: str = Field(..., description="Stable unique identifier for the insight")
    category: str = Field(
        ...,
        description="Category: 'meteorological', 'distribution', 'seasonal', 'consensus', or 'quality'"
    )
    severity: str = Field(
        ...,
        description="Severity: 'critical', 'warning', or 'info'"
    )
    title: str = Field(..., description="Clear descriptive finding headline")
    summary: str = Field(..., description="Factual numerical summary of the finding")
    variable: Optional[str] = Field(None, description="Primary meteorological variable involved")
    evidence: Dict[str, Any] = Field(
        default_factory=dict,
        description="Exact numerical metrics backing the finding (e.g. counts, deviations, rates)"
    )
    observation_period: Optional[Dict[str, Optional[str]]] = Field(
        None,
        description="Start and end dates of the observation span relevant to this insight"
    )
    supporting_dates: List[str] = Field(
        default_factory=list,
        description="ISO date strings of key anomaly observations illustrating the finding"
    )
    scientific_caveat: str = Field(
        ...,
        description="Scientific qualification preventing ungrounded synoptic or decadal extrapolation"
    )


class CategoryInsights(BaseModel):
    """Insights grouped by analytical category."""
    category: str
    display_name: str
    count: int
    items: List[InsightItem]


class DatasetInsightsResponse(BaseModel):
    """Complete synthesized insights payload for a dataset detection run."""
    dataset_id: int
    dataset_name: str
    run_id: int
    primary_variable: str
    generated_at: str
    total_insights: int
    severity_counts: Dict[str, int] = Field(
        default_factory=lambda: {"critical": 0, "warning": 0, "info": 0}
    )
    categories: List[CategoryInsights]
    all_insights: List[InsightItem]
    methodology_disclosure: str = Field(
        default=(
            "ClimaSentinel Automated Insights Methodology: All insights are rule-derived strictly from "
            "actual dataset observations, seasonal climatology baselines (7-day circular DOY), and stored "
            "ensemble detection runs. Insights describe local empirical departures within the provided "
            "observation window and do not constitute long-term climate change attribution or synoptic storm declarations."
        )
    )

