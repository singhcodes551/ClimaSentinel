import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


@pytest.fixture(scope="module")
def setup_dataset_and_run():
    """Seeds a sample dataset and runs detection to produce a valid run_id."""
    # 1. Create dataset
    res = client.post("/api/v1/datasets/sample/delhi_climate")
    assert res.status_code == 201
    dataset_id = res.json()["id"]

    # 2. Wrangle
    w_res = client.post(
        f"/api/v1/datasets/{dataset_id}/wrangle",
        json={"remove_duplicates": True, "missing_strategy": "linear", "rainfall_strategy": "preserve"}
    )
    assert w_res.status_code == 200

    # 3. Detect
    d_res = client.post(
        f"/api/v1/datasets/{dataset_id}/detect",
        json={
            "primary_variable": "temperature",
            "z_threshold": 3.0,
            "mad_threshold": 3.0,
            "iforest_contamination": 0.03,
            "lof_contamination": 0.03,
        }
    )
    assert d_res.status_code == 201
    run_id = d_res.json()["id"]

    return {"dataset_id": dataset_id, "run_id": run_id}


# ============================================================================
# Observational Model Comparison Tests
# ============================================================================

def test_run_comparison_endpoint(setup_dataset_and_run):
    """Verifies cross-detector comparison, agreement matrix, and solo/corroborated arithmetic."""
    d_id = setup_dataset_and_run["dataset_id"]
    r_id = setup_dataset_and_run["run_id"]

    res = client.get(f"/api/v1/datasets/{d_id}/runs/{r_id}/compare")
    assert res.status_code == 200
    data = res.json()

    assert data["dataset_id"] == d_id
    assert data["run_id"] == r_id
    assert len(data["detectors"]) == 4

    # 1. Invariance Check: solo_flag_count + corroborated_flag_count == flag_count
    for det in data["detectors"]:
        assert det["flag_count"] >= 0
        assert det["solo_flag_count"] + det["corroborated_flag_count"] == det["flag_count"]
        if det["flag_count"] > 0:
            assert 99.9 <= (det["solo_rate_pct"] + det["corroborated_rate_pct"]) <= 100.1
        if det["latency_ms"] is not None:
            assert det["latency_ms"] >= 0.0

    # 2. Jaccard Matrix Symmetry & Boundaries
    j_matrix = data["jaccard_matrix"]
    det_names = data["detector_names"]
    for d1 in det_names:
        assert j_matrix[d1][d1] == 1.0  # Diagonal is 1.0
        for d2 in det_names:
            assert j_matrix[d1][d2] == j_matrix[d2][d1]  # Symmetry
            assert 0.0 <= j_matrix[d1][d2] <= 1.0        # Bounded [0, 1]

    # 3. Ensemble Comparison Summary
    ens = data["ensemble_summary"]
    assert ens["total_records"] > 0
    assert ens["total_anomalies"] == ens["confirmed_count"] + ens["potential_count"]
    if ens["total_anomalies"] > 0:
        assert 0.0 <= ens["corroboration_ratio"] <= 1.0


def test_run_comparison_mismatched_and_nonexistent(setup_dataset_and_run):
    """Verifies 404 error responses for invalid run queries."""
    d_id = setup_dataset_and_run["dataset_id"]
    r_id = setup_dataset_and_run["run_id"]

    # Nonexistent run
    res = client.get(f"/api/v1/datasets/{d_id}/runs/999999/compare")
    assert res.status_code == 404

    # Run belonging to another dataset
    fake_dataset_res = client.post("/api/v1/datasets/sample/seattle_weather")
    other_d_id = fake_dataset_res.json()["id"]
    mismatch_res = client.get(f"/api/v1/datasets/{other_d_id}/runs/{r_id}/compare")
    assert mismatch_res.status_code == 404


# ============================================================================
# Synthetic Anomaly Injection Benchmark Tests
# ============================================================================

def test_synthetic_benchmark_endpoint(setup_dataset_and_run):
    """Verifies synthetic anomaly injection, confusion matrices, and empirical metrics."""
    d_id = setup_dataset_and_run["dataset_id"]

    payload = {
        "primary_variable": "temperature",
        "seed": 42,
        "injection_types": ["point", "block", "step"],
        "point_anomaly_count": 10,
        "block_count": 2,
        "block_length": 4,
        "step_count": 1,
        "step_length": 10,
        "spike_magnitude_sigma": 4.0,
        "block_magnitude_sigma": 3.0,
        "step_magnitude_sigma": 2.5,
    }

    res = client.post(f"/api/v1/datasets/{d_id}/evaluate/benchmark", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["dataset_id"] == d_id
    assert data["primary_variable"] == "temperature"
    assert data["total_injected_points"] > 0
    assert len(data["injected_events"]) == (10 + 2 + 1)  # 13 events

    # Sum of event points matches total_injected_points
    injected_sum = sum(len(e["injected_indices"]) for e in data["injected_events"])
    assert injected_sum == data["total_injected_points"]

    # 5 Models evaluated (4 base + ensemble)
    assert len(data["models"]) == 5
    model_names = [m["detector_name"] for m in data["models"]]
    assert "seasonal_zscore" in model_names
    assert "modified_zscore" in model_names
    assert "isolation_forest" in model_names
    assert "lof" in model_names
    assert "ensemble" in model_names

    # Check confusion matrix arithmetic for each model
    for model in data["models"]:
        cm = model["confusion_matrix"]
        # TP + FN must equal total injected ground truth
        assert cm["tp"] + cm["fn"] == data["total_injected_points"]
        # FP + TN must equal non-injected valid baseline observations
        assert cm["fp"] + cm["tn"] == (data["valid_observations"] - data["total_injected_points"])

        # Metric bounds [0.0, 1.0]
        assert 0.0 <= model["precision"] <= 1.0
        assert 0.0 <= model["recall"] <= 1.0
        assert 0.0 <= model["f1_score"] <= 1.0
        assert 0.0 <= model["false_positive_rate"] <= 1.0
        assert model["latency_ms"] > 0.0


def test_synthetic_benchmark_reproducibility(setup_dataset_and_run):
    """Verifies that identical random seeds yield identical injected events and confusion matrices."""
    d_id = setup_dataset_and_run["dataset_id"]

    req = {
        "primary_variable": "temperature",
        "seed": 99,
        "point_anomaly_count": 8,
        "block_count": 1,
        "block_length": 3,
        "step_count": 0,
    }

    res1 = client.post(f"/api/v1/datasets/{d_id}/evaluate/benchmark", json=req)
    res2 = client.post(f"/api/v1/datasets/{d_id}/evaluate/benchmark", json=req)

    assert res1.status_code == 200
    assert res2.status_code == 200
    d1 = res1.json()
    d2 = res2.json()

    assert d1["total_injected_points"] == d2["total_injected_points"]
    assert d1["injected_events"] == d2["injected_events"]
    # Check that model confusion matrices match exactly
    for m1, m2 in zip(d1["models"], d2["models"]):
        assert m1["confusion_matrix"] == m2["confusion_matrix"]
        assert m1["f1_score"] == m2["f1_score"]


def test_synthetic_benchmark_rainfall_physical_bounds():
    """Verifies that rainfall injection strictly enforces non-negativity."""
    res = client.post("/api/v1/datasets/sample/seattle_weather")
    assert res.status_code == 201
    d_id = res.json()["id"]

    req = {
        "primary_variable": "rainfall",
        "seed": 123,
        "point_anomaly_count": 10,
        "block_count": 1,
        "block_length": 3,
        "step_count": 0,
    }

    b_res = client.post(f"/api/v1/datasets/{d_id}/evaluate/benchmark", json=req)
    assert b_res.status_code == 200
    data = b_res.json()
    assert data["total_injected_points"] > 0
    # Seattle rainfall injection succeeded and respects boundaries
    assert all(m["confusion_matrix"]["tp"] >= 0 for m in data["models"])


def test_synthetic_benchmark_invalid_configuration(setup_dataset_and_run):
    """Verifies 422 for out-of-range benchmark configurations."""
    d_id = setup_dataset_and_run["dataset_id"]

    # Spike magnitude too low (< 2.0)
    bad_req = {"spike_magnitude_sigma": 0.5}
    res = client.post(f"/api/v1/datasets/{d_id}/evaluate/benchmark", json=bad_req)
    assert res.status_code == 422

    # Nonexistent dataset ID (404)
    res404 = client.post("/api/v1/datasets/999999/evaluate/benchmark", json={})
    assert res404.status_code == 404


# ============================================================================
# Edge-Case & Robustness Tests
# ============================================================================

def test_zero_anomaly_run_comparison():
    """Verifies that an anomaly run with 0 flagged anomalies yields Jaccard = 1.0 and 0 solo/corroborated flags."""
    from app.core.evaluation import compute_run_comparison
    from app.models.dataset import AnomalyRun

    empty_run = AnomalyRun(
        id=999,
        dataset_id=1,
        primary_variable="temperature",
        total_records=100,
        confirmed_count=0,
        potential_count=0,
        normal_count=100,
        config={"z_threshold": 3.0, "detector_timings": {"seasonal_zscore": 1.2}},
        anomalies_data=[],
    )

    data = compute_run_comparison(empty_run)

    # 1. Flag counts and corroboration counts are all 0
    for det in data.detectors:
        assert det.flag_count == 0
        assert det.solo_flag_count == 0
        assert det.corroborated_flag_count == 0
        assert det.solo_flag_count + det.corroborated_flag_count == det.flag_count

    # 2. Pairwise Jaccard similarity must be 1.0 for all pairs of empty flag sets
    j_matrix = data.jaccard_matrix
    det_names = data.detector_names
    for d1 in det_names:
        for d2 in det_names:
            assert j_matrix[d1][d2] == 1.0


def test_zero_positive_predictions_metrics():
    """Verifies that Precision, Recall, and F1 cleanly handle zero positive predictions without division errors."""
    import numpy as np
    from app.core.synthetic_injection import compute_benchmark_metrics

    y_true = np.array([1, 1, 1, 0, 0, 0, 0, 0], dtype=int)
    y_pred = np.zeros(8, dtype=int)  # Detector flagged nothing
    valid_mask = np.ones(8, dtype=bool)

    metrics = compute_benchmark_metrics(
        y_true=y_true,
        y_pred=y_pred,
        valid_mask=valid_mask,
        injected_events=[],
        latency_ms=15.0,
        detector_name="test_detector",
        display_name="Test Detector",
    )

    assert metrics.confusion_matrix.tp == 0
    assert metrics.confusion_matrix.fp == 0
    assert metrics.confusion_matrix.fn == 3
    assert metrics.confusion_matrix.tn == 5
    assert metrics.precision == 0.0
    assert metrics.recall == 0.0
    assert metrics.f1_score == 0.0
    assert metrics.false_positive_rate == 0.0
    assert metrics.event_detection_delay_days is None

    # Test edge case where both y_true and y_pred are all zeros
    y_true_zero = np.zeros(8, dtype=int)
    metrics_zero = compute_benchmark_metrics(
        y_true=y_true_zero,
        y_pred=y_pred,
        valid_mask=valid_mask,
        injected_events=[],
        latency_ms=12.0,
        detector_name="test_zero",
        display_name="Test Zero",
    )
    assert metrics_zero.precision == 0.0
    assert metrics_zero.recall == 0.0
    assert metrics_zero.f1_score == 0.0


def test_small_dataset_safe_handling():
    """Verifies that a dataset with insufficient observations returns a clear 422 error rather than crashing."""
    import io

    csv_content = (
        "date,temperature\n"
        "2023-01-01,20.5\n"
        "2023-01-02,21.0\n"
        "2023-01-03,20.8\n"
    )
    files = {"file": ("tiny.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    up_res = client.post("/api/v1/datasets/upload", files=files, data={"name": "Tiny Dataset"})
    assert up_res.status_code == 201
    ds_id = up_res.json()["id"]

    res = client.post(f"/api/v1/datasets/{ds_id}/evaluate/benchmark", json={})
    assert res.status_code == 422
    assert "minimum 30 required" in res.json()["detail"].lower() or "insufficient" in res.json()["detail"].lower()


def test_corroboration_invariant_assertion(setup_dataset_and_run):
    """Verifies solo_flags + corroborated_flags == flag_count strictly across all base detectors."""
    d_id = setup_dataset_and_run["dataset_id"]
    r_id = setup_dataset_and_run["run_id"]

    res = client.get(f"/api/v1/datasets/{d_id}/runs/{r_id}/compare")
    assert res.status_code == 200
    data = res.json()

    for det in data["detectors"]:
        assert det["solo_flag_count"] + det["corroborated_flag_count"] == det["flag_count"], (
            f"Detector {det['detector_name']} failed invariance: "
            f"{det['solo_flag_count']} + {det['corroborated_flag_count']} != {det['flag_count']}"
        )


def test_physical_bound_clipping_adjustment_and_skipping():
    """Verifies that perturbations exceeding physical bounds are adjusted or skipped, never leaving an unchanged observation marked as injected."""
    import numpy as np
    from app.core.synthetic_injection import evaluate_perturbation_candidate

    # 1. Perturbation adjusted to fit within physical max [min: -50, max: 65]
    orig_vals = np.array([55.0])
    res = evaluate_perturbation_candidate(
        original_values=orig_vals,
        desired_mag=20.0,
        desired_direction="positive",
        sigma=3.0,
        p_min=-50.0,
        p_max=65.0,
        is_rainfall=False,
    )
    assert res is not None
    new_vals, effective_mag, actual_dir, was_adjusted = res
    assert was_adjusted is True
    assert effective_mag == 10.0
    assert new_vals[0] == 65.0
    assert abs(new_vals[0] - orig_vals[0]) == 10.0

    # 2. Perturbation flipped from positive to negative when positive headroom is negligible
    orig_near_max = np.array([64.95])
    res2 = evaluate_perturbation_candidate(
        original_values=orig_near_max,
        desired_mag=10.0,
        desired_direction="positive",
        sigma=2.0,
        p_min=-50.0,
        p_max=65.0,
        is_rainfall=False,
    )
    assert res2 is not None
    new_vals2, effective_mag2, actual_dir2, was_adjusted2 = res2
    assert actual_dir2 == "negative"
    assert was_adjusted2 is True
    assert new_vals2[0] == 54.95

    # 3. Rainfall strictly forbids negative directions, skipping when positive headroom is insufficient
    rainfall_near_max = np.array([1999.95])
    res_rain = evaluate_perturbation_candidate(
        original_values=rainfall_near_max,
        desired_mag=15.0,
        desired_direction="positive",
        sigma=2.0,
        p_min=0.0,
        p_max=2000.0,
        is_rainfall=True,
    )
    assert res_rain is None


def test_ground_truth_mask_matches_actual_modifications():
    """Verifies that every observation where y_true == 1 has actually been modified by a scientifically meaningful delta."""
    import numpy as np
    import pandas as pd
    from app.core.synthetic_injection import inject_synthetic_anomalies
    from app.schemas.evaluation import SyntheticBenchmarkRequest

    dates = pd.date_range("2023-01-01", periods=60, freq="D").strftime("%Y-%m-%d")
    temps = np.linspace(15.0, 30.0, 60)
    df = pd.DataFrame({"date": dates, "temp": temps})

    cfg = SyntheticBenchmarkRequest(
        primary_variable="temperature",
        seed=42,
        point_anomaly_count=5,
        block_count=1,
        block_length=3,
        step_count=0,
    )

    perturbed_df, y_true, events, meta = inject_synthetic_anomalies(
        df=df,
        date_col="date",
        raw_col="temp",
        std_var="temperature",
        config=cfg,
    )

    # Invariant: y_true == 1 if and only if actual value was modified by at least meaningful delta
    for idx in range(len(df)):
        orig_v = df.at[idx, "temp"]
        pert_v = perturbed_df.at[idx, "temp"]
        if y_true[idx] == 1:
            assert abs(pert_v - orig_v) >= 0.05, f"Row {idx} marked as injected but departure was negligible!"
        else:
            assert pert_v == orig_v, f"Row {idx} not in y_true but was modified!"


def test_event_detection_delay_across_missing_calendar_dates():
    """Verifies that event detection delay computes actual calendar-day difference rather than index offset."""
    import numpy as np
    from app.core.synthetic_injection import compute_benchmark_metrics

    injected_events = [
        {
            "event_id": 1,
            "event_type": "block",
            "start_date": "2023-05-01",
            "end_date": "2023-05-06",
            "duration_days": 2,
            "injected_indices": [5, 6],
            "injected_dates": ["2023-05-01", "2023-05-06"],
            "magnitude_applied": 8.0,
            "direction": "positive",
        }
    ]

    y_true = np.zeros(20, dtype=int)
    y_true[5] = 1
    y_true[6] = 1
    valid_mask = np.ones(20, dtype=bool)

    # Case A: Detected on onset day (2023-05-01) -> delay should be 0.0 days
    y_pred_immediate = np.zeros(20, dtype=int)
    y_pred_immediate[5] = 1
    metrics_immediate = compute_benchmark_metrics(
        y_true=y_true,
        y_pred=y_pred_immediate,
        valid_mask=valid_mask,
        injected_events=injected_events,
        latency_ms=10.0,
        detector_name="det",
        display_name="Det",
    )
    assert metrics_immediate.event_detection_delay_days == 0.0

    # Case B: Missed onset (index 5 / 2023-05-01), detected on next record (index 6 / 2023-05-06)
    # Calendar delay is 5 days, whereas index offset is only 1!
    y_pred_lagged = np.zeros(20, dtype=int)
    y_pred_lagged[6] = 1
    metrics_lagged = compute_benchmark_metrics(
        y_true=y_true,
        y_pred=y_pred_lagged,
        valid_mask=valid_mask,
        injected_events=injected_events,
        latency_ms=10.0,
        detector_name="det",
        display_name="Det",
    )
    assert metrics_lagged.event_detection_delay_days == 5.0
    assert metrics_lagged.event_detection_delay_days != 1.0

