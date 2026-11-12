"""Seasonal Z-score Anomaly Detector."""
from typing import Dict, Any, Optional
import numpy as np
import pandas as pd


class SeasonalZScoreDetector:
    """Detects statistical departures from Day-Of-Year climatological distributions."""

    def __init__(self, threshold: float = 3.0):
        self.threshold = threshold

    def detect(
        self,
        df: pd.DataFrame,
        variable_name: str,
        z_col: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Detects anomalies where |Seasonal Z-score| >= threshold."""
        col = z_col
        if not col or col not in df.columns:
            candidates = [
                f"{variable_name}_seasonal_zscore",
                f"{variable_name}_zscore",
                "seasonal_zscore",
            ]
            for c in candidates:
                if c in df.columns:
                    col = c
                    break

        if not col or col not in df.columns:
            raise ValueError(f"Seasonal Z-score column not found for variable '{variable_name}'.")

        z_scores = pd.to_numeric(df[col], errors="coerce").to_numpy()
        valid_mask = ~np.isnan(z_scores)

        flags = np.zeros(len(df), dtype=int)
        # Anomaly condition: |Z| >= threshold (strictly on valid observations)
        anomaly_mask = valid_mask & (np.abs(z_scores) >= self.threshold)
        flags[anomaly_mask] = 1

        scores = np.abs(np.nan_to_num(z_scores, nan=0.0))

        return {
            "detector_name": "seasonal_zscore",
            "variable": variable_name,
            "threshold": self.threshold,
            "flags": flags,
            "scores": np.round(scores, 3),
            "anomaly_count": int(anomaly_mask.sum()),
            "high_anomalies": int((valid_mask & (z_scores >= self.threshold)).sum()),
            "low_anomalies": int((valid_mask & (z_scores <= -self.threshold)).sum()),
        }
