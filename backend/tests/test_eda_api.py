import pytest
import pandas as pd
import numpy as np
from fastapi.testclient import TestClient
from app.main import app
from app.core.eda import (
    compute_distribution,
    compute_correlations,
    compute_seasonality,
    compute_timeseries,
    compute_missingness,
    resolve_column,
)

client = TestClient(app)


@pytest.fixture(scope="module")
def sample_dataset_id():
    """Seeds a sample dataset for EDA integration tests."""
    res = client.post("/api/v1/datasets/sample/delhi_climate")
    assert res.status_code == 201
    return res.json()["id"]


# ============================================================================
# API Integration Tests
# ============================================================================

def test_eda_distribution_endpoint(sample_dataset_id):
    """Verifies distribution statistics and histogram bins."""
    res = client.get(f"/api/v1/datasets/{sample_dataset_id}/eda/distribution?variable=temperature&bins=15")
    assert res.status_code == 200
    data = res.json()

    assert data["variable"] == "temperature"
    assert data["unit"] == "°C"
    assert data["valid_count"] > 0
    assert data["min"] <= data["mean"] <= data["max"]
    assert data["std"] > 0
    assert isinstance(data["skewness"], (float, int))
    assert isinstance(data["kurtosis"], (float, int))
    assert len(data["bins"]) == 15

    # Sum of bin counts should equal valid_count
    total_bin_counts = sum(b["count"] for b in data["bins"])
    assert total_bin_counts == data["valid_count"]

    # Bin percentages should sum to approximately 100%
    total_pct = sum(b["percentage"] for b in data["bins"])
    assert 99.0 <= total_pct <= 101.0

    # Physical limits metadata
    assert data["physical_limits"] is not None
    assert data["physical_limits"]["min"] == -90.0
    assert data["physical_limits"]["max"] == 65.0


def test_eda_distribution_default_variable(sample_dataset_id):
    """Verifies distribution defaults to first available variable when omitted."""
    res = client.get(f"/api/v1/datasets/{sample_dataset_id}/eda/distribution")
    assert res.status_code == 200
    data = res.json()
    assert data["valid_count"] > 0
    assert len(data["bins"]) == 20  # default 20 bins


def test_eda_distribution_invalid_variable(sample_dataset_id):
    """Verifies 422 for a nonexistent variable."""
    res = client.get(f"/api/v1/datasets/{sample_dataset_id}/eda/distribution?variable=nonexistent_var_xyz")
    assert res.status_code == 422


def test_eda_correlations_endpoint(sample_dataset_id):
    """Verifies correlation matrix dimensions, symmetry, diagonal, and sample sizes."""
    res = client.get(f"/api/v1/datasets/{sample_dataset_id}/eda/correlations")
    assert res.status_code == 200
    data = res.json()

    variables = data["variables"]
    matrix = data["matrix"]
    sample_sizes = data["sample_sizes"]

    n = len(variables)
    assert n >= 2
    assert len(matrix) == n
    assert len(sample_sizes) == n

    for i in range(n):
        assert len(matrix[i]) == n
        assert len(sample_sizes[i]) == n
        # Diagonal is 1.0
        assert matrix[i][i] == 1.0
        assert sample_sizes[i][i] > 0
        for j in range(n):
            # Symmetry
            assert matrix[i][j] == matrix[j][i]
            assert sample_sizes[i][j] == sample_sizes[j][i]
            if matrix[i][j] is not None:
                assert -1.0 <= matrix[i][j] <= 1.0


def test_eda_seasonality_endpoint(sample_dataset_id):
    """Verifies 12 monthly and 4 seasonal profiles."""
    res = client.get(f"/api/v1/datasets/{sample_dataset_id}/eda/seasonality")
    assert res.status_code == 200
    data = res.json()

    assert len(data["monthly_profile"]) == 12
    assert len(data["seasonal_profile"]) == 4

    # Verify months 1..12
    for idx, month_item in enumerate(data["monthly_profile"], start=1):
        assert month_item["month"] == idx
        assert month_item["record_count"] > 0
        assert "temperature" in month_item["metrics"]
        assert month_item["metrics"]["temperature"]["mean"] is not None

    # Verify seasons
    season_names = [s["season_name"] for s in data["seasonal_profile"]]
    assert "Winter (DJF)" in season_names
    assert "Spring (MAM)" in season_names
    assert "Summer (JJA)" in season_names
    assert "Autumn (SON)" in season_names


def test_eda_timeseries_endpoint(sample_dataset_id):
    """Verifies chronological order, 7-day rolling mean, and sampling."""
    res = client.get(f"/api/v1/datasets/{sample_dataset_id}/eda/timeseries?variable=temperature&max_points=200")
    assert res.status_code == 200
    data = res.json()

    assert data["variable"] == "temperature"
    assert data["total_points"] > 0
    assert len(data["points"]) <= 201
    assert data["sampled"] is True

    # Check chronological monotonicity
    dates = [p["date"] for p in data["points"]]
    for k in range(len(dates) - 1):
        assert dates[k] <= dates[k + 1]

    # Verify rolling mean presence
    has_rolling = any(p["rolling_mean_7d"] is not None for p in data["points"])
    assert has_rolling is True


def test_eda_missingness_endpoint(sample_dataset_id):
    """Verifies monthly missingness matrix and overall rates."""
    res = client.get(f"/api/v1/datasets/{sample_dataset_id}/eda/missingness")
    assert res.status_code == 200
    data = res.json()

    assert len(data["periods"]) > 0
    assert len(data["variables"]) > 0
    assert len(data["cells"]) == len(data["periods"])
    assert data["total_observations"] > 0

    first_cell = data["cells"][0]
    assert "period" in first_cell
    assert "missing_counts" in first_cell
    assert "missing_percentages" in first_cell


def test_eda_nonexistent_dataset():
    """Verifies 404 for all EDA endpoints when dataset doesn't exist."""
    fake_id = 999999
    endpoints = ["distribution", "correlations", "seasonality", "timeseries", "missingness"]
    for ep in endpoints:
        res = client.get(f"/api/v1/datasets/{fake_id}/eda/{ep}")
        assert res.status_code == 404


# ============================================================================
# Unit Tests for Core Analytical Functions & Edge Cases
# ============================================================================

def test_compute_distribution_constant_values():
    """Edge case: zero variance / constant values."""
    df = pd.DataFrame({"temp": [25.0] * 50, "date": ["2023-01-01"] * 50})
    mapping = {"date": "date", "temperature": "temp"}
    res = compute_distribution(df, mapping, "temperature", num_bins=10)

    assert res["valid_count"] == 50
    assert res["min"] == 25.0
    assert res["max"] == 25.0
    assert res["std"] == 0.0
    assert res["skewness"] == 0.0
    assert res["kurtosis"] == 0.0
    assert len(res["bins"]) == 1
    assert res["bins"][0]["count"] == 50


def test_compute_distribution_empty_column():
    """Edge case: all missing / null values."""
    df = pd.DataFrame({"temp": [np.nan, None, np.nan], "date": ["2023-01-01", "2023-01-02", "2023-01-03"]})
    mapping = {"date": "date", "temperature": "temp"}
    res = compute_distribution(df, mapping, "temperature")

    assert res["valid_count"] == 0
    assert res["missing_count"] == 3
    assert res["min"] is None
    assert res["mean"] is None
    assert len(res["bins"]) == 0


def test_compute_correlations_with_missing_values():
    """Edge case: pairwise complete correlations with missing values in some rows."""
    df = pd.DataFrame({
        "t": [10.0, 20.0, 30.0, np.nan, 50.0],
        "h": [80.0, np.nan, 60.0, 50.0, 40.0],
        "date": ["2023-01-01", "2023-01-02", "2023-01-03", "2023-01-04", "2023-01-05"]
    })
    mapping = {"date": "date", "temperature": "t", "humidity": "h"}
    res = compute_correlations(df, mapping)

    # Temperature and humidity both present in rows 0, 2, 4 (3 pairs)
    assert res["sample_sizes"][0][1] == 3
    assert res["matrix"][0][1] is not None
    # Negative correlation expected (as temp rises, humidity drops)
    assert res["matrix"][0][1] < 0.0

