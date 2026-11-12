"""Local Outlier Factor (LOF) Anomaly Detector."""
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import RobustScaler


class LocalOutlierFactorDetector:
    """Density-based outlier detector identifying points with substantially lower local density."""

    def __init__(
        self,
        n_neighbors: int = 20,
        contamination: float = 0.03,
    ):
        self.requested_neighbors = n_neighbors
        self.contamination = contamination

    def detect(
        self,
        df: pd.DataFrame,
        feature_columns: List[str],
    ) -> Dict[str, Any]:
        """Runs LOF on selected feature columns.
        
        Parameters
        ----------
        df : pd.DataFrame
            DataFrame.
        feature_columns : List[str]
            Subset of columns to evaluate.
            
        Returns
        -------
        Dict with flags, normalized anomaly scores, and counts.
        """
        available_cols = [c for c in feature_columns if c in df.columns]
        if not available_cols:
            raise ValueError("No matching feature columns found for Local Outlier Factor.")

        X = df[available_cols].copy()
        imputed_X = X.apply(lambda col: col.fillna(col.median() if col.notna().any() else 0.0))
        n_samples = len(imputed_X)

        # Safe neighborhood adaptation for small datasets
        if n_samples < 5:
            return {
                "detector_name": "lof",
                "features_used": available_cols,
                "flags": np.zeros(n_samples, dtype=int),
                "scores": np.zeros(n_samples, dtype=float),
                "anomaly_count": 0,
            }

        effective_neighbors = min(self.requested_neighbors, max(3, n_samples - 1))

        # Scale features
        scaler = RobustScaler()
        X_scaled = scaler.fit_transform(imputed_X)

        lof = LocalOutlierFactor(
            n_neighbors=effective_neighbors,
            contamination=self.contamination,
            novelty=False,
            n_jobs=-1,
        )
        preds = lof.fit_predict(X_scaled)  # -1 for anomaly, 1 for inlier
        # negative_outlier_factor_: closer to -1 is normal, large negative is outlier
        raw_factors = -lof.negative_outlier_factor_  # ~1 is inlier, >1.5 is outlier

        flags = np.where(preds == -1, 1, 0)

        # Normalize score into [0, 1] range
        min_f, max_f = raw_factors.min(), raw_factors.max()
        if max_f > min_f:
            norm_scores = (raw_factors - min_f) / (max_f - min_f)
        else:
            norm_scores = np.zeros(n_samples)

        all_nan_mask = X.isna().all(axis=1).to_numpy()
        flags[all_nan_mask] = 0
        norm_scores[all_nan_mask] = 0.0

        return {
            "detector_name": "lof",
            "features_used": available_cols,
            "effective_neighbors": effective_neighbors,
            "flags": flags,
            "scores": np.round(norm_scores, 3),
            "anomaly_count": int(flags.sum()),
        }

