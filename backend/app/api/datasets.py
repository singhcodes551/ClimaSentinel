import json
import shutil
from pathlib import Path
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
import pandas as pd

from app.database import get_db
from app.config import settings
from app.models.dataset import Dataset, DatasetProfile, WranglingSummary
from app.schemas.dataset import DatasetResponse, DatasetProfileResponse
from app.schemas.wrangling import WrangleRequest, WrangleSummaryResponse
from app.core.validator import detect_column_mapping
from app.core.profiler import DatasetProfiler
from app.core.preprocessor import WeatherDataWrangler

router = APIRouter(prefix="/datasets", tags=["Datasets"])


@router.post("/upload", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    column_mapping: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Uploads a meteorological CSV file, validates columns, and stores raw data."""
    if not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files (.csv) are currently supported.",
        )

    dataset_name = name or Path(file.filename).stem.replace("_", " ").title()
    timestamp_prefix = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"{timestamp_prefix}_{file.filename}"
    raw_path = settings.UPLOADS_DIR / safe_filename

    content = await file.read()
    with open(raw_path, "wb") as f:
        f.write(content)

    file_size = len(content)

    try:
        df = pd.read_csv(raw_path)
    except Exception as exc:
        if raw_path.exists():
            raw_path.unlink()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse CSV file: {str(exc)}",
        )

    mapping = None
    if column_mapping:
        try:
            mapping = json.loads(column_mapping)
        except Exception:
            mapping = detect_column_mapping(df.columns.tolist())
    else:
        mapping = detect_column_mapping(df.columns.tolist())

    dataset = Dataset(
        name=dataset_name,
        description=description or f"Uploaded weather dataset from {file.filename}",
        filename=file.filename,
        raw_file_path=str(raw_path),
        file_size_bytes=file_size,
        row_count=len(df),
        column_count=len(df.columns),
        status="raw",
        column_mapping=mapping,
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)

    return dataset


@router.post("/sample/{sample_key}", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
def load_sample_dataset(sample_key: str, db: Session = Depends(get_db)):
    """Loads a pre-packaged synthetic benchmark dataset calibrated to real climatology."""
    sample_files = {
        "delhi_climate": {
            "file": "delhi_daily_climate.csv",
            "name": "Delhi Synthetic Benchmark Series (2018–2022)",
            "description": "Synthetic daily meteorological series calibrated to Delhi Safdarjung subtropical monsoon climatology, featuring modeled heatwaves (>45°C) and August monsoon spikes.",
        },
        "seattle_weather": {
            "file": "seattle_weather.csv",
            "name": "Seattle Synthetic Benchmark Series (2019–2022)",
            "description": "Synthetic daily meteorological series calibrated to Seattle Pacific maritime climatology, featuring a modeled recreation of the June 2021 Pacific Northwest Heat Dome.",
        },
    }

    if sample_key not in sample_files:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sample '{sample_key}' not found. Available samples: {list(sample_files.keys())}",
        )

    info = sample_files[sample_key]
    source_path = settings.SAMPLES_DIR / info["file"]
    if not source_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sample data file missing on server.",
        )

    timestamp_prefix = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    target_filename = f"sample_{timestamp_prefix}_{info['file']}"
    target_path = settings.UPLOADS_DIR / target_filename
    shutil.copyfile(source_path, target_path)

    df = pd.read_csv(target_path)
    mapping = detect_column_mapping(df.columns.tolist())

    dataset = Dataset(
        name=info["name"],
        description=info["description"],
        filename=info["file"],
        raw_file_path=str(target_path),
        file_size_bytes=target_path.stat().st_size,
        row_count=len(df),
        column_count=len(df.columns),
        status="raw",
        column_mapping=mapping,
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)

    return dataset


@router.get("", response_model=List[DatasetResponse])
def list_datasets(db: Session = Depends(get_db)):
    """Lists all registered weather datasets ordered by newest first."""
    return db.query(Dataset).order_by(Dataset.created_at.desc()).all()


@router.get("/{dataset_id}", response_model=DatasetResponse)
def get_dataset(dataset_id: int, db: Session = Depends(get_db)):
    """Retrieves metadata for a specific dataset."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    return dataset


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(dataset_id: int, db: Session = Depends(get_db)):
    """Deletes a dataset record and associated raw/cleaned files from disk."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found.")

    for path_str in [dataset.raw_file_path, dataset.cleaned_file_path]:
        if path_str:
            p = Path(path_str)
            if p.exists():
                try:
                    p.unlink()
                except Exception:
                    pass

    db.delete(dataset)
    db.commit()
    return None


@router.get("/{dataset_id}/profile", response_model=DatasetProfileResponse)
def get_dataset_profile(dataset_id: int, refresh: bool = False, db: Session = Depends(get_db)):
    """Calculates or retrieves cached meteorological profile for a dataset."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found.")

    if not refresh and dataset.profile:
        return DatasetProfileResponse(**dataset.profile.profile_data)

    raw_path = Path(dataset.raw_file_path)
    if not raw_path.exists():
        raise HTTPException(status_code=404, detail="Raw dataset file not found on disk.")

    df = pd.read_csv(raw_path)
    profiler = DatasetProfiler(df, custom_mapping=dataset.column_mapping)
    profile_dict = profiler.profile()
    profile_dict["dataset_id"] = dataset.id
    profile_dict["dataset_name"] = dataset.name

    if dataset.profile:
        dataset.profile.profile_data = profile_dict
    else:
        profile_entity = DatasetProfile(dataset_id=dataset.id, profile_data=profile_dict)
        db.add(profile_entity)

    dataset.status = "profiled" if dataset.status == "raw" else dataset.status
    db.commit()

    return DatasetProfileResponse(**profile_dict)


@router.post("/{dataset_id}/wrangle", response_model=WrangleSummaryResponse)
def wrangle_dataset(
    dataset_id: int,
    request: WrangleRequest,
    db: Session = Depends(get_db),
):
    """Executes the data cleaning and preprocessing pipeline, enforcing strict weather rules."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found.")

    raw_path = Path(dataset.raw_file_path)
    if not raw_path.exists():
        raise HTTPException(status_code=404, detail="Raw dataset file not found on disk.")

    df = pd.read_csv(raw_path)
    effective_mapping = request.column_mapping or dataset.column_mapping or detect_column_mapping(df.columns.tolist())

    wrangler = WeatherDataWrangler(
        df=df,
        mapping=effective_mapping,
        remove_duplicates=request.remove_duplicates,
        missing_strategy=request.missing_strategy,
        rainfall_strategy=request.rainfall_strategy,
        filter_physically_impossible=request.filter_physically_impossible,
        sort_chronologically=request.sort_chronologically,
    )

    cleaned_df, summary_dict = wrangler.wrangle()
    summary_dict["dataset_id"] = dataset.id

    cleaned_filename = f"cleaned_{dataset.id}_{Path(dataset.filename).name}"
    cleaned_path = settings.UPLOADS_DIR / cleaned_filename
    cleaned_df.to_csv(cleaned_path, index=False)

    dataset.cleaned_file_path = str(cleaned_path)
    dataset.status = "wrangled"
    dataset.column_mapping = effective_mapping

    if dataset.wrangling_summary:
        dataset.wrangling_summary.summary_data = summary_dict
    else:
        summary_entity = WranglingSummary(dataset_id=dataset.id, summary_data=summary_dict)
        db.add(summary_entity)

    db.commit()

    return WrangleSummaryResponse(**summary_dict)


@router.get("/{dataset_id}/quality-summary", response_model=WrangleSummaryResponse)
def get_quality_summary(dataset_id: int, db: Session = Depends(get_db)):
    """Retrieves the data cleaning and quality summary from the most recent wrangling run."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found.")

    if not dataset.wrangling_summary:
        raise HTTPException(
            status_code=400,
            detail="Dataset has not been wrangled yet. Please run the wrangling pipeline first.",
        )

    return WrangleSummaryResponse(**dataset.wrangling_summary.summary_data)
