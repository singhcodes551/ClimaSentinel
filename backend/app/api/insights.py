"""API endpoints for automated meteorological and climatological insights."""
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
import pandas as pd

from app.database import get_db
from app.models.dataset import Dataset
from app.api.detection import get_run_or_404
from app.core.insights import build_dataset_insights_response
from app.schemas.insights import DatasetInsightsResponse

router = APIRouter(prefix="/datasets", tags=["Insights"])

VALID_CATEGORIES = {"meteorological", "distribution", "seasonal", "consensus", "quality"}


@router.get(
    "/{dataset_id}/insights",
    response_model=DatasetInsightsResponse,
    summary="Get automated climatological insights for dataset detection run",
)
def get_dataset_insights(
    dataset_id: int,
    run_id: Optional[int] = Query(None, description="Optional specific run ID. Defaults to latest run."),
    category: Optional[str] = Query(None, description="Filter insights by category: 'meteorological', 'distribution', 'seasonal', 'consensus', or 'quality'"),
    db: Session = Depends(get_db),
):
    """
    Returns deterministic, rule-based climatological insights backed by actual observational evidence.
    Supports filtering by run_id (defaults to latest run) and category.
    """
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found.",
        )

    run = get_run_or_404(dataset_id, run_id, db)

    if category:
        cat_clean = category.lower().strip()
        if cat_clean not in VALID_CATEGORIES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Invalid category '{category}'. Allowed categories: {sorted(list(VALID_CATEGORIES))}",
            )

    df: Optional[pd.DataFrame] = None
    target_path = dataset.cleaned_file_path or dataset.raw_file_path
    if target_path and Path(target_path).exists():
        try:
            df = pd.read_csv(target_path)
        except Exception:
            df = None

    response = build_dataset_insights_response(
        dataset=dataset,
        anomaly_run=run,
        df=df,
        category=category,
    )
    return response

