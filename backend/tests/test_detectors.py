import numpy as np
import pandas as pd
import pytest

from app.core.detectors.seasonal_zscore import SeasonalZScoreDetector
from app.core.detectors.modified_zscore import ModifiedZScoreDetector
from app.core.detectors.isolation_forest import IsolationForestDetector
from app.core.detectors.lof import LocalOutlierFactorDetector
from app.core.detectors.ensemble import EnsembleAnomalyDetector


def test_seasonal_zscore_detector():
    """Verify Seasonal Z-score detects points exceeding |Z| >= 3.0 threshold."""
    df = pd.DataFrame({
        "temp_seasonal_zscore": [0.5, -0.2, 3.4, 0.1, -3.8, 1.2, np.nan],
    })
    detector = SeasonalZScoreDetector(threshold=3.0)
    res = detector.detect(df, variable_name="temp", z_col="temp_seasonal_zscore")

    assert res["anomaly_count"] == 2
    assert res["high_anomalies"] == 1  # 3.4
    assert res["low_anomalies"] == 1   # -3.8
    # Critical rule: NaN is NEVER an anomaly
    assert res["flags"][6] == 0


def test_modified_zscore_detector():
    """Verify Modified Z-score using MAD detects extreme outliers."""
    # Series with a cluster of normal values (20) and a single extreme spike (55)
    df = pd.DataFrame({
        "temp_seasonal_modified_zscore": [0.2, 0.1, -0.1, 0.0, 4.2, 0.3, np.nan],
    })
    detector = ModifiedZScoreDetector(threshold=3.0)
    res = detector.detect(df, variable_name="temp", mod_z_col="temp_seasonal_modified_zscore")

    assert res["anomaly_count"] == 1
    assert res["flags"][4] == 1
    assert res["flags"][6] == 0  # NaN is not an anomaly


def test_isolation_forest_and_lof():
    """Verify Isolation Forest and LOF detect multivariable anomalous points."""
    np.random.seed(42)
    # 50 normal observations
    t_dev = np.random.normal(0, 1.0, 50)
    p_diff = np.random.normal(0, 1.0, 50)

    # Inject 2 known multi-dimensional anomalies at index 10 and 25
    t_dev[10] = 6.5
    p_diff[10] = -12.0
    t_dev[25] = -7.0
    p_diff[25] = 14.0

    df = pd.DataFrame({
        "temp_seasonal_dev": t_dev,
        "pressure_diff_1d": p_diff,
    })

    # Isolation Forest
    if_detector = IsolationForestDetector(contamination=0.04, random_state=42)
    if_res = if_detector.detect(df, feature_columns=["temp_seasonal_dev", "pressure_diff_1d"])
    assert if_res["flags"][10] == 1 or if_res["flags"][25] == 1
    assert if_res["anomaly_count"] > 0

    # Local Outlier Factor
    lof_detector = LocalOutlierFactorDetector(contamination=0.04)
    lof_res = lof_detector.detect(df, feature_columns=["temp_seasonal_dev", "pressure_diff_1d"])
    assert lof_res["anomaly_count"] > 0


def test_ensemble_classification_rules():
    """Verify blueprint ensemble classification rules:
    - Confirmed: >= 2 detectors agree.
    - Potential: exactly 1 detector flags.
    - Normal: 0 detectors flag.
    """
    # Create controlled DataFrame with synthetic seasonal columns
    df = pd.DataFrame({
        "date": ["2022-01-01", "2022-01-02", "2022-01-03", "2022-01-04"],
        "temp": [15.0, 35.0, 22.0, 15.2],  # Index 1 is extreme, Index 2 is mild, Index 0 & 3 normal
        "temp_expected_seasonal_mean": [15.0, 15.0, 15.0, 15.0],
        "temp_seasonal_dev": [0.0, 20.0, 7.0, 0.2],
        "temp_seasonal_zscore": [0.0, 5.0, 2.8, 0.05],          # Index 1 triggers Z (>=3.0)
        "temp_seasonal_modified_zscore": [0.0, 4.8, 2.6, 0.05], # Index 1 triggers MAD (>=3.0)
    })
    mapping = {"date": "date", "temperature": "temp"}

    ensemble = EnsembleAnomalyDetector(z_threshold=3.0, mad_threshold=3.0)
    res = ensemble.run(df, mapping, primary_variable="temperature")

    # Index 1 has high Z and high MAD -> at least 2 detectors -> Confirmed
    assert res["all_records"][1]["classification"] == "confirmed"
    assert res["all_records"][1]["severity"] in ["extreme", "high"]

    # Index 0 is normal
    assert res["all_records"][0]["classification"] == "normal"
    assert res["all_records"][0]["severity"] == "none"


def test_missing_observations_never_flagged_as_anomalies():
    """CRITICAL RULE: Missing values (NaN) must NEVER be classified as anomalies."""
    df = pd.DataFrame({
        "date": ["2022-01-01", "2022-01-02", "2022-01-03"],
        "temp": [np.nan, 15.0, np.nan],
        "temp_expected_seasonal_mean": [15.0, 15.0, 15.0],
        "temp_seasonal_dev": [np.nan, 0.0, np.nan],
        "temp_seasonal_zscore": [np.nan, 0.0, np.nan],
        "temp_seasonal_modified_zscore": [np.nan, 0.0, np.nan],
    })
    mapping = {"date": "date", "temperature": "temp"}

    ensemble = EnsembleAnomalyDetector()
    res = ensemble.run(df, mapping, primary_variable="temperature")

    # Neither index 0 nor index 2 should be flagged
    assert res["all_records"][0]["classification"] == "normal"
    assert res["all_records"][2]["classification"] == "normal"
    assert res["confirmed_count"] == 0
    assert res["potential_count"] == 0


def test_small_dataset_edge_cases():
    """Verify detectors execute cleanly on tiny datasets (N < 10) without index out-of-bounds."""
    df = pd.DataFrame({
        "date": pd.date_range("2022-01-01", periods=6, freq="D"),
        "temp": [10.0, 11.0, 10.5, 12.0, 30.0, 11.2],
        "temp_expected_seasonal_mean": [10.8, 10.8, 10.8, 10.8, 10.8, 10.8],
        "temp_seasonal_dev": [-0.8, 0.2, -0.3, 1.2, 19.2, 0.4],
        "temp_seasonal_zscore": [-0.5, 0.1, -0.2, 0.8, 4.5, 0.2],
        "temp_seasonal_modified_zscore": [-0.5, 0.1, -0.2, 0.8, 4.2, 0.2],
    })
    mapping = {"date": "date", "temperature": "temp"}

    ensemble = EnsembleAnomalyDetector()
    res = ensemble.run(df, mapping, primary_variable="temperature")

    assert res["total_records"] == 6
    assert res["confirmed_count"] >= 1  # Index 4 should be confirmed

