from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_anomaly_detection_api_workflow():
    """Verify end-to-end detection API lifecycle: detect, summary, and filtered retrieval."""
    # 1. Load sample dataset
    sample_res = client.post("/api/v1/datasets/sample/delhi_climate")
    assert sample_res.status_code == 201
    dataset_id = sample_res.json()["id"]

    # 2. Wrangle dataset first
    wrangle_res = client.post(
        f"/api/v1/datasets/{dataset_id}/wrangle",
        json={"remove_duplicates": True, "missing_strategy": "linear", "rainfall_strategy": "preserve"}
    )
    assert wrangle_res.status_code == 200

    # 3. Run anomaly detection
    detect_res = client.post(
        f"/api/v1/datasets/{dataset_id}/detect",
        json={
            "primary_variable": "temperature",
            "z_threshold": 3.0,
            "mad_threshold": 3.0,
            "iforest_contamination": 0.03,
            "lof_contamination": 0.03,
        }
    )
    assert detect_res.status_code == 201
    summary = detect_res.json()
    assert summary["dataset_id"] == dataset_id
    assert summary["total_records"] > 1000
    assert summary["confirmed_count"] >= 0
    assert "severity_breakdown" in summary
    assert "detector_breakdown" in summary

    # 4. Retrieve anomaly summary
    sum_res = client.get(f"/api/v1/datasets/{dataset_id}/anomalies/summary")
    assert sum_res.status_code == 200
    assert sum_res.json()["id"] == summary["id"]

    # 5. Retrieve filtered anomalies (confirmed anomalies)
    anom_res = client.get(f"/api/v1/datasets/{dataset_id}/anomalies?classification=confirmed&limit=50")
    assert anom_res.status_code == 200
    anom_list = anom_res.json()
    assert "anomalies" in anom_list
    assert anom_list["dataset_id"] == dataset_id
    # Every returned record must be confirmed
    for a in anom_list["anomalies"]:
        assert a["classification"] == "confirmed"
        assert a["flag_count"] >= 2
        assert len(a["flagged_by"]) >= 2

