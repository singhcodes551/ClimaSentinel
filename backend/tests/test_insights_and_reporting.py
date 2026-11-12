"""Unit and Regression Tests for Phase 7 Step 1: Insights & Reporting Engines."""
import pytest
import csv
import io
import pandas as pd
from datetime import datetime

from app.schemas.insights import (
    InsightItem,
    CategoryInsights,
    DatasetInsightsResponse,
)
from app.schemas.reporting import (
    ComprehensiveReportResponse,
)
from app.core.insights import (
    generate_dataset_insights,
    build_dataset_insights_response,
    check_rainfall_provenance,
    _resolve_raw_col,
)
from app.core.reporting import (
    generate_comprehensive_report,
    report_to_json,
    report_to_csv_bundle,
)


class MockDatasetProfile:
    def __init__(self):
        self.profile_data = {
            "quality_score": 88.5,
            "duplicate_rows": 2,
            "summary": {"missing_pct": 1.2},
            "columns": [
                {"column": "temperature", "missing_pct": 0.5},
                {"column": "rainfall", "missing_pct": 0.0},
                {"column": "humidity", "missing_pct": 6.2},  # > 5% triggers missingness insight
            ],
        }


class MockWranglingSummary:
    def __init__(self, treatment="preserved_nan", non_interp=True):
        self.summary_data = {
            "duplicates_removed": 2,
            "temporal_gaps_identified": 1,
            "rainfall_treatment_applied": treatment,
            "rainfall_non_interpolated": non_interp,
        }


class MockDataset:
    def __init__(self, id=1, name="Delhi Climate Test Station", has_rain=True, rain_treatment="preserved_nan"):
        self.id = id
        self.name = name
        self.column_mapping = {
            "date": "date",
            "temperature": "temp",
            "humidity": "humidity",
        }
        if has_rain:
            self.column_mapping["rainfall"] = "rain"

        self.profile = MockDatasetProfile()
        if rain_treatment is not None:
            non_interp = (rain_treatment == "preserved_nan")
            self.wrangling_summary = MockWranglingSummary(treatment=rain_treatment, non_interp=non_interp)
        else:
            self.wrangling_summary = None


class MockAnomalyRun:
    def __init__(
        self,
        id=101,
        dataset_id=1,
        primary_variable="temperature",
        total_records=730,
        confirmed_count=12,
        potential_count=4,
        anomalies_data=None,
    ):
        self.id = id
        self.dataset_id = dataset_id
        self.primary_variable = primary_variable
        self.total_records = total_records
        self.confirmed_count = confirmed_count
        self.potential_count = potential_count
        self.normal_count = total_records - (confirmed_count + potential_count)
        self.severity_breakdown = {
            "extreme": 5,
            "high": 7,
            "moderate": 4,
            "none": self.normal_count,
        }
        self.detector_breakdown = {
            "seasonal_zscore": 10,
            "modified_zscore": 8,
            "isolation_forest": 9,
            "lof": 7,
        }
        self.config = {
            "primary_variable": primary_variable,
            "z_threshold": 3.0,
            "mad_threshold": 3.0,
            "iforest_contamination": 0.03,
            "lof_contamination": 0.03,
            "detector_timings": {
                "seasonal_zscore": 12.5,
                "modified_zscore": 14.2,
                "isolation_forest": 85.0,
                "lof": 62.1,
            },
        }
        self.created_at = datetime(2023, 6, 15, 12, 0, 0)

        if anomalies_data is not None:
            self.anomalies_data = anomalies_data
        else:
            # Default rich sample anomaly set spanning 2021-2022
            self.anomalies_data = [
                # Heat spike
                {
                    "index": 120,
                    "date": "2021-05-01",
                    "variable": "temperature",
                    "observed_value": 46.5,
                    "expected_value": 38.0,
                    "deviation": 8.5,
                    "z_score": 4.2,
                    "modified_z_score": 4.5,
                    "iforest_score": 0.15,
                    "lof_score": 1.6,
                    "flag_count": 4,
                    "flagged_by": ["seasonal_zscore", "modified_zscore", "isolation_forest", "lof"],
                    "classification": "confirmed",
                    "severity": "extreme",
                },
                # Cold spike
                {
                    "index": 350,
                    "date": "2021-12-25",
                    "variable": "temperature",
                    "observed_value": 3.0,
                    "expected_value": 11.5,
                    "deviation": -8.5,
                    "z_score": -3.8,
                    "modified_z_score": -4.0,
                    "iforest_score": 0.12,
                    "lof_score": 1.4,
                    "flag_count": 3,
                    "flagged_by": ["seasonal_zscore", "modified_zscore", "isolation_forest"],
                    "classification": "confirmed",
                    "severity": "extreme",
                },
                # Consecutive cluster: 2022-06-10, 2022-06-11, 2022-06-12 (3 days)
                {
                    "index": 526,
                    "date": "2022-06-10",
                    "variable": "temperature",
                    "observed_value": 44.0,
                    "expected_value": 37.5,
                    "deviation": 6.5,
                    "z_score": 3.2,
                    "modified_z_score": 3.4,
                    "iforest_score": 0.08,
                    "lof_score": 1.3,
                    "flag_count": 3,
                    "flagged_by": ["seasonal_zscore", "modified_zscore", "isolation_forest"],
                    "classification": "confirmed",
                    "severity": "high",
                },
                {
                    "index": 527,
                    "date": "2022-06-11",
                    "variable": "temperature",
                    "observed_value": 45.2,
                    "expected_value": 37.6,
                    "deviation": 7.6,
                    "z_score": 3.7,
                    "modified_z_score": 3.9,
                    "iforest_score": 0.09,
                    "lof_score": 1.4,
                    "flag_count": 3,
                    "flagged_by": ["seasonal_zscore", "modified_zscore", "isolation_forest"],
                    "classification": "confirmed",
                    "severity": "extreme",
                },
                {
                    "index": 528,
                    "date": "2022-06-12",
                    "variable": "temperature",
                    "observed_value": 44.8,
                    "expected_value": 37.7,
                    "deviation": 7.1,
                    "z_score": 3.5,
                    "modified_z_score": 3.7,
                    "iforest_score": 0.07,
                    "lof_score": 1.2,
                    "flag_count": 2,
                    "flagged_by": ["seasonal_zscore", "modified_zscore"],
                    "classification": "confirmed",
                    "severity": "high",
                },
                # Rainfall spike
                {
                    "index": 560,
                    "date": "2022-07-15",
                    "variable": "rainfall",
                    "observed_value": 115.0,
                    "expected_value": 12.0,
                    "deviation": 103.0,
                    "z_score": 5.1,
                    "modified_z_score": 6.2,
                    "iforest_score": 0.18,
                    "lof_score": 2.1,
                    "flag_count": 4,
                    "flagged_by": ["seasonal_zscore", "modified_zscore", "isolation_forest", "lof"],
                    "classification": "confirmed",
                    "severity": "extreme",
                },
                # Spatial ML only
                {
                    "index": 600,
                    "date": "2022-08-20",
                    "variable": "temperature",
                    "observed_value": 32.0,
                    "expected_value": 31.0,
                    "deviation": 1.0,
                    "z_score": 0.8,
                    "modified_z_score": 0.7,
                    "iforest_score": 0.14,
                    "lof_score": 1.5,
                    "flag_count": 2,
                    "flagged_by": ["isolation_forest", "lof"],
                    "classification": "confirmed",
                    "severity": "moderate",
                },
            ]


# =============================================================================
# Baseline Functionality Tests
# =============================================================================

def test_insights_generation_with_rich_anomalies():
    """Verifies that rule-based insights correctly detect extremes, clusters, seasonality, and consensus."""
    dataset = MockDataset()
    anomaly_run = MockAnomalyRun()

    dates = pd.date_range("2021-01-01", periods=730, freq="D").strftime("%Y-%m-%d")
    df = pd.DataFrame({"date": dates, "temp": [25.0] * 730, "rain": [0.0] * 730})

    insights = generate_dataset_insights(dataset, anomaly_run, df=df)
    assert len(insights) >= 5

    insight_ids = [ins.id for ins in insights]

    # 1. Peak positive thermal deviation
    assert "met_temp_peak_positive" in insight_ids
    pos_ins = next(ins for ins in insights if ins.id == "met_temp_peak_positive")
    assert pos_ins.category == "meteorological"
    assert pos_ins.evidence["observed_value"] == 46.5
    assert pos_ins.evidence["deviation"] == 8.5
    assert pos_ins.severity == "critical"
    assert "scientific_caveat" in pos_ins.model_dump()

    # 2. Peak negative thermal deviation
    assert "met_temp_peak_negative" in insight_ids
    neg_ins = next(ins for ins in insights if ins.id == "met_temp_peak_negative")
    assert neg_ins.evidence["deviation"] == -8.5

    # 3. Prolonged consecutive cluster (June 10-12, 2022)
    assert "met_temp_prolonged_cluster" in insight_ids
    clust_ins = next(ins for ins in insights if ins.id == "met_temp_prolonged_cluster")
    assert clust_ins.evidence["duration_days"] == 3
    assert clust_ins.evidence["start_date"] == "2022-06-10"
    assert clust_ins.evidence["end_date"] == "2022-06-12"

    # 4. Rainfall spike (115.0 mm)
    assert "met_rain_spike" in insight_ids
    rain_ins = next(ins for ins in insights if ins.id == "met_rain_spike")
    assert rain_ins.evidence["observed_rainfall_mm"] == 115.0

    # 5. Consensus corroboration
    assert "cons_high_multi_detector_agreement" in insight_ids or "cons_divergent_detector_sensitivity" in insight_ids

    # 6. Quality missingness warning (humidity > 5%)
    assert "qual_high_missingness" in insight_ids
    assert "qual_rainfall_preservation_policy" in insight_ids


def test_insights_response_builder():
    """Verifies that build_dataset_insights_response groups items into 5 standard categories with severity counts."""
    dataset = MockDataset()
    anomaly_run = MockAnomalyRun()

    dates = pd.date_range("2021-01-01", periods=730, freq="D").strftime("%Y-%m-%d")
    df = pd.DataFrame({"date": dates, "temp": [25.0] * 730, "rain": [0.0] * 730})

    resp = build_dataset_insights_response(dataset, anomaly_run, df=df)
    assert isinstance(resp, DatasetInsightsResponse)
    assert resp.dataset_id == dataset.id
    assert resp.run_id == anomaly_run.id
    assert resp.total_insights == len(resp.all_insights)

    # 5 categories defined
    cat_keys = [c.category for c in resp.categories]
    assert "meteorological" in cat_keys
    assert "distribution" in cat_keys
    assert "seasonal" in cat_keys
    assert "consensus" in cat_keys
    assert "quality" in cat_keys

    # Severity counts add up to total_insights
    sum_sev = sum(resp.severity_counts.values())
    assert sum_sev == resp.total_insights


def test_insights_zero_anomalies_safe_handling():
    """Verifies that an anomaly run with 0 anomalies cleanly returns a nominal quality insight without division errors."""
    dataset = MockDataset()
    empty_run = MockAnomalyRun(
        confirmed_count=0,
        potential_count=0,
        anomalies_data=[],
    )

    insights = generate_dataset_insights(dataset, empty_run)
    assert len(insights) >= 1

    zero_ins = next((ins for ins in insights if ins.id == "qual_zero_anomalies_observed"), None)
    assert zero_ins is not None
    assert zero_ins.category == "quality"
    assert zero_ins.severity == "info"
    assert zero_ins.evidence["total_anomalies"] == 0

    resp = build_dataset_insights_response(dataset, empty_run)
    assert resp.total_insights >= 1
    assert resp.severity_counts["critical"] == 0


def test_comprehensive_report_generation():
    """Verifies that generate_comprehensive_report constructs all 10 audit sections correctly."""
    dataset = MockDataset()
    anomaly_run = MockAnomalyRun()

    dates = pd.date_range("2021-01-01", periods=730, freq="D").strftime("%Y-%m-%d")
    df = pd.DataFrame({"date": dates, "temp": [25.0] * 730, "rain": [0.0] * 730})

    report = generate_comprehensive_report(dataset, anomaly_run, df=df)
    assert isinstance(report, ComprehensiveReportResponse)

    # 1. Executive Summary
    es = report.executive_summary
    assert es.dataset_id == dataset.id
    assert es.run_id == anomaly_run.id
    assert es.total_records == 730
    assert es.total_anomalies == 16
    assert es.confirmed_count == 12
    assert es.potential_count == 4
    assert es.corroboration_ratio == round(12 / 16, 4)

    # 2. Data Quality Section
    dq = report.data_quality
    assert dq.duplicate_rows_detected == 2
    assert dq.temporal_gaps_identified == 1
    assert "preserve" in dq.rainfall_strategy

    # 3. Detection Config
    dc = report.detection_config
    assert dc.z_threshold == 3.0
    assert "Seasonal Z-Score" in dc.algorithms_used

    # 4. Variable Breakdown
    vb = report.variable_breakdown
    assert len(vb) >= 1
    temp_vb = next((v for v in vb if v.variable == "temperature"), None)
    assert temp_vb is not None
    assert temp_vb.max_positive_deviation == 8.5
    assert temp_vb.max_negative_deviation == -8.5

    # 5. Seasonal Patterns
    sp = report.seasonal_patterns
    assert len(sp) == 4
    season_names = [s.season_name for s in sp]
    assert "Winter (DJF)" in season_names
    assert "Summer (JJA)" in season_names

    # 6. Key Anomaly Events
    kae = report.key_anomaly_events
    assert len(kae) >= 1
    assert kae[0].flag_count >= kae[-1].flag_count

    # 7. Detector Comparison
    dc_sec = report.detector_comparison
    assert dc_sec.corroboration_ratio == round(12 / 16, 4)

    # 8. Automated Insights
    assert len(report.insights) >= 5

    # 9. Scientific Disclosure
    sd = report.scientific_disclosure
    assert len(sd.scientific_limitations) >= 3


def test_report_json_and_csv_serialization():
    """Verifies that report_to_json and report_to_csv_bundle produce verifiable exports."""
    dataset = MockDataset()
    anomaly_run = MockAnomalyRun()

    report = generate_comprehensive_report(dataset, anomaly_run)

    # 1. JSON serialization
    json_dict = report_to_json(report)
    assert isinstance(json_dict, dict)
    assert json_dict["report_id"] == report.report_id
    assert "executive_summary" in json_dict
    assert "insights" in json_dict
    assert json_dict["executive_summary"]["total_anomalies"] == 16

    # 2. CSV Bundle serialization
    csv_str = report_to_csv_bundle(report)
    assert isinstance(csv_str, str)
    assert len(csv_str) > 200

    assert "# CLIMASENTINEL RESEARCH & AUDIT REPORT" in csv_str
    assert "# SECTION 1: EXECUTIVE SUMMARY" in csv_str
    assert "# SECTION 2: DATA INTEGRITY & QUALITY AUDIT" in csv_str
    assert "# SECTION 3: SEASONAL ANOMALY DISTRIBUTION" in csv_str

    f = io.StringIO(csv_str)
    reader = csv.reader(f)
    rows = list(reader)
    assert len(rows) > 15


# =============================================================================
# 10 Regression Tests for Audit Corrections
# =============================================================================

# 1. Temperature Severity Based on Normalized Departures
def test_regression_temperature_severity_normalized_departures():
    """Verifies severity escalation uses normalized departures (Z >= 4.0), not hardcoded Celsius thresholds."""
    dataset = MockDataset(has_rain=False)

    # Case A: Small Celsius departure (+2.5°C), but extreme normalized departure (Z = 4.3 in low-variance climate)
    anom_low_variance = [
        {
            "index": 10,
            "date": "2022-07-01",
            "variable": "temperature",
            "observed_value": 24.5,
            "expected_value": 22.0,
            "deviation": 2.5,  # Much less than 6.0°C!
            "z_score": 4.3,    # >= 4.0 sigma
            "modified_z_score": 4.6,
            "flag_count": 3,
            "flagged_by": ["seasonal_zscore", "modified_zscore", "isolation_forest"],
            "classification": "confirmed",
            "severity": "extreme",
        }
    ]
    run_a = MockAnomalyRun(anomalies_data=anom_low_variance, confirmed_count=1, potential_count=0)
    insights_a = generate_dataset_insights(dataset, run_a)
    peak_ins_a = next(ins for ins in insights_a if ins.id == "met_temp_peak_positive")
    # Must be critical because Z >= 4.0, even though delta is only 2.5°C
    assert peak_ins_a.severity == "critical"

    # Case B: Large Celsius departure (+5.5°C), but moderate normalized departure (Z = 2.8 in high-variance winter)
    anom_high_variance = [
        {
            "index": 20,
            "date": "2022-01-15",
            "variable": "temperature",
            "observed_value": 5.5,
            "expected_value": 0.0,
            "deviation": 5.5,
            "z_score": 2.8,
            "modified_z_score": 2.9,
            "flag_count": 2,
            "flagged_by": ["seasonal_zscore", "modified_zscore"],
            "classification": "confirmed",
            "severity": "high",
        }
    ]
    run_b = MockAnomalyRun(anomalies_data=anom_high_variance, confirmed_count=1, potential_count=0)
    insights_b = generate_dataset_insights(dataset, run_b)
    peak_ins_b = next(ins for ins in insights_b if ins.id == "met_temp_peak_positive")
    # Must be warning, NOT critical, because Z < 4.0
    assert peak_ins_b.severity == "warning"


# 2. Rainfall Spikes in Arid & Wet Climate Scenarios
def test_regression_rainfall_spikes_arid_and_wet_scenarios():
    """Verifies rainfall spike insights trigger on normalized statistical departures, not fixed 30mm/80mm cutoffs."""
    dataset = MockDataset(has_rain=True)

    # Arid Climate Scenario: 18.0 mm rain in desert station (normally 0.5 mm). Z = 5.2.
    # Previously, a 30 mm threshold would have completely missed this 18 mm extreme flash flood!
    arid_anomalies = [
        {
            "index": 45,
            "date": "2022-03-12",
            "variable": "rainfall",
            "observed_value": 18.0,
            "expected_value": 0.8,
            "deviation": 17.2,
            "z_score": 5.2,
            "modified_z_score": 6.1,
            "flag_count": 4,
            "flagged_by": ["seasonal_zscore", "modified_zscore", "isolation_forest", "lof"],
            "classification": "confirmed",
            "severity": "extreme",
        }
    ]
    run_arid = MockAnomalyRun(anomalies_data=arid_anomalies, confirmed_count=1, potential_count=0)
    insights_arid = generate_dataset_insights(dataset, run_arid)
    rain_ins = next((ins for ins in insights_arid if ins.id == "met_rain_spike"), None)
    assert rain_ins is not None
    assert rain_ins.evidence["observed_rainfall_mm"] == 18.0
    assert rain_ins.severity == "critical"  # Z >= 4.5 -> critical

    # Wet Climate Scenario: 28.0 mm rain in monsoon season with low Z (Z = 1.1).
    # Normal rain is ~25 mm. Not a statistical anomaly departure!
    wet_non_anomaly = [
        {
            "index": 80,
            "date": "2022-07-20",
            "variable": "rainfall",
            "observed_value": 28.0,
            "expected_value": 25.0,
            "deviation": 3.0,
            "z_score": 1.1,
            "modified_z_score": 1.2,
            "flag_count": 1,
            "flagged_by": ["lof"],
            "classification": "potential",
            "severity": "moderate",
        }
    ]
    run_wet = MockAnomalyRun(anomalies_data=wet_non_anomaly, confirmed_count=0, potential_count=1)
    insights_wet = generate_dataset_insights(dataset, run_wet)
    # Low Z-score should NOT trigger rainfall spike insight
    assert not any(ins.id == "met_rain_spike" for ins in insights_wet)


# 3. Seasonal Rates with Unequal Observation Counts
def test_regression_seasonal_rates_with_unequal_observation_counts():
    """Verifies that seasonal concentration uses valid seasonal observation counts as the denominator."""
    dataset = MockDataset(has_rain=False)

    # Construct DataFrame where Summer has 300 observations and Winter has 100 observations
    dates_summer = pd.date_range("2021-06-01", "2021-08-31").strftime("%Y-%m-%d").tolist() * 3
    dates_winter = pd.date_range("2021-12-01", "2022-02-28").strftime("%Y-%m-%d").tolist()
    dates_spring = pd.date_range("2021-03-01", "2021-05-31").strftime("%Y-%m-%d").tolist()
    dates_autumn = pd.date_range("2021-09-01", "2021-11-30").strftime("%Y-%m-%d").tolist()

    all_dates = dates_summer + dates_winter + dates_spring + dates_autumn
    df = pd.DataFrame({"date": all_dates, "temp": [25.0] * len(all_dates)})
    # Summer obs: ~276, Winter obs: ~90, Spring: ~92, Autumn: ~91

    # 4 anomalies in Summer (rate: 4 / 276 = 1.45%)
    # 8 anomalies in Winter (rate: 8 / 90 = 8.89%)
    # Total anoms: 12. Overall rate: 12 / 549 = 2.18%
    anoms = []
    for d in dates_summer[:4]:
        anoms.append({
            "index": 1, "date": d, "variable": "temperature", "observed_value": 35.0,
            "expected_value": 30.0, "deviation": 5.0, "z_score": 3.1, "classification": "confirmed"
        })
    for d in dates_winter[:8]:
        anoms.append({
            "index": 2, "date": d, "variable": "temperature", "observed_value": 20.0,
            "expected_value": 12.0, "deviation": 8.0, "z_score": 3.8, "classification": "confirmed"
        })

    run = MockAnomalyRun(anomalies_data=anoms, confirmed_count=12, potential_count=0, total_records=len(df))
    insights = generate_dataset_insights(dataset, run, df=df)

    # Winter has 8.89% rate, which is > 1.75 * 2.18% (3.82%).
    # The concentration insight must flag Winter (DJF), NOT Summer!
    conc_ins = next((ins for ins in insights if ins.id == "seas_disproportionate_concentration"), None)
    assert conc_ins is not None
    assert conc_ins.evidence["season"] == "Winter (DJF)"
    assert conc_ins.evidence["anomaly_count"] == 8
    assert conc_ins.evidence["season_rate_pct"] > 8.0


# 4. Completely Unobserved Seasons
def test_regression_completely_unobserved_seasons():
    """Verifies that an unobserved season (Ns = 0) is never falsely claimed as climatologically stable."""
    dataset = MockDataset(has_rain=False)

    # Dataset spans ONLY May to September (Summer + adjacent months; Winter DJF has 0 records)
    dates = pd.date_range("2022-05-01", "2022-09-30").strftime("%Y-%m-%d").tolist()
    df = pd.DataFrame({"date": dates, "temp": [25.0] * len(dates)})

    anoms = [
        {"index": i, "date": dates[i * 10], "variable": "temperature", "observed_value": 38.0,
         "expected_value": 32.0, "deviation": 6.0, "z_score": 3.5, "classification": "confirmed"}
        for i in range(8)
    ]
    run = MockAnomalyRun(anomalies_data=anoms, confirmed_count=8, potential_count=0, total_records=len(df))
    insights = generate_dataset_insights(dataset, run, df=df)

    # Must NOT claim Winter is stable!
    stability_ins = next((ins for ins in insights if ins.id == "seas_low_anomaly_stability"), None)
    if stability_ins:
        assert stability_ins.evidence["season"] != "Winter (DJF)"

    # Must emit incomplete coverage disclosure
    incomp_ins = next((ins for ins in insights if ins.id == "seas_incomplete_seasonal_coverage"), None)
    assert incomp_ins is not None
    assert "Winter (DJF)" in incomp_ins.evidence["unobserved_or_sparse_seasons"]


# 5. Incomplete First and Last Calendar Years
def test_regression_incomplete_first_and_last_calendar_years():
    """Verifies that years with < 180 days are excluded from multi-year comparison to prevent sampling bias."""
    dataset = MockDataset(has_rain=False)

    # Year 2020: 15 days in Dec (1 anomaly, rate = 6.67%)
    # Year 2021: 365 days full (8 anomalies, rate = 2.19%)
    # Year 2022: 10 days in Jan (0 anomalies, rate = 0.0%)
    dates_2020 = pd.date_range("2020-12-16", "2020-12-31").strftime("%Y-%m-%d").tolist()
    dates_2021 = pd.date_range("2021-01-01", "2021-12-31").strftime("%Y-%m-%d").tolist()
    dates_2022 = pd.date_range("2022-01-01", "2022-01-10").strftime("%Y-%m-%d").tolist()
    all_dates = dates_2020 + dates_2021 + dates_2022
    df = pd.DataFrame({"date": all_dates, "temp": [25.0] * len(all_dates)})

    anoms = [
        {"index": 0, "date": "2020-12-20", "variable": "temperature", "observed_value": 25.0,
         "expected_value": 18.0, "deviation": 7.0, "z_score": 3.4, "classification": "confirmed"}
    ]
    for i in range(8):
        anoms.append({
            "index": 20 + i, "date": f"2021-06-0{i+1}", "variable": "temperature", "observed_value": 40.0,
            "expected_value": 33.0, "deviation": 7.0, "z_score": 3.5, "classification": "confirmed"
        })

    run = MockAnomalyRun(anomalies_data=anoms, confirmed_count=9, potential_count=0, total_records=len(df))
    insights = generate_dataset_insights(dataset, run, df=df)

    # 2020 and 2022 have < 180 days. Only 2021 is eligible.
    # Fewer than 2 eligible years -> MUST NOT produce multi-year rate shift!
    shift_ins = next((ins for ins in insights if ins.id == "dist_multiyear_rate_shift"), None)
    assert shift_ins is None

    # Must produce disclosure about insufficient annual coverage
    cov_ins = next((ins for ins in insights if ins.id == "dist_insufficient_annual_coverage"), None)
    assert cov_ins is not None


# 6. Datasets Without Rainfall Columns
def test_regression_dataset_without_rainfall_column():
    """Verifies that no rainfall preservation insights are emitted if dataset has no rainfall column."""
    dataset = MockDataset(has_rain=False)
    run = MockAnomalyRun()
    insights = generate_dataset_insights(dataset, run)

    # No rainfall insight of any kind should be emitted
    assert not any(ins.variable == "rainfall" for ins in insights)
    assert not any(ins.id.startswith("qual_rainfall") for ins in insights)


# 7. Rainfall with Verified Preserve Strategy
def test_regression_rainfall_verified_preserve_strategy():
    """Verifies that wrangling summary with preserved_nan generates verified policy insight (info)."""
    dataset = MockDataset(has_rain=True, rain_treatment="preserved_nan")
    run = MockAnomalyRun()
    insights = generate_dataset_insights(dataset, run)

    prov_ins = next(ins for ins in insights if ins.id == "qual_rainfall_preservation_policy")
    assert prov_ins.severity == "info"
    assert "Verified" in prov_ins.title
    assert prov_ins.evidence["rainfall_treatment_applied"] == "preserved_nan"


# 8. Rainfall with Zero-Fill Strategy
def test_regression_rainfall_zero_fill_strategy():
    """Verifies that wrangling summary with zero_filled generates an explicit warning."""
    dataset = MockDataset(has_rain=True, rain_treatment="zero_filled")
    run = MockAnomalyRun()
    insights = generate_dataset_insights(dataset, run)

    warn_ins = next(ins for ins in insights if ins.id == "qual_rainfall_zero_fill_warning")
    assert warn_ins.severity == "warning"
    assert "Zero-Fill" in warn_ins.title
    assert warn_ins.evidence["rainfall_treatment_applied"] == "zero_filled"


# 9. Missing Rainfall Provenance
def test_regression_missing_rainfall_provenance():
    """Verifies that unverified wrangling records emit an unverified provenance disclosure."""
    dataset = MockDataset(has_rain=True, rain_treatment=None)  # No wrangling summary
    run = MockAnomalyRun()
    insights = generate_dataset_insights(dataset, run)

    unver_ins = next(ins for ins in insights if ins.id == "qual_rainfall_provenance_unverified")
    assert unver_ins.severity == "info"
    assert "Unverified" in unver_ins.title


# 10. Consecutive Positive and Negative Temperature Anomalies
def test_regression_consecutive_positive_and_negative_temperature_anomalies():
    """Verifies that alternating positive heat and negative cold anomalies are NEVER merged into one event cluster."""
    dataset = MockDataset(has_rain=False)

    # 3 consecutive days with alternating signs: +5°C, -6°C, +5.5°C
    alternating_anomalies = [
        {
            "index": 1, "date": "2022-04-10", "variable": "temperature",
            "observed_value": 35.0, "expected_value": 30.0, "deviation": 5.0,
            "z_score": 3.2, "classification": "confirmed"
        },
        {
            "index": 2, "date": "2022-04-11", "variable": "temperature",
            "observed_value": 20.0, "expected_value": 26.0, "deviation": -6.0,
            "z_score": -3.5, "classification": "confirmed"
        },
        {
            "index": 3, "date": "2022-04-12", "variable": "temperature",
            "observed_value": 36.0, "expected_value": 30.5, "deviation": 5.5,
            "z_score": 3.3, "classification": "confirmed"
        },
    ]
    run_alt = MockAnomalyRun(anomalies_data=alternating_anomalies, confirmed_count=3, potential_count=0)
    insights_alt = generate_dataset_insights(dataset, run_alt)
    # Consecutive cluster MUST NOT be formed because sign alternates!
    assert not any(ins.id == "met_temp_prolonged_cluster" for ins in insights_alt)

    # Conversely, 3 consecutive days with identical positive signs MUST form a cluster
    positive_anomalies = [
        {
            "index": 1, "date": "2022-04-10", "variable": "temperature",
            "observed_value": 35.0, "expected_value": 30.0, "deviation": 5.0,
            "z_score": 3.2, "classification": "confirmed"
        },
        {
            "index": 2, "date": "2022-04-11", "variable": "temperature",
            "observed_value": 36.5, "expected_value": 30.2, "deviation": 6.3,
            "z_score": 3.6, "classification": "confirmed"
        },
        {
            "index": 3, "date": "2022-04-12", "variable": "temperature",
            "observed_value": 36.0, "expected_value": 30.5, "deviation": 5.5,
            "z_score": 3.3, "classification": "confirmed"
        },
    ]
    run_pos = MockAnomalyRun(anomalies_data=positive_anomalies, confirmed_count=3, potential_count=0)
    insights_pos = generate_dataset_insights(dataset, run_pos)
    clust_ins = next((ins for ins in insights_pos if ins.id == "met_temp_prolonged_cluster"), None)
    assert clust_ins is not None
    assert clust_ins.evidence["duration_days"] == 3
    assert clust_ins.evidence["direction"] == "positive"


# 11. Seasonal Normalization Variable Specific
def test_regression_seasonal_normalization_variable_specific():
    """Verifies that seasonal denominators count only valid observations of primary_var
    and anomaly numerators include only matching variable records, even when mixed with rainfall."""
    dataset = MockDataset(has_rain=True)

    # Exactly 92 days of Summer (June 1 to August 31, 2021)
    dates_summer = pd.date_range("2021-06-01", "2021-08-31", freq="D").strftime("%Y-%m-%d").tolist()
    # Exactly 90 days of Winter (December 1, 2021 to February 28, 2022)
    dates_winter = pd.date_range("2021-12-01", "2022-02-28", freq="D").strftime("%Y-%m-%d").tolist()

    all_dates = dates_summer + dates_winter

    # Temperature is valid for all 92 Summer days, but missing (NaN) for 20 Winter days (70 valid)
    temp_vals = [28.0] * len(dates_summer) + [10.0] * 70 + [None] * 20

    # Rainfall is valid for only 40 Summer days (52 NaN), and valid for 80 Winter days (10 NaN)
    rain_vals = [5.0] * 40 + [None] * (len(dates_summer) - 40) + [2.0] * 80 + [None] * 10

    df = pd.DataFrame({
        "date": all_dates,
        "temp": temp_vals,
        "rain": rain_vals,
    })

    # Mixed anomalies: 5 temperature anomalies in Summer, 10 rainfall anomalies in Summer
    # and 2 temperature anomalies in Winter
    mixed_anomalies = [
        {"index": i, "date": dates_summer[i], "variable": "temperature", "observed_value": 38.0,
         "expected_value": 28.0, "deviation": 10.0, "z_score": 3.5, "classification": "confirmed"}
        for i in range(5)
    ] + [
        {"index": 20 + i, "date": dates_summer[i], "variable": "rainfall", "observed_value": 50.0,
         "expected_value": 5.0, "deviation": 45.0, "z_score": 4.1, "classification": "confirmed"}
        for i in range(10)
    ] + [
        {"index": 50 + i, "date": dates_winter[i], "variable": "temperature", "observed_value": 2.0,
         "expected_value": 10.0, "deviation": -8.0, "z_score": -3.2, "classification": "confirmed"}
        for i in range(2)
    ]

    # Run targeting temperature
    run_temp = MockAnomalyRun(
        primary_variable="temperature",
        anomalies_data=mixed_anomalies,
        confirmed_count=17,
        potential_count=0,
        total_records=len(df),
    )

    insights = generate_dataset_insights(dataset, run_temp, df=df)
    report = generate_comprehensive_report(dataset, run_temp, df=df)

    # Check report seasonal patterns
    summer_sp = next(sp for sp in report.seasonal_patterns if sp.season_name == "Summer (JJA)")
    winter_sp = next(sp for sp in report.seasonal_patterns if sp.season_name == "Winter (DJF)")

    # Temperature record count in Summer MUST be exactly 92 (non-null temp), NOT 40 (rain) and NOT 182 (all rows)
    assert summer_sp.record_count == 92
    # Temperature anomaly count in Summer MUST be exactly 5 (excluding the 10 rainfall anomalies)
    assert summer_sp.anomaly_count == 5
    assert summer_sp.anomaly_rate_pct == round((5 / 92) * 100.0, 2)

    # In Winter: non-null temp was 70 days, temp anomalies was 2
    assert winter_sp.record_count == 70
    assert winter_sp.anomaly_count == 2
    assert winter_sp.anomaly_rate_pct == round((2 / 70) * 100.0, 2)


# 12. Annual Comparison Variable Specific
def test_regression_annual_comparison_variable_specific():
    """Verifies that annual observation counts and eligibility (N >= 180) are variable-specific."""
    dataset = MockDataset(has_rain=True)

    # Spanning 2021 and 2022: 200 days in 2021, 200 days in 2022
    dates_2021 = pd.date_range("2021-01-01", periods=200, freq="D").strftime("%Y-%m-%d").tolist()
    dates_2022 = pd.date_range("2022-01-01", periods=200, freq="D").strftime("%Y-%m-%d").tolist()
    all_dates = dates_2021 + dates_2022

    # Temperature has 200 valid observations in both 2021 and 2022
    temp_vals = [25.0] * 400
    # Rainfall has only 50 valid observations in 2021 and 60 in 2022 (excessive missingness)
    rain_vals = [10.0] * 50 + [None] * 150 + [12.0] * 60 + [None] * 140

    df = pd.DataFrame({"date": all_dates, "temp": temp_vals, "rain": rain_vals})

    # Temperature anomalies: 4 in 2021 (rate 2.0%), 12 in 2022 (rate 6.0%)
    temp_anoms = [
        {"index": i, "date": dates_2021[i], "variable": "temperature", "observed_value": 35.0,
         "expected_value": 25.0, "deviation": 10.0, "z_score": 3.5, "classification": "confirmed"}
        for i in range(4)
    ] + [
        {"index": 200 + i, "date": dates_2022[i], "variable": "temperature", "observed_value": 37.0,
         "expected_value": 25.0, "deviation": 12.0, "z_score": 4.1, "classification": "confirmed"}
        for i in range(12)
    ]

    run_temp = MockAnomalyRun(
        primary_variable="temperature",
        anomalies_data=temp_anoms,
        confirmed_count=16,
        potential_count=0,
        total_records=len(df),
    )

    insights_temp = generate_dataset_insights(dataset, run_temp, df=df)
    # Both 2021 and 2022 have 200 >= 180 valid temp records -> Multi-year frequency shift MUST be produced!
    shift_ins = next((ins for ins in insights_temp if ins.id == "dist_multiyear_rate_shift"), None)
    assert shift_ins is not None
    assert shift_ins.evidence["year_first"] == "2021"
    assert shift_ins.evidence["observations_first"] == 200
    assert shift_ins.evidence["year_last"] == "2022"
    assert shift_ins.evidence["observations_last"] == 200
    assert shift_ins.evidence["rate_first_pct"] == 2.0
    assert shift_ins.evidence["rate_last_pct"] == 6.0

    # Now run targeting rainfall on the exact same DataFrame
    rain_anoms = [
        {"index": i, "date": dates_2021[i], "variable": "rainfall", "observed_value": 50.0,
         "expected_value": 10.0, "deviation": 40.0, "z_score": 4.0, "classification": "confirmed"}
        for i in range(3)
    ]
    run_rain = MockAnomalyRun(
        primary_variable="rainfall",
        anomalies_data=rain_anoms,
        confirmed_count=3,
        potential_count=0,
        total_records=len(df),
    )
    insights_rain = generate_dataset_insights(dataset, run_rain, df=df)
    # For rainfall, valid obs in 2021 is 50 (< 180) and in 2022 is 60 (< 180) -> Multi-year shift MUST be omitted!
    shift_rain = next((ins for ins in insights_rain if ins.id == "dist_multiyear_rate_shift"), None)
    assert shift_rain is None

    cov_rain = next((ins for ins in insights_rain if ins.id == "dist_insufficient_annual_coverage"), None)
    assert cov_rain is not None
    assert cov_rain.evidence["yearly_observation_counts"]["2021"] == 50
    assert cov_rain.evidence["yearly_observation_counts"]["2022"] == 60


# 13. Seasonal Coverage Unequal Missingness
def test_regression_seasonal_coverage_unequal_missingness_between_variables():
    """Verifies that missingness in one variable does not disqualify another variable from seasonal analysis."""
    dataset = MockDataset(has_rain=True)

    # 4 full seasons: 90 days in each season
    d_winter = pd.date_range("2021-01-01", periods=90, freq="D").strftime("%Y-%m-%d").tolist()
    d_spring = pd.date_range("2021-04-01", periods=90, freq="D").strftime("%Y-%m-%d").tolist()
    d_summer = pd.date_range("2021-07-01", periods=90, freq="D").strftime("%Y-%m-%d").tolist()
    d_autumn = pd.date_range("2021-10-01", periods=90, freq="D").strftime("%Y-%m-%d").tolist()
    all_dates = d_winter + d_spring + d_summer + d_autumn

    # Temperature has 90 valid days in all 4 seasons (N >= 60 in all 4 quarters)
    temp_vals = [20.0] * len(all_dates)

    # Rainfall is completely missing in Summer (90 NaNs), and has only 10 valid records in Autumn
    rain_vals = [5.0] * 90 + [5.0] * 90 + [None] * 90 + [5.0] * 10 + [None] * 80

    df = pd.DataFrame({"date": all_dates, "temp": temp_vals, "rain": rain_vals})

    temp_anoms = [
        {"index": i, "date": d_summer[i], "variable": "temperature", "observed_value": 35.0,
         "expected_value": 25.0, "deviation": 10.0, "z_score": 3.5, "classification": "confirmed"}
        for i in range(8)
    ]
    run_temp = MockAnomalyRun(
        primary_variable="temperature",
        anomalies_data=temp_anoms,
        confirmed_count=8,
        potential_count=0,
        total_records=len(df),
    )

    insights_temp = generate_dataset_insights(dataset, run_temp, df=df)
    # Temperature has full 4-quarter coverage -> incomplete seasonal coverage disclosure must NOT be emitted
    incomp_temp = next((ins for ins in insights_temp if ins.id == "seas_incomplete_seasonal_coverage"), None)
    assert incomp_temp is None

    # Now test for rainfall: Summer has 0 (< 60) and Autumn has 10 (< 60)
    rain_anoms = [
        {"index": i, "date": d_winter[i], "variable": "rainfall", "observed_value": 50.0,
         "expected_value": 5.0, "deviation": 45.0, "z_score": 4.0, "classification": "confirmed"}
        for i in range(4)
    ]
    run_rain = MockAnomalyRun(
        primary_variable="rainfall",
        anomalies_data=rain_anoms,
        confirmed_count=4,
        potential_count=0,
        total_records=len(df),
    )
    insights_rain = generate_dataset_insights(dataset, run_rain, df=df)
    incomp_rain = next((ins for ins in insights_rain if ins.id == "seas_incomplete_seasonal_coverage"), None)
    assert incomp_rain is not None
    assert "Summer (JJA)" in incomp_rain.evidence["unobserved_or_sparse_seasons"]
    assert "Autumn (SON)" in incomp_rain.evidence["unobserved_or_sparse_seasons"]


# 14. Missing Raw Temperature Column Safety
def test_regression_missing_raw_temperature_column():
    """Verifies that missing raw temperature column omits rates and emits clear provenance disclosure."""
    # Dataset mapping maps 'temperature' -> 'temp', but df only has 'date', 'rain', and 'humidity'
    dataset = MockDataset(has_rain=True)
    dates = pd.date_range("2021-01-01", periods=365, freq="D").strftime("%Y-%m-%d").tolist()
    df = pd.DataFrame({
        "date": dates,
        "rain": [5.0] * 365,
        "humidity": [60.0] * 365,
        # 'temp' is completely missing!
    })

    anoms = [
        {"index": i, "date": dates[i], "variable": "temperature", "observed_value": 35.0,
         "expected_value": 25.0, "deviation": 10.0, "z_score": 3.5, "classification": "confirmed"}
        for i in range(5)
    ]
    run = MockAnomalyRun(
        primary_variable="temperature",
        anomalies_data=anoms,
        confirmed_count=5,
        potential_count=0,
        total_records=len(df),
    )

    insights = generate_dataset_insights(dataset, run, df=df)
    report = generate_comprehensive_report(dataset, run, df=df)

    # 1. Unresolved variable disclosures MUST be emitted
    dist_unresolved = next((ins for ins in insights if ins.id == "dist_unresolved_variable_coverage"), None)
    assert dist_unresolved is not None
    assert "temperature" in dist_unresolved.title

    seas_unresolved = next((ins for ins in insights if ins.id == "seas_unresolved_variable_coverage"), None)
    assert seas_unresolved is not None
    assert "temperature" in seas_unresolved.title

    # 2. Unsupported comparisons MUST be omitted
    assert not any(ins.id == "dist_multiyear_rate_shift" for ins in insights)
    assert not any(ins.id == "seas_disproportionate_concentration" for ins in insights)

    # 3. Report seasonal patterns and temporal trends must NOT treat dates as observations
    for sp in report.seasonal_patterns:
        assert sp.record_count == 0
        assert sp.anomaly_rate_pct is None

    for tt in report.temporal_trends:
        assert tt.record_count == 0
        assert tt.anomaly_rate_pct is None


# 15. Missing Raw Rainfall Column Safety
def test_regression_missing_raw_rainfall_column():
    """Verifies that missing raw rainfall column omits rainfall rates and emits provenance disclosure."""
    dataset = MockDataset(has_rain=False)  # No rainfall mapping
    dates = pd.date_range("2021-01-01", periods=365, freq="D").strftime("%Y-%m-%d").tolist()
    df = pd.DataFrame({
        "date": dates,
        "temp": [25.0] * 365,
        # 'rain' is missing!
    })

    anoms = [
        {"index": i, "date": dates[i], "variable": "rainfall", "observed_value": 45.0,
         "expected_value": 5.0, "deviation": 40.0, "z_score": 4.0, "classification": "confirmed"}
        for i in range(3)
    ]
    run = MockAnomalyRun(
        primary_variable="rainfall",
        anomalies_data=anoms,
        confirmed_count=3,
        potential_count=0,
        total_records=len(df),
    )

    insights = generate_dataset_insights(dataset, run, df=df)
    report = generate_comprehensive_report(dataset, run, df=df)

    dist_unresolved = next((ins for ins in insights if ins.id == "dist_unresolved_variable_coverage"), None)
    assert dist_unresolved is not None
    assert "rainfall" in dist_unresolved.title

    seas_unresolved = next((ins for ins in insights if ins.id == "seas_unresolved_variable_coverage"), None)
    assert seas_unresolved is not None
    assert "rainfall" in seas_unresolved.title

    for sp in report.seasonal_patterns:
        assert sp.record_count == 0
        assert sp.anomaly_rate_pct is None


# 16. Different Available Variable Must Not Be Used As Substitute
def test_regression_no_substitute_variable_used():
    """Verifies that when a target variable is missing, another available variable is NEVER substituted."""
    dataset = MockDataset(has_rain=True)
    dates = pd.date_range("2021-01-01", periods=365, freq="D").strftime("%Y-%m-%d").tolist()
    df = pd.DataFrame({
        "date": dates,
        "rain": [10.0] * 365,       # 365 valid observations of rain
        "humidity": [70.0] * 365,   # 365 valid observations of humidity
        # 'temp' is missing!
    })

    # Raw column resolution MUST return None
    resolved = _resolve_raw_col(df, dataset.column_mapping, "temperature")
    assert resolved is None

    run = MockAnomalyRun(
        primary_variable="temperature",
        anomalies_data=[],
        confirmed_count=0,
        potential_count=0,
        total_records=len(df),
    )
    report = generate_comprehensive_report(dataset, run, df=df)

    # Neither rain nor humidity should be substituted: record count must be 0, not 365
    for sp in report.seasonal_patterns:
        assert sp.record_count == 0


# 17. Unknown Anomaly Variables Must Not Be Attributed to Primary Variable
def test_regression_unknown_anomaly_variables_not_attributed():
    """Verifies that unknown or other variables are strictly excluded from the primary variable's counts."""
    dataset = MockDataset(has_rain=True)
    dates = pd.date_range("2021-06-01", periods=92, freq="D").strftime("%Y-%m-%d").tolist()
    df = pd.DataFrame({
        "date": dates,
        "temp": [30.0] * 92,
        "rain": [5.0] * 92,
    })

    mixed_anomalies = [
        # 4 genuine temperature anomalies
        {"index": 1, "date": dates[0], "variable": "temperature", "deviation": 5.0, "classification": "confirmed"},
        {"index": 2, "date": dates[1], "variable": "temperature", "deviation": 6.0, "classification": "confirmed"},
        {"index": 3, "date": dates[2], "variable": "temperature", "deviation": 4.5, "classification": "confirmed"},
        {"index": 4, "date": dates[3], "variable": "temperature", "deviation": 5.2, "classification": "confirmed"},

        # Unknown / non-target variables: must NOT be attributed to temperature!
        {"index": 10, "date": dates[10], "variable": "unknown", "deviation": 10.0, "classification": "confirmed"},
        {"index": 11, "date": dates[11], "variable": "unknown_sensor", "deviation": 12.0, "classification": "confirmed"},
        {"index": 20, "date": dates[20], "variable": "solar_radiation", "deviation": 100.0, "classification": "confirmed"},
        {"index": 30, "date": dates[30], "variable": "rainfall", "deviation": 50.0, "classification": "confirmed"},
    ]

    run = MockAnomalyRun(
        primary_variable="temperature",
        anomalies_data=mixed_anomalies,
        confirmed_count=8,
        potential_count=0,
        total_records=len(df),
    )

    report = generate_comprehensive_report(dataset, run, df=df)
    summer_sp = next(sp for sp in report.seasonal_patterns if sp.season_name == "Summer (JJA)")

    # Exactly 4 temperature anomalies, excluding 'unknown', 'unknown_sensor', 'solar_radiation', and 'rainfall'
    assert summer_sp.anomaly_count == 4
    assert summer_sp.record_count == 92
    assert summer_sp.anomaly_rate_pct == round((4 / 92) * 100.0, 2)

    # In temporal trends: exactly 4 in 2021
    tt_2021 = next(tt for tt in report.temporal_trends if tt.period_label == "2021")
    assert tt_2021.anomaly_count == 4


# 18. Rate Distinguishes Unavailable from Genuine Zero
def test_regression_rate_distinguishes_unavailable_from_genuine_zero():
    """Verifies that missing variable produces None (N/A) rate, while existing variable with zero anomalies produces 0.0%."""
    dataset = MockDataset(has_rain=True)
    dates = pd.date_range("2021-06-01", periods=92, freq="D").strftime("%Y-%m-%d").tolist()
    df = pd.DataFrame({
        "date": dates,
        "temp": [25.0] * 92,   # 92 valid temperature observations
        # 'rain' is missing from df!
    })

    # Case A: Temperature exists with ZERO anomalies in Summer
    run_temp_zero = MockAnomalyRun(
        primary_variable="temperature",
        anomalies_data=[],  # 0 anomalies
        confirmed_count=0,
        potential_count=0,
        total_records=len(df),
    )
    report_temp = generate_comprehensive_report(dataset, run_temp_zero, df=df)
    summer_temp = next(sp for sp in report_temp.seasonal_patterns if sp.season_name == "Summer (JJA)")
    # Genuine observed zero anomaly rate MUST be exactly 0.0, NOT None!
    assert summer_temp.record_count == 92
    assert summer_temp.anomaly_count == 0
    assert summer_temp.anomaly_rate_pct == 0.0

    # CSV serialization must write 0.0
    csv_temp = report_to_csv_bundle(report_temp)
    assert "Summer (JJA),6;7;8,92,0,0.0," in csv_temp

    # Case B: Rainfall is MISSING from df
    run_rain_missing = MockAnomalyRun(
        primary_variable="rainfall",
        anomalies_data=[],
        confirmed_count=0,
        potential_count=0,
        total_records=len(df),
    )
    report_rain = generate_comprehensive_report(dataset, run_rain_missing, df=df)
    summer_rain = next(sp for sp in report_rain.seasonal_patterns if sp.season_name == "Summer (JJA)")
    # Unavailable rate MUST be None, NOT 0.0!
    assert summer_rain.record_count == 0
    assert summer_rain.anomaly_rate_pct is None

    # CSV serialization must write N/A, NOT 0.0
    csv_rain = report_to_csv_bundle(report_rain)
    assert "Summer (JJA),6;7;8,0,0,N/A," in csv_rain

    # JSON serialization must preserve None as null, NOT 0.0
    json_rain = report_to_json(report_rain)
    summer_json = next(sp for sp in json_rain["seasonal_patterns"] if sp["season_name"] == "Summer (JJA)")
    assert summer_json["anomaly_rate_pct"] is None
