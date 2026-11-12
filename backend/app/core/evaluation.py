"""Core analytical engine for Model Comparison and Agreement Evaluation."""
import numpy as np
from typing import Dict, List, Any, Optional

from app.schemas.evaluation import (
    DetectorComparisonMetric,
    PairwiseAgreementItem,
    EnsembleComparisonSummary,
    RunComparisonResponse,
)

BASE_DETECTORS = ["seasonal_zscore", "modified_zscore", "isolation_forest", "lof"]

DETECTOR_DISPLAY_NAMES = {
    "seasonal_zscore": "Seasonal Z-Score",
    "modified_zscore": "Modified Z-Score (MAD)",
    "isolation_forest": "Isolation Forest",
    "lof": "Local Outlier Factor (LOF)",
    "ensemble": "Consensus Ensemble",
}


def compute_run_comparison(anomaly_run: Any) -> RunComparisonResponse:
    """
    Computes individual detector metrics, consensus corroboration,
    and pairwise Jaccard similarity matrices from an existing AnomalyRun.
    
    Scientific Safeguards:
    - Corroboration is calculated strictly across the 4 base detectors.
    - Ensemble is kept as an independent reference comparison.
    - Solo flags + corroborated flags strictly equals each detector's total flag count.
    - Historical latency is returned as None if unrecorded (no fabricated runtimes).
    """
    total_records = anomaly_run.total_records or 1
    anomalies_data = anomaly_run.anomalies_data or []
    timings = (anomaly_run.config or {}).get("detector_timings") or {}

    # Map each base detector to set of flagged record indices
    detector_indices: Dict[str, set] = {d: set() for d in BASE_DETECTORS}
    detector_deviations: Dict[str, List[float]] = {d: [] for d in BASE_DETECTORS}
    record_flagged_by: Dict[int, List[str]] = {}

    for rec in anomalies_data:
        idx = rec.get("index")
        flagged = rec.get("flagged_by") or []
        dev = rec.get("deviation")
        abs_dev = abs(float(dev)) if dev is not None else None

        record_flagged_by[idx] = flagged
        for d in BASE_DETECTORS:
            if d in flagged:
                detector_indices[d].add(idx)
                if abs_dev is not None:
                    detector_deviations[d].append(abs_dev)

    # 1. Build metrics for each base detector
    detectors_metrics: List[DetectorComparisonMetric] = []
    for d in BASE_DETECTORS:
        flagged_set = detector_indices[d]
        total_flags = len(flagged_set)

        # Corroboration arithmetic across the 4 base detectors ONLY
        solo_count = 0
        corroborated_count = 0
        for idx in flagged_set:
            other_base_flags = [other for other in BASE_DETECTORS if other != d and other in record_flagged_by.get(idx, [])]
            if len(other_base_flags) == 0:
                solo_count += 1
            else:
                corroborated_count += 1

        # Invariance check: solo + corroborated == total_flags
        assert solo_count + corroborated_count == total_flags, "Solo + corroborated must equal total flags"

        solo_rate = round((solo_count / total_flags) * 100.0, 2) if total_flags > 0 else 0.0
        corroborated_rate = round((corroborated_count / total_flags) * 100.0, 2) if total_flags > 0 else 0.0
        rate_pct = round((total_flags / total_records) * 100.0, 2)

        devs = detector_deviations[d]
        mean_dev = round(float(np.mean(devs)), 2) if devs else None
        median_dev = round(float(np.median(devs)), 2) if devs else None
        max_dev = round(float(np.max(devs)), 2) if devs else None

        latency = timings.get(d)
        if latency is not None:
            latency = float(latency)

        detectors_metrics.append(
            DetectorComparisonMetric(
                detector_name=d,
                display_name=DETECTOR_DISPLAY_NAMES.get(d, d),
                flag_count=total_flags,
                anomaly_rate_pct=rate_pct,
                solo_flag_count=solo_count,
                solo_rate_pct=solo_rate,
                corroborated_flag_count=corroborated_count,
                corroborated_rate_pct=corroborated_rate,
                mean_deviation=mean_dev,
                median_deviation=median_dev,
                max_deviation=max_dev,
                latency_ms=latency,
            )
        )

    # 2. Pairwise Agreement & Jaccard Matrix
    pairwise_items: List[PairwiseAgreementItem] = []
    jaccard_matrix: Dict[str, Dict[str, float]] = {d: {} for d in BASE_DETECTORS}
    shared_counts_matrix: Dict[str, Dict[str, int]] = {d: {} for d in BASE_DETECTORS}

    for i in range(len(BASE_DETECTORS)):
        d1 = BASE_DETECTORS[i]
        set1 = detector_indices[d1]
        for j in range(len(BASE_DETECTORS)):
            d2 = BASE_DETECTORS[j]
            set2 = detector_indices[d2]

            shared = len(set1 & set2)
            union = len(set1 | set2)
            # Boundary handling: if both sets are empty, both detectors are in 100% agreement (Jaccard = 1.0)
            jaccard = round(shared / union, 4) if union > 0 else 1.0

            pct_a_in_b = round((shared / len(set1)) * 100.0, 2) if len(set1) > 0 else (100.0 if len(set2) == 0 else 0.0)
            pct_b_in_a = round((shared / len(set2)) * 100.0, 2) if len(set2) > 0 else (100.0 if len(set1) == 0 else 0.0)

            jaccard_matrix[d1][d2] = jaccard
            shared_counts_matrix[d1][d2] = shared

            if i <= j:
                pairwise_items.append(
                    PairwiseAgreementItem(
                        detector_a=d1,
                        detector_b=d2,
                        shared_count=shared,
                        union_count=union,
                        jaccard_similarity=jaccard,
                        percent_a_in_b=pct_a_in_b,
                        percent_b_in_a=pct_b_in_a,
                    )
                )

    # 3. Ensemble Comparison Summary
    confirmed = anomaly_run.confirmed_count or 0
    potential = anomaly_run.potential_count or 0
    total_anomalies = confirmed + potential
    corroboration_ratio = round(confirmed / total_anomalies, 4) if total_anomalies > 0 else 0.0

    ensemble_summary = EnsembleComparisonSummary(
        total_records=total_records,
        confirmed_count=confirmed,
        potential_count=potential,
        total_anomalies=total_anomalies,
        anomaly_rate_pct=round((total_anomalies / total_records) * 100.0, 2),
        confirmed_rate_pct=round((confirmed / total_records) * 100.0, 2),
        severity_breakdown=anomaly_run.severity_breakdown or {},
        corroboration_ratio=corroboration_ratio,
    )

    return RunComparisonResponse(
        dataset_id=anomaly_run.dataset_id,
        run_id=anomaly_run.id,
        primary_variable=anomaly_run.primary_variable,
        total_records=total_records,
        detector_names=BASE_DETECTORS,
        detectors=detectors_metrics,
        ensemble_summary=ensemble_summary,
        pairwise_agreement=pairwise_items,
        jaccard_matrix=jaccard_matrix,
        shared_counts_matrix=shared_counts_matrix,
    )

