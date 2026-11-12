"""Synthetic Anomaly Injection and Benchmark Evaluation Engine.

Scientific Safeguards:
- Preserves exact ground-truth masks (y_true).
- Uses reproducible random seeds.
- Works on copies, keeping original datasets untouched.
- Enforces variable-specific physical boundaries (PHYSICAL_LIMITS).
- Strictly prevents negative rainfall and preserves rainfall gaps.
- Handles zero-inflated rainfall separately from continuous variables.
- Prevents overlapping injection events and never injects into missing values.
- Point-level and event-level evaluation metrics are computed independently.
"""
import time
from typing import Dict, List, Tuple, Any, Optional
import numpy as np
import pandas as pd

from app.core.validator import PHYSICAL_LIMITS, detect_column_mapping
from app.core.feature_engineering import generate_meteorological_features
from app.core.seasonal import SeasonalClimatologyEngine
from app.core.detectors.ensemble import EnsembleAnomalyDetector
from app.core.detectors.seasonal_zscore import SeasonalZScoreDetector
from app.core.detectors.modified_zscore import ModifiedZScoreDetector
from app.core.detectors.isolation_forest import IsolationForestDetector
from app.core.detectors.lof import LocalOutlierFactorDetector
from app.schemas.evaluation import (
    SyntheticBenchmarkRequest,
    InjectedEventInfo,
    ConfusionMatrix,
    ModelBenchmarkMetrics,
    SyntheticBenchmarkResponse,
)


def calculate_meaningful_min_magnitude(requested_mag: float, sigma: float) -> float:
    """
    Computes the minimum magnitude required for an injected perturbation to be scientifically meaningful.
    Ensures that an injection is never a negligible rounding artifact or near-zero clipping remnant.
    Minimum meaningful magnitude is at least 50% of requested magnitude or 1.0 * sigma, bounded below by 0.05.
    """
    return max(min(1.0 * sigma, 0.5 * abs(requested_mag)), 0.05)


def evaluate_perturbation_candidate(
    original_values: np.ndarray,
    desired_mag: float,
    desired_direction: str,
    sigma: float,
    p_min: float,
    p_max: float,
    is_rainfall: bool,
) -> Optional[Tuple[np.ndarray, float, str, bool]]:
    """
    Evaluates whether a perturbation can be applied to `original_values` within [p_min, p_max].
    
    Rules:
    - Never mark an unchanged observation as injected (every element must achieve delta >= min_magnitude).
    - If requested perturbation exceeds physical limits, adjust within bounds while preserving min_magnitude.
    - If desired direction violates limits, try opposite direction (except for rainfall).
    - For rainfall, negative direction is forbidden and p_min is 0.0.
    - If neither direction can achieve min_magnitude, return None to skip this candidate injection.

    Returns:
        (new_values, effective_mag, actual_direction, was_adjusted) or None
    """
    min_mag = calculate_meaningful_min_magnitude(desired_mag, sigma)
    abs_desired = abs(desired_mag)

    # Determine candidate directions to evaluate
    if is_rainfall:
        candidate_directions = ["positive"]
    else:
        opp_dir = "negative" if desired_direction == "positive" else "positive"
        candidate_directions = [desired_direction, opp_dir]

    for direction in candidate_directions:
        sign = 1.0 if direction == "positive" else -1.0

        if direction == "positive":
            headrooms = p_max - original_values
        else:
            headrooms = original_values - p_min

        # If any element in the event has headroom < min_mag, this direction cannot achieve a meaningful shift
        min_headroom = float(np.min(headrooms))
        if min_headroom < min_mag:
            continue

        # If full perturbation fits
        if min_headroom >= abs_desired:
            effective_mag = abs_desired
            was_adjusted = (direction != desired_direction)
        else:
            # Perturbation adjusted down to maximum achievable headroom while >= min_mag
            effective_mag = min_headroom
            was_adjusted = True

        new_vals = np.round(original_values + sign * effective_mag, 2)
        # Final safety verification: ensure all values are strictly within [p_min, p_max]
        if np.all(new_vals >= p_min - 1e-4) and np.all(new_vals <= p_max + 1e-4):
            # Verify every element actually changed by at least min_mag - 0.01
            deltas = np.abs(new_vals - original_values)
            if np.all(deltas >= (min_mag - 0.01)) and np.all(deltas > 0):
                return new_vals, round(float(effective_mag), 2), direction, was_adjusted

    return None


def inject_synthetic_anomalies(
    df: pd.DataFrame,
    date_col: str,
    raw_col: str,
    std_var: str,
    config: SyntheticBenchmarkRequest,
) -> Tuple[pd.DataFrame, np.ndarray, List[Dict[str, Any]], Dict[str, int]]:
    """
    Injects point spikes, persistent blocks, and step-change anomalies into a copy of df.
    Returns (perturbed_df, y_true_binary_mask, list_of_injected_events, injection_metadata).
    """
    rng = np.random.RandomState(config.seed)
    work_df = df.copy()

    # Extract clean series and identify valid non-missing indices
    s_raw = pd.to_numeric(work_df[raw_col], errors='coerce')
    valid_indices = s_raw.dropna().index.tolist()
    n_samples = len(work_df)

    if len(valid_indices) < 30:
        raise ValueError("Insufficient valid observations for synthetic anomaly injection (minimum 30 required).")

    # Estimate empirical variability (std or MAD)
    vals = s_raw.loc[valid_indices].to_numpy(dtype=float)
    sigma = float(np.std(vals, ddof=1))
    if sigma < 1e-4:
        sigma = 1.0

    # Physical limits for clamping
    limits = PHYSICAL_LIMITS.get(std_var, {})
    p_min = limits.get("min", -9999.0)
    p_max = limits.get("max", 9999.0)
    is_rainfall = (std_var == "rainfall")

    occupied_indices: set = set()
    y_true = np.zeros(n_samples, dtype=int)
    injected_events: List[Dict[str, Any]] = []
    event_counter = 1
    skipped_count = 0
    adjusted_count = 0

    # Buffer helper to avoid adjacent/overlapping event collisions
    def is_region_free(indices: List[int]) -> bool:
        for idx in indices:
            if idx in occupied_indices:
                return False
            for buf in range(max(0, idx - 2), min(n_samples, idx + 3)):
                if buf in occupied_indices:
                    return False
        return True

    # ------------------------------------------------------------------------
    # 1. Step Changes (Calibration Drift / Sensor Offset)
    # ------------------------------------------------------------------------
    if "step" in config.injection_types and config.step_count > 0:
        step_len = max(config.step_length, 5)
        # Choose candidate starts in the interior of the series
        candidate_starts = [i for i in valid_indices if 10 <= i <= (n_samples - step_len - 10)]
        rng.shuffle(candidate_starts)

        steps_placed = 0
        for start_idx in candidate_starts:
            if steps_placed >= config.step_count:
                break
            event_indices = [idx for idx in range(start_idx, start_idx + step_len) if idx in valid_indices]
            if len(event_indices) >= (step_len * 0.7) and is_region_free(event_indices):
                desired_dir = "positive" if (is_rainfall or rng.rand() > 0.5) else "negative"
                desired_mag = config.step_magnitude_sigma * sigma
                orig_vals = work_df[raw_col].iloc[event_indices].to_numpy(dtype=float)

                res = evaluate_perturbation_candidate(
                    original_values=orig_vals,
                    desired_mag=desired_mag,
                    desired_direction=desired_dir,
                    sigma=sigma,
                    p_min=p_min,
                    p_max=p_max,
                    is_rainfall=is_rainfall,
                )

                if res is None:
                    skipped_count += 1
                    continue

                new_vals, effective_mag, actual_dir, was_adjusted = res
                if was_adjusted:
                    adjusted_count += 1

                for i, idx in enumerate(event_indices):
                    work_df.at[idx, raw_col] = float(new_vals[i])
                    y_true[idx] = 1
                    occupied_indices.add(idx)

                dates = [str(work_df.at[idx, date_col]) for idx in event_indices] if date_col in work_df.columns else []
                injected_events.append({
                    "event_id": event_counter,
                    "event_type": "step",
                    "start_date": dates[0] if dates else f"Row {event_indices[0]}",
                    "end_date": dates[-1] if dates else f"Row {event_indices[-1]}",
                    "duration_days": len(event_indices),
                    "injected_indices": event_indices,
                    "injected_dates": dates,
                    "magnitude_applied": effective_mag,
                    "direction": actual_dir,
                    "was_adjusted": was_adjusted,
                })
                event_counter += 1
                steps_placed += 1

    # ------------------------------------------------------------------------
    # 2. Block Anomalies (Persistent Heatwaves / Cold Snaps)
    # ------------------------------------------------------------------------
    if "block" in config.injection_types and config.block_count > 0:
        block_len = max(config.block_length, 2)
        candidate_starts = [i for i in valid_indices if i <= (n_samples - block_len)]
        rng.shuffle(candidate_starts)

        blocks_placed = 0
        for start_idx in candidate_starts:
            if blocks_placed >= config.block_count:
                break
            event_indices = [idx for idx in range(start_idx, start_idx + block_len) if idx in valid_indices]
            if len(event_indices) == block_len and is_region_free(event_indices):
                desired_dir = "positive" if (is_rainfall or rng.rand() > 0.5) else "negative"
                desired_mag = config.block_magnitude_sigma * sigma
                orig_vals = work_df[raw_col].iloc[event_indices].to_numpy(dtype=float)

                res = evaluate_perturbation_candidate(
                    original_values=orig_vals,
                    desired_mag=desired_mag,
                    desired_direction=desired_dir,
                    sigma=sigma,
                    p_min=p_min,
                    p_max=p_max,
                    is_rainfall=is_rainfall,
                )

                if res is None:
                    skipped_count += 1
                    continue

                new_vals, effective_mag, actual_dir, was_adjusted = res
                if was_adjusted:
                    adjusted_count += 1

                for i, idx in enumerate(event_indices):
                    work_df.at[idx, raw_col] = float(new_vals[i])
                    y_true[idx] = 1
                    occupied_indices.add(idx)

                dates = [str(work_df.at[idx, date_col]) for idx in event_indices] if date_col in work_df.columns else []
                injected_events.append({
                    "event_id": event_counter,
                    "event_type": "block",
                    "start_date": dates[0] if dates else f"Row {event_indices[0]}",
                    "end_date": dates[-1] if dates else f"Row {event_indices[-1]}",
                    "duration_days": len(event_indices),
                    "injected_indices": event_indices,
                    "injected_dates": dates,
                    "magnitude_applied": effective_mag,
                    "direction": actual_dir,
                    "was_adjusted": was_adjusted,
                })
                event_counter += 1
                blocks_placed += 1

    # ------------------------------------------------------------------------
    # 3. Point Anomalies (Isolated Spikes)
    # ------------------------------------------------------------------------
    if "point" in config.injection_types and config.point_anomaly_count > 0:
        candidate_points = [i for i in valid_indices if i not in occupied_indices]
        rng.shuffle(candidate_points)

        points_placed = 0
        for idx in candidate_points:
            if points_placed >= config.point_anomaly_count:
                break
            if is_region_free([idx]):
                desired_dir = "positive" if (is_rainfall or rng.rand() > 0.5) else "negative"
                desired_mag = config.spike_magnitude_sigma * sigma
                orig_val = float(work_df.at[idx, raw_col])

                res = evaluate_perturbation_candidate(
                    original_values=np.array([orig_val]),
                    desired_mag=desired_mag,
                    desired_direction=desired_dir,
                    sigma=sigma,
                    p_min=p_min,
                    p_max=p_max,
                    is_rainfall=is_rainfall,
                )

                if res is None:
                    skipped_count += 1
                    continue

                new_vals, effective_mag, actual_dir, was_adjusted = res
                if was_adjusted:
                    adjusted_count += 1

                work_df.at[idx, raw_col] = float(new_vals[0])
                y_true[idx] = 1
                occupied_indices.add(idx)

                d_str = str(work_df.at[idx, date_col]) if date_col in work_df.columns else f"Row {idx}"
                injected_events.append({
                    "event_id": event_counter,
                    "event_type": "point",
                    "start_date": d_str,
                    "end_date": d_str,
                    "duration_days": 1,
                    "injected_indices": [idx],
                    "injected_dates": [d_str],
                    "magnitude_applied": effective_mag,
                    "direction": actual_dir,
                    "was_adjusted": was_adjusted,
                })
                event_counter += 1
                points_placed += 1

    injection_meta = {
        "skipped_injections_count": skipped_count,
        "adjusted_injections_count": adjusted_count,
    }
    return work_df, y_true, injected_events, injection_meta


def compute_benchmark_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    valid_mask: np.ndarray,
    injected_events: List[Dict[str, Any]],
    latency_ms: float,
    detector_name: str,
    display_name: str,
    is_ensemble: bool = False,
) -> ModelBenchmarkMetrics:
    """Calculates point-level confusion matrix and event-level detection delay using calendar-day differences."""
    # Restrict evaluation strictly to valid observations
    yt = y_true[valid_mask]
    yp = y_pred[valid_mask]

    tp = int(np.sum((yt == 1) & (yp == 1)))
    fp = int(np.sum((yt == 0) & (yp == 1)))
    fn = int(np.sum((yt == 1) & (yp == 0)))
    tn = int(np.sum((yt == 0) & (yp == 0)))

    precision = round(tp / (tp + fp), 4) if (tp + fp) > 0 else 0.0
    recall = round(tp / (tp + fn), 4) if (tp + fn) > 0 else 0.0
    f1 = round((2 * precision * recall) / (precision + recall), 4) if (precision + recall) > 0 else 0.0
    fpr = round(fp / (fp + tn), 4) if (fp + tn) > 0 else 0.0

    # Event-level detection delay and detection rate for multi-day events (block and step)
    delays: List[float] = []
    multi_day_events = [e for e in injected_events if e["duration_days"] > 1]
    detected_events_count = 0

    for ev in multi_day_events:
        indices = ev["injected_indices"]
        dates = ev.get("injected_dates", [])
        flags_in_event = [i for i, idx in enumerate(indices) if y_pred[idx] == 1]
        if flags_in_event:
            detected_events_count += 1
            first_pos = flags_in_event[0]

            # Calculate calendar-day difference from event onset to first detected observation
            cal_delay: Optional[float] = None
            if dates and len(dates) == len(indices):
                try:
                    onset_dt = pd.to_datetime(dates[0])
                    detected_dt = pd.to_datetime(dates[first_pos])
                    if pd.notna(onset_dt) and pd.notna(detected_dt):
                        cal_delay = float((detected_dt - onset_dt).days)
                except Exception:
                    cal_delay = None

            if cal_delay is not None and cal_delay >= 0:
                delays.append(cal_delay)
            else:
                delays.append(float(first_pos))

    mean_delay = round(float(np.mean(delays)), 2) if delays else None
    event_det_rate = (
        round((detected_events_count / len(multi_day_events)) * 100.0, 2)
        if multi_day_events else 100.0
    )

    return ModelBenchmarkMetrics(
        detector_name=detector_name,
        display_name=display_name,
        is_ensemble=is_ensemble,
        confusion_matrix=ConfusionMatrix(tp=tp, fp=fp, fn=fn, tn=tn),
        precision=precision,
        recall=recall,
        f1_score=f1,
        false_positive_rate=fpr,
        event_detection_delay_days=mean_delay,
        event_detection_rate=event_det_rate,
        latency_ms=round(latency_ms, 2),
    )


def run_synthetic_benchmark(
    df: pd.DataFrame,
    mapping: Dict[str, str],
    config: SyntheticBenchmarkRequest,
    dataset_id: int,
    dataset_name: str,
) -> SyntheticBenchmarkResponse:
    """
    Executes end-to-end controlled synthetic anomaly injection and benchmarks all 4 models + ensemble.
    """
    if len(df) < 30:
        raise ValueError("Insufficient observations for synthetic anomaly benchmarking (minimum 30 required).")

    date_col = mapping.get("date")
    if not date_col or date_col not in df.columns:
        raise ValueError("Dataset does not contain a recognized date column for benchmarking.")

    target_var = config.primary_variable or "temperature"
    raw_col = mapping.get(target_var)
    if not raw_col or raw_col not in df.columns:
        # Default to first available numeric column
        available = [std for std, raw in mapping.items() if std != "date" and raw in df.columns]
        if not available:
            raise ValueError(f"Variable '{target_var}' is not mapped or present in dataset.")
        target_var = available[0]
        raw_col = mapping[target_var]

    # 1. Inject synthetic anomalies into a clean copy
    perturbed_df, y_true, injected_events, injection_meta = inject_synthetic_anomalies(
        df=df,
        date_col=date_col,
        raw_col=raw_col,
        std_var=target_var,
        config=config,
    )

    s_raw = pd.to_numeric(perturbed_df[raw_col], errors='coerce')
    valid_mask = s_raw.notna().to_numpy()
    total_injected = int(y_true.sum())
    valid_obs = int(valid_mask.sum())
    injection_rate = round((total_injected / valid_obs) * 100.0, 2) if valid_obs > 0 else 0.0

    # 2. Run Feature Engineering & Seasonal Climatology on perturbed data
    feat_df = generate_meteorological_features(perturbed_df, mapping)
    seasonal_engine = SeasonalClimatologyEngine(window_days=7)
    season_df, _ = seasonal_engine.fit_transform(feat_df, mapping)

    # 3. Benchmark Individual Detectors & Ensemble
    models_metrics: List[ModelBenchmarkMetrics] = []

    # Model 1: Seasonal Z-Score
    t0 = time.perf_counter()
    z_det = SeasonalZScoreDetector(threshold=3.0)
    z_col = (
        f"{target_var}_seasonal_zscore"
        if f"{target_var}_seasonal_zscore" in season_df.columns
        else f"{raw_col}_seasonal_zscore"
    )
    z_res = z_det.detect(season_df, variable_name=target_var, z_col=z_col)
    z_lat = (time.perf_counter() - t0) * 1000.0
    models_metrics.append(
        compute_benchmark_metrics(
            y_true=y_true,
            y_pred=z_res["flags"],
            valid_mask=valid_mask,
            injected_events=injected_events,
            latency_ms=z_lat,
            detector_name="seasonal_zscore",
            display_name="Seasonal Z-Score",
            is_ensemble=False,
        )
    )

    # Model 2: Modified Z-Score (MAD)
    t0 = time.perf_counter()
    mad_det = ModifiedZScoreDetector(threshold=3.0)
    mad_col = (
        f"{target_var}_seasonal_modified_zscore"
        if f"{target_var}_seasonal_modified_zscore" in season_df.columns
        else f"{raw_col}_seasonal_modified_zscore"
    )
    mad_res = mad_det.detect(season_df, variable_name=target_var, mod_z_col=mad_col, raw_col=raw_col)
    mad_lat = (time.perf_counter() - t0) * 1000.0
    models_metrics.append(
        compute_benchmark_metrics(
            y_true=y_true,
            y_pred=mad_res["flags"],
            valid_mask=valid_mask,
            injected_events=injected_events,
            latency_ms=mad_lat,
            detector_name="modified_zscore",
            display_name="Modified Z-Score (MAD)",
            is_ensemble=False,
        )
    )

    # Prepare ML Features
    ml_candidates = [
        f"{target_var}_seasonal_dev",
        f"{target_var}_seasonal_zscore",
        f"{raw_col}_seasonal_dev",
        f"{raw_col}_seasonal_zscore",
        "pressure_diff_1d",
        "humidity_diff_1d",
        "wind_diff_1d",
        "rain_cumulative_3d",
        "temp_diff_1d",
    ]
    for std_var in ["temperature", "humidity", "pressure", "wind_speed"]:
        dev_col_name = f"{std_var}_seasonal_dev"
        if dev_col_name in season_df.columns and dev_col_name not in ml_candidates:
            ml_candidates.append(dev_col_name)
    feature_cols = list(dict.fromkeys([c for c in ml_candidates if c in season_df.columns]))
    if not feature_cols:
        feature_cols = [raw_col]

    # Model 3: Isolation Forest
    t0 = time.perf_counter()
    if_det = IsolationForestDetector(contamination=0.03, random_state=config.seed)
    if_res = if_det.detect(season_df, feature_columns=feature_cols)
    if_lat = (time.perf_counter() - t0) * 1000.0
    models_metrics.append(
        compute_benchmark_metrics(
            y_true=y_true,
            y_pred=if_res["flags"],
            valid_mask=valid_mask,
            injected_events=injected_events,
            latency_ms=if_lat,
            detector_name="isolation_forest",
            display_name="Isolation Forest",
            is_ensemble=False,
        )
    )

    # Model 4: Local Outlier Factor (LOF)
    t0 = time.perf_counter()
    lof_det = LocalOutlierFactorDetector(contamination=0.03)
    lof_res = lof_det.detect(season_df, feature_columns=feature_cols)
    lof_lat = (time.perf_counter() - t0) * 1000.0
    models_metrics.append(
        compute_benchmark_metrics(
            y_true=y_true,
            y_pred=lof_res["flags"],
            valid_mask=valid_mask,
            injected_events=injected_events,
            latency_ms=lof_lat,
            detector_name="lof",
            display_name="Local Outlier Factor (LOF)",
            is_ensemble=False,
        )
    )

    # Model 5: Consensus Ensemble
    t0 = time.perf_counter()
    ensemble_det = EnsembleAnomalyDetector(
        z_threshold=3.0,
        mad_threshold=3.0,
        iforest_contamination=0.03,
        lof_contamination=0.03,
    )
    ens_res = ensemble_det.run(season_df, mapping, primary_variable=target_var)
    ens_lat = (time.perf_counter() - t0) * 1000.0

    # Confirmed anomalies (>=2 votes) for ensemble flag mask
    ens_flags = np.array([
        1 if r["classification"] in ["confirmed", "potential"] else 0
        for r in ens_res["all_records"]
    ])
    models_metrics.append(
        compute_benchmark_metrics(
            y_true=y_true,
            y_pred=ens_flags,
            valid_mask=valid_mask,
            injected_events=injected_events,
            latency_ms=ens_lat,
            detector_name="ensemble",
            display_name="Consensus Ensemble",
            is_ensemble=True,
        )
    )

    injected_events_schemas = [
        InjectedEventInfo(
            event_id=e["event_id"],
            event_type=e["event_type"],
            start_date=e["start_date"],
            end_date=e["end_date"],
            duration_days=e["duration_days"],
            injected_indices=e["injected_indices"],
            magnitude_applied=e["magnitude_applied"],
            direction=e["direction"],
            was_adjusted=e.get("was_adjusted", False),
        )
        for e in injected_events
    ]

    return SyntheticBenchmarkResponse(
        dataset_id=dataset_id,
        dataset_name=dataset_name,
        primary_variable=target_var,
        total_records=len(df),
        valid_observations=valid_obs,
        total_injected_points=total_injected,
        injection_rate_pct=injection_rate,
        skipped_injections_count=injection_meta.get("skipped_injections_count", 0),
        adjusted_injections_count=injection_meta.get("adjusted_injections_count", 0),
        injected_events=injected_events_schemas,
        models=models_metrics,
        scientific_disclosure=(
            "Benchmark Ground-Truth Assumption: Observations without injected synthetic perturbations "
            "are treated as true negatives for mathematical benchmarking. Any genuine natural weather extremes "
            "already present in the historical observational record will be registered as false positives under "
            "this benchmark definition. Precision, Recall, and F1 reflect empirical sensitivity to calibrated "
            "mathematical departures and should not be confused with ungrounded real-world accuracy."
        ),
    )

