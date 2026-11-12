"""Comprehensive meteorological data profiling and statistical exploration module."""
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from app.core.validator import detect_column_mapping, check_physical_violations, PHYSICAL_LIMITS


class DatasetProfiler:
    """Profiles a historical meteorological dataset for data quality, missingness, and sanity."""

    def __init__(self, df: pd.DataFrame, custom_mapping: Optional[Dict[str, str]] = None):
        self.df = df
        self.mapping = custom_mapping or detect_column_mapping(df.columns.tolist())

    def profile(self) -> Dict[str, Any]:
        """Runs the complete profiling pipeline and returns a structured dictionary."""
        total_rows = len(self.df)
        total_cols = len(self.df.columns)
        
        # Duplicate detection
        duplicate_rows = int(self.df.duplicated().sum())
        duplicate_pct = round((duplicate_rows / total_rows * 100), 2) if total_rows > 0 else 0.0

        # Temporal profile
        temporal_profile = self._profile_temporal()

        # Column statistics
        column_stats = self._profile_columns()

        # Physical impossibility check
        invalid_values = check_physical_violations(self.df, self.mapping)

        # Overall quality score (0 to 100)
        overall_score = self._compute_quality_score(column_stats, duplicate_pct, invalid_values)

        return {
            "total_rows": total_rows,
            "total_columns": total_cols,
            "duplicate_rows": duplicate_rows,
            "duplicate_pct": duplicate_pct,
            "temporal_profile": temporal_profile,
            "column_stats": column_stats,
            "invalid_values": invalid_values,
            "detected_mapping": self.mapping,
            "overall_quality_score": overall_score,
        }

    def _profile_temporal(self) -> Dict[str, Any]:
        """Examines the date/timestamp column for range, continuity, and cadence."""
        date_col = self.mapping.get("date")
        if not date_col or date_col not in self.df.columns:
            return {
                "date_column": None,
                "start_date": None,
                "end_date": None,
                "duration_days": 0.0,
                "frequency": "Unknown",
                "has_gaps": False,
                "missing_dates_count": 0,
            }

        try:
            # Parse dates safely
            parsed_dates = pd.to_datetime(self.df[date_col], errors="coerce").dropna().sort_values()
            if len(parsed_dates) == 0:
                return {
                    "date_column": date_col,
                    "start_date": None,
                    "end_date": None,
                    "duration_days": 0.0,
                    "frequency": "Invalid Dates",
                    "has_gaps": True,
                    "missing_dates_count": len(self.df),
                }

            start_dt = parsed_dates.iloc[0]
            end_dt = parsed_dates.iloc[-1]
            duration_days = round((end_dt - start_dt).total_seconds() / 86400.0, 1)

            # Infer frequency
            inferred_freq = pd.infer_freq(parsed_dates)
            freq_label = "Irregular"
            has_gaps = False
            missing_dates = 0

            if inferred_freq:
                if "D" in inferred_freq:
                    freq_label = "Daily"
                elif "h" in inferred_freq or "H" in inferred_freq:
                    freq_label = "Hourly"
                elif "M" in inferred_freq:
                    freq_label = "Monthly"
                else:
                    freq_label = str(inferred_freq)
            else:
                # Approximate cadence from median time delta
                diffs = parsed_dates.diff().dropna()
                if len(diffs) > 0:
                    median_diff_sec = diffs.median().total_seconds()
                    if 82800 <= median_diff_sec <= 90000:
                        freq_label = "Daily (approx)"
                        expected_count = int(duration_days) + 1
                        missing_dates = max(0, expected_count - len(parsed_dates.unique()))
                        has_gaps = missing_dates > 0
                    elif 3500 <= median_diff_sec <= 3700:
                        freq_label = "Hourly (approx)"
                        expected_count = int(duration_days * 24) + 1
                        missing_dates = max(0, expected_count - len(parsed_dates.unique()))
                        has_gaps = missing_dates > 0
                    else:
                        freq_label = "Irregular"
                        has_gaps = True

            return {
                "date_column": date_col,
                "start_date": start_dt.strftime("%Y-%m-%d %H:%M:%S") if start_dt else None,
                "end_date": end_dt.strftime("%Y-%m-%d %H:%M:%S") if end_dt else None,
                "duration_days": duration_days,
                "frequency": freq_label,
                "has_gaps": has_gaps,
                "missing_dates_count": int(missing_dates),
            }
        except Exception:
            return {
                "date_column": date_col,
                "start_date": None,
                "end_date": None,
                "duration_days": 0.0,
                "frequency": "Unparseable",
                "has_gaps": True,
                "missing_dates_count": 0,
            }

    def _profile_columns(self) -> List[Dict[str, Any]]:
        """Calculates per-column data types, nullity, uniqueness, and distributional stats."""
        stats: List[Dict[str, Any]] = []
        reverse_mapping = {v: k for k, v in self.mapping.items()}

        for col in self.df.columns:
            series = self.df[col]
            total = len(series)
            missing = int(series.isna().sum())
            missing_pct = round((missing / total * 100), 2) if total > 0 else 0.0
            unique_count = int(series.nunique(dropna=True))
            std_name = reverse_mapping.get(col)

            stat: Dict[str, Any] = {
                "column": col,
                "dtype": str(series.dtype),
                "standard_name": std_name,
                "missing_count": missing,
                "missing_pct": missing_pct,
                "unique_count": unique_count,
                "min": None,
                "max": None,
                "mean": None,
                "median": None,
                "std": None,
            }

            # Check if column is numeric or can be cast to numeric
            numeric_series = pd.to_numeric(series, errors="coerce").dropna()
            if len(numeric_series) > 0 and (pd.api.types.is_numeric_dtype(series) or std_name != "date"):
                stat["min"] = round(float(numeric_series.min()), 2)
                stat["max"] = round(float(numeric_series.max()), 2)
                stat["mean"] = round(float(numeric_series.mean()), 2)
                stat["median"] = round(float(numeric_series.median()), 2)
                std_val = numeric_series.std()
                stat["std"] = round(float(std_val), 2) if not np.isnan(std_val) else 0.0

            stats.append(stat)

        return stats

    def _compute_quality_score(
        self,
        column_stats: List[Dict[str, Any]],
        duplicate_pct: float,
        invalid_values: List[Dict[str, Any]],
    ) -> float:
        """Derives a normalized 0-100 quality score based on completeness, uniqueness, and sanity."""
        if not column_stats:
            return 0.0

        avg_missing_pct = sum(c["missing_pct"] for c in column_stats) / len(column_stats)
        completeness_score = max(0.0, 100.0 - avg_missing_pct * 2.0)
        uniqueness_score = max(0.0, 100.0 - duplicate_pct * 3.0)

        total_invalid = sum(inv["invalid_count"] for inv in invalid_values)
        total_cells = len(self.df) * max(1, len(self.df.columns))
        invalid_pct = (total_invalid / total_cells * 100.0) if total_cells > 0 else 0.0
        sanity_score = max(0.0, 100.0 - invalid_pct * 10.0)

        overall = (completeness_score * 0.45) + (uniqueness_score * 0.25) + (sanity_score * 0.30)
        return round(float(np.clip(overall, 0.0, 100.0)), 1)

