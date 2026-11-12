"""Ensemble Anomaly Classification & Severity Scoring Engine."""
import time
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd

from app.core.detectors.seasonal_zscore import SeasonalZScoreDetector
from app.core.detectors.modified_zscore import ModifiedZScoreDetector
from app.core.detectors.isolation_forest import IsolationForestDetector
from app.core.detectors.lof import LocalOutlierFactorDetector


class EnsembleAnomalyDetector:
    """Combines Seasonal Z, Modified Z (MAD), Isolation Forest, and LOF consensus voting."""

    def __init__(
        self,
        z_threshold: float = 3.0,
        mad_threshold: float = 3.0,
        iforest_contamination: float = 0.03,
        lof_contamination: float = 0.03,
    ):
        self.z_detector = SeasonalZScoreDetector(threshold=z_threshold)
        self.mad_detector = ModifiedZScoreDetector(threshold=mad_threshold)
        self.iforest_detector = IsolationForestDetector(contamination=iforest_contamination)
        self.lof_detector = LocalOutlierFactorDetector(contamination=lof_contamination)

    def run(
        self,
        df: pd.DataFrame,
        mapping: Dict[str, str],
        primary_variable: str = "temperature",
    ) -> Dict[str, Any]:
        """Runs all 4 detectors and synthesizes consensus classification and severity."""
        n_samples = len(df)
        date_col = mapping.get("date")
        raw_target_col = mapping.get(primary_variable)

        # 1. Run Seasonal Z-score
        t0 = time.perf_counter()
        z_col = (
            f"{primary_variable}_seasonal_zscore"
            if f"{primary_variable}_seasonal_zscore" in df.columns
            else (f"{raw_target_col}_seasonal_zscore" if raw_target_col and f"{raw_target_col}_seasonal_zscore" in df.columns else None)
        )
        z_res = self.z_detector.detect(df, variable_name=primary_variable, z_col=z_col)
        z_latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        z_flags = z_res["flags"]
        z_scores = z_res["scores"]

        # 2. Run Modified Z-score (MAD)
        t0 = time.perf_counter()
        mad_col = (
            f"{primary_variable}_seasonal_modified_zscore"
            if f"{primary_variable}_seasonal_modified_zscore" in df.columns
            else (f"{raw_target_col}_seasonal_modified_zscore" if raw_target_col and f"{raw_target_col}_seasonal_modified_zscore" in df.columns else None)
        )
        mad_res = self.mad_detector.detect(
            df,
            variable_name=primary_variable,
            mod_z_col=mad_col,
            raw_col=raw_target_col,
        )
        mad_latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        mad_flags = mad_res["flags"]
        mad_scores = mad_res["scores"]

        # 3. Select multivariable features for ML detectors
        ml_candidates = [
            f"{primary_variable}_seasonal_dev",
            f"{primary_variable}_seasonal_zscore",
            f"{raw_target_col}_seasonal_dev" if raw_target_col else None,
            f"{raw_target_col}_seasonal_zscore" if raw_target_col else None,
            "pressure_diff_1d",
            "humidity_diff_1d",
            "wind_diff_1d",
            "rain_cumulative_3d",
            "temp_diff_1d",
        ]
        # Include seasonal deviations of any mapped variable
        for std_var in ["temperature", "humidity", "pressure", "wind_speed"]:
            dev_col_name = f"{std_var}_seasonal_dev"
            if dev_col_name in df.columns and dev_col_name not in ml_candidates:
                ml_candidates.append(dev_col_name)

        feature_cols = list(dict.fromkeys([c for c in ml_candidates if c and c in df.columns]))
        if not feature_cols and raw_target_col and raw_target_col in df.columns:
            feature_cols = [raw_target_col]
        elif not feature_cols:
            # Fall back to any numeric column
            feature_cols = df.select_dtypes(include=[np.number]).columns.tolist()

        # 4. Run Isolation Forest
        t0 = time.perf_counter()
        if_res = self.iforest_detector.detect(df, feature_columns=feature_cols)
        if_latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        if_flags = if_res["flags"]
        if_scores = if_res["scores"]

        # 5. Run Local Outlier Factor
        t0 = time.perf_counter()
        lof_res = self.lof_detector.detect(df, feature_columns=feature_cols)
        lof_latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        lof_flags = lof_res["flags"]
        lof_scores = lof_res["scores"]

        # 6. Ensemble Voting & Consensus Classification
        vote_matrix = np.column_stack([z_flags, mad_flags, if_flags, lof_flags])
        vote_counts = vote_matrix.sum(axis=1)

        exp_mean_col = (
            f"{primary_variable}_expected_seasonal_mean"
            if f"{primary_variable}_expected_seasonal_mean" in df.columns
            else (f"{raw_target_col}_expected_seasonal_mean" if raw_target_col and f"{raw_target_col}_expected_seasonal_mean" in df.columns else None)
        )
        dev_col = (
            f"{primary_variable}_seasonal_dev"
            if f"{primary_variable}_seasonal_dev" in df.columns
            else (f"{raw_target_col}_seasonal_dev" if raw_target_col and f"{raw_target_col}_seasonal_dev" in df.columns else None)
        )

        expected_vals = df[exp_mean_col].to_numpy() if exp_mean_col and exp_mean_col in df.columns else np.full(n_samples, np.nan)
        deviations = df[dev_col].to_numpy() if dev_col and dev_col in df.columns else np.full(n_samples, np.nan)
        observed_vals = df[raw_target_col].to_numpy() if raw_target_col and raw_target_col in df.columns else np.full(n_samples, np.nan)
        dates = df[date_col].astype(str).to_numpy() if date_col and date_col in df.columns else np.array([f"Row {i}" for i in range(n_samples)])

        records: List[Dict[str, Any]] = []
        confirmed_count = 0
        potential_count = 0
        normal_count = 0
        extreme_count = 0
        high_count = 0
        moderate_count = 0

        for i in range(n_samples):
            v_count = int(vote_counts[i])
            flagged_by: List[str] = []
            if z_flags[i] == 1:
                flagged_by.append("seasonal_zscore")
            if mad_flags[i] == 1:
                flagged_by.append("modified_zscore")
            if if_flags[i] == 1:
                flagged_by.append("isolation_forest")
            if lof_flags[i] == 1:
                flagged_by.append("lof")

            # Classification rules per ClimaSentinel blueprint:
            # Confirmed: >= 2 detectors
            # Potential: exactly 1 detector
            # Normal: 0 detectors
            if v_count >= 2:
                classification = "confirmed"
                confirmed_count += 1
            elif v_count == 1:
                classification = "potential"
                potential_count += 1
            else:
                classification = "normal"
                normal_count += 1

            abs_z = abs(z_scores[i]) if not np.isnan(z_scores[i]) else 0.0
            abs_mad = abs(mad_scores[i]) if not np.isnan(mad_scores[i]) else 0.0

            if classification == "normal":
                severity = "none"
            elif v_count >= 3 or abs_z >= 4.0 or abs_mad >= 4.5:
                severity = "extreme"
                extreme_count += 1
            elif v_count == 2 or abs_z >= 3.5:
                severity = "high"
                high_count += 1
            else:
                severity = "moderate"
                moderate_count += 1

            rec = {
                "index": i,
                "date": dates[i],
                "variable": primary_variable,
                "observed_value": round(float(observed_vals[i]), 2) if not np.isnan(observed_vals[i]) else None,
                "expected_value": round(float(expected_vals[i]), 2) if not np.isnan(expected_vals[i]) else None,
                "deviation": round(float(deviations[i]), 2) if not np.isnan(deviations[i]) else None,
                "z_score": round(float(z_scores[i]), 2) if not np.isnan(z_scores[i]) else 0.0,
                "modified_z_score": round(float(mad_scores[i]), 2) if not np.isnan(mad_scores[i]) else 0.0,
                "iforest_score": round(float(if_scores[i]), 3),
                "lof_score": round(float(lof_scores[i]), 3),
                "flag_count": v_count,
                "flagged_by": flagged_by,
                "classification": classification,
                "severity": severity,
            }
            records.append(rec)

        anomalies_only = [r for r in records if r["classification"] in ["confirmed", "potential"]]

        return {
            "total_records": n_samples,
            "confirmed_count": confirmed_count,
            "potential_count": potential_count,
            "normal_count": normal_count,
            "severity_breakdown": {
                "extreme": extreme_count,
                "high": high_count,
                "moderate": moderate_count,
                "none": normal_count,
            },
            "detector_breakdown": {
                "seasonal_zscore": int(z_flags.sum()),
                "modified_zscore": int(mad_flags.sum()),
                "isolation_forest": int(if_flags.sum()),
                "lof": int(lof_flags.sum()),
            },
            "detector_timings": {
                "seasonal_zscore": z_latency_ms,
                "modified_zscore": mad_latency_ms,
                "isolation_forest": if_latency_ms,
                "lof": lof_latency_ms,
            },
            "anomalies": anomalies_only,
            "all_records": records,
        }
