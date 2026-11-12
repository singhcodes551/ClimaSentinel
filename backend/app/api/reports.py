"""API endpoints for comprehensive research and audit reports and downloads."""
import json
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
import pandas as pd

from app.database import get_db
from app.models.dataset import Dataset
from app.api.detection import get_run_or_404
from app.core.reporting import (
    generate_comprehensive_report,
    report_to_json,
    report_to_csv_bundle,
)
from app.schemas.reporting import ComprehensiveReportResponse

router = APIRouter(prefix="/datasets", tags=["Reports"])

VALID_EXPORT_FORMATS = {"json", "csv"}


@router.get(
    "/{dataset_id}/reports/summary",
    response_model=ComprehensiveReportResponse,
    summary="Get comprehensive research & audit report summary",
)
def get_report_summary(
    dataset_id: int,
    run_id: Optional[int] = Query(None, description="Optional specific run ID. Defaults to latest run."),
    db: Session = Depends(get_db),
):
    """
    Generates a full audit-grade research report integrating dataset profile,
    wrangling summaries, detector agreements, and climatological insights.
    """
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found.",
        )

    run = get_run_or_404(dataset_id, run_id, db)

    df: Optional[pd.DataFrame] = None
    target_path = dataset.cleaned_file_path or dataset.raw_file_path
    if target_path and Path(target_path).exists():
        try:
            df = pd.read_csv(target_path)
        except Exception:
            df = None

    report = generate_comprehensive_report(dataset, run, df=df)
    return report


@router.get(
    "/{dataset_id}/reports/export",
    summary="Export comprehensive research & audit report as downloadable JSON or CSV bundle",
)
def export_report(
    dataset_id: int,
    format: str = Query("json", description="Export format: 'json' or 'csv'"),
    run_id: Optional[int] = Query(None, description="Optional specific run ID. Defaults to latest run."),
    include_insights: bool = Query(True, description="Whether to include automated insights in the export"),
    db: Session = Depends(get_db),
):
    """
    Exports the comprehensive report in downloadable format (JSON or multi-section CSV bundle).
    Preserves nulls in JSON and N/A in CSV for unobserved or unavailable rates.
    """
    fmt = format.lower().strip()
    if fmt not in VALID_EXPORT_FORMATS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Invalid export format '{format}'. Allowed values: {sorted(list(VALID_EXPORT_FORMATS))}",
        )

    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found.",
        )

    run = get_run_or_404(dataset_id, run_id, db)

    df: Optional[pd.DataFrame] = None
    target_path = dataset.cleaned_file_path or dataset.raw_file_path
    if target_path and Path(target_path).exists():
        try:
            df = pd.read_csv(target_path)
        except Exception:
            df = None

    report = generate_comprehensive_report(dataset, run, df=df)

    if fmt == "json":
        json_data = report_to_json(report, include_insights=include_insights)
        filename = f"climasentinel_report_ds{dataset_id}_run{run.id}.json"
        content_str = json.dumps(json_data, indent=2)
        return Response(
            content=content_str,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # Format == csv
    csv_str = report_to_csv_bundle(report, include_insights=include_insights)
    filename = f"climasentinel_report_ds{dataset_id}_run{run.id}.csv"
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

