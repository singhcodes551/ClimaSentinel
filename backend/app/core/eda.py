"""Analytical computation engine for Exploratory Data Analysis (EDA) of meteorological data."""
import math
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import pandas as pd
from scipy import stats

from app.core.validator import detect_column_mapping, PHYSICAL_LIMITS

MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
]

SEASONS = [
    {"name": "Winter (DJF)", "months": [12, 1, 2]},
    {"name": "Spring (MAM)", "months": [3, 4, 5]},
    {"name": "Summer (JJA)", "months": [6, 7, 8]},
    {"name": "Autumn (SON)", "months": [9, 10, 11]},
]


def resolve_column(
    df: pd.DataFrame,
    mapping: Dict[str, str],
    variable: str,
) -> Tuple[str, Optional[str]]:
    """
    Resolves a requested variable name to its underlying raw DataFrame column
    and its standardized meteorological key.
    """
    var_lower = variable.lower().strip()
    
    # 1. Check if it's a standard key in mapping (e.g., 'temperature')
    if var_lower in mapping and mapping[var_lower] in df.columns:
        return mapping[var_lower], var_lower
        
    # 2. Check direct column match
    if variable in df.columns:
        # Find if any standard key maps to this raw column
        for std_key, raw_name in mapping.items():
            if raw_name == variable:
                return variable, std_key
        return variable, None
        
    # 3. Case-insensitive check on df columns
    for col in df.columns:
        if col.lower().strip() == var_lower:
            for std_key, raw_name in mapping.items():
                if raw_name.lower().strip() == var_lower:
                    return col, std_key
            return col, None
            
    # 4. Check if standard key alias matches
    for std_key, raw_col in mapping.items():
        if std_key.lower() == var_lower and raw_col in df.columns:
            return raw_col, std_key

    raise ValueError(f"Variable '{variable}' was not found in dataset columns or detected mapping.")


def get_meteorological_columns(df: pd.DataFrame, mapping: Dict[str, str]) -> List[Tuple[str, str]]:
    """
    Returns list of (raw_col, display_label) for all meteorological numeric columns,
    excluding the date column, prioritizing standardized variables.
    """
    date_col = mapping.get("date")
    result: List[Tuple[str, str]] = []
    seen = set()

    # Add mapped standard variables first
    standard_order = ["temperature", "humidity", "rainfall", "pressure", "wind_speed"]
    for std_key in standard_order:
        raw_col = mapping.get(std_key)
        if raw_col and raw_col in df.columns and raw_col != date_col:
            if pd.api.types.is_numeric_dtype(df[raw_col]) or pd.to_numeric(df[raw_col], errors='coerce').notna().sum() > 0:
                result.append((raw_col, std_key))
                seen.add(raw_col)

    # Add other mapped variables
    for std_key, raw_col in mapping.items():
        if std_key != "date" and raw_col in df.columns and raw_col not in seen:
            if pd.api.types.is_numeric_dtype(df[raw_col]) or pd.to_numeric(df[raw_col], errors='coerce').notna().sum() > 0:
                result.append((raw_col, std_key))
                seen.add(raw_col)

    # Add any remaining numeric columns
    for col in df.columns:
        if col != date_col and col not in seen:
            s_numeric = pd.to_numeric(df[col], errors='coerce')
            if s_numeric.notna().sum() > 0:
                result.append((col, col))
                seen.add(col)

    return result


def compute_distribution(
    df: pd.DataFrame,
    mapping: Dict[str, str],
    variable: str,
    num_bins: int = 20,
) -> Dict[str, Any]:
    """Computes distribution statistics, skewness, kurtosis, and histogram bins for a variable."""
    raw_col, std_key = resolve_column(df, mapping, variable)
    series = pd.to_numeric(df[raw_col], errors='coerce')
    valid_series = series.dropna()

    valid_count = int(len(valid_series))
    missing_count = int(series.isna().sum())

    unit = None
    limits_meta = None
    if std_key and std_key in PHYSICAL_LIMITS:
        unit = PHYSICAL_LIMITS[std_key].get("unit")
        limits_meta = PHYSICAL_LIMITS[std_key]

    if valid_count == 0:
        return {
            "variable": std_key or raw_col,
            "unit": unit,
            "valid_count": 0,
            "missing_count": missing_count,
            "min": None,
            "max": None,
            "mean": None,
            "median": None,
            "std": None,
            "skewness": None,
            "kurtosis": None,
            "physical_limits": limits_meta,
            "bins": [],
        }

    clean_vals = valid_series.to_numpy(dtype=float)
    min_val = float(np.min(clean_vals))
    max_val = float(np.max(clean_vals))
    mean_val = float(np.mean(clean_vals))
    median_val = float(np.median(clean_vals))
    std_val = float(np.std(clean_vals, ddof=1)) if valid_count > 1 else 0.0

    # Skewness and Kurtosis
    if valid_count >= 3 and std_val > 1e-9:
        skew_val = float(stats.skew(clean_vals))
        kurt_val = float(stats.kurtosis(clean_vals, fisher=True))
        if math.isnan(skew_val):
            skew_val = None
        else:
            skew_val = round(skew_val, 4)
        if math.isnan(kurt_val):
            kurt_val = None
        else:
            kurt_val = round(kurt_val, 4)
    else:
        skew_val = 0.0 if valid_count > 0 else None
        kurt_val = 0.0 if valid_count > 0 else None

    # Histogram Bins
    bins: List[Dict[str, Any]] = []
    if min_val == max_val:
        bins.append({
            "bin_start": round(min_val - 0.5, 4),
            "bin_end": round(max_val + 0.5, 4),
            "count": valid_count,
            "percentage": 100.0,
        })
    else:
        actual_bins = min(max(num_bins, 5), 50)
        counts, edges = np.histogram(clean_vals, bins=actual_bins)
        for i in range(len(counts)):
            cnt = int(counts[i])
            pct = round((cnt / valid_count) * 100.0, 2)
            bins.append({
                "bin_start": round(float(edges[i]), 4),
                "bin_end": round(float(edges[i + 1]), 4),
                "count": cnt,
                "percentage": pct,
            })

    return {
        "variable": std_key or raw_col,
        "unit": unit,
        "valid_count": valid_count,
        "missing_count": missing_count,
        "min": round(min_val, 4),
        "max": round(max_val, 4),
        "mean": round(mean_val, 4),
        "median": round(median_val, 4),
        "std": round(std_val, 4),
        "skewness": skew_val,
        "kurtosis": kurt_val,
        "physical_limits": limits_meta,
        "bins": bins,
    }


def compute_correlations(
    df: pd.DataFrame,
    mapping: Dict[str, str],
) -> Dict[str, Any]:
    """
    Computes pairwise complete Pearson correlations across all meteorological variables,
    along with sample sizes (N) for each pair.
    """
    meteo_cols = get_meteorological_columns(df, mapping)
    var_keys = [label for _, label in meteo_cols]
    var_labels = {label: raw for raw, label in meteo_cols}

    n_vars = len(meteo_cols)
    matrix: List[List[Optional[float]]] = [[None for _ in range(n_vars)] for _ in range(n_vars)]
    sample_sizes: List[List[int]] = [[0 for _ in range(n_vars)] for _ in range(n_vars)]

    for i in range(n_vars):
        raw_i, _ = meteo_cols[i]
        s_i = pd.to_numeric(df[raw_i], errors='coerce')
        for j in range(i, n_vars):
            raw_j, _ = meteo_cols[j]
            s_j = pd.to_numeric(df[raw_j], errors='coerce')

            # Pairwise complete rows
            valid_mask = s_i.notna() & s_j.notna()
            n_pair = int(valid_mask.sum())
            sample_sizes[i][j] = n_pair
            sample_sizes[j][i] = n_pair

            if i == j:
                if n_pair >= 2 and float(s_i[valid_mask].std(ddof=1) or 0.0) > 1e-9:
                    matrix[i][j] = 1.0
                elif n_pair > 0:
                    matrix[i][j] = 1.0
                else:
                    matrix[i][j] = None
            else:
                if n_pair >= 2:
                    val_i = s_i[valid_mask].to_numpy(dtype=float)
                    val_j = s_j[valid_mask].to_numpy(dtype=float)
                    std_i = np.std(val_i, ddof=1)
                    std_j = np.std(val_j, ddof=1)
                    if std_i > 1e-9 and std_j > 1e-9:
                        r, _ = stats.pearsonr(val_i, val_j)
                        if not math.isnan(r):
                            r_val = round(float(r), 4)
                            matrix[i][j] = r_val
                            matrix[j][i] = r_val
                        else:
                            matrix[i][j] = None
                            matrix[j][i] = None
                    else:
                        matrix[i][j] = None
                        matrix[j][i] = None
                else:
                    matrix[i][j] = None
                    matrix[j][i] = None

    return {
        "variables": var_keys,
        "variable_labels": var_labels,
        "matrix": matrix,
        "sample_sizes": sample_sizes,
    }


def compute_seasonality(
    df: pd.DataFrame,
    mapping: Dict[str, str],
) -> Dict[str, Any]:
    """Computes 12-month calendar climatology and 4-season comparative statistics."""
    date_col = mapping.get("date")
    if not date_col or date_col not in df.columns:
        raise ValueError("Dataset does not contain a recognized date column for seasonality analysis.")

    dates = pd.to_datetime(df[date_col], errors='coerce')
    if dates.notna().sum() == 0:
        raise ValueError("Date column contains no valid parseable timestamps.")

    meteo_cols = get_meteorological_columns(df, mapping)
    var_keys = [label for _, label in meteo_cols]

    # Pre-parse numeric series
    num_df = pd.DataFrame(index=df.index)
    for raw_col, label in meteo_cols:
        num_df[label] = pd.to_numeric(df[raw_col], errors='coerce')
    num_df["month"] = dates.dt.month

    # 1. 12-Month Profile
    monthly_profile: List[Dict[str, Any]] = []
    for m in range(1, 13):
        m_mask = num_df["month"] == m
        m_sub = num_df[m_mask]
        record_count = int(m_mask.sum())

        metrics: Dict[str, Dict[str, Optional[float]]] = {}
        for _, label in meteo_cols:
            s_var = m_sub[label].dropna()
            if len(s_var) > 0:
                metrics[label] = {
                    "mean": round(float(s_var.mean()), 3),
                    "std": round(float(s_var.std(ddof=1)), 3) if len(s_var) > 1 else 0.0,
                    "min": round(float(s_var.min()), 3),
                    "max": round(float(s_var.max()), 3),
                    "median": round(float(s_var.median()), 3),
                }
            else:
                metrics[label] = {
                    "mean": None,
                    "std": None,
                    "min": None,
                    "max": None,
                    "median": None,
                }

        monthly_profile.append({
            "month": m,
            "month_name": MONTH_NAMES[m - 1],
            "record_count": record_count,
            "metrics": metrics,
        })

    # 2. 4-Season Profile
    seasonal_profile: List[Dict[str, Any]] = []
    for s_def in SEASONS:
        s_mask = num_df["month"].isin(s_def["months"])
        s_sub = num_df[s_mask]
        s_count = int(s_mask.sum())

        s_metrics: Dict[str, Dict[str, Optional[float]]] = {}
        for _, label in meteo_cols:
            s_var = s_sub[label].dropna()
            if len(s_var) > 0:
                s_metrics[label] = {
                    "mean": round(float(s_var.mean()), 3),
                    "std": round(float(s_var.std(ddof=1)), 3) if len(s_var) > 1 else 0.0,
                    "min": round(float(s_var.min()), 3),
                    "max": round(float(s_var.max()), 3),
                    "median": round(float(s_var.median()), 3),
                }
            else:
                s_metrics[label] = {
                    "mean": None,
                    "std": None,
                    "min": None,
                    "max": None,
                    "median": None,
                }

        seasonal_profile.append({
            "season_name": s_def["name"],
            "months": s_def["months"],
            "record_count": s_count,
            "metrics": s_metrics,
        })

    return {
        "available_variables": var_keys,
        "monthly_profile": monthly_profile,
        "seasonal_profile": seasonal_profile,
    }


def compute_timeseries(
    df: pd.DataFrame,
    mapping: Dict[str, str],
    variable: str,
    max_points: int = 600,
) -> Dict[str, Any]:
    """
    Computes chronologically ordered time series with a 7-day rolling mean baseline.
    Preserves raw gaps and missing rainfall.
    """
    date_col = mapping.get("date")
    if not date_col or date_col not in df.columns:
        raise ValueError("Dataset does not contain a recognized date column for time series.")

    raw_col, std_key = resolve_column(df, mapping, variable)
    
    # Sort chronologically
    work_df = pd.DataFrame({
        "raw_date": df[date_col],
        "value": pd.to_numeric(df[raw_col], errors='coerce'),
    })
    work_df["parsed_date"] = pd.to_datetime(work_df["raw_date"], errors='coerce')
    work_df = work_df.dropna(subset=["parsed_date"]).sort_values("parsed_date").reset_index(drop=True)

    total_points = len(work_df)
    if total_points == 0:
        return {
            "variable": std_key or raw_col,
            "unit": PHYSICAL_LIMITS.get(std_key, {}).get("unit"),
            "total_points": 0,
            "sampled": False,
            "points": [],
        }

    # Compute 7-day rolling mean chronologically
    # min_periods=1 ensures initial points are calculated
    work_df["rolling_mean_7d"] = work_df["value"].rolling(window=7, min_periods=1).mean()

    # Format ISO date string
    work_df["date_str"] = work_df["parsed_date"].dt.strftime("%Y-%m-%d")

    # Downsampling if needed for UI performance
    sampled = False
    if total_points > max_points:
        sampled = True
        step = int(math.ceil(total_points / max_points))
        sample_indices = list(range(0, total_points, step))
        if (total_points - 1) not in sample_indices:
            sample_indices.append(total_points - 1)
        sub_df = work_df.iloc[sample_indices]
    else:
        sub_df = work_df

    points: List[Dict[str, Any]] = []
    for _, row in sub_df.iterrows():
        val = None if pd.isna(row["value"]) else round(float(row["value"]), 3)
        roll = None if pd.isna(row["rolling_mean_7d"]) else round(float(row["rolling_mean_7d"]), 3)
        points.append({
            "date": str(row["date_str"]),
            "value": val,
            "rolling_mean_7d": roll,
        })

    unit = PHYSICAL_LIMITS.get(std_key, {}).get("unit") if std_key in PHYSICAL_LIMITS else None

    return {
        "variable": std_key or raw_col,
        "unit": unit,
        "total_points": total_points,
        "sampled": sampled,
        "points": points,
    }


def compute_missingness(
    df: pd.DataFrame,
    mapping: Dict[str, str],
) -> Dict[str, Any]:
    """Computes monthly sensor missingness breakdown and data gaps."""
    date_col = mapping.get("date")
    if not date_col or date_col not in df.columns:
        raise ValueError("Dataset does not contain a recognized date column for missingness analysis.")

    dates = pd.to_datetime(df[date_col], errors='coerce')
    if dates.notna().sum() == 0:
        raise ValueError("Date column contains no valid parseable timestamps.")

    meteo_cols = get_meteorological_columns(df, mapping)
    var_keys = [label for _, label in meteo_cols]
    total_observations = len(df)

    work_df = pd.DataFrame(index=df.index)
    work_df["period"] = dates.dt.strftime("%Y-%m")
    for raw_col, label in meteo_cols:
        work_df[label] = pd.to_numeric(df[raw_col], errors='coerce')

    # Drop invalid dates
    valid_work = work_df.dropna(subset=["period"]).sort_values("period")
    unique_periods = sorted(valid_work["period"].unique().tolist())

    cells: List[Dict[str, Any]] = []
    for period in unique_periods:
        p_df = valid_work[valid_work["period"] == period]
        p_total = len(p_df)
        m_counts: Dict[str, int] = {}
        m_pcts: Dict[str, float] = {}

        for _, label in meteo_cols:
            missing_count = int(p_df[label].isna().sum())
            m_counts[label] = missing_count
            m_pcts[label] = round((missing_count / p_total) * 100.0, 2) if p_total > 0 else 0.0

        cells.append({
            "period": period,
            "total_records": p_total,
            "missing_counts": m_counts,
            "missing_percentages": m_pcts,
        })

    # Overall missingness percentage
    overall_missing_pct: Dict[str, float] = {}
    for _, label in meteo_cols:
        col_missing = int(valid_work[label].isna().sum())
        overall_missing_pct[label] = round((col_missing / total_observations) * 100.0, 2) if total_observations > 0 else 0.0

    return {
        "periods": unique_periods,
        "variables": var_keys,
        "cells": cells,
        "overall_missing_pct": overall_missing_pct,
        "total_observations": total_observations,
    }

