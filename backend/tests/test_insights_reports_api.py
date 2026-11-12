"""Integration & API Tests for Phase 7 Step 2: Insights & Reporting API Endpoints."""
import json
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.dataset import AnomalyRun

client = TestClient(app)


@pytest.fixture(scope="module")
def setup_dataset_and_run():
    """Sets up a wrangled dataset with two distinct detection runs for API testing."""
    # 1. Load sample dataset
    sample_res = client.post("/api/v1/datasets/sample/delhi_climate")
    assert sample_res.status_code == 201
    dataset_id = sample_res.json()["id"]

    # 2. Wrangle dataset
    wrangle_res = client.post(
        f"/api/v1/datasets/{dataset_id}/wrangle",
        json={"remove_duplicates": True, "missing_strategy": "linear", "rainfall_strategy": "preserve"}
    )
    assert wrangle_res.status_code == 200

    # 3. First detection run (temperature, conservative thresholds)
    detect_res1 = client.post(
        f"/api/v1/datasets/{dataset_id}/detect",
        json={
            "primary_variable": "temperature",
            "z_threshold": 3.5,
            "mad_threshold": 3.5,
            "iforest_contamination": 0.02,
            "lof_contamination": 0.02,
        }
    )
    assert detect_res1.status_code == 201
    run1_id = detect_res1.json()["id"]

    # 4. Second detection run (temperature, standard thresholds - becomes latest run)
    detect_res2 = client.post(
        f"/api/v1/datasets/{dataset_id}/detect",
        json={
            "primary_variable": "temperature",
            "z_threshold": 3.0,
            "mad_threshold": 3.0,
            "iforest_contamination": 0.03,
            "lof_contamination": 0.03,
        }
    )
    assert detect_res2.status_code == 201
    run2_id = detect_res2.json()["id"]

    return {
        "dataset_id": dataset_id,
        "run1_id": run1_id,
        "run2_id": run2_id,
    }


def test_get_dataset_insights_success_and_categories(setup_dataset_and_run):
    """Verifies GET /api/v1/datasets/{dataset_id}/insights returns complete structured insights."""
    ds_id = setup_dataset_and_run["dataset_id"]
    latest_run_id = setup_dataset_and_run["run2_id"]

    # Default request (latest run)
    res = client.get(f"/api/v1/datasets/{ds_id}/insights")
    assert res.status_code == 200
    data = res.json()

    assert data["dataset_id"] == ds_id
    assert data["run_id"] == latest_run_id
    assert data["total_insights"] > 0
    assert len(data["categories"]) == 5
    assert "severity_counts" in data
    assert "all_insights" in data
    assert "methodology_disclosure" in data

    cat_keys = [c["category"] for c in data["categories"]]
    assert "meteorological" in cat_keys
    assert "distribution" in cat_keys
    assert "seasonal" in cat_keys
    assert "consensus" in cat_keys
    assert "quality" in cat_keys


def test_get_dataset_insights_category_filtering(setup_dataset_and_run):
    """Verifies category query filtering on insights API."""
    ds_id = setup_dataset_and_run["dataset_id"]

    # Filter to meteorological insights
    res_met = client.get(f"/api/v1/datasets/{ds_id}/insights?category=meteorological")
    assert res_met.status_code == 200
    data_met = res_met.json()
    assert len(data_met["categories"]) == 1
    assert data_met["categories"][0]["category"] == "meteorological"
    assert all(ins["category"] == "meteorological" for ins in data_met["all_insights"])

    # Filter to distribution insights
    res_dist = client.get(f"/api/v1/datasets/{ds_id}/insights?category=distribution")
    assert res_dist.status_code == 200
    data_dist = res_dist.json()
    assert len(data_dist["categories"]) == 1
    assert data_dist["categories"][0]["category"] == "distribution"

    # Invalid category returns 422
    res_inv = client.get(f"/api/v1/datasets/{ds_id}/insights?category=invalid_category")
    assert res_inv.status_code == 422
    assert "Invalid category" in res_inv.json()["detail"]


def test_insights_and_reports_run_selection_and_latest_behavior(setup_dataset_and_run):
    """Verifies explicit run_id query parameter vs default latest-run behavior."""
    ds_id = setup_dataset_and_run["dataset_id"]
    run1_id = setup_dataset_and_run["run1_id"]
    run2_id = setup_dataset_and_run["run2_id"]

    # 1. Insights: Explicit run 1
    res_ins1 = client.get(f"/api/v1/datasets/{ds_id}/insights?run_id={run1_id}")
    assert res_ins1.status_code == 200
    assert res_ins1.json()["run_id"] == run1_id

    # 2. Insights: Explicit run 2
    res_ins2 = client.get(f"/api/v1/datasets/{ds_id}/insights?run_id={run2_id}")
    assert res_ins2.status_code == 200
    assert res_ins2.json()["run_id"] == run2_id

    # 3. Report Summary: Explicit run 1
    res_rep1 = client.get(f"/api/v1/datasets/{ds_id}/reports/summary?run_id={run1_id}")
    assert res_rep1.status_code == 200
    assert res_rep1.json()["run_id"] == run1_id

    # 4. Report Summary: Default latest run (run 2)
    res_rep_latest = client.get(f"/api/v1/datasets/{ds_id}/reports/summary")
    assert res_rep_latest.status_code == 200
    assert res_rep_latest.json()["run_id"] == run2_id


def test_insights_and_reports_error_handling(setup_dataset_and_run):
    """Verifies 404 error responses for invalid datasets, invalid runs, and unanalyzed datasets."""
    ds_id = setup_dataset_and_run["dataset_id"]

    # Nonexistent dataset ID
    res_no_ds = client.get("/api/v1/datasets/999999/insights")
    assert res_no_ds.status_code == 404
    assert "Dataset not found" in res_no_ds.json()["detail"]

    res_no_ds_rep = client.get("/api/v1/datasets/999999/reports/summary")
    assert res_no_ds_rep.status_code == 404

    res_no_ds_exp = client.get("/api/v1/datasets/999999/reports/export")
    assert res_no_ds_exp.status_code == 404

    # Nonexistent run ID
    res_no_run = client.get(f"/api/v1/datasets/{ds_id}/insights?run_id=999999")
    assert res_no_run.status_code == 404
    assert "not found" in res_no_run.json()["detail"]

    # Dataset with zero detection runs
    sample_fresh = client.post("/api/v1/datasets/sample/delhi_climate")
    assert sample_fresh.status_code == 201
    fresh_ds_id = sample_fresh.json()["id"]

    res_fresh_ins = client.get(f"/api/v1/datasets/{fresh_ds_id}/insights")
    assert res_fresh_ins.status_code == 404
    assert "No anomaly detection run found" in res_fresh_ins.json()["detail"]

    res_fresh_rep = client.get(f"/api/v1/datasets/{fresh_ds_id}/reports/summary")
    assert res_fresh_rep.status_code == 404


def test_get_report_summary_endpoint(setup_dataset_and_run):
    """Verifies GET /api/v1/datasets/{dataset_id}/reports/summary returns complete audit structure."""
    ds_id = setup_dataset_and_run["dataset_id"]
    run_id = setup_dataset_and_run["run2_id"]

    res = client.get(f"/api/v1/datasets/{ds_id}/reports/summary")
    assert res.status_code == 200
    report = res.json()

    assert report["dataset_id"] == ds_id
    assert report["run_id"] == run_id
    assert report["report_id"].startswith(f"CSR_{ds_id}_{run_id}_")

    # Sections validation
    assert "executive_summary" in report
    assert report["executive_summary"]["total_records"] > 1000
    assert "corroboration_ratio" in report["executive_summary"]

    assert "data_quality" in report
    assert "detection_config" in report
    assert "variable_breakdown" in report
    assert "seasonal_patterns" in report
    assert len(report["seasonal_patterns"]) == 4

    assert "temporal_trends" in report
    assert len(report["temporal_trends"]) >= 2

    assert "key_anomaly_events" in report
    assert "detector_comparison" in report
    assert "insights" in report
    assert len(report["insights"]) > 0
    assert "scientific_disclosure" in report


def test_report_export_json_and_headers(setup_dataset_and_run):
    """Verifies GET /api/v1/datasets/{dataset_id}/reports/export?format=json produces downloadable JSON."""
    ds_id = setup_dataset_and_run["dataset_id"]
    run_id = setup_dataset_and_run["run2_id"]

    res = client.get(f"/api/v1/datasets/{ds_id}/reports/export?format=json")
    assert res.status_code == 200
    assert "application/json" in res.headers["content-type"]
    assert f'filename="climasentinel_report_ds{ds_id}_run{run_id}.json"' in res.headers["content-disposition"]

    payload = res.json()
    assert payload["dataset_id"] == ds_id
    assert payload["run_id"] == run_id
    assert "executive_summary" in payload
    assert len(payload["insights"]) > 0


def test_report_export_csv_and_headers(setup_dataset_and_run):
    """Verifies GET /api/v1/datasets/{dataset_id}/reports/export?format=csv produces multi-section CSV bundle."""
    ds_id = setup_dataset_and_run["dataset_id"]
    run_id = setup_dataset_and_run["run2_id"]

    res = client.get(f"/api/v1/datasets/{ds_id}/reports/export?format=csv")
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert f'filename="climasentinel_report_ds{ds_id}_run{run_id}.csv"' in res.headers["content-disposition"]

    csv_text = res.text
    assert "# CLIMASENTINEL RESEARCH & AUDIT REPORT" in csv_text
    assert "# SECTION 1: EXECUTIVE SUMMARY" in csv_text
    assert "# SECTION 2: DATA INTEGRITY & QUALITY AUDIT" in csv_text
    assert "# SECTION 3: SEASONAL ANOMALY DISTRIBUTION" in csv_text
    assert "# SECTION 4: YEARLY ANOMALY TRENDS" in csv_text
    assert "# SECTION 5: KEY ANOMALY EVENTS PORTFOLIO" in csv_text
    assert "# SECTION 6: AUTOMATED CLIMATOLOGICAL INSIGHTS" in csv_text
    assert "# SECTION 7: SCIENTIFIC LIMITATIONS & DISCLOSURE" in csv_text


def test_report_export_include_insights_toggle(setup_dataset_and_run):
    """Verifies include_insights=false omits insights from both JSON and CSV exports."""
    ds_id = setup_dataset_and_run["dataset_id"]

    # JSON export without insights
    res_json = client.get(f"/api/v1/datasets/{ds_id}/reports/export?format=json&include_insights=false")
    assert res_json.status_code == 200
    payload = res_json.json()
    assert payload["insights"] == []

    # CSV export without insights
    res_csv = client.get(f"/api/v1/datasets/{ds_id}/reports/export?format=csv&include_insights=false")
    assert res_csv.status_code == 200
    assert "# SECTION 6: AUTOMATED CLIMATOLOGICAL INSIGHTS" not in res_csv.text
    # But Section 7 (Scientific Limitations) remains intact
    assert "# SECTION 7: SCIENTIFIC LIMITATIONS & DISCLOSURE" in res_csv.text


def test_report_export_invalid_format(setup_dataset_and_run):
    """Verifies unsupported format returns 422 Unprocessable Entity."""
    ds_id = setup_dataset_and_run["dataset_id"]

    res = client.get(f"/api/v1/datasets/{ds_id}/reports/export?format=pdf")
    assert res.status_code == 422
    assert "Invalid export format" in res.json()["detail"]


def test_existing_apis_unaffected(setup_dataset_and_run):
    """Verifies that existing dataset, detection, EDA, and evaluation endpoints remain fully functional."""
    ds_id = setup_dataset_and_run["dataset_id"]

    # 1. Datasets API
    ds_res = client.get(f"/api/v1/datasets/{ds_id}")
    assert ds_res.status_code == 200

    # 2. Anomaly Summary API
    anom_sum = client.get(f"/api/v1/datasets/{ds_id}/anomalies/summary")
    assert anom_sum.status_code == 200

    # 3. EDA Distribution API
    eda_dist = client.get(f"/api/v1/datasets/{ds_id}/eda/distribution?variable=temperature")
    assert eda_dist.status_code == 200


def test_report_api_nullable_rates_preservation(setup_dataset_and_run):
    """Verifies that an anomaly run with an unmapped variable preserves None in JSON and N/A in CSV via API."""
    ds_id = setup_dataset_and_run["dataset_id"]
    db = SessionLocal()
    try:
        # Create a run targeting an unmapped variable like 'solar_radiation'
        unmapped_run = AnomalyRun(
            dataset_id=ds_id,
            primary_variable="solar_radiation",
            config={"primary_variable": "solar_radiation"},
            total_records=730,
            confirmed_count=1,
            potential_count=0,
            normal_count=729,
            severity_breakdown={"high": 1},
            detector_breakdown={"seasonal_zscore": 1},
            anomalies_data=[
                {
                    "index": 1,
                    "date": "2021-06-15",
                    "variable": "solar_radiation",
                    "observed_value": 950.0,
                    "expected_value": 700.0,
                    "deviation": 250.0,
                    "z_score": 3.8,
                    "classification": "confirmed",
                    "severity": "high",
                }
            ],
        )
        db.add(unmapped_run)
        db.commit()
        db.refresh(unmapped_run)
        unmapped_run_id = unmapped_run.id
    finally:
        db.close()

    # 1. Summary API preserves None in JSON
    res_sum = client.get(f"/api/v1/datasets/{ds_id}/reports/summary?run_id={unmapped_run_id}")
    assert res_sum.status_code == 200
    sum_data = res_sum.json()
    assert sum_data["seasonal_patterns"][0]["record_count"] == 0
    assert sum_data["seasonal_patterns"][0]["anomaly_rate_pct"] is None
    assert sum_data["temporal_trends"][0]["record_count"] == 0
    assert sum_data["temporal_trends"][0]["anomaly_rate_pct"] is None

    # 2. Export API JSON preserves None / null
    res_exp_json = client.get(f"/api/v1/datasets/{ds_id}/reports/export?run_id={unmapped_run_id}&format=json")
    assert res_exp_json.status_code == 200
    json_data = res_exp_json.json()
    assert json_data["seasonal_patterns"][0]["anomaly_rate_pct"] is None
    assert json_data["temporal_trends"][0]["anomaly_rate_pct"] is None

    # 3. Export API CSV writes N/A
    res_exp_csv = client.get(f"/api/v1/datasets/{ds_id}/reports/export?run_id={unmapped_run_id}&format=csv")
    assert res_exp_csv.status_code == 200
    csv_text = res_exp_csv.text
    assert ",N/A" in csv_text or ",N/A," in csv_text

