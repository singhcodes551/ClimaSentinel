import pandas as pd
import numpy as np
import pytest
from app.core.preprocessor import WeatherDataWrangler


def test_rainfall_never_interpolated_and_preserved_by_default():
    """CRITICAL RULE TEST: Verify missing rainfall is NEVER interpolated.
    
    By default (rainfall_strategy='preserve'), missing rainfall records remain NaN
    so that artificial dry days (0.0 mm) are not fabricated into climate data.
    Continuous variables like temperature are linearly interpolated.
    """
    # Day 1: 10 mm, Day 2: NaN, Day 3: 50 mm
    # If linear interpolation were mistakenly used, Day 2 would become 30 mm!
    # Under ClimaSentinel rules, rainfall is discrete; it must NEVER be interpolated.
    df = pd.DataFrame({
        "date": ["2022-07-01", "2022-07-02", "2022-07-03"],
        "rainfall": [10.0, np.nan, 50.0],
        "temperature": [30.0, np.nan, 32.0],
    })

    wrangler = WeatherDataWrangler(
        df=df,
        mapping={"date": "date", "rainfall": "rainfall", "temperature": "temperature"},
        missing_strategy="linear",  # Linear requested for continuous variables
        rainfall_strategy="preserve",  # Default policy
    )
    cleaned_df, summary = wrangler.wrangle()

    # Temperature SHOULD be interpolated (30.0, 31.0, 32.0)
    assert cleaned_df["temperature"].iloc[1] == 31.0

    # Rainfall MUST NOT be interpolated to 30.0
    assert cleaned_df["rainfall"].iloc[1] != 30.0
    # Rainfall default policy preserves NaN to prevent false dry days
    assert np.isnan(cleaned_df["rainfall"].iloc[1])
    assert summary["rainfall_non_interpolated"] is True
    assert summary["rainfall_treatment_applied"] == "preserved_nan"


def test_rainfall_explicit_zero_fill_never_interpolates():
    """Verify that when user explicitly selects zero-fill for rainfall,
    it zero-fills but strictly does NOT interpolate with adjacent values.
    """
    df = pd.DataFrame({
        "date": ["2022-07-01", "2022-07-02", "2022-07-03"],
        "rainfall": [25.0, np.nan, 75.0],
    })

    wrangler = WeatherDataWrangler(
        df=df,
        mapping={"date": "date", "rainfall": "rainfall"},
        missing_strategy="linear",
        rainfall_strategy="zero_fill",
    )
    cleaned_df, summary = wrangler.wrangle()

    assert cleaned_df["rainfall"].iloc[1] == 0.0
    assert cleaned_df["rainfall"].iloc[1] != 50.0
    assert summary["rainfall_non_interpolated"] is True
    assert summary["rainfall_treatment_applied"] == "zero_filled"


def test_duplicate_removal_and_chronological_sort():
    """Verify duplicate records are dropped and dates are sorted ascending."""
    df = pd.DataFrame({
        "date": ["2022-01-03", "2022-01-01", "2022-01-02", "2022-01-01"],
        "temperature": [15.0, 10.0, 12.0, 10.0],
        "humidity": [60.0, 50.0, 55.0, 50.0],
    })

    wrangler = WeatherDataWrangler(
        df=df,
        remove_duplicates=True,
        sort_chronologically=True,
    )
    cleaned_df, summary = wrangler.wrangle()

    assert len(cleaned_df) == 3
    assert summary["duplicates_removed"] == 1
    # Verify chronological order
    assert pd.to_datetime(cleaned_df["date"]).is_monotonic_increasing


def test_genuine_extremes_preserved():
    """Verify genuine high meteorological values (e.g. 48C heatwave) are preserved."""
    df = pd.DataFrame({
        "date": ["2022-05-15", "2022-05-16", "2022-05-17"],
        "temperature": [42.0, 48.5, 47.0],  # Genuine extreme heatwave
        "rainfall": [0.0, 120.0, 0.0],      # Genuine monsoon cloudburst
    })

    wrangler = WeatherDataWrangler(
        df=df,
        mapping={"date": "date", "temperature": "temperature", "rainfall": "rainfall"},
        filter_physically_impossible=True,
    )
    cleaned_df, summary = wrangler.wrangle()

    # All genuine extremes must remain untouched
    assert cleaned_df["temperature"].iloc[1] == 48.5
    assert cleaned_df["rainfall"].iloc[1] == 120.0
    assert summary["rows_after"] == 3
