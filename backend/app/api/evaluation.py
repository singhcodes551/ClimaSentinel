from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import pandas as pd

from app.database import get_db
from app.models.dataset import Dataset, AnomalyRun
from app.core.validator import detect_column_mapping
from app.core.evaluation import compute_run_comparison
from app.core.synthetic_injection import run_synthetic_benchmark
from app.schemas.evaluation import (
    RunComparisonResponse,
    SyntheticBenchmarkRequest,
    SyntheticBenchmarkResponse,
)

router = APIRouter(prefix="/datasets", tags=["Model Evaluation & Comparison"])


def get_dataset_or_404(dataset_id: int, db: Session) -> Dataset:
    """Fetches dataset by ID or raises 404."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset with ID {dataset_id} not found.",
        )
    return dataset


@router.get(
    "/{dataset_id}/runs/{run_id}/compare",
    response_model=RunComparisonResponse,
    summary="Compute cross-detector agreement, Jaccard overlap, and consensus breakdown for a detection run",
)
def get_run_comparison(
    dataset_id: int,
    run_id: int,
    db: Session = Depends(get_db),
):
    """
    Evaluates individual base detectors against each other and the consensus ensemble.
    Computes pairwise Jaccard similarity, solo vs corroborated detections, and deviation distributions.
    """
    get_dataset_or_404(dataset_id, db)

    run = db.query(AnomalyRun).filter(AnomalyRun.id == run_id).first()
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Anomaly run {run_id} not found.",
        )
    if run.dataset_id != dataset_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Anomaly run {run_id} does not belong to dataset {dataset_id}.",
        )

    try:
        return compute_run_comparison(run)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compute model comparison: {str(e)}",
        )


@router.post(
    "/{dataset_id}/evaluate/benchmark",
    response_model=SyntheticBenchmarkResponse,
    summary="Execute controlled synthetic anomaly injection and benchmark precision, recall, and detection latency",
)
def evaluate_synthetic_benchmark(
    dataset_id: int,
    request: SyntheticBenchmarkRequest = SyntheticBenchmarkRequest(),
    db: Session = Depends(get_db),
):
    """
    Injects calibrated point spikes, persistent blocks, and step-change offsets with exact ground truth.
    Benchmarks Seasonal Z-score, Modified Z-score (MAD), Isolation Forest, LOF, and Consensus Ensemble.
    """
    dataset = get_dataset_or_404(dataset_id, db)

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
            detail="Cannot benchmark an empty dataset.",
        )

    mapping = dataset.column_mapping or detect_column_mapping(df.columns.tolist())

    try:
        return run_synthetic_benchmark(
            df=df,
            mapping=mapping,
            config=request,
            dataset_id=dataset.id,
            dataset_name=dataset.name,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Benchmark execution failed: {str(e)}",
        )

