"""Seasonal Preprocessing & Climatological Baseline Engine.

Computes multi-year day-of-year (DOY) climatological baselines using a ±7-day
circular moving window, isolating genuine anomalies from natural seasonal oscillations.
"""
from typing import Dict, List, Optional, Tuple
import numpy as np
import pandas as pd


class SeasonalClimatologyEngine:
    """Calculates day-of-year seasonal baselines and deviations using a ±7-day circular window."""

    def __init__(self, window_days: int = 7, min_samples_per_window: int = 3):
        self.window_days = window_days
        self.min_samples_per_window = min_samples_per_window

    def fit_transform(
        self,
        df: pd.DataFrame,
        mapping: Dict[str, str],
        target_variables: Optional[List[str]] = None,
    ) -> Tuple[pd.DataFrame, Dict[str, Dict[int, Dict[str, float]]]]:
        """Computes seasonal baselines and appends seasonal expected values and deviations.
        
        Parameters
        ----------
        df : pd.DataFrame
            DataFrame containing 'day_of_year' and meteorological columns.
        mapping : Dict[str, str]
            Standard column mapping.
        target_variables : List[str], optional
            Variables to seasonally baseline (defaults to temperature, humidity, pressure, wind_speed).
            
        Returns
        -------
        Tuple[pd.DataFrame, Dict]
            Seasonally adjusted DataFrame, and lookup table of baseline statistics per DOY.
        """
        out_df = df.copy()
        date_col = mapping.get("date")

        if "day_of_year" not in out_df.columns:
            if date_col and date_col in out_df.columns:
                out_df["day_of_year"] = pd.to_datetime(out_df[date_col], errors="coerce").dt.day_of_year
            else:
                raise ValueError("Day of year could not be determined. Date column missing.")

        # Determine target variables to compute seasonal climatology for
        default_vars = ["temperature", "humidity", "pressure", "wind_speed", "rainfall"]
        vars_to_process = target_variables or [
            std_v for std_v in default_vars if std_v in mapping and mapping[std_v] in out_df.columns
        ]

        baselines: Dict[str, Dict[int, Dict[str, float]]] = {}

        # Precompute circular window index sets for DOY 1..366
        # ±window_days around day d (circular modulo 366)
        doy_windows: Dict[int, List[int]] = {}
        for d in range(1, 367):
            w = []
            for offset in range(-self.window_days, self.window_days + 1):
                target_d = (d + offset - 1) % 366 + 1
                w.append(target_d)
            doy_windows[d] = w

        for std_var in vars_to_process:
            raw_col = mapping[std_var]
            var_series = out_df[raw_col]
            var_baselines: Dict[int, Dict[str, float]] = {}

            # Storage arrays for DataFrame column insertion
            expected_mean_arr = np.full(len(out_df), np.nan)
            expected_std_arr = np.full(len(out_df), np.nan)
            expected_median_arr = np.full(len(out_df), np.nan)
            expected_mad_arr = np.full(len(out_df), np.nan)
            seasonal_dev_arr = np.full(len(out_df), np.nan)
            seasonal_z_arr = np.full(len(out_df), np.nan)
            seasonal_mod_z_arr = np.full(len(out_df), np.nan)

            # Compute baseline stats per unique day of year
            unique_doys = out_df["day_of_year"].dropna().unique().astype(int)

            for d in unique_doys:
                window_doys = doy_windows.get(d, [d])
                # Extract observations across all available years falling in this ±window_days band
                mask = out_df["day_of_year"].isin(window_doys)
                window_vals = var_series[mask].dropna().to_numpy()

                if len(window_vals) < self.min_samples_per_window:
                    # Fallback to full series statistics if insufficient local samples
                    mean_val = float(var_series.mean())
                    std_val = float(var_series.std()) if var_series.std() > 0 else 1.0
                    median_val = float(var_series.median())
                    mad_val = float(np.median(np.abs(var_series.dropna() - median_val))) or 1.0
                else:
                    mean_val = float(np.mean(window_vals))
                    std_val = float(np.std(window_vals, ddof=1)) if len(window_vals) > 1 else 1.0
                    median_val = float(np.median(window_vals))
                    mad_val = float(np.median(np.abs(window_vals - median_val)))

                # Ensure std and MAD are strictly non-zero to avoid division by zero
                std_val = max(std_val, 1e-3)
                mad_val = max(mad_val, 1e-3)

                var_baselines[int(d)] = {
                    "mean": round(mean_val, 3),
                    "std": round(std_val, 3),
                    "median": round(median_val, 3),
                    "mad": round(mad_val, 3),
                    "sample_count": len(window_vals),
                }

            baselines[std_var] = var_baselines

            # Vectorized assignment of deviations and scores
            for i, (doy_val, obs_val) in enumerate(zip(out_df["day_of_year"], var_series)):
                if pd.isna(doy_val) or pd.isna(obs_val):
                    continue
                d = int(doy_val)
                stats = var_baselines.get(d)
                if not stats:
                    continue

                exp_mean = stats["mean"]
                exp_std = stats["std"]
                exp_med = stats["median"]
                exp_mad = stats["mad"]

                dev = obs_val - exp_mean
                z = dev / exp_std
                # Modified Z-score: 0.6745 * (x - median) / MAD
                mod_z = 0.6745 * (obs_val - exp_med) / exp_mad

                expected_mean_arr[i] = exp_mean
                expected_std_arr[i] = exp_std
                expected_median_arr[i] = exp_med
                expected_mad_arr[i] = exp_mad
                seasonal_dev_arr[i] = round(dev, 3)
                seasonal_z_arr[i] = round(z, 3)
                seasonal_mod_z_arr[i] = round(mod_z, 3)

            # Assign columns with clear names
            out_df[f"{std_var}_expected_seasonal_mean"] = expected_mean_arr
            out_df[f"{std_var}_expected_seasonal_std"] = expected_std_arr
            out_df[f"{std_var}_expected_seasonal_median"] = expected_median_arr
            out_df[f"{std_var}_expected_seasonal_mad"] = expected_mad_arr
            out_df[f"{std_var}_seasonal_dev"] = seasonal_dev_arr
            out_df[f"{std_var}_seasonal_zscore"] = seasonal_z_arr
            out_df[f"{std_var}_seasonal_modified_zscore"] = seasonal_mod_z_arr

        return out_df, baselines

