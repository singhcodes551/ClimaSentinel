from datetime import datetime
from typing import Optional, Dict, List, Any
from pydantic import BaseModel, Field


class WrangleRequest(BaseModel):
    column_mapping: Optional[Dict[str, str]] = None
    remove_duplicates: bool = True
    missing_strategy: str = Field(
        default="linear",
        description="Imputation for continuous variables: linear, forward_fill, median, or none"
    )
    rainfall_strategy: str = Field(
        default="preserve",
        description="Precipitation policy: preserve (leaves as NaN to prevent false dry days) or zero_fill"
    )
    filter_physically_impossible: bool = Field(
        default=False,
        description="Whether to nullify physically impossible readings vs flag them"
    )
    sort_chronologically: bool = True


class QualityLogItem(BaseModel):
    step: str
    action: str
    details: str
    records_affected: int


class WrangleSummaryResponse(BaseModel):
    dataset_id: int
    rows_before: int
    rows_after: int
    duplicates_removed: int
    missing_treated: Dict[str, int]
    invalid_flagged: Dict[str, int]
    rainfall_non_interpolated: bool = True
    rainfall_treatment_applied: str = "preserved_nan"
    temporal_gaps_identified: int
    operations_log: List[QualityLogItem]
    created_at: datetime
