"""Meteorological physical boundaries, unit validations, and column detection rules."""
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import pandas as pd


# Meteorological Physical Limits on Earth
PHYSICAL_LIMITS: Dict[str, Dict[str, Any]] = {
    "temperature": {
        "min": -90.0,
        "max": 65.0,
        "unit": "°C",
        "description": "Earth surface temperature must lie between -90°C (Antarctica record) and +65°C.",
    },
    "humidity": {
        "min": 0.0,
        "max": 100.0,
        "unit": "%",
        "description": "Relative humidity is a ratio bounded between 0% and 100%.",
    },
    "rainfall": {
        "min": 0.0,
        "max": 2500.0,
        "unit": "mm",
        "description": "Rainfall/Precipitation cannot be negative and single-day accumulation rarely exceeds 2500mm.",
    },
    "pressure": {
        "min": 850.0,
        "max": 1100.0,
        "unit": "hPa",
        "description": "Sea-level / surface barometric pressure typically ranges between 850 hPa (tropical cyclone) and 1100 hPa.",
    },
    "wind_speed": {
        "min": 0.0,
        "max": 450.0,
        "unit": "km/h",
        "description": "Wind speed cannot be negative and wind gusts on Earth do not exceed 450 km/h.",
    },
}

# Column Name Aliases for automatic mapping
COLUMN_ALIASES: Dict[str, List[str]] = {
    "date": [
        "date", "datetime", "timestamp", "time", "dt", "formatted_date",
        "observation_date", "day", "record_date"
    ],
    "temperature": [
        "temperature", "temp", "meantemp", "tavg", "temp_c", "temperature_c",
        "tmax", "tmin", "air_temperature", "temp_avg", "temperature_2m"
    ],
    "humidity": [
        "humidity", "relative_humidity", "rh", "hum", "rel_humidity",
        "relative_humidity_2m", "humidity_pct"
    ],
    "rainfall": [
        "rainfall", "precipitation", "precip", "prcp", "rain", "rain_mm",
        "precipitation_mm", "rain_fall", "precipitation_sum"
    ],
    "pressure": [
        "pressure", "mean_pressure", "slp", "mslp", "barometer", "baro",
        "surface_pressure", "sealevel_pressure", "pres", "atm_pressure"
    ],
    "wind_speed": [
        "wind_speed", "windspeed", "wind", "wspd", "wind_velocity",
        "wind_speed_10m", "wind_kph", "wind_mps"
    ],
}


def detect_column_mapping(columns: List[str]) -> Dict[str, str]:
    """Inspects a list of DataFrame column names and suggests standardized mapping."""
    mapping: Dict[str, str] = {}
    normalized_cols = {col.lower().replace(" ", "_").replace("-", "_"): col for col in columns}

    for std_name, aliases in COLUMN_ALIASES.items():
        matched = False
        # 1. Exact match on normalized column name
        for alias in aliases:
            if alias in normalized_cols:
                mapping[std_name] = normalized_cols[alias]
                matched = True
                break
        
        # 2. Substring match fallback
        if not matched:
            for norm_col, original_col in normalized_cols.items():
                if any(alias in norm_col for alias in aliases) and original_col not in mapping.values():
                    mapping[std_name] = original_col
                    break

    return mapping


def check_physical_violations(
    df: pd.DataFrame,
    mapping: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Identifies readings that are physically impossible in meteorological observation."""
    violations: List[Dict[str, Any]] = []

    for std_name, raw_col in mapping.items():
        if std_name not in PHYSICAL_LIMITS or raw_col not in df.columns:
            continue

        limits = PHYSICAL_LIMITS[std_name]
        col_series = pd.to_numeric(df[raw_col], errors="coerce")
        valid_series = col_series.dropna()
        if len(valid_series) == 0:
            continue

        min_val, max_val = limits["min"], limits["max"]
        mask = (valid_series < min_val) | (valid_series > max_val)
        invalid_count = int(mask.sum())

        if invalid_count > 0:
            samples = valid_series[mask].head(5).tolist()
            invalid_pct = round((invalid_count / len(col_series)) * 100, 2)
            rule_str = f"{min_val} <= value <= {max_val} {limits['unit']}"
            violations.append({
                "column": raw_col,
                "standard_name": std_name,
                "rule": rule_str,
                "invalid_count": invalid_count,
                "invalid_pct": invalid_pct,
                "sample_values": [round(float(s), 2) for s in samples],
                "description": limits["description"],
            })

    return violations

