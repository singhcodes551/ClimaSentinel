import pandas as pd
import numpy as np
from app.core.validator import detect_column_mapping, check_physical_violations
from app.core.profiler import DatasetProfiler


def test_detect_column_mapping():
    """Verify standard weather column aliases are accurately detected."""
    cols = ["Observation_Date", "Temp_C", "Rel_Hum", "Rain_MM", "Baro_Pres", "Wind_Velocity"]
    mapping = detect_column_mapping(cols)

    assert mapping["date"] == "Observation_Date"
    assert mapping["temperature"] == "Temp_C"
    assert mapping["humidity"] == "Rel_Hum"
    assert mapping["rainfall"] == "Rain_MM"
    assert mapping["pressure"] == "Baro_Pres"
    assert mapping["wind_speed"] == "Wind_Velocity"


def test_check_physical_violations():
    """Verify physical impossibility rules flag sensor glitches."""
    df = pd.DataFrame({
        "temperature": [25.0, 75.0, -105.0],  # 75 and -105 are impossible
        "humidity": [50.0, 105.0, -10.0],     # 105 and -10 are impossible
        "rainfall": [0.0, -5.0, 30.0],        # -5 is impossible
    })
    mapping = {"temperature": "temperature", "humidity": "humidity", "rainfall": "rainfall"}
    violations = check_physical_violations(df, mapping)

    violated_cols = {v["column"]: v["invalid_count"] for v in violations}
    assert violated_cols["temperature"] == 2
    assert violated_cols["humidity"] == 2
    assert violated_cols["rainfall"] == 1


def test_dataset_profiler_statistics():
    """Verify DatasetProfiler calculates correct summary metrics and quality scores."""
    dates = pd.date_range("2022-01-01", periods=10, freq="D")
    df = pd.DataFrame({
        "date": dates,
        "temperature": [10.0, 12.0, np.nan, 14.0, 15.0, 16.0, 18.0, 20.0, 22.0, 25.0],
        "rainfall": [0.0, 5.0, 0.0, 12.0, 0.0, 0.0, 2.0, np.nan, 0.0, 1.0],
    })
    # Add 1 duplicate row
    df = pd.concat([df, df.iloc[[0]]]).reset_index(drop=True)

    profiler = DatasetProfiler(df)
    res = profiler.profile()

    assert res["total_rows"] == 11
    assert res["total_columns"] == 3
    assert res["duplicate_rows"] == 1
    assert "Daily" in res["temporal_profile"]["frequency"]
    assert res["temporal_profile"]["start_date"] == "2022-01-01 00:00:00"
    assert res["overall_quality_score"] > 80.0
