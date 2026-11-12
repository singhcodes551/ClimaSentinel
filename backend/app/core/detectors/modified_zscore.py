"""Modified Z-score (Median Absolute Deviation - MAD) Anomaly Detector."""
from typing import Dict, Any, Optional
import numpy as np
import pandas as pd


class ModifiedZScoreDetector:
    """Detects robust outliers using Median Absolute Deviation (MAD), resilient to extreme skew."""

    def __init__(self, threshold: float = 3.0):
        self.threshold = threshold

    def detect(
        self,
        df: pd.DataFrame,
        variable_name: str,
        mod_z_col: Optional[str] = None,
        raw_col: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Detects anomalies where |Modified Z-score| >= threshold."""
        col = mod_z_col
        if not col or col not in df.columns:
            candidates = [
                f"{variable_name}_seasonal_modified_zscore",
                f"{variable_name}_modified_zscore",
                "seasonal_modified_zscore",
            ]
            for c in candidates:
                if c in df.columns:
                    col = c
                    break

        if col and col in df.columns:
            mod_z_scores = pd.to_numeric(df[col], errors="coerce").to_numpy()
        elif raw_col and raw_col in df.columns:
            series = pd.to_numeric(df[raw_col], errors="coerce").to_numpy()
            valid = series[~np.isnan(series)]
            if len(valid) == 0:
                mod_z_scores = np.full(len(df), np.nan)
            else:
                med = np.median(valid)
                mad = np.median(np.abs(valid - med)) or 1e-3
                mod_z_scores = 0.6745 * (series - med) / mad
        else:
            raise ValueError(f"Modified Z-score column not found for variable '{variable_name}'.")

        valid_mask = ~np.isnan(mod_z_scores)
        flags = np.zeros(len(df), dtype=int)
        anomaly_mask = valid_mask & (np.abs(mod_z_scores) >= self.threshold)
        flags[anomaly_mask] = 1

        scores = np.abs(np.nan_to_num(mod_z_scores, nan=0.0))

        return {
            "detector_name": "modified_zscore",
            "variable": variable_name,
            "threshold": self.threshold,
            "flags": flags,
            "scores": np.round(scores, 3),
            "anomaly_count": int(anomaly_mask.sum()),
            "high_anomalies": int((valid_mask & (mod_z_scores >= self.threshold)).sum()),
            "low_anomalies": int((valid_mask & (mod_z_scores <= -self.threshold)).sum()),
        }
