"""Modular weather data wrangling, cleaning, and preprocessing engine."""
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
import numpy as np
import pandas as pd
from app.core.validator import detect_column_mapping, PHYSICAL_LIMITS, check_physical_violations


class WeatherDataWrangler:
    """Preprocesses and cleans weather data according to strict meteorological standards."""

    def __init__(
        self,
        df: pd.DataFrame,
        mapping: Optional[Dict[str, str]] = None,
        remove_duplicates: bool = True,
        missing_strategy: str = "linear",  # for continuous variables (temp, humidity, pressure, wind)
        rainfall_strategy: str = "preserve",  # "preserve" (default: leaves as NaN to avoid false dry days) or "zero_fill"
        filter_physically_impossible: bool = False,
        sort_chronologically: bool = True,
    ):
        self.raw_df = df.copy()
        self.mapping = mapping or detect_column_mapping(df.columns.tolist())
        self.remove_duplicates = remove_duplicates
        self.missing_strategy = missing_strategy
        self.rainfall_strategy = rainfall_strategy
        self.filter_physically_impossible = filter_physically_impossible
        self.sort_chronologically = sort_chronologically
        self.operations_log: List[Dict[str, Any]] = []

    def wrangle(self) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """Executes the wrangling pipeline and returns the cleaned DataFrame along with summary."""
        df = self.raw_df.copy()
        rows_before = len(df)
        self.operations_log = []

        # 1. Date parsing & Chronological Sorting
        df = self._process_datetime(df)

        # 2. Duplicate detection and removal
        df, duplicates_removed = self._handle_duplicates(df)

        # 3. Numeric Data Type Coercion
        df = self._coerce_numeric_types(df)

        # 4. Physical Impossibility Check & Sanitization
        df, invalid_flagged = self._handle_physical_limits(df)

        # 5. Missing Value Treatment (STRICT RULE: Rainfall is NEVER interpolated)
        df, missing_treated, rain_treatment = self._treat_missing_values(df)

        rows_after = len(df)

        summary = {
            "rows_before": rows_before,
            "rows_after": rows_after,
            "duplicates_removed": duplicates_removed,
            "missing_treated": missing_treated,
            "invalid_flagged": invalid_flagged,
            "rainfall_non_interpolated": True,
            "rainfall_treatment_applied": rain_treatment,
            "temporal_gaps_identified": self._count_temporal_gaps(df),
            "operations_log": self.operations_log,
            "created_at": datetime.utcnow().isoformat(),
        }

        return df, summary

    def _process_datetime(self, df: pd.DataFrame) -> pd.DataFrame:
        """Parses date column into standardized UTC-naive datetime and sorts chronologically."""
        date_col = self.mapping.get("date")
        if not date_col or date_col not in df.columns:
            self.operations_log.append({
                "step": "Date Processing",
                "action": "Skipped",
                "details": "No date column mapped or identified.",
                "records_affected": 0,
            })
            return df

        try:
            df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
            unparseable = int(df[date_col].isna().sum())

            if unparseable > 0:
                self.operations_log.append({
                    "step": "Date Parsing",
                    "action": "Flagged Unparseable Dates",
                    "details": f"Found {unparseable} records with invalid datetime formats.",
                    "records_affected": unparseable,
                })

            if self.sort_chronologically:
                df = df.sort_values(by=date_col, ascending=True).reset_index(drop=True)
                self.operations_log.append({
                    "step": "Chronological Sorting",
                    "action": "Sorted Ascending",
                    "details": f"Dataset ordered chronologically by '{date_col}'.",
                    "records_affected": len(df),
                })
        except Exception as exc:
            self.operations_log.append({
                "step": "Date Processing",
                "action": "Error Handled",
                "details": f"Encountered error parsing dates: {str(exc)}",
                "records_affected": 0,
            })

        return df

    def _handle_duplicates(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
        """Removes exact duplicate rows or duplicate timestamps while keeping the earliest."""
        if not self.remove_duplicates:
            return df, 0

        date_col = self.mapping.get("date")
        if date_col and date_col in df.columns:
            dup_mask = df.duplicated(subset=[date_col], keep="first")
        else:
            dup_mask = df.duplicated(keep="first")

        dup_count = int(dup_mask.sum())
        if dup_count > 0:
            df = df[~dup_mask].reset_index(drop=True)
            self.operations_log.append({
                "step": "Duplicate Removal",
                "action": "Dropped Duplicates",
                "details": f"Removed {dup_count} duplicate timestamp records, preserving initial reading.",
                "records_affected": dup_count,
            })

        return df, dup_count

    def _coerce_numeric_types(self, df: pd.DataFrame) -> pd.DataFrame:
        """Converts weather metric columns into standard float64."""
        date_col = self.mapping.get("date")
        for col in df.columns:
            if col == date_col:
                continue
            converted = pd.to_numeric(df[col], errors="coerce")
            if converted.notna().sum() / max(1, len(df)) >= 0.4:
                df[col] = converted

        return df

    def _handle_physical_limits(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, int]]:
        """Identifies physical impossibilities (e.g. negative rainfall or humidity > 100%)."""
        invalid_flagged: Dict[str, int] = {}

        for std_name, raw_col in self.mapping.items():
            if std_name not in PHYSICAL_LIMITS or raw_col not in df.columns:
                continue

            limits = PHYSICAL_LIMITS[std_name]
            series = pd.to_numeric(df[raw_col], errors="coerce")
            min_val, max_val = limits["min"], limits["max"]

            viol_mask = (series < min_val) | (series > max_val)
            viol_count = int(viol_mask.sum())
            invalid_flagged[raw_col] = viol_count

            if viol_count > 0:
                if self.filter_physically_impossible:
                    df.loc[viol_mask, raw_col] = np.nan
                    self.operations_log.append({
                        "step": "Physical Validation",
                        "action": "Nullified Impossible Values",
                        "details": f"Replaced {viol_count} physically impossible values in '{raw_col}' with NaN.",
                        "records_affected": viol_count,
                    })
                else:
                    self.operations_log.append({
                        "step": "Physical Validation",
                        "action": "Logged Sensor Anomalies",
                        "details": f"Flagged {viol_count} readings in '{raw_col}' outside physical envelope ({min_val} to {max_val} {limits['unit']}). Preserved original data.",
                        "records_affected": viol_count,
                    })

        return df, invalid_flagged

    def _treat_missing_values(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, int], str]:
        """Imputes missing values with strict domain protection: RAINFALL IS NEVER INTERPOLATED."""
        missing_treated: Dict[str, int] = {}
        rainfall_col = self.mapping.get("rainfall")
        date_col = self.mapping.get("date")
        rain_treatment = "none"

        for col in df.columns:
            if col == date_col:
                continue

            missing_count = int(df[col].isna().sum())
            if missing_count == 0:
                continue

            # MANDATORY RULE: Rainfall/Precipitation must NEVER be interpolated!
            if col == rainfall_col:
                if self.rainfall_strategy == "zero_fill":
                    df[col] = df[col].fillna(0.0)
                    missing_treated[col] = missing_count
                    rain_treatment = "zero_filled"
                    self.operations_log.append({
                        "step": "Precipitation Missing Treatment",
                        "action": "Zero-Filled (Explicit User Choice)",
                        "details": f"User-selected zero-fill: {missing_count} missing rainfall records filled with 0.0 mm without interpolation.",
                        "records_affected": missing_count,
                    })
                else:
                    # DEFAULT: PRESERVE MISSING
                    # Preserving missing values avoids fabricating false dry days in climatology.
                    missing_treated[col] = 0
                    rain_treatment = "preserved_nan"
                    self.operations_log.append({
                        "step": "Precipitation Missing Treatment",
                        "action": "Preserved NaN (Never Interpolated)",
                        "details": f"Meteorological standard enforced: {missing_count} missing rainfall records preserved as NaN without interpolation to avoid introducing false dry days.",
                        "records_affected": missing_count,
                    })
                continue

            # Continuous variables: Temperature, Humidity, Pressure, Wind Speed
            if self.missing_strategy == "linear":
                df[col] = df[col].interpolate(method="linear", limit_direction="both")
                missing_treated[col] = missing_count
                self.operations_log.append({
                    "step": "Continuous Imputation",
                    "action": "Linear Interpolation",
                    "details": f"Imputed {missing_count} missing values in '{col}' using temporal linear interpolation.",
                    "records_affected": missing_count,
                })
            elif self.missing_strategy == "forward_fill":
                df[col] = df[col].ffill().bfill()
                missing_treated[col] = missing_count
                self.operations_log.append({
                    "step": "Continuous Imputation",
                    "action": "Forward/Backward Fill",
                    "details": f"Filled {missing_count} missing values in '{col}' via forward propagation.",
                    "records_affected": missing_count,
                })
            elif self.missing_strategy == "median":
                med_val = df[col].median()
                df[col] = df[col].fillna(med_val)
                missing_treated[col] = missing_count
                self.operations_log.append({
                    "step": "Continuous Imputation",
                    "action": "Median Replacement",
                    "details": f"Replaced {missing_count} missing values in '{col}' with column median ({round(med_val, 2)}).",
                    "records_affected": missing_count,
                })

        return df, missing_treated, rain_treatment

    def _count_temporal_gaps(self, df: pd.DataFrame) -> int:
        """Counts date discontinuities in the time series."""
        date_col = self.mapping.get("date")
        if not date_col or date_col not in df.columns:
            return 0

        dates = pd.to_datetime(df[date_col], errors="coerce").dropna()
        if len(dates) < 2:
            return 0

        diffs = dates.diff().dropna()
        median_step = diffs.median()
        gaps = (diffs > (median_step * 1.5)).sum()
        return int(gaps)
