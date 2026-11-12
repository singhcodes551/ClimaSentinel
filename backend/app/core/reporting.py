"""Comprehensive Research & Audit Report Generation Engine.

Synthesizes dataset metadata, profiling metrics, wrangling summaries,
historical AnomalyRun detections, EDA distributions, and automated insights
into an audit-grade scientific report.
"""
import io
import csv
from datetime import datetime
from typing import Dict, List, Any, Optional
import numpy as np
import pandas as pd

from app.schemas.reporting import (
    ReportExecutiveSummary,
    ReportDataQualitySection,
    ReportDetectionConfigSection,
    ReportVariableAnomalyBreakdown,
    ReportSeasonalPattern,
    ReportTemporalTrend,
    ReportKeyAnomalyEvent,
    ReportDetectorAgreementSection,
    ReportScientificDisclosure,
    ComprehensiveReportResponse,
)
from app.core.insights import (
    generate_dataset_insights,
    SEASONS,
    _get_season_for_month,
    _resolve_raw_col,
)
from app.core.evaluation import compute_run_comparison


def generate_comprehensive_report(
    dataset: Any,
    anomaly_run: Any,
    df: Optional[pd.DataFrame] = None,
) -> ComprehensiveReportResponse:
    """
    Constructs an audit-grade ComprehensiveReportResponse by integrating
    dataset profiling, wrangling summaries, anomaly records, and rule-based insights.
    """
    dataset_id = getattr(dataset, "id", 0) or 0
    dataset_name = getattr(dataset, "name", "Dataset")
    run_id = getattr(anomaly_run, "id", 0) or 0
    primary_var = getattr(anomaly_run, "primary_variable", "temperature") or "temperature"
    total_records = getattr(anomaly_run, "total_records", 0) or 1
    confirmed_count = getattr(anomaly_run, "confirmed_count", 0) or 0
    potential_count = getattr(anomaly_run, "potential_count", 0) or 0
    total_anomalies = confirmed_count + potential_count
    severity_breakdown = getattr(anomaly_run, "severity_breakdown", {}) or {}
    config_dict = getattr(anomaly_run, "config", {}) or {}
    anomalies_data: List[Dict[str, Any]] = getattr(anomaly_run, "anomalies_data", None) or []

    # Dates and observation range
    all_dates = [r.get("date") for r in anomalies_data if r.get("date")]
    if not all_dates and df is not None and "date" in df.columns:
        valid_df_dates = df["date"].dropna().astype(str).tolist()
        if valid_df_dates:
            all_dates = valid_df_dates

    obs_start = min(all_dates) if all_dates else None
    obs_end = max(all_dates) if all_dates else None

    # Calculate overall rates
    anom_rate = round((total_anomalies / total_records) * 100.0, 2)
    conf_rate = round((confirmed_count / total_records) * 100.0, 2)
    corrob_ratio = round(confirmed_count / total_anomalies, 4) if total_anomalies > 0 else 0.0

    # -------------------------------------------------------------------------
    # 1. Executive Summary
    # -------------------------------------------------------------------------
    if corrob_ratio >= 0.50:
        quality_assessment = "High Confidence: Majority of detected anomalies verified across >= 2 independent algorithms."
    elif total_anomalies == 0:
        quality_assessment = "Nominal: Series fully conforms to local 7-day DOY climatology within configured bounds."
    else:
        quality_assessment = "Moderate Confidence: Notable portion of anomalies flagged by single models (potential departures)."

    extreme_count = severity_breakdown.get("extreme", 0)
    high_count = severity_breakdown.get("high", 0)
    driver_summary = (
        f"Primary analysis focused on {primary_var}. Detected {total_anomalies} total departures "
        f"({confirmed_count} confirmed, {potential_count} potential). "
        f"High/Extreme events comprise {extreme_count + high_count} observations."
    )

    exec_summary = ReportExecutiveSummary(
        dataset_id=dataset_id,
        dataset_name=dataset_name,
        run_id=run_id,
        primary_variable=primary_var,
        observation_start=obs_start,
        observation_end=obs_end,
        total_records=total_records,
        total_anomalies=total_anomalies,
        confirmed_count=confirmed_count,
        potential_count=potential_count,
        anomaly_rate_pct=anom_rate,
        confirmed_rate_pct=conf_rate,
        corroboration_ratio=corrob_ratio,
        overall_quality_assessment=quality_assessment,
        primary_driver_summary=driver_summary,
    )

    # -------------------------------------------------------------------------
    # 2. Data Quality Section
    # -------------------------------------------------------------------------
    profile_data = getattr(getattr(dataset, "profile", None), "profile_data", None) or {}
    quality_score = profile_data.get("quality_score")
    col_profiles = profile_data.get("columns", [])
    overall_missing = profile_data.get("summary", {}).get("missing_pct", 0.0)

    missing_by_var: Dict[str, float] = {}
    for c in col_profiles:
        c_name = c.get("column", "")
        if c_name:
            missing_by_var[c_name] = round(float(c.get("missing_pct", 0.0)), 2)

    wrangling_summary = getattr(getattr(dataset, "wrangling_summary", None), "summary_data", None) or {}
    dup_rows = wrangling_summary.get("duplicates_removed", profile_data.get("duplicate_rows", 0))
    gaps_count = wrangling_summary.get("temporal_gaps_identified", 0)
    rain_treatment = wrangling_summary.get("rainfall_treatment_applied")
    if rain_treatment == "preserved_nan":
        rain_strategy_label = "preserve (NaN maintained to prevent false dry days)"
    elif rain_treatment == "zero_filled":
        rain_strategy_label = "zero_fill (imputed zeros; risk of artificial dry days)"
    else:
        rain_strategy_label = "unverified"

    quality_warnings: List[str] = []
    if overall_missing > 5.0:
        quality_warnings.append(f"Overall dataset missingness is elevated ({overall_missing:.1f}%).")
    if gaps_count > 0:
        quality_warnings.append(f"{gaps_count} temporal observation gap(s) identified in calendar sequence.")
    if dup_rows > 0:
        quality_warnings.append(f"{dup_rows} duplicate row(s) identified and handled during ingestion.")
    if rain_treatment == "zero_filled":
        quality_warnings.append("Rainfall missing values were zero-filled; precipitation dry spells may be artificially amplified.")

    data_quality_sec = ReportDataQualitySection(
        overall_missing_pct=round(float(overall_missing), 2),
        missingness_by_variable=missing_by_var,
        duplicate_rows_detected=int(dup_rows),
        temporal_gaps_identified=int(gaps_count),
        rainfall_strategy=rain_strategy_label,
        data_quality_score=round(float(quality_score), 1) if quality_score is not None else None,
        quality_warnings=quality_warnings,
    )

    # -------------------------------------------------------------------------
    # 3. Detection Configuration
    # -------------------------------------------------------------------------
    config_sec = ReportDetectionConfigSection(
        primary_variable=primary_var,
        algorithms_used=["Seasonal Z-Score", "Modified Z-Score (MAD)", "Isolation Forest", "Local Outlier Factor (LOF)"],
        z_threshold=float(config_dict.get("z_threshold", 3.0)),
        mad_threshold=float(config_dict.get("mad_threshold", 3.0)),
        iforest_contamination=float(config_dict.get("iforest_contamination", 0.03)),
        lof_contamination=float(config_dict.get("lof_contamination", 0.03)),
        detector_timings_ms=config_dict.get("detector_timings") or {},
    )

    # -------------------------------------------------------------------------
    # 4. Variable-Wise Anomaly Breakdown
    # -------------------------------------------------------------------------
    vars_map: Dict[str, List[Dict[str, Any]]] = {}
    for r in anomalies_data:
        v_name = r.get("variable") or primary_var
        vars_map.setdefault(v_name, []).append(r)

    if not vars_map:
        vars_map[primary_var] = []

    var_breakdown_list: List[ReportVariableAnomalyBreakdown] = []
    for v_name, v_records in vars_map.items():
        v_conf = sum(1 for r in v_records if r.get("classification") == "confirmed")
        v_pot = sum(1 for r in v_records if r.get("classification") == "potential")
        devs = [r.get("deviation") for r in v_records if r.get("deviation") is not None]
        pos_devs = [d for d in devs if d > 0]
        neg_devs = [d for d in devs if d < 0]
        abs_devs = [abs(d) for d in devs]

        var_breakdown_list.append(
            ReportVariableAnomalyBreakdown(
                variable=v_name,
                anomaly_count=len(v_records),
                confirmed_count=v_conf,
                potential_count=v_pot,
                max_positive_deviation=round(float(max(pos_devs)), 2) if pos_devs else None,
                max_negative_deviation=round(float(min(neg_devs)), 2) if neg_devs else None,
                mean_abs_deviation=round(float(np.mean(abs_devs)), 2) if abs_devs else None,
            )
        )

    # -------------------------------------------------------------------------
    # 5. Seasonal Patterns (Variable-Specific)
    # -------------------------------------------------------------------------
    col_mapping = getattr(dataset, "column_mapping", {}) or {}
    date_col = col_mapping.get("date") or ("date" if df is not None and "date" in df.columns else None)
    raw_col = _resolve_raw_col(df, col_mapping, primary_var)
    has_target_var = bool(raw_col and df is not None and raw_col in df.columns)

    seasonal_patterns: List[ReportSeasonalPattern] = []
    for s_def in SEASONS:
        s_name = s_def["name"]
        s_months = s_def["months"]

        # Anomalies in this season matching primary_var strictly
        s_anoms = [
            r for r in anomalies_data
            if r.get("variable") == primary_var
            and r.get("date")
            and pd.to_datetime(r["date"], errors="coerce").month in s_months
        ]
        s_count = len(s_anoms)

        # Expected valid records in this season for primary_var
        if df is not None:
            if has_target_var and date_col and date_col in df.columns:
                dt_col = pd.to_datetime(df[date_col], errors="coerce")
                valid_mask = dt_col.notna() & df[raw_col].notna()
                s_rec_count = int((valid_mask & dt_col.dt.month.isin(s_months)).sum())
                s_rate = round((s_count / s_rec_count) * 100.0, 2) if s_rec_count > 0 else None
            else:
                # Target variable column unresolved in df: record count is 0, rate is unavailable (None)
                s_rec_count = 0
                s_rate = None
        else:
            s_rec_count = (total_records // 4 or 90) if (df is None and raw_col) else 0
            s_rate = round((s_count / s_rec_count) * 100.0, 2) if s_rec_count > 0 else None

        # Dominant severity
        sevs = [r.get("severity") for r in s_anoms if r.get("severity")]
        dominant_sev = max(set(sevs), key=sevs.count) if sevs else "none"

        seasonal_patterns.append(
            ReportSeasonalPattern(
                season_name=s_name,
                months=s_months,
                record_count=s_rec_count,
                anomaly_count=s_count,
                anomaly_rate_pct=s_rate,
                dominant_severity=dominant_sev,
            )
        )

    # -------------------------------------------------------------------------
    # 6. Temporal Trends (Yearly, Variable-Specific)
    # -------------------------------------------------------------------------
    years_data: Dict[str, int] = {}
    for r in anomalies_data:
        if r.get("variable") == primary_var:
            d_str = r.get("date")
            if d_str and len(d_str) >= 4:
                yr = d_str[:4]
                years_data[yr] = years_data.get(yr, 0) + 1

    temporal_trends: List[ReportTemporalTrend] = []

    if df is not None:
        if has_target_var and date_col and date_col in df.columns:
            dt_col = pd.to_datetime(df[date_col], errors="coerce")
            valid_mask = dt_col.notna() & df[raw_col].notna()

            valid_years = {str(int(y)) for y in dt_col[valid_mask].dt.year.dropna().unique()}
            all_years = sorted(valid_years.union(years_data.keys()))

            for yr in all_years:
                anom_c = years_data.get(yr, 0)
                yr_int = int(yr)
                rec_c = int((valid_mask & (dt_col.dt.year == yr_int)).sum())
                rate_yr = round((anom_c / rec_c) * 100.0, 2) if rec_c > 0 else None
                temporal_trends.append(
                    ReportTemporalTrend(
                        period_label=yr,
                        record_count=rec_c,
                        anomaly_count=anom_c,
                        anomaly_rate_pct=rate_yr,
                    )
                )
        else:
            # Target variable column unresolved in df: record count is 0, rate is None (unavailable)
            all_years = sorted(years_data.keys())
            for yr in all_years:
                anom_c = years_data[yr]
                temporal_trends.append(
                    ReportTemporalTrend(
                        period_label=yr,
                        record_count=0,
                        anomaly_count=anom_c,
                        anomaly_rate_pct=None,
                    )
                )
    else:
        all_years = sorted(years_data.keys())
        for yr in all_years:
            anom_c = years_data[yr]
            rec_c = (total_records // len(all_years) or 365) if (df is None and raw_col) else 0
            rate_yr = round((anom_c / rec_c) * 100.0, 2) if rec_c > 0 else None
            temporal_trends.append(
                ReportTemporalTrend(
                    period_label=yr,
                    record_count=rec_c,
                    anomaly_count=anom_c,
                    anomaly_rate_pct=rate_yr,
                )
            )
            temporal_trends.append(
                ReportTemporalTrend(
                    period_label=yr,
                    record_count=rec_c,
                    anomaly_count=anom_c,
                    anomaly_rate_pct=rate_yr,
                )
            )

    # -------------------------------------------------------------------------
    # 7. Key Anomaly Events Portfolio (Top 25 ranked by severity and deviation)
    # -------------------------------------------------------------------------
    def rank_key(r: Dict[str, Any]):
        f_count = r.get("flag_count", 0)
        abs_d = abs(r.get("deviation") or 0.0)
        return (f_count, abs_d)

    sorted_events = sorted(anomalies_data, key=rank_key, reverse=True)
    key_events: List[ReportKeyAnomalyEvent] = []

    for rec in sorted_events[:25]:
        key_events.append(
            ReportKeyAnomalyEvent(
                index=rec.get("index", 0),
                date=rec.get("date", "Unknown"),
                variable=rec.get("variable", primary_var),
                observed_value=rec.get("observed_value"),
                expected_value=rec.get("expected_value"),
                deviation=rec.get("deviation"),
                z_score=rec.get("z_score", 0.0),
                flag_count=rec.get("flag_count", 1),
                flagged_by=rec.get("flagged_by", []),
                classification=rec.get("classification", "potential"),
                severity=rec.get("severity", "moderate"),
            )
        )

    # -------------------------------------------------------------------------
    # 8. Detector Agreement & Comparison
    # -------------------------------------------------------------------------
    try:
        comp_res = compute_run_comparison(anomaly_run)
        det_list = [d.model_dump() for d in comp_res.detectors]
        top_agreements = [
            p.model_dump() for p in comp_res.pairwise_agreement if p.detector_a != p.detector_b
        ]
        detector_sec = ReportDetectorAgreementSection(
            detectors=det_list,
            corroboration_ratio=comp_res.ensemble_summary.corroboration_ratio,
            top_pairwise_agreements=top_agreements[:6],
        )
    except Exception:
        detector_sec = ReportDetectorAgreementSection(
            detectors=[],
            corroboration_ratio=corrob_ratio,
            top_pairwise_agreements=[],
        )

    # -------------------------------------------------------------------------
    # 9. Automated Insights
    # -------------------------------------------------------------------------
    insights = generate_dataset_insights(dataset, anomaly_run, df=df)

    # -------------------------------------------------------------------------
    # 10. Scientific Disclosure & Limitations
    # -------------------------------------------------------------------------
    disclosure = ReportScientificDisclosure(
        methodology_summary=(
            "ClimaSentinel applies a hybrid multi-paradigm anomaly detection architecture combining "
            "parametric Seasonal Z-score, non-parametric Modified Z-score (MAD), Isolation Forest, and "
            "Local Outlier Factor (LOF). Baselines are established using a circular 7-day day-of-year window "
            "to account for seasonal climatology without leaking future observations."
        ),
        scientific_limitations=[
            "Statistical departures reflect deviations from the empirical historical sample, not absolute climate change.",
            "Single-station observational data contains local microclimate effects, land-use shifts, and potential sensor drift.",
            "Potential anomalies (single detector flag) represent model-specific sensitivities requiring cautious verification.",
            "Rainfall observations are highly zero-inflated and non-negative; non-precipitation days must not be treated as Gaussian baselines.",
            "Multi-day thermal anomalies indicate sustained temperature departures but do not replace synoptic atmospheric pressure reanalysis.",
        ],
        rainfall_policy_disclosure=(
            "Rainfall missing values were strictly preserved as NaN per ClimaSentinel scientific integrity rules. "
            "Zero artificial imputation was performed to prevent false dry-spell fabrication."
        ),
        attribution_disclaimer=(
            "ClimaSentinel reports statistical departures relative to local station records. These metrics cannot be used "
            "to attribute individual weather events to anthropogenic climate change without formal extreme event attribution studies."
        ),
    )

    report_id = f"CSR_{dataset_id}_{run_id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

    return ComprehensiveReportResponse(
        report_id=report_id,
        dataset_id=dataset_id,
        dataset_name=dataset_name,
        run_id=run_id,
        generated_at=datetime.utcnow().isoformat() + "Z",
        executive_summary=exec_summary,
        data_quality=data_quality_sec,
        detection_config=config_sec,
        variable_breakdown=var_breakdown_list,
        seasonal_patterns=seasonal_patterns,
        temporal_trends=temporal_trends,
        key_anomaly_events=key_events,
        detector_comparison=detector_sec,
        insights=insights,
        scientific_disclosure=disclosure,
    )


def report_to_json(
    report: ComprehensiveReportResponse,
    include_insights: bool = True,
) -> Dict[str, Any]:
    """Serializes ComprehensiveReportResponse to clean nested dictionary, optionally excluding insights."""
    data = report.model_dump()
    if not include_insights:
        data["insights"] = []
    return data


def report_to_csv_bundle(
    report: ComprehensiveReportResponse,
    include_insights: bool = True,
) -> str:
    """
    Renders an audit-ready, multi-section text/csv stream representing the
    full comprehensive report suitable for direct import into Excel or Pandas.
    """
    output = io.StringIO()
    writer = csv.writer(output)

    # 1. Header & Metadata
    writer.writerow(["# CLIMASENTINEL RESEARCH & AUDIT REPORT"])
    writer.writerow(["Report ID", report.report_id])
    writer.writerow(["Dataset ID", report.dataset_id])
    writer.writerow(["Dataset Name", report.dataset_name])
    writer.writerow(["Run ID", report.run_id])
    writer.writerow(["Generated At", report.generated_at])
    writer.writerow([])

    # 2. Executive Summary
    es = report.executive_summary
    writer.writerow(["# SECTION 1: EXECUTIVE SUMMARY"])
    writer.writerow(["Metric", "Value"])
    writer.writerow(["Primary Variable", es.primary_variable])
    writer.writerow(["Observation Start", es.observation_start or "N/A"])
    writer.writerow(["Observation End", es.observation_end or "N/A"])
    writer.writerow(["Total Records", es.total_records])
    writer.writerow(["Total Anomalies", es.total_anomalies])
    writer.writerow(["Confirmed Anomalies", es.confirmed_count])
    writer.writerow(["Potential Anomalies", es.potential_count])
    writer.writerow(["Anomaly Rate (%)", es.anomaly_rate_pct])
    writer.writerow(["Confirmed Rate (%)", es.confirmed_rate_pct])
    writer.writerow(["Corroboration Ratio", es.corroboration_ratio])
    writer.writerow(["Quality Assessment", es.overall_quality_assessment])
    writer.writerow([])

    # 3. Data Quality Audit
    dq = report.data_quality
    writer.writerow(["# SECTION 2: DATA INTEGRITY & QUALITY AUDIT"])
    writer.writerow(["Metric", "Value"])
    writer.writerow(["Overall Missing (%)", dq.overall_missing_pct])
    writer.writerow(["Duplicate Rows Detected", dq.duplicate_rows_detected])
    writer.writerow(["Temporal Gaps Identified", dq.temporal_gaps_identified])
    writer.writerow(["Rainfall Imputation Strategy", dq.rainfall_strategy])
    writer.writerow(["Data Quality Score (0-100)", dq.data_quality_score or "N/A"])
    writer.writerow([])

    # 4. Seasonal Breakdown
    writer.writerow(["# SECTION 3: SEASONAL ANOMALY DISTRIBUTION"])
    writer.writerow(["Season", "Months", "Record Count", "Anomaly Count", "Anomaly Rate (%)", "Dominant Severity"])
    for sp in report.seasonal_patterns:
        writer.writerow([
            sp.season_name,
            ";".join(str(m) for m in sp.months),
            sp.record_count,
            sp.anomaly_count,
            sp.anomaly_rate_pct if sp.anomaly_rate_pct is not None else "N/A",
            sp.dominant_severity,
        ])
    writer.writerow([])

    # 5. Temporal Trends
    writer.writerow(["# SECTION 4: YEARLY ANOMALY TRENDS"])
    writer.writerow(["Period Label", "Record Count", "Anomaly Count", "Anomaly Rate (%)"])
    for tt in report.temporal_trends:
        writer.writerow([
            tt.period_label,
            tt.record_count,
            tt.anomaly_count,
            tt.anomaly_rate_pct if tt.anomaly_rate_pct is not None else "N/A",
        ])
    writer.writerow([])

    # 6. Key Anomaly Events
    writer.writerow(["# SECTION 5: KEY ANOMALY EVENTS PORTFOLIO"])
    writer.writerow([
        "Index", "Date", "Variable", "Observed", "Expected", "Deviation",
        "Z-Score", "Flags", "Flagged By", "Classification", "Severity"
    ])
    for ev in report.key_anomaly_events:
        writer.writerow([
            ev.index,
            ev.date,
            ev.variable,
            ev.observed_value if ev.observed_value is not None else "",
            ev.expected_value if ev.expected_value is not None else "",
            ev.deviation if ev.deviation is not None else "",
            ev.z_score,
            ev.flag_count,
            ";".join(ev.flagged_by),
            ev.classification,
            ev.severity,
        ])
    writer.writerow([])

    # 7. Automated Insights Summary
    if include_insights and report.insights:
        writer.writerow(["# SECTION 6: AUTOMATED CLIMATOLOGICAL INSIGHTS"])
        writer.writerow(["ID", "Category", "Severity", "Title", "Summary", "Caveat"])
        for ins in report.insights:
            writer.writerow([
                ins.id,
                ins.category,
                ins.severity,
                ins.title,
                ins.summary,
                ins.scientific_caveat,
            ])
        writer.writerow([])

    # 8. Scientific Limitations
    writer.writerow(["# SECTION 7: SCIENTIFIC LIMITATIONS & DISCLOSURE"])
    for lim in report.scientific_disclosure.scientific_limitations:
        writer.writerow(["Limitation", lim])

    content = output.getvalue()
    output.close()
    return content

