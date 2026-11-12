"""Isolation Forest Machine Learning Anomaly Detector."""
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import RobustScaler


class IsolationForestDetector:
    """Multivariate anomaly detector isolating meteorological anomalies in feature space."""

    def __init__(
        self,
        contamination: float = 0.03,
        n_estimators: int = 150,
        random_state: int = 42,
    ):
        self.contamination = contamination
        self.n_estimators = n_estimators
        self.random_state = random_state

    def detect(
        self,
        df: pd.DataFrame,
        feature_columns: List[str],
    ) -> Dict[str, Any]:
        """Runs Isolation Forest on selected normalized features.
        
        Parameters
        ----------
        df : pd.DataFrame
            DataFrame with feature columns.
        feature_columns : List[str]
            Subset of columns to evaluate (e.g. seasonal deviations, pressure diffs).
            
        Returns
        -------
        Dict with flags, normalized anomaly scores (0 to 1), and counts.
        """
        available_cols = [c for c in feature_columns if c in df.columns]
        if not available_cols:
            raise ValueError("No matching feature columns found for Isolation Forest.")

        X = df[available_cols].copy()
        # Impute temporary median for missing entries during ML matrix calculation
        imputed_X = X.apply(lambda col: col.fillna(col.median() if col.notna().any() else 0.0))

        # Check sample size
        n_samples = len(imputed_X)
        if n_samples < 5:
            return {
                "detector_name": "isolation_forest",
                "features_used": available_cols,
                "flags": np.zeros(n_samples, dtype=int),
                "scores": np.zeros(n_samples, dtype=float),
                "anomaly_count": 0,
            }

        # Normalize features with RobustScaler (resilient to existing anomalies)
        scaler = RobustScaler()
        X_scaled = scaler.fit_transform(imputed_X)

        # Train Isolation Forest
        model = IsolationForest(
            n_estimators=self.n_estimators,
            contamination=self.contamination,
            random_state=self.random_state,
            n_jobs=-1,
        )
        preds = model.fit_predict(X_scaled)  # -1 for anomaly, 1 for inlier
        raw_scores = model.decision_function(X_scaled)  # Lower is more abnormal

        # Convert to 1 for anomaly, 0 for normal
        flags = np.where(preds == -1, 1, 0)

        # Normalize score into [0, 1] range where 1 is highest anomaly probability
        # Invert raw scores: raw_scores < 0 are anomalies
        min_s, max_s = raw_scores.min(), raw_scores.max()
        if max_s > min_s:
            norm_scores = 1.0 - ((raw_scores - min_s) / (max_s - min_s))
        else:
            norm_scores = np.zeros(n_samples)

        # Mask rows that had all features missing originally
        all_nan_mask = X.isna().all(axis=1).to_numpy()
        flags[all_nan_mask] = 0
        norm_scores[all_nan_mask] = 0.0

        return {
            "detector_name": "isolation_forest",
            "features_used": available_cols,
            "contamination": self.contamination,
            "flags": flags,
            "scores": np.round(norm_scores, 3),
            "anomaly_count": int(flags.sum()),
        }

