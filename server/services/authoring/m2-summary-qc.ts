/**
 * Module 2 summary feed-forward QC — CTD Module 2 (ICH M4).
 *
 * The M2 summary builders (`m2-summary-builders`) each self-report their own
 * completeness and gaps. This service is the cross-summary inspector pass over a
 * *set* of built summaries (2.3 QOS / 2.4 Nonclinical Overview / 2.5 Clinical
 * Overview / 2.7 Clinical Summary), checking the things a single builder cannot:
 *
 *   - PRESENCE     — the expected M2 summaries are all present (no missing 2.x).
 *   - TRACEABILITY — every summary declares the upstream sections it was built
 *                    from (a summary with no inputs is a summary built from
 *                    nothing); when the available upstream key set is supplied,
 *                    each declared input must actually exist (no orphan claim).
 *   - CONTENT      — every summary has a non-empty narrative.
 *   - COMPLETENESS — each summary meets a minimum completeness threshold.
 *   - GAPS         — every builder-reported gap is surfaced as a finding.
 *   - STRUCTURE    — no duplicate section keys.
 *
 * The verdict is honest-by-construction: `ready` is true only when there are no
 * error-severity findings and no missing summaries. Pure / deterministic.
 *
 * @module server/services/authoring/m2-summary-qc
 */

import type { M2Summary } from '../m2-summary-builders';

/** The standard set of Module 2 summaries an IND/NDA expects. */
export const DEFAULT_EXPECTED_M2 = ['2.3', '2.4', '2.5', '2.7'] as const;

export type M2QcSeverity = 'error' | 'warning';

export interface M2QcFinding {
  /** The M2 section the finding concerns ('2.3', '2.4', …) or '*' for a set-level finding. */
  summaryKey: string;
  severity: M2QcSeverity;
  /** Stable machine code (PRESENCE / TRACEABILITY / ORPHAN_INPUT / CONTENT / LOW_COMPLETENESS / GAP / DUPLICATE). */
  code: string;
  message: string;
}

export interface M2QcResult {
  ready: boolean;
  /** Section keys that were present and checked. */
  checked: string[];
  /** Expected sections that were absent. */
  missingSummaries: string[];
  /** Completeness (0–100) by present section key. */
  completenessByKey: Record<string, number>;
  findings: M2QcFinding[];
  counts: { errors: number; warnings: number };
}

export interface M2QcInput {
  summaries: M2Summary[];
  /** Section keys required to be present (defaults to 2.3/2.4/2.5/2.7). */
  expectedSummaries?: string[];
  /** Minimum acceptable completeness (0–100, default 80). */
  minCompleteness?: number;
  /** When supplied, every declared inputSectionKey must be in this set (true traceability). */
  availableUpstreamKeys?: string[];
}

/**
 * Run the cross-summary Module 2 QC. Pure / deterministic; findings are ordered
 * by section key then severity.
 */
export function runM2SummaryQc(input: M2QcInput): M2QcResult {
  const expected = input.expectedSummaries ?? [...DEFAULT_EXPECTED_M2];
  const minCompleteness = input.minCompleteness ?? 80;
  const upstream = input.availableUpstreamKeys ? new Set(input.availableUpstreamKeys) : null;

  const findings: M2QcFinding[] = [];
  const present = new Map<string, M2Summary>();

  // STRUCTURE — duplicate section keys (and index the present summaries).
  for (const s of input.summaries) {
    if (present.has(s.sectionKey)) {
      findings.push({
        summaryKey: s.sectionKey,
        severity: 'error',
        code: 'DUPLICATE',
        message: `Duplicate M2 summary for section ${s.sectionKey}.`,
      });
      continue;
    }
    present.set(s.sectionKey, s);
  }

  // PRESENCE — expected summaries that are absent.
  const missingSummaries = expected.filter((k) => !present.has(k));
  for (const k of missingSummaries) {
    findings.push({
      summaryKey: k,
      severity: 'error',
      code: 'PRESENCE',
      message: `Expected Module 2 summary ${k} is missing.`,
    });
  }

  const completenessByKey: Record<string, number> = {};

  for (const [key, s] of present) {
    completenessByKey[key] = s.completeness;

    // CONTENT — non-empty narrative.
    if (!s.narrative || s.narrative.trim().length === 0) {
      findings.push({ summaryKey: key, severity: 'error', code: 'CONTENT', message: `Module 2 summary ${key} has no narrative.` });
    }

    // TRACEABILITY — must declare upstream inputs.
    if (!s.inputSectionKeys || s.inputSectionKeys.length === 0) {
      findings.push({
        summaryKey: key,
        severity: 'error',
        code: 'TRACEABILITY',
        message: `Module 2 summary ${key} declares no upstream input sections (not traceable to source).`,
      });
    } else if (upstream) {
      // ORPHAN_INPUT — a declared input that does not exist upstream.
      for (const inputKey of s.inputSectionKeys) {
        if (!upstream.has(inputKey)) {
          findings.push({
            summaryKey: key,
            severity: 'error',
            code: 'ORPHAN_INPUT',
            message: `Module 2 summary ${key} cites upstream section "${inputKey}", which is not present in the source set.`,
          });
        }
      }
    }

    // COMPLETENESS — below the threshold.
    if (s.completeness < minCompleteness) {
      findings.push({
        summaryKey: key,
        severity: 'warning',
        code: 'LOW_COMPLETENESS',
        message: `Module 2 summary ${key} completeness ${s.completeness}% is below the ${minCompleteness}% threshold.`,
      });
    }

    // GAP — surface every builder-reported gap.
    for (const gap of s.gaps ?? []) {
      findings.push({ summaryKey: key, severity: 'warning', code: 'GAP', message: `${key}: ${gap}.` });
    }
  }

  findings.sort((a, b) =>
    a.summaryKey === b.summaryKey
      ? severityRank(a.severity) - severityRank(b.severity)
      : a.summaryKey.localeCompare(b.summaryKey),
  );

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;

  return {
    ready: errors === 0 && missingSummaries.length === 0,
    checked: [...present.keys()].sort(),
    missingSummaries,
    completenessByKey,
    findings,
    counts: { errors, warnings },
  };
}

function severityRank(s: M2QcSeverity): number {
  return s === 'error' ? 0 : 1;
}
