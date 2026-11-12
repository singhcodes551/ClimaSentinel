import csv
import io
import json
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


@pytest.fixture(scope="module")
def setup_dataset_with_runs():
    """Sets up a wrangled dataset and executes two detection runs with different configs."""
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

    # 3. First detection run (standard thresholds)
    run1_res = client.post(
        f"/api/v1/datasets/{dataset_id}/detect",
        json={
            "primary_variable": "temperature",
            "z_threshold": 3.0,
            "mad_threshold": 3.0,
            "iforest_contamination": 0.03,
            "lof_contamination": 0.03,
        }
    )
    assert run1_res.status_code == 201
    run1 = run1_res.json()

    # 4. Second detection run (more sensitive thresholds)
    run2_res = client.post(
        f"/api/v1/datasets/{dataset_id}/detect",
        json={
            "primary_variable": "temperature",
            "z_threshold": 2.5,
            "mad_threshold": 2.5,
            "iforest_contamination": 0.05,
            "lof_contamination": 0.05,
        }
    )
    assert run2_res.status_code == 201
    run2 = run2_res.json()

    return {
        "dataset_id": dataset_id,
        "run1_id": run1["id"],
        "run2_id": run2["id"],
        "run1": run1,
        "run2": run2,
    }


def test_multiple_runs_and_run_specific_retrieval(setup_dataset_with_runs):
    """Test listing all runs, querying by specific run_id, and default latest run retrieval."""
    ds_id = setup_dataset_with_runs["dataset_id"]
    r1_id = setup_dataset_with_runs["run1_id"]
    r2_id = setup_dataset_with_runs["run2_id"]

    # 1. List all runs
    list_res = client.get(f"/api/v1/datasets/{ds_id}/runs")
    assert list_res.status_code == 200
    run_list = list_res.json()
    assert run_list["total_runs"] >= 2
    run_ids = [r["id"] for r in run_list["runs"]]
    assert r1_id in run_ids
    assert r2_id in run_ids
    # Verify descending creation order
    assert run_ids.index(r2_id) < run_ids.index(r1_id)

    # 2. Get specific run metadata
    get_r1 = client.get(f"/api/v1/datasets/{ds_id}/runs/{r1_id}")
    assert get_r1.status_code == 200
    assert get_r1.json()["id"] == r1_id
    assert get_r1.json()["config"]["z_threshold"] == 3.0

    get_r2 = client.get(f"/api/v1/datasets/{ds_id}/runs/{r2_id}")
    assert get_r2.status_code == 200
    assert get_r2.json()["id"] == r2_id
    assert get_r2.json()["config"]["z_threshold"] == 2.5

    # 3. Query anomalies for specific run_id
    anom_r1 = client.get(f"/api/v1/datasets/{ds_id}/anomalies?run_id={r1_id}&limit=10")
    assert anom_r1.status_code == 200
    assert anom_r1.json()["run_id"] == r1_id

    anom_r2 = client.get(f"/api/v1/datasets/{ds_id}/anomalies?run_id={r2_id}&limit=10")
    assert anom_r2.status_code == 200
    assert anom_r2.json()["run_id"] == r2_id

    # 4. Omitting run_id defaults to the latest run (r2_id)
    anom_latest = client.get(f"/api/v1/datasets/{ds_id}/anomalies?limit=10")
    assert anom_latest.status_code == 200
    assert anom_latest.json()["run_id"] == r2_id


def test_anomaly_sorting_in_both_directions(setup_dataset_with_runs):
    """Test sorting anomalies by date, deviation, z_score, severity, and flag_count."""
    ds_id = setup_dataset_with_runs["dataset_id"]
    r_id = setup_dataset_with_runs["run1_id"]

    # 1. Sort by deviation desc
    res_dev_desc = client.get(f"/api/v1/datasets/{ds_id}/anomalies?run_id={r_id}&sort_by=deviation&sort_order=desc&limit=20")
    assert res_dev_desc.status_code == 200
    anoms_dev_desc = res_dev_desc.json()["anomalies"]
    devs = [abs(a["deviation"]) for a in anoms_dev_desc if a["deviation"] is not None]
    assert all(devs[i] >= devs[i + 1] for i in range(len(devs) - 1))

    # 2. Sort by deviation asc
    res_dev_asc = client.get(f"/api/v1/datasets/{ds_id}/anomalies?run_id={r_id}&sort_by=deviation&sort_order=asc&limit=20")
    assert res_dev_asc.status_code == 200
    anoms_dev_asc = res_dev_asc.json()["anomalies"]
    devs_asc = [abs(a["deviation"]) for a in anoms_dev_asc if a["deviation"] is not None]
    assert all(devs_asc[i] <= devs_asc[i + 1] for i in range(len(devs_asc) - 1))

    # 3. Sort by Z-score desc
    res_z_desc = client.get(f"/api/v1/datasets/{ds_id}/anomalies?run_id={r_id}&sort_by=z_score&sort_order=desc&limit=20")
    assert res_z_desc.status_code == 200
    z_scores = [abs(a["z_score"]) for a in res_z_desc.json()["anomalies"]]
    assert all(z_scores[i] >= z_scores[i + 1] for i in range(len(z_scores) - 1))

    # 4. Sort by severity desc (extreme -> high -> moderate -> none)
    res_sev = client.get(f"/api/v1/datasets/{ds_id}/anomalies?run_id={r_id}&sort_by=severity&sort_order=desc&limit=50")
    assert res_sev.status_code == 200
    sev_rank = {"extreme": 3, "high": 2, "moderate": 1, "none": 0}
    sevs = [sev_rank.get(a["severity"], 0) for a in res_sev.json()["anomalies"]]
    assert all(sevs[i] >= sevs[i + 1] for i in range(len(sevs) - 1))

    # 5. Sort by flag count desc
    res_flag = client.get(f"/api/v1/datasets/{ds_id}/anomalies?run_id={r_id}&sort_by=flag_count&sort_order=desc&limit=20")
    assert res_flag.status_code == 200
    flags = [a["flag_count"] for a in res_flag.json()["anomalies"]]
    assert all(flags[i] >= flags[i + 1] for i in range(len(flags) - 1))

    # 6. Sort by date desc
    res_date = client.get(f"/api/v1/datasets/{ds_id}/anomalies?run_id={r_id}&sort_by=date&sort_order=desc&limit=20")
    assert res_date.status_code == 200
    dates = [a["date"] for a in res_date.json()["anomalies"]]
    assert all(dates[i] >= dates[i + 1] for i in range(len(dates) - 1))


def test_timeline_aggregation(setup_dataset_with_runs):
    """Test monthly and yearly timeline aggregations from persisted results."""
    ds_id = setup_dataset_with_runs["dataset_id"]
    r_id = setup_dataset_with_runs["run1_id"]

    # 1. Monthly timeline
    m_res = client.get(f"/api/v1/datasets/{ds_id}/anomalies/timeline?run_id={r_id}&interval=monthly")
    assert m_res.status_code == 200
    m_data = m_res.json()
    assert m_data["interval"] == "monthly"
    assert len(m_data["buckets"]) > 0
    # Verify monthly period format 'YYYY-MM'
    for b in m_data["buckets"]:
        assert len(b["period"]) == 7
        assert b["period"][4] == "-"
        assert b["total_anomalies"] == b["confirmed"] + b["potential"]
    # Total sum matches total_anomalies
    total_monthly = sum(b["total_anomalies"] for b in m_data["buckets"])
    assert total_monthly == m_data["total_anomalies"]

    # 2. Yearly timeline
    y_res = client.get(f"/api/v1/datasets/{ds_id}/anomalies/timeline?run_id={r_id}&interval=yearly")
    assert y_res.status_code == 200
    y_data = y_res.json()
    assert y_data["interval"] == "yearly"
    assert len(y_data["buckets"]) > 0
    for b in y_data["buckets"]:
        assert len(b["period"]) == 4
        assert b["period"].isdigit()
        assert b["total_anomalies"] == b["confirmed"] + b["potential"]
    total_yearly = sum(b["total_anomalies"] for b in y_data["buckets"])
    assert total_yearly == y_data["total_anomalies"]
    assert total_yearly == total_monthly


def test_csv_and_json_anomaly_export(setup_dataset_with_runs):
    """Test export endpoint for CSV and JSON format with attachment disposition and filtering."""
    ds_id = setup_dataset_with_runs["dataset_id"]
    r_id = setup_dataset_with_runs["run1_id"]

    # 1. JSON Export
    json_res = client.get(f"/api/v1/datasets/{ds_id}/anomalies/export?run_id={r_id}&format=json")
    assert json_res.status_code == 200
    assert "attachment" in json_res.headers.get("content-disposition", "").lower()
    assert f"climasentinel_anomalies_ds{ds_id}_run{r_id}.json" in json_res.headers.get("content-disposition", "")
    data = json_res.json()
    assert data["dataset_id"] == ds_id
    assert data["run_id"] == r_id
    assert "anomalies" in data
    assert len(data["anomalies"]) > 0

    # 2. CSV Export
    csv_res = client.get(f"/api/v1/datasets/{ds_id}/anomalies/export?run_id={r_id}&format=csv")
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers.get("content-type", "")
    assert f"climasentinel_anomalies_ds{ds_id}_run{r_id}.csv" in csv_res.headers.get("content-disposition", "")
    csv_text = csv_res.text
    reader = csv.DictReader(io.StringIO(csv_text))
    rows = list(reader)
    assert len(rows) > 0
    assert "observed_value" in rows[0]
    assert "expected_value" in rows[0]
    assert "deviation" in rows[0]
    assert "flagged_by" in rows[0]

    # 3. Filtered CSV Export (only confirmed)
    filtered_csv_res = client.get(
        f"/api/v1/datasets/{ds_id}/anomalies/export?run_id={r_id}&format=csv&classification=confirmed"
    )
    assert filtered_csv_res.status_code == 200
    f_reader = csv.DictReader(io.StringIO(filtered_csv_res.text))
    f_rows = list(f_reader)
    assert len(f_rows) > 0
    for r in f_rows:
        assert r["classification"] == "confirmed"


def test_input_validation_and_error_handling(setup_dataset_with_runs):
    """Test validation of ISO dates, sort fields, intervals, formats, and mismatched IDs."""
    ds_id = setup_dataset_with_runs["dataset_id"]
    r_id = setup_dataset_with_runs["run1_id"]

    # 1. Nonexistent dataset
    res_404_ds = client.get("/api/v1/datasets/999999/runs")
    assert res_404_ds.status_code == 404

    # 2. Nonexistent run
    res_404_run = client.get(f"/api/v1/datasets/{ds_id}/runs/999999")
    assert res_404_run.status_code == 404

    # 3. Invalid date format
    res_bad_date = client.get(f"/api/v1/datasets/{ds_id}/anomalies?start_date=2021-99-99")
    assert res_bad_date.status_code == 422

    res_bad_date2 = client.get(f"/api/v1/datasets/{ds_id}/anomalies?start_date=not-a-date")
    assert res_bad_date2.status_code == 422

    # 4. Inverted date range
    res_inv_dates = client.get(f"/api/v1/datasets/{ds_id}/anomalies?start_date=2022-01-01&end_date=2020-01-01")
    assert res_inv_dates.status_code == 422

    # 5. Invalid sort parameters
    res_bad_sort = client.get(f"/api/v1/datasets/{ds_id}/anomalies?sort_by=invalid_col")
    assert res_bad_sort.status_code == 422

    res_bad_order = client.get(f"/api/v1/datasets/{ds_id}/anomalies?sort_order=diagonal")
    assert res_bad_order.status_code == 422

    # 6. Invalid interval for timeline
    res_bad_int = client.get(f"/api/v1/datasets/{ds_id}/anomalies/timeline?interval=hourly")
    assert res_bad_int.status_code == 422

    # 7. Invalid export format
    res_bad_fmt = client.get(f"/api/v1/datasets/{ds_id}/anomalies/export?format=pdf")
    assert res_bad_fmt.status_code == 422

    # 8. Invalid classification and severity
    res_bad_cls = client.get(f"/api/v1/datasets/{ds_id}/anomalies?classification=bogus")
    assert res_bad_cls.status_code == 422

    res_bad_sev = client.get(f"/api/v1/datasets/{ds_id}/anomalies?severity=catastrophic")
    assert res_bad_sev.status_code == 422


def test_run_deletion_and_relationship_integrity():
    """Test individual run deletion and verifying dataset ownership enforcement."""
    # Create two separate datasets
    ds1_res = client.post("/api/v1/datasets/sample/delhi_climate")
    assert ds1_res.status_code == 201
    ds1_id = ds1_res.json()["id"]

    ds2_res = client.post("/api/v1/datasets/sample/seattle_weather")
    assert ds2_res.status_code == 201
    ds2_id = ds2_res.json()["id"]

    # Wrangle ds1 and ds2
    client.post(f"/api/v1/datasets/{ds1_id}/wrangle", json={"remove_duplicates": True})
    client.post(f"/api/v1/datasets/{ds2_id}/wrangle", json={"remove_duplicates": True})

    # Run detection on ds1
    run_ds1 = client.post(f"/api/v1/datasets/{ds1_id}/detect").json()
    run1_id = run_ds1["id"]

    # Run detection on ds2
    run_ds2 = client.post(f"/api/v1/datasets/{ds2_id}/detect").json()
    run2_id = run_ds2["id"]

    # Cross-dataset verification: Attempt to access ds2's run under ds1
    mismatch_res = client.get(f"/api/v1/datasets/{ds1_id}/runs/{run2_id}")
    assert mismatch_res.status_code == 404
    assert f"does not belong to dataset {ds1_id}" in mismatch_res.json()["detail"]

    # Delete ds1's run
    del_res = client.delete(f"/api/v1/datasets/{ds1_id}/runs/{run1_id}")
    assert del_res.status_code == 204

    # Verify run is gone
    check_del = client.get(f"/api/v1/datasets/{ds1_id}/runs/{run1_id}")
    assert check_del.status_code == 404

    # Verify ds2's run is unaffected
    check_ds2 = client.get(f"/api/v1/datasets/{ds2_id}/runs/{run2_id}")
    assert check_ds2.status_code == 200

    # Delete dataset ds2: Cascading delete should clean up run2
    del_ds2 = client.delete(f"/api/v1/datasets/{ds2_id}")
    assert del_ds2.status_code == 204

    # Verify run2 is also gone from database
    check_cascade = client.get(f"/api/v1/datasets/{ds2_id}/runs/{run2_id}")
    assert check_cascade.status_code == 404

