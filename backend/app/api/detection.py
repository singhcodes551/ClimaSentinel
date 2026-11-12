import csv
import io
import re
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import pandas as pd

from app.database import get_db
from app.models.dataset import Dataset, AnomalyRun
from app.schemas.anomaly import (
    AnomalyDetectRequest,
    AnomalySummaryResponse,
    AnomalyListResponse,
    AnomalyRecord,
    AnomalyRunItem,
    AnomalyRunListResponse,
    TimelineBucket,
    AnomalyTimelineResponse,
)
from app.core.validator import detect_column_mapping
from app.core.feature_engineering import generate_meteorological_features
from app.core.seasonal import SeasonalClimatologyEngine
from app.core.detectors.ensemble import EnsembleAnomalyDetector

router = APIRouter(prefix="/datasets", tags=["Anomaly Detection"])

ISO_DATE_REGEX = re.compile(r"^\d{4}-\d{2}-\d{2}$")
VALID_CLASSIFICATIONS = {"confirmed", "potential"}
VALID_SEVERITIES = {"extreme", "high", "moderate", "none"}
VALID_SORT_FIELDS = {"date", "deviation", "z_score", "severity", "flag_count"}
VALID_SORT_ORDERS = {"asc", "desc"}
VALID_INTERVALS = {"monthly", "yearly"}
VALID_EXPORT_FORMATS = {"csv", "json"}
SEVERITY_ORDER = {"none": 0, "moderate": 1, "high": 2, "extreme": 3}


def validate_iso_date(date_str: Optional[str], param_name: str) -> Optional[str]:
    """Validates that a date string follows ISO format (YYYY-MM-DD) and represents a valid calendar day."""
    if not date_str:
        return None
    if not ISO_DATE_REGEX.match(date_str):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid {param_name} format: '{date_str}'. Expected ISO format 'YYYY-MM-DD'.",
        )
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid calendar date for {param_name}: '{date_str}'.",
        )
    return date_str


def get_run_or_404(dataset_id: int, run_id: Optional[int], db: Session) -> AnomalyRun:
    """Fetches a specific detection run or the latest run, validating dataset ownership."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found.")

    if run_id is not None:
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
        return run
    else:
        run = (
            db.query(AnomalyRun)
            .filter(AnomalyRun.dataset_id == dataset_id)
            .order_by(AnomalyRun.created_at.desc())
            .first()
        )
        if not run:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No anomaly detection run found for this dataset. Please run detection first.",
            )
        return run


def filter_anomalies_data(
    records: List[Dict[str, Any]],
    classification: Optional[str] = None,
    severity: Optional[str] = None,
    variable: Optional[str] = None,
    detector: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Applies multi-dimensional filters with ISO date and taxonomy validation."""
    if classification:
        c_lower = classification.lower()
        if c_lower not in VALID_CLASSIFICATIONS:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid classification '{classification}'. Allowed values: {sorted(VALID_CLASSIFICATIONS)}",
            )
        records = [a for a in records if a.get("classification", "").lower() == c_lower]

    if severity:
        s_lower = severity.lower()
        if s_lower not in VALID_SEVERITIES:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid severity '{severity}'. Allowed values: {sorted(VALID_SEVERITIES)}",
            )
        records = [a for a in records if a.get("severity", "").lower() == s_lower]

    if variable:
        v_lower = variable.lower()
        records = [a for a in records if a.get("variable", "").lower() == v_lower]

    if detector:
        d_lower = detector.lower()
        records = [a for a in records if any(d_lower in str(det).lower() for det in a.get("flagged_by", []))]

    if start_date:
        validate_iso_date(start_date, "start_date")
        records = [a for a in records if str(a.get("date", "")) >= start_date]

    if end_date:
        validate_iso_date(end_date, "end_date")
        records = [a for a in records if str(a.get("date", "")) <= end_date]

    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=422,
            detail=f"start_date '{start_date}' cannot be after end_date '{end_date}'.",
        )

    return records


def sort_anomalies(records: List[Dict[str, Any]], sort_by: str, sort_order: str) -> List[Dict[str, Any]]:
    """Sorts anomaly records safely handling nulls/missing values."""
    field = sort_by.lower()
    if field not in VALID_SORT_FIELDS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid sort_by '{sort_by}'. Allowed values: {sorted(VALID_SORT_FIELDS)}",
        )

    order = sort_order.lower()
    if order not in VALID_SORT_ORDERS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid sort_order '{sort_order}'. Allowed values: {sorted(VALID_SORT_ORDERS)}",
        )

    reverse = (order == "desc")

    def sort_key(r: Dict[str, Any]):
        if field == "date":
            return str(r.get("date") or "")
        elif field == "deviation":
            val = r.get("deviation")
            if val is None:
                return -float("inf") if reverse else float("inf")
            return abs(float(val))
        elif field == "z_score":
            val = r.get("z_score")
            if val is None:
                return -float("inf") if reverse else float("inf")
            return abs(float(val))
        elif field == "severity":
            s_val = str(r.get("severity") or "none").lower()
            return SEVERITY_ORDER.get(s_val, 0)
        elif field == "flag_count":
            val = r.get("flag_count")
            return int(val) if val is not None else 0
        return 0

    return sorted(records, key=sort_key, reverse=reverse)


@router.post(
    "/{dataset_id}/detect",
    response_model=AnomalySummaryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Execute multi-algorithm anomaly detection pipeline",
)
def run_anomaly_detection(
    dataset_id: int,
    request: AnomalyDetectRequest = AnomalyDetectRequest(),
    db: Session = Depends(get_db),
):
    """Executes Feature Engineering -> Seasonal Baseline (±7-day DOY) -> 4 Detectors -> Consensus Ensemble."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found.")

    target_path = dataset.cleaned_file_path or dataset.raw_file_path
    if not target_path or not Path(target_path).exists():
        raise HTTPException(status_code=404, detail="Dataset file not found on disk.")

    df = pd.read_csv(target_path)
    if len(df) == 0:
        raise HTTPException(status_code=400, detail="Cannot run detection on empty dataset.")

    mapping = dataset.column_mapping or detect_column_mapping(df.columns.tolist())

    primary_var = request.primary_variable
    if primary_var not in mapping or mapping[primary_var] not in df.columns:
        available = [std for std, raw in mapping.items() if std != "date" and raw in df.columns]
        if not available:
            raise HTTPException(
                status_code=400,
                detail=f"Variable '{primary_var}' is not mapped or present in dataset.",
            )
        primary_var = available[0]

    # Step 1: Feature Engineering
    feat_df = generate_meteorological_features(df, mapping)

    # Step 2: Seasonal Preprocessing (±7-day circular DOY window)
    seasonal_engine = SeasonalClimatologyEngine(window_days=7)
    season_df, _ = seasonal_engine.fit_transform(feat_df, mapping)

    # Step 3: Run Ensemble Detector (Seasonal Z, Modified Z, Isolation Forest, LOF)
    ensemble = EnsembleAnomalyDetector(
        z_threshold=request.z_threshold,
        mad_threshold=request.mad_threshold,
        iforest_contamination=request.iforest_contamination,
        lof_contamination=request.lof_contamination,
    )
    result = ensemble.run(season_df, mapping, primary_variable=primary_var)

    # Step 4: Persist AnomalyRun entity
    config_dict = {
        "primary_variable": primary_var,
        "z_threshold": request.z_threshold,
        "mad_threshold": request.mad_threshold,
        "iforest_contamination": request.iforest_contamination,
        "lof_contamination": request.lof_contamination,
        "detector_timings": result.get("detector_timings"),
    }

    anomaly_run = AnomalyRun(
        dataset_id=dataset.id,
        primary_variable=primary_var,
        config=config_dict,
        total_records=result["total_records"],
        confirmed_count=result["confirmed_count"],
        potential_count=result["potential_count"],
        normal_count=result["normal_count"],
        severity_breakdown=result["severity_breakdown"],
        detector_breakdown=result["detector_breakdown"],
        anomalies_data=result["anomalies"],
    )

    db.add(anomaly_run)
    db.commit()
    db.refresh(anomaly_run)

    return anomaly_run


@router.get(
    "/{dataset_id}/runs",
    response_model=AnomalyRunListResponse,
    summary="List all historical anomaly detection runs for a dataset",
)
def list_anomaly_runs(dataset_id: int, db: Session = Depends(get_db)):
    """Retrieves full historical list of detection runs for a given dataset."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found.")

    runs = (
        db.query(AnomalyRun)
        .filter(AnomalyRun.dataset_id == dataset_id)
        .order_by(AnomalyRun.created_at.desc())
        .all()
    )

    return AnomalyRunListResponse(
        dataset_id=dataset_id,
        total_runs=len(runs),
        runs=[AnomalyRunItem.model_validate(r) for r in runs],
    )


@router.get(
    "/{dataset_id}/runs/{run_id}",
    response_model=AnomalySummaryResponse,
    summary="Get details and metrics of a specific detection run",
)
def get_anomaly_run(dataset_id: int, run_id: int, db: Session = Depends(get_db)):
    """Retrieves metadata and metric breakdown for a specific detection run."""
    run = get_run_or_404(dataset_id, run_id, db)
    return run


@router.delete(
    "/{dataset_id}/runs/{run_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an individual historical anomaly detection run",
)
def delete_anomaly_run(dataset_id: int, run_id: int, db: Session = Depends(get_db)):
    """Deletes a specific historical anomaly detection run without removing the dataset."""
    run = get_run_or_404(dataset_id, run_id, db)
    db.delete(run)
    db.commit()
    return None


@router.get(
    "/{dataset_id}/anomalies/summary",
    response_model=AnomalySummaryResponse,
    summary="Get anomaly detection summary for a dataset or specific run",
)
def get_anomaly_summary(
    dataset_id: int,
    run_id: Optional[int] = Query(None, description="Optional specific run ID. Defaults to latest run."),
    db: Session = Depends(get_db),
):
    """Retrieves summary metrics of the latest or specified detection run."""
    run = get_run_or_404(dataset_id, run_id, db)
    return run


@router.get(
    "/{dataset_id}/anomalies",
    response_model=AnomalyListResponse,
    summary="Get filtered and sorted list of detected anomalies",
)
def get_anomalies(
    dataset_id: int,
    run_id: Optional[int] = Query(None, description="Optional specific run ID. Defaults to latest run."),
    classification: Optional[str] = Query(None, description="'confirmed' or 'potential'"),
    severity: Optional[str] = Query(None, description="'extreme', 'high', or 'moderate'"),
    variable: Optional[str] = Query(None, description="Meteorological variable name"),
    detector: Optional[str] = Query(None, description="Filter anomalies flagged by detector"),
    start_date: Optional[str] = Query(None, description="Filter after date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Filter before date YYYY-MM-DD"),
    sort_by: str = Query("date", description="Field to sort by: 'date', 'deviation', 'z_score', 'severity', 'flag_count'"),
    sort_order: str = Query("asc", description="Sort direction: 'asc' or 'desc'"),
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Retrieves individual anomaly records with multi-dimensional filtering and robust sorting."""
    run = get_run_or_404(dataset_id, run_id, db)

    all_anomalies: List[Dict[str, Any]] = run.anomalies_data or []

    filtered = filter_anomalies_data(
        records=all_anomalies,
        classification=classification,
        severity=severity,
        variable=variable,
        detector=detector,
        start_date=start_date,
        end_date=end_date,
    )

    sorted_records = sort_anomalies(filtered, sort_by=sort_by, sort_order=sort_order)

    total_filtered = len(sorted_records)
    paginated = sorted_records[offset : offset + limit]

    return AnomalyListResponse(
        dataset_id=dataset_id,
        run_id=run.id,
        total_anomalies=len(all_anomalies),
        filtered_count=total_filtered,
        anomalies=[AnomalyRecord(**item) for item in paginated],
    )


@router.get(
    "/{dataset_id}/anomalies/timeline",
    response_model=AnomalyTimelineResponse,
    summary="Get monthly or yearly timeline aggregation of detected anomalies",
)
def get_anomaly_timeline(
    dataset_id: int,
    run_id: Optional[int] = Query(None, description="Optional specific run ID. Defaults to latest run."),
    interval: str = Query("monthly", description="'monthly' (YYYY-MM) or 'yearly' (YYYY)"),
    db: Session = Depends(get_db),
):
    """Calculates temporal frequency distribution of confirmed and potential anomalies."""
    interval_lower = interval.lower()
    if interval_lower not in VALID_INTERVALS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid interval '{interval}'. Allowed values: {sorted(VALID_INTERVALS)}",
        )

    run = get_run_or_404(dataset_id, run_id, db)
    anomalies: List[Dict[str, Any]] = run.anomalies_data or []

    # Aggregate by period key
    bucket_map: Dict[str, Dict[str, int]] = {}

    for a in anomalies:
        d_str = str(a.get("date", "")).strip()
        if not d_str:
            continue

        if interval_lower == "monthly":
            period = d_str[:7]  # YYYY-MM
        else:
            period = d_str[:4]  # YYYY

        if period not in bucket_map:
            bucket_map[period] = {
                "confirmed": 0,
                "potential": 0,
                "total_anomalies": 0,
                "extreme": 0,
                "high": 0,
                "moderate": 0,
            }

        b = bucket_map[period]
        b["total_anomalies"] += 1

        cls = str(a.get("classification", "")).lower()
        if cls == "confirmed":
            b["confirmed"] += 1
        elif cls == "potential":
            b["potential"] += 1

        sev = str(a.get("severity", "")).lower()
        if sev == "extreme":
            b["extreme"] += 1
        elif sev == "high":
            b["high"] += 1
        elif sev == "moderate":
            b["moderate"] += 1

    # Sort periods chronologically
    sorted_periods = sorted(bucket_map.keys())
    buckets = [
        TimelineBucket(
            period=p,
            confirmed=bucket_map[p]["confirmed"],
            potential=bucket_map[p]["potential"],
            total_anomalies=bucket_map[p]["total_anomalies"],
            extreme=bucket_map[p]["extreme"],
            high=bucket_map[p]["high"],
            moderate=bucket_map[p]["moderate"],
        )
        for p in sorted_periods
    ]

    return AnomalyTimelineResponse(
        dataset_id=dataset_id,
        run_id=run.id,
        interval=interval_lower,
        total_anomalies=len(anomalies),
        buckets=buckets,
    )


@router.get(
    "/{dataset_id}/anomalies/export",
    summary="Export detected anomalies as downloadable CSV or JSON file",
)
def export_anomalies(
    dataset_id: int,
    format: str = Query("csv", description="'csv' or 'json'"),
    run_id: Optional[int] = Query(None, description="Optional specific run ID. Defaults to latest run."),
    classification: Optional[str] = Query(None, description="'confirmed' or 'potential'"),
    severity: Optional[str] = Query(None, description="'extreme', 'high', or 'moderate'"),
    variable: Optional[str] = Query(None, description="Meteorological variable name"),
    detector: Optional[str] = Query(None, description="Filter anomalies flagged by detector"),
    start_date: Optional[str] = Query(None, description="Filter after date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Filter before date YYYY-MM-DD"),
    sort_by: str = Query("date", description="Sort field"),
    sort_order: str = Query("asc", description="Sort direction"),
    db: Session = Depends(get_db),
):
    """Exports actual persisted anomaly records formatted as CSV or JSON with full detector audit trail."""
    fmt = format.lower()
    if fmt not in VALID_EXPORT_FORMATS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid export format '{format}'. Allowed values: {sorted(VALID_EXPORT_FORMATS)}",
        )

    run = get_run_or_404(dataset_id, run_id, db)
    all_anomalies: List[Dict[str, Any]] = run.anomalies_data or []

    filtered = filter_anomalies_data(
        records=all_anomalies,
        classification=classification,
        severity=severity,
        variable=variable,
        detector=detector,
        start_date=start_date,
        end_date=end_date,
    )
    sorted_records = sort_anomalies(filtered, sort_by=sort_by, sort_order=sort_order)

    if fmt == "json":
        filename = f"climasentinel_anomalies_ds{dataset_id}_run{run.id}.json"
        export_payload = {
            "dataset_id": dataset_id,
            "run_id": run.id,
            "exported_at": datetime.utcnow().isoformat() + "Z",
            "primary_variable": run.primary_variable,
            "config": run.config,
            "total_anomalies": len(sorted_records),
            "anomalies": sorted_records,
        }
        return JSONResponse(
            content=export_payload,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # Generate CSV
    filename = f"climasentinel_anomalies_ds{dataset_id}_run{run.id}.csv"
    output = io.StringIO()
    fieldnames = [
        "index",
        "date",
        "variable",
        "observed_value",
        "expected_value",
        "deviation",
        "z_score",
        "modified_z_score",
        "iforest_score",
        "lof_score",
        "flag_count",
        "flagged_by",
        "classification",
        "severity",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    for item in sorted_records:
        row = dict(item)
        # Format flagged_by list as semicolon-delimited string
        if isinstance(row.get("flagged_by"), list):
            row["flagged_by"] = ";".join(row["flagged_by"])
        writer.writerow({k: row.get(k, "") for k in fieldnames})

    csv_data = output.getvalue()
    output.close()

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
