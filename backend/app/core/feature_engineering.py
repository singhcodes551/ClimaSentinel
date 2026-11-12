"""Meteorological Feature Engineering Module.

Computes calendar, temporal rolling, differential, and rainfall-derived features
strictly respecting climatological invariants and never fabricating precipitation.
"""
from typing import Dict, List, Optional
import numpy as np
import pandas as pd


def generate_meteorological_features(
    df: pd.DataFrame,
    mapping: Dict[str, str],
) -> pd.DataFrame:
    """Enriches a cleaned weather DataFrame with seasonal, rolling, and differential features.
    
    Parameters
    ----------
    df : pd.DataFrame
        Chronologically sorted weather DataFrame.
    mapping : Dict[str, str]
        Mapping from standard names ('date', 'temperature', 'humidity', 'rainfall',
        'pressure', 'wind_speed') to raw DataFrame column names.
        
    Returns
    -------
    pd.DataFrame
        DataFrame enriched with engineered feature columns.
    """
    feat_df = df.copy()
    date_col = mapping.get("date")
    temp_col = mapping.get("temperature")
    rain_col = mapping.get("rainfall")
    hum_col = mapping.get("humidity")
    pres_col = mapping.get("pressure")
    wind_col = mapping.get("wind_speed")

    # 1. Calendar & Temporal Features
    if date_col and date_col in feat_df.columns:
        dt_series = pd.to_datetime(feat_df[date_col], errors="coerce")
        feat_df["day_of_year"] = dt_series.dt.day_of_year
        feat_df["month"] = dt_series.dt.month
        feat_df["day"] = dt_series.dt.day
        feat_df["quarter"] = dt_series.dt.quarter

        # Standard Meteorological Seasons (Northern Hemisphere)
        # 1: Winter (Dec-Feb), 2: Spring/Pre-monsoon (Mar-May), 
        # 3: Summer/Monsoon (Jun-Aug), 4: Autumn/Post-monsoon (Sep-Nov)
        def _get_season(m: Optional[int]) -> Optional[int]:
            if pd.isna(m):
                return np.nan
            if m in [12, 1, 2]:
                return 1  # Winter
            elif m in [3, 4, 5]:
                return 2  # Spring / Pre-monsoon
            elif m in [6, 7, 8]:
                return 3  # Summer / Monsoon
            else:
                return 4  # Autumn / Post-monsoon

        feat_df["season"] = dt_series.dt.month.map(_get_season)

    # 2. Temperature Rolling & Differential Features
    if temp_col and temp_col in feat_df.columns:
        t = feat_df[temp_col]
        # 7-day and 14-day rolling statistics (min_periods=1 to handle boundaries)
        feat_df["temp_rolling_mean_7d"] = t.rolling(window=7, min_periods=1).mean().round(2)
        feat_df["temp_rolling_std_7d"] = t.rolling(window=7, min_periods=2).std().fillna(0.0).round(2)
        # 1-day rate of change (inter-diurnal temperature change)
        feat_df["temp_diff_1d"] = t.diff().fillna(0.0).round(2)
        # Deviation from short-term baseline
        feat_df["temp_dev_from_rolling_7d"] = (t - feat_df["temp_rolling_mean_7d"]).round(2)

    # 3. Rainfall-Derived Features (NEVER Fabricating Precipitation)
    if rain_col and rain_col in feat_df.columns:
        r = feat_df[rain_col]
        # Rain occurrence indicator (> 0.1mm standard WMO measurable precipitation threshold)
        feat_df["rain_binary"] = (r > 0.1).astype(float)
        # If rainfall is NaN, rain_binary must also be NaN
        feat_df.loc[r.isna(), "rain_binary"] = np.nan

        # 3-day and 7-day cumulative rainfall
        # Cumulative sum with min_periods=1; if all are NaN, result is NaN
        feat_df["rain_cumulative_3d"] = r.rolling(window=3, min_periods=1).sum().round(2)
        feat_df["rain_cumulative_7d"] = r.rolling(window=7, min_periods=1).sum().round(2)

        # Consecutive dry days (running tally of days where rain <= 0.1mm)
        dry_mask = (r <= 0.1) | r.isna()
        consecutive_dry = []
        count = 0
        for is_dry, val in zip(dry_mask, r):
            if pd.isna(val):
                # When data is missing, we do NOT invent dry or wet
                consecutive_dry.append(np.nan)
            elif is_dry:
                count += 1
                consecutive_dry.append(count)
            else:
                count = 0
                consecutive_dry.append(0)
        feat_df["consecutive_dry_days"] = consecutive_dry

    # 4. Humidity & Pressure Variations (Key Atmospheric Instability Indicators)
    if hum_col and hum_col in feat_df.columns:
        h = feat_df[hum_col]
        feat_df["humidity_rolling_mean_7d"] = h.rolling(window=7, min_periods=1).mean().round(2)
        feat_df["humidity_diff_1d"] = h.diff().fillna(0.0).round(2)

    if pres_col and pres_col in feat_df.columns:
        p = feat_df[pres_col]
        # Rapid barometric pressure drop is a primary indicator of convective storms / cyclonic depressions
        feat_df["pressure_diff_1d"] = p.diff().fillna(0.0).round(2)
        feat_df["pressure_diff_3d"] = p.diff(periods=3).fillna(0.0).round(2)
        feat_df["pressure_rolling_mean_7d"] = p.rolling(window=7, min_periods=1).mean().round(2)

    # 5. Wind Speed Variations
    if wind_col and wind_col in feat_df.columns:
        w = feat_df[wind_col]
        feat_df["wind_diff_1d"] = w.diff().fillna(0.0).round(2)
        w_roll = w.rolling(window=7, min_periods=1).mean()
        # Wind gust / ratio above local rolling background
        feat_df["wind_ratio_to_rolling"] = (w / (w_roll + 1e-4)).round(2)

    return feat_df

