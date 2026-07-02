/**
 * WarGameReport — FDA War Game simulation report renderer.
 *
 * A rich, visually striking component that displays the results of an
 * adversarial FDA audit simulation. Designed for the AnA chat system's
 * dark theme (bg-gray-900 / text-gray-200). Uses inline Tailwind CSS
 * for all styling.
 *
 * Layout:
 *   1. Circular SVG gauge — overall score with colour-coded ring
 *   2. Regulatory risk badge — colour-coded pill
 *   3. Executive summary — accent-bordered callout
 *   4. Top priorities — numbered action items
 *   5. Dimension scores — horizontal bar chart
 *   6. Findings — grouped by severity (critical → warning → info),
 *      each with an adversarial "FDA reviewer question" blockquote
 *      and a Remediate CTA
 *   7. Dismiss (X) button in top-right corner
 *
 * @module client/src/concept2cure/components/ana/WarGameReport
 */

import { useMemo } from 'react';
import styles from './styles.module.css';

/* ── Interfaces ─────────────────────────────────────────────────────────── */

export interface WarGameFinding {
  id: string;
  dimension: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  /** The adversarial question the FDA auditor would ask. */
  question: string;
  observation: string;
  requirement: string;
  reference: string;
  recommendation: string;
  relatedFields: string[];
}

export interface WarGameReportData {
  id: string;
  category: string; // 'protocol' | 'ind' | 'csr' | '510k' | 'cer' | 'sop'
  sourceFlowId: string;
  timestamp: string;
  overallScore: number; // 0-100
  overallAssessment:
    | 'audit_ready'
    | 'needs_work'
    | 'significant_gaps'
    | 'not_ready';
  findings: WarGameFinding[];
  dimensionScores: Record<string, { score: number; findingCount: number }>;
  executiveSummary: string;
  topPriorities: string[];
  regulatoryRiskLevel: 'low' | 'moderate' | 'high' | 'critical';
}

export interface WarGameReportProps {
  report: WarGameReportData;
  onDismiss?: () => void;
  onRemediate?: (findingId: string) => void;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

const SEVERITY_ORDER: Record<WarGameFinding['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const SEVERITY_LABEL: Record<WarGameFinding['severity'], string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Informational',
};

const SEVERITY_COLOR: Record<
  WarGameFinding['severity'],
  { text: string; bg: string; border: string; icon: string }
> = {
  critical: {
    text: 'text-red-400',
    bg: 'bg-red-900/30',
    border: 'border-red-700/50',
    icon: 'text-red-500',
  },
  warning: {
    text: 'text-amber-400',
    bg: 'bg-amber-900/20',
    border: 'border-amber-700/40',
    icon: 'text-amber-500',
  },
  info: {
    text: 'text-blue-400',
    bg: 'bg-blue-900/20',
    border: 'border-blue-700/40',
    icon: 'text-blue-400',
  },
};

const ASSESSMENT_LABEL: Record<WarGameReportData['overallAssessment'], string> =
  {
    audit_ready: 'Audit Ready',
    needs_work: 'Needs Work',
    significant_gaps: 'Significant Gaps',
    not_ready: 'Not Ready',
  };

const RISK_PILL: Record<
  WarGameReportData['regulatoryRiskLevel'],
  { bg: string; text: string; ring: string }
> = {
  critical: {
    bg: 'bg-red-600/20',
    text: 'text-red-400',
    ring: 'ring-red-500/40',
  },
  high: {
    bg: 'bg-orange-600/20',
    text: 'text-orange-400',
    ring: 'ring-orange-500/40',
  },
  moderate: {
    bg: 'bg-yellow-600/20',
    text: 'text-yellow-400',
    ring: 'ring-yellow-500/40',
  },
  low: {
    bg: 'bg-emerald-600/20',
    text: 'text-emerald-400',
    ring: 'ring-emerald-500/40',
  },
};

function scoreColor(score: number): string {
  if (score >= 80) return '#10b981'; // emerald-500
  if (score >= 60) return '#eab308'; // yellow-500
  if (score >= 40) return '#f97316'; // orange-500
  return '#ef4444'; // red-500
}

function scoreColorClass(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function barColorClass(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-yellow-500';
  if (score >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

/* ── Severity icon SVG fragments ─────────────────────────────────────── */

function SeverityIcon({ severity }: { severity: WarGameFinding['severity'] }) {
  const color = SEVERITY_COLOR[severity].icon;
  if (severity === 'critical') {
    return (
      <svg
        className={`w-5 h-5 flex-shrink-0 ${color}`}
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  if (severity === 'warning') {
    return (
      <svg
        className={`w-5 h-5 flex-shrink-0 ${color}`}
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg
      className={`w-5 h-5 flex-shrink-0 ${color}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/* ── Score Gauge (SVG circular) ──────────────────────────────────────── */

function ScoreGauge({
  score,
  assessment,
}: {
  score: number;
  assessment: WarGameReportData['overallAssessment'];
}) {
  const radius = 62;
  const stroke = 8;
  const center = 75;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference - (clamped / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <svg width={150} height={150} className="drop-shadow-lg">
          {/* Background track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={stroke}
          />
          {/* Score arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${center} ${center})`}
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
        </svg>
        {/* Score number centered */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`text-4xl font-bold tabular-nums tracking-tight ${scoreColorClass(score)}`}
          >
            {score}
          </span>
          <span className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">
            / 100
          </span>
        </div>
      </div>
      {/* Assessment label */}
      <span
        className={`text-sm font-semibold tracking-wide uppercase ${scoreColorClass(score)}`}
      >
        {ASSESSMENT_LABEL[assessment]}
      </span>
    </div>
  );
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function WarGameReport({
  report,
  onDismiss,
  onRemediate,
}: WarGameReportProps) {
  /* Sort findings by severity. */
  const sortedFindings = useMemo(
    () =>
      [...report.findings].sort(
        (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
      ),
    [report.findings],
  );

  /* Group findings by severity for sectioned rendering. */
  const findingsBySeverity = useMemo(() => {
    const groups: Record<WarGameFinding['severity'], WarGameFinding[]> = {
      critical: [],
      warning: [],
      info: [],
    };
    for (const f of sortedFindings) {
      groups[f.severity].push(f);
    }
    return groups;
  }, [sortedFindings]);

  /* Sorted dimension entries. */
  const dimensions = useMemo(
    () =>
      Object.entries(report.dimensionScores).sort(
        ([, a], [, b]) => a.score - b.score,
      ),
    [report.dimensionScores],
  );

  const risk = RISK_PILL[report.regulatoryRiskLevel];
  const categoryLabel = report.category.toUpperCase();
  const ts = new Date(report.timestamp);
  const formattedDate = ts.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="relative bg-gray-900 text-gray-200 rounded-2xl border border-gray-700/60 shadow-2xl overflow-hidden">
      {/* ── Dismiss button ─────────────────────────────────────────── */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-gray-100 transition-colors"
          aria-label="Dismiss report"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      )}

      {/* ── Header strip ───────────────────────────────────────────── */}
      <div className="px-8 pt-8 pb-6 border-b border-gray-800">
        <div className="flex items-start justify-between gap-6 pr-10">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-gray-100 tracking-tight">
                FDA War Game Report
              </h2>
              <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500 bg-gray-800 px-2.5 py-0.5 rounded-md">
                {categoryLabel}
              </span>
            </div>
            <p className="text-xs text-gray-500 font-mono">{formattedDate}</p>
          </div>
          {/* Regulatory risk pill */}
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase ring-1 ${risk.bg} ${risk.text} ${risk.ring}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {report.regulatoryRiskLevel} risk
          </span>
        </div>
      </div>

      {/* ── Score + executive summary row ──────────────────────────── */}
      <div className="px-8 py-8 flex flex-col md:flex-row items-center md:items-start gap-8 border-b border-gray-800">
        <ScoreGauge
          score={report.overallScore}
          assessment={report.overallAssessment}
        />
        {/* Executive summary callout */}
        <div className="flex-1 min-w-0">
          <div className="border-l-4 border-indigo-500 bg-gray-800/50 rounded-r-lg px-5 py-4">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-indigo-400 mb-2">
              Executive Summary
            </h3>
            <p className="text-sm leading-relaxed text-gray-300">
              {report.executiveSummary}
            </p>
          </div>
        </div>
      </div>

      {/* ── Top priorities ─────────────────────────────────────────── */}
      {report.topPriorities.length > 0 && (
        <div className="px-8 py-6 border-b border-gray-800">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-4">
            Top Priorities
          </h3>
          <ol className="space-y-3">
            {report.topPriorities.map((priority, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600/20 text-indigo-400 text-xs font-bold flex items-center justify-center ring-1 ring-indigo-500/30">
                  {idx + 1}
                </span>
                <span className="text-sm leading-relaxed text-gray-300 pt-0.5">
                  {priority}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── Dimension scores ───────────────────────────────────────── */}
      {dimensions.length > 0 && (
        <div className="px-8 py-6 border-b border-gray-800">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-4">
            Dimension Scores
          </h3>
          <div className="space-y-3">
            {dimensions.map(([dim, { score, findingCount }]) => (
              <div key={dim} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-36 truncate font-medium capitalize">
                  {dim.replace(/_/g, ' ')}
                </span>
                <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColorClass(score)} transition-all duration-700`}
                    style={{ width: `${Math.max(2, score)}%` }}
                  />
                </div>
                <span
                  className={`text-xs font-bold tabular-nums w-8 text-right ${scoreColorClass(score)}`}
                >
                  {score}
                </span>
                <span className="text-[10px] text-gray-600 w-14 text-right tabular-nums">
                  {findingCount} {findingCount === 1 ? 'finding' : 'findings'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Findings ───────────────────────────────────────────────── */}
      <div className="px-8 py-6">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-5">
          Findings ({sortedFindings.length})
        </h3>

        {(['critical', 'warning', 'info'] as const).map((sev) => {
          const group = findingsBySeverity[sev];
          if (group.length === 0) return null;
          const sc = SEVERITY_COLOR[sev];

          return (
            <div key={sev} className="mb-8 last:mb-0">
              {/* Severity section header */}
              <div className="flex items-center gap-2 mb-4">
                <SeverityIcon severity={sev} />
                <span
                  className={`text-xs font-bold uppercase tracking-widest ${sc.text}`}
                >
                  {SEVERITY_LABEL[sev]} ({group.length})
                </span>
              </div>

              <div className="space-y-4">
                {group.map((finding) => (
                  <FindingCard
                    key={finding.id}
                    finding={finding}
                    onRemediate={onRemediate}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {sortedFindings.length === 0 && (
          <p className="text-sm text-gray-500 italic">
            No findings were identified.
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Finding card ────────────────────────────────────────────────────── */

function FindingCard({
  finding,
  onRemediate,
}: {
  finding: WarGameFinding;
  onRemediate?: (id: string) => void;
}) {
  const sc = SEVERITY_COLOR[finding.severity];

  return (
    <div
      className={`rounded-xl border ${sc.border} ${sc.bg} overflow-hidden transition-colors`}
    >
      <div className="px-5 py-4">
        {/* Title row */}
        <div className="flex items-start gap-2.5 mb-3">
          <SeverityIcon severity={finding.severity} />
          <div className="flex-1 min-w-0">
            <h4 className={`text-sm font-semibold ${sc.text}`}>
              {finding.title}
            </h4>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
              {finding.dimension.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {/* Adversarial question — styled as a stern FDA reviewer quote */}
        <div className="mb-4 border-l-[3px] border-red-600/70 bg-gray-950/60 rounded-r-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-red-500/80 font-bold mb-1.5">
            FDA Reviewer Question
          </p>
          <p className="text-sm italic text-gray-300 leading-relaxed">
            <span className="text-red-400/60 text-lg leading-none mr-0.5">
              &ldquo;
            </span>
            {finding.question}
            <span className="text-red-400/60 text-lg leading-none ml-0.5">
              &rdquo;
            </span>
          </p>
        </div>

        {/* Detail sections */}
        <div className="space-y-3 text-sm">
          <DetailSection label="Observation" text={finding.observation} />
          <DetailSection label="Requirement" text={finding.requirement} />
          <DetailSection label="Reference" text={finding.reference} />
          <DetailSection
            label="Recommendation"
            text={finding.recommendation}
          />
        </div>

        {/* Related fields */}
        {finding.relatedFields.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {finding.relatedFields.map((field) => (
              <span
                key={field}
                className="text-[10px] font-mono text-gray-500 bg-gray-800/80 px-2 py-0.5 rounded"
              >
                {field}
              </span>
            ))}
          </div>
        )}

        {/* Remediate button */}
        {onRemediate && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => onRemediate(finding.id)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/20 text-indigo-400 ring-1 ring-indigo-500/30 hover:bg-indigo-600/30 hover:ring-indigo-500/50 transition-colors"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
              </svg>
              Remediate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Detail section row ─────────────────────────────────────────────── */

function DetailSection({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
        {label}
      </span>
      <p className="text-gray-400 leading-relaxed mt-0.5">{text}</p>
    </div>
  );
}
