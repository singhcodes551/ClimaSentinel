from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
import pandas as pd

from app.database import get_db
from app.models.dataset import Dataset
from app.core.validator import detect_column_mapping
from app.core.eda import (
    compute_distribution,
    compute_correlations,
    compute_seasonality,
    compute_timeseries,
    compute_missingness,
    get_meteorological_columns,
)
from app.schemas.eda import (
    VariableDistributionResponse,
    CorrelationMatrixResponse,
    SeasonalityResponse,
    TimeseriesResponse,
    MissingnessResponse,
)

router = APIRouter(prefix="/datasets/{dataset_id}/eda", tags=["Exploratory Data Analysis"])


def _load_dataset_df(dataset_id: int, db: Session):
    """Loads and validates dataset DataFrame and column mapping."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset with ID {dataset_id} not found.",
        )

    target_path = dataset.cleaned_file_path or dataset.raw_file_path
    if not target_path or not Path(target_path).exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset file not found on disk.",
        )

    try:
        df = pd.read_csv(target_path)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read dataset file: {str(e)}",
        )

    if len(df) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot perform EDA on an empty dataset.",
        )

    mapping = dataset.column_mapping or detect_column_mapping(df.columns.tolist())
    return dataset, df, mapping


@router.get(
    "/distribution",
    response_model=VariableDistributionResponse,
    summary="Compute statistical distribution and histogram for a meteorological variable",
)
def get_distribution(
    dataset_id: int,
    variable: Optional[str] = Query(None, description="Variable name or standard key (e.g., temperature, humidity)"),
    bins: int = Query(20, ge=5, le=50, description="Number of histogram bins (5 to 50)"),
    db: Session = Depends(get_db),
):
    _, df, mapping = _load_dataset_df(dataset_id, db)
    
    # If variable not specified, default to primary temperature or first available numeric column
    if not variable:
        meteo_cols = get_meteorological_columns(df, mapping)
        if not meteo_cols:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No numeric meteorological variables found in this dataset.",
            )
        variable = meteo_cols[0][1]

    try:
        return compute_distribution(df, mapping, variable, num_bins=bins)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get(
    "/correlations",
    response_model=CorrelationMatrixResponse,
    summary="Compute pairwise complete Pearson correlation matrix across variables",
)
def get_correlations(
    dataset_id: int,
    db: Session = Depends(get_db),
):
    _, df, mapping = _load_dataset_df(dataset_id, db)
    try:
        return compute_correlations(df, mapping)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/seasonality",
    response_model=SeasonalityResponse,
    summary="Compute monthly and seasonal climatological baseline profiles",
)
def get_seasonality(
    dataset_id: int,
    db: Session = Depends(get_db),
):
    _, df, mapping = _load_dataset_df(dataset_id, db)
    try:
        return compute_seasonality(df, mapping)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/timeseries",
    response_model=TimeseriesResponse,
    summary="Retrieve chronologically ordered time series with 7-day rolling mean",
)
def get_timeseries(
    dataset_id: int,
    variable: Optional[str] = Query(None, description="Variable name or standard key"),
    max_points: int = Query(600, ge=50, le=2000, description="Maximum points to return"),
    db: Session = Depends(get_db),
):
    _, df, mapping = _load_dataset_df(dataset_id, db)

    if not variable:
        meteo_cols = get_meteorological_columns(df, mapping)
        if not meteo_cols:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No numeric meteorological variables found in this dataset.",
            )
        variable = meteo_cols[0][1]

    try:
        return compute_timeseries(df, mapping, variable, max_points=max_points)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get(
    "/missingness",
    response_model=MissingnessResponse,
    summary="Compute monthly sensor missingness breakdown and data gaps",
)
def get_missingness(
    dataset_id: int,
    db: Session = Depends(get_db),
):
    _, df, mapping = _load_dataset_df(dataset_id, db)
    try:
        return compute_missingness(df, mapping)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
