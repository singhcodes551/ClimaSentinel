import React from 'react';
import {
  GitCommit,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Database,
  CloudRain,
  Clock,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';
import type { PageId } from '../../types';

interface PipelinePageProps {
  onNavigate?: (page: PageId) => void;
}

const PIPELINE_STAGES = [
  {
    step: '01',
    title: 'Chronological Ordering & Deduplication',
    badge: 'Stage 1',
    badgeColor: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    icon: Clock,
    description:
      'Parses timestamps into monotonic datetime indexes, ensures chronological continuity, and identifies and eliminates duplicate timestamp records.',
    operations: [
      'ISO-8601 & flexible datetime resolution',
      'Strict chronological sorting across the observation span',
      'Prunes redundant duplicate timestamps while logging record counts',
    ],
  },
  {
    step: '02',
    title: 'Continuous Variable Imputation',
    badge: 'Stage 2',
    badgeColor: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    icon: SlidersHorizontal,
    description:
      'Treats short missing gaps in continuous atmospheric variables (temperature, relative humidity, wind speed, barometric pressure) using configurable statistical methods.',
    operations: [
      'Linear Interpolation: continuous trend preservation for short gaps',
      'Forward Fill: carries last observed sensor value',
      'Median Imputation: robust central tendency replacement',
      'None (Preserve): leaves raw null values untouched for strict audit requirements',
    ],
  },
  {
    step: '03',
    title: 'Scientific Rainfall Non-Interpolation Policy',
    badge: 'Stage 3 (Core Scientific Policy)',
    badgeColor: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    icon: CloudRain,
    description:
      'Precipitation is non-negative, zero-inflated, and episodic. Linear interpolation is strictly prohibited because it fabricates spurious drizzle across extended dry intervals.',
    operations: [
      'Preserve Strategy (Default): leaves unrecorded rainfall as NaN, maintaining genuine missingness provenance',
      'Zero-Fill Strategy: replaces missing rainfall with 0.0 mm where dry-day assumptions are valid',
      'Strict non-negative clamping: enforces physical lower bound (rainfall ≥ 0.0 mm)',
      'Verified in quality log and downstream reporting denominators',
    ],
  },
  {
    step: '04',
    title: 'Feature Engineering & Climatological Baselining',
    badge: 'Stage 4',
    badgeColor: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    icon: Sparkles,
    description:
      'Derives high-order statistical features and calendar encodings required for classical and machine learning anomaly detection.',
    operations: [
      '7-day rolling window means and standard deviations',
      'First-order temperature differentials (ΔT = T_t − T_{t-1})',
      'Meteorological season assignment: DJF (Winter), MAM (Spring), JJA (Summer), SON (Autumn)',
      'Circular Day-of-Year (DOY) index mapping for seasonal climatology baseline',
    ],
  },
];

export const PipelinePage: React.FC<PipelinePageProps> = ({ onNavigate }) => {
  return (
    <div className="space-y-6">
      {/* Top Header & Navigation CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
              <GitCommit className="w-6 h-6 text-sky-500" />
              Data Wrangling & Preprocessing Pipeline
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              Operational Pipeline
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Four-stage automated workflow transforming raw meteorological CSV observations into analysis-ready time series with verifiable data provenance.
          </p>
        </div>

        {onNavigate && (
          <button
            onClick={() => onNavigate('datasets')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors shadow-sm whitespace-nowrap self-start sm:self-auto"
          >
            <Database className="w-4 h-4" />
            Wrangle a Dataset
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Pipeline Stages Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {PIPELINE_STAGES.map((stage) => {
          const Icon = stage.icon;
          return (
            <div
              key={stage.step}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${stage.badgeColor}`}
                  >
                    {stage.badge}
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-400">
                    STAGE {stage.step}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-semibold text-base mb-2">
                  <Icon className="w-4 h-4 text-sky-500 shrink-0" />
                  <h3>{stage.title}</h3>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                  {stage.description}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Operations Executed
                </div>
                {stage.operations.map((op, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="text-[11px] leading-snug">{op}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quality Guarantees & Audit Invariants */}
      <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-4">
          <ShieldCheck className="w-4 h-4 text-sky-500" />
          Data Integrity & Scientific Invariants
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs">
            <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Objective Quality Score (0–100)
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
              Calculates penalties across missingness density, timestamp duplicates, and temporal gaps to compute a deterministic dataset health metric.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs">
            <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
              WMO Physical Bounds Validation
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
              Detects physically impossible values (e.g. negative rainfall, temperatures exceeding physical records, relative humidity outside 0–100%).
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs">
            <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Immutable Quality Audit Log
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
              Every transformation records rows before, rows after, affected metrics, and timestamped actions directly into the SQLite database.
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Action Callout */}
      <div className="p-6 rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/50 dark:bg-sky-950/20 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-sky-900 dark:text-sky-200">
            Execute Wrangling on an Active Dataset
          </h3>
          <p className="text-xs text-sky-700 dark:text-sky-400 mt-1 max-w-xl">
            Navigate to the Datasets view to profile raw CSV files, choose custom imputation and rainfall strategies, and generate clean time series for anomaly detection.
          </p>
        </div>

        {onNavigate && (
          <button
            onClick={() => onNavigate('datasets')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors shadow-sm whitespace-nowrap self-start sm:self-auto"
          >
            Go to Datasets
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
