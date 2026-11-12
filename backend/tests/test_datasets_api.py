import io
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_load_sample_dataset():
    """Verify loading preloaded synthetic benchmark datasets works and registers in database."""
    res = client.post("/api/v1/datasets/sample/delhi_climate")
    assert res.status_code == 201
    data = res.json()
    assert "Delhi" in data["name"]
    assert "Synthetic Benchmark" in data["name"]
    assert data["row_count"] > 1000
    assert data["status"] == "raw"
    assert "date" in data["column_mapping"]


def test_upload_and_wrangle_workflow():
    """Verify upload, profile, and wrangle complete lifecycle."""
    csv_content = (
        "date,temp,rh,rain\n"
        "2023-01-01,15.5,60.0,0.0\n"
        "2023-01-02,,65.0,\n"
        "2023-01-03,18.0,70.0,15.0\n"
        "2023-01-03,18.0,70.0,15.0\n"  # duplicate
    )
    files = {"file": ("test_weather.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    
    # 1. Upload
    up_res = client.post("/api/v1/datasets/upload", files=files, data={"name": "Test Ingestion Station"})
    assert up_res.status_code == 201
    dataset = up_res.json()
    dataset_id = dataset["id"]
    assert dataset["row_count"] == 4

    # 2. List
    list_res = client.get("/api/v1/datasets")
    assert list_res.status_code == 200
    assert any(d["id"] == dataset_id for d in list_res.json())

    # 3. Profile
    prof_res = client.get(f"/api/v1/datasets/{dataset_id}/profile")
    assert prof_res.status_code == 200
    prof = prof_res.json()
    assert prof["duplicate_rows"] == 1
    assert prof["total_rows"] == 4

    # 4. Wrangle (default rainfall_strategy='preserve')
    wrangle_res = client.post(
        f"/api/v1/datasets/{dataset_id}/wrangle",
        json={"remove_duplicates": True, "missing_strategy": "linear", "rainfall_strategy": "preserve"}
    )
    assert wrangle_res.status_code == 200
    summary = wrangle_res.json()
    assert summary["duplicates_removed"] == 1
    assert summary["rows_after"] == 3
    assert summary["rainfall_non_interpolated"] is True
    assert summary["rainfall_treatment_applied"] == "preserved_nan"

    # 5. Quality Summary
    qual_res = client.get(f"/api/v1/datasets/{dataset_id}/quality-summary")
    assert qual_res.status_code == 200
    assert qual_res.json()["rows_after"] == 3
