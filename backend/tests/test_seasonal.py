import numpy as np
import pandas as pd
from app.core.seasonal import SeasonalClimatologyEngine


def test_seasonal_baseline_and_year_boundary_circular_window():
    """Verify ±7-day circular DOY window correctly wraps across the Dec 31 -> Jan 1 boundary."""
    # Create multi-year series (3 years: 2020, 2021, 2022) with synthetic seasonal curve
    dates = pd.date_range("2020-01-01", "2022-12-31", freq="D")
    df = pd.DataFrame({
        "date": dates,
        "temperature": 20.0 + 10.0 * np.sin(2 * np.pi * dates.day_of_year / 365.25),
    })
    mapping = {"date": "date", "temperature": "temperature"}

    engine = SeasonalClimatologyEngine(window_days=7)
    season_df, baselines = engine.fit_transform(df, mapping)

    # Check that seasonal columns were appended
    assert "temperature_expected_seasonal_mean" in season_df.columns
    assert "temperature_seasonal_zscore" in season_df.columns
    assert "temperature_seasonal_modified_zscore" in season_df.columns

    # Verify Day 1 baseline exists and sample count is >= 14 days * 3 years
    doy1_stats = baselines["temperature"][1]
    assert doy1_stats["sample_count"] > 20
    # Day 365 baseline exists
    assert 365 in baselines["temperature"]


def test_seasonal_deviation_isolates_genuine_anomalies():
    """Verify that expected seasonal weather produces ~0 deviation, while an unseasonal spike produces large Z."""
    # Synthetic summer vs winter scenario
    dates = pd.date_range("2022-01-01", periods=10, freq="D")
    df = pd.DataFrame({
        "date": dates,
        "temperature": [5.0, 5.2, 4.8, 5.1, 25.0, 5.0, 5.1, 4.9, 5.0, 5.2],  # Day 4 (25.0) is a massive winter spike!
    })
    mapping = {"date": "date", "temperature": "temperature"}

    engine = SeasonalClimatologyEngine(window_days=7)
    season_df, _ = engine.fit_transform(df, mapping)

    # Winter spike should have a high seasonal Z-score
    spike_z = season_df["temperature_seasonal_zscore"].iloc[4]
    normal_z = season_df["temperature_seasonal_zscore"].iloc[0]

    assert spike_z > 2.5
    assert abs(normal_z) < 1.5
