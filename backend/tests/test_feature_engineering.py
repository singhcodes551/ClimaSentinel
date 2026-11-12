import numpy as np
import pandas as pd
from app.core.feature_engineering import generate_meteorological_features


def test_calendar_and_meteorological_seasons():
    """Verify calendar features and meteorological seasons (1:Winter, 2:Spring, 3:Summer, 4:Autumn)."""
    dates = pd.to_datetime(["2022-01-15", "2022-04-10", "2022-07-20", "2022-10-05"])
    df = pd.DataFrame({"date": dates, "temp": [12.0, 25.0, 35.0, 22.0]})
    mapping = {"date": "date", "temperature": "temp"}

    res = generate_meteorological_features(df, mapping)

    assert res["day_of_year"].tolist() == [15, 100, 201, 278]
    assert res["month"].tolist() == [1, 4, 7, 10]
    # Seasons: Jan -> 1 (Winter), Apr -> 2 (Spring), Jul -> 3 (Summer), Oct -> 4 (Autumn)
    assert res["season"].tolist() == [1, 2, 3, 4]


def test_rolling_and_differential_features():
    """Verify 7-day rolling statistics and 1-day differences."""
    df = pd.DataFrame({
        "date": pd.date_range("2022-01-01", periods=10, freq="D"),
        "temp": [10.0, 12.0, 14.0, 16.0, 18.0, 20.0, 22.0, 24.0, 26.0, 28.0],
        "pres": [1010.0, 1008.0, 1005.0, 995.0, 990.0, 998.0, 1002.0, 1005.0, 1008.0, 1010.0],
    })
    mapping = {"date": "date", "temperature": "temp", "pressure": "pres"}

    res = generate_meteorological_features(df, mapping)

    # 1-day rate of change
    assert res["temp_diff_1d"].iloc[1] == 2.0
    # Pressure sudden drop of 10 hPa between index 2 and 3
    assert res["pressure_diff_1d"].iloc[3] == -10.0
    # 7-day rolling mean on index 6 (mean of 10..22 = 16.0)
    assert res["temp_rolling_mean_7d"].iloc[6] == 16.0


def test_rainfall_features_never_fabricate():
    """Verify rainfall features respect absence of rain and do NOT fabricate values on missing data."""
    df = pd.DataFrame({
        "date": pd.date_range("2022-01-01", periods=6, freq="D"),
        "rainfall": [0.0, 0.0, 15.0, 0.0, np.nan, 0.0],
    })
    mapping = {"date": "date", "rainfall": "rainfall"}

    res = generate_meteorological_features(df, mapping)

    # rain_binary is 1 for >0.1mm, 0 for <=0.1mm, and NaN for NaN
    assert res["rain_binary"].iloc[0] == 0.0
    assert res["rain_binary"].iloc[2] == 1.0
    assert np.isnan(res["rain_binary"].iloc[4])  # Missing must remain missing!

    # Consecutive dry days tally
    # Day 0: 1, Day 1: 2, Day 2: 0 (rained 15mm), Day 3: 1, Day 4: NaN, Day 5: 1
    assert res["consecutive_dry_days"].iloc[0] == 1
    assert res["consecutive_dry_days"].iloc[1] == 2
    assert res["consecutive_dry_days"].iloc[2] == 0
    assert res["consecutive_dry_days"].iloc[3] == 1
    assert np.isnan(res["consecutive_dry_days"].iloc[4])

