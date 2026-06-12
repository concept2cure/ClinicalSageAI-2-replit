/**
 * Module 5 clinical assembly QC — CTD Module 5.3.x (ICH E3 / M4E).
 *
 * The CSR builder (`csr-builder`) drafts ONE Clinical Study Report per study in
 * the ICH E3 structure and tracks each section's status. This is the
 * assembly-level inspector pass over the *set* of CSRs that feed the M2.5
 * Clinical Overview / M2.7 Clinical Summary, checking what a single CSR cannot:
 *
 *   - COVERAGE   — the expected study phases are represented (only checked when
 *                  `expectedPhases` is supplied — phase requirements are
 *                  program/stage specific, so there is no prescriptive default).
 *   - SECTIONS   — every required ICH E3 section is at least drafted (a required
 *                  section still 'empty' is an error; 'drafting' is a warning).
 *   - PLACEMENT  — each CSR is filed under CTD Module 5.3.x (controlled study
 *                  reports); a non-5.3 / empty placement is an error.
 *   - STRUCTURE  — no duplicate study ids.
 *
 * Honest-by-construction verdict: `ready` is true only when there are no
 * error-severity findings. Pure / deterministic.
 *
 * @module server/services/authoring/m5-clinical-qc
 */

import type { CSRSection } from '../csr-builder';

/** A CSR section's drafting status (from the CSR builder's ICH E3 model). */
export type CsrSectionStatus = CSRSection['status'];

/** Minimal per-CSR shape this QC needs (a projection of the CSR build job). */
export interface M5CsrInput {
  studyId: string;
  phase?: '1' | '2' | '3' | '4' | 'other';
  /** CTD Module 5.3.x section the CSR is filed under (e.g. 'm5.3.5.1'). */
  reportSection: string;
  /** The CSR's required sections with their drafting status (may be flattened). */
  sections: Array<{ number: string; title: string; required: boolean; status: CsrSectionStatus }>;
}

export type M5QcSeverity = 'error' | 'warning';

export interface M5QcFinding {
  /** The study id the finding concerns, or '*' for a set-level (coverage) finding. */
  studyId: string;
  severity: M5QcSeverity;
  /** COVERAGE / SECTION_EMPTY / SECTION_DRAFTING / PLACEMENT / DUPLICATE. */
  code: string;
  message: string;
}

export interface M5QcResult {
  ready: boolean;
  checked: string[];
  phasesPresent: string[];
  missingPhases: string[];
  findings: M5QcFinding[];
  counts: { errors: number; warnings: number };
}

export interface M5QcInput {
  csrs: M5CsrInput[];
  /** Study phases whose presence is required (no default — supply per program/stage). */
  expectedPhases?: Array<'1' | '2' | '3' | '4' | 'other'>;
}

/** Section statuses that count as "drafted or beyond" (acceptable for assembly). */
const DRAFTED_OR_BEYOND: ReadonlySet<CsrSectionStatus> = new Set(['drafted', 'reviewed', 'approved']);

/**
 * Run the Module 5 clinical assembly QC over the set of CSRs.
 * Pure / deterministic; findings ordered by study id then severity.
 */
export function runM5ClinicalQc(input: M5QcInput): M5QcResult {
  const findings: M5QcFinding[] = [];
  const seen = new Set<string>();
  const phases = new Set<string>();

  for (const c of input.csrs) {
    // STRUCTURE — duplicate study ids.
    if (seen.has(c.studyId)) {
      findings.push({ studyId: c.studyId, severity: 'error', code: 'DUPLICATE', message: `Duplicate CSR study id "${c.studyId}".` });
      continue;
    }
    seen.add(c.studyId);
    if (c.phase) phases.add(c.phase);

    // PLACEMENT — CTD Module 5.3.x.
    const placement = (c.reportSection ?? '').trim();
    if (!placement) {
      findings.push({ studyId: c.studyId, severity: 'error', code: 'PLACEMENT', message: `CSR "${c.studyId}" has no CTD 5.3.x placement.` });
    } else if (!/^m?5\.3(\.|$)/.test(placement)) {
      findings.push({ studyId: c.studyId, severity: 'error', code: 'PLACEMENT', message: `CSR "${c.studyId}" is placed at ${placement} but ICH M4E expects Module 5.3.x.` });
    }

    // SECTIONS — required sections must be drafted or beyond.
    for (const s of c.sections ?? []) {
      if (!s.required) continue;
      if (DRAFTED_OR_BEYOND.has(s.status)) continue;
      if (s.status === 'empty') {
        findings.push({ studyId: c.studyId, severity: 'error', code: 'SECTION_EMPTY', message: `CSR "${c.studyId}" required section ${s.number} (${s.title}) is empty.` });
      } else {
        // 'drafting' — in progress, not yet assembly-ready.
        findings.push({ studyId: c.studyId, severity: 'warning', code: 'SECTION_DRAFTING', message: `CSR "${c.studyId}" required section ${s.number} (${s.title}) is still drafting.` });
      }
    }
  }

  // COVERAGE — only when the caller declares the expected phases.
  const missingPhases = (input.expectedPhases ?? []).filter((p) => !phases.has(p));
  for (const p of missingPhases) {
    findings.push({ studyId: '*', severity: 'error', code: 'COVERAGE', message: `No Phase ${p} clinical study report found in the clinical program.` });
  }

  findings.sort((a, b) =>
    a.studyId === b.studyId ? severityRank(a.severity) - severityRank(b.severity) : a.studyId.localeCompare(b.studyId),
  );

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;

  return {
    ready: errors === 0,
    checked: [...seen].sort(),
    phasesPresent: [...phases].sort(),
    missingPhases,
    findings,
    counts: { errors, warnings },
  };
}

function severityRank(s: M5QcSeverity): number {
  return s === 'error' ? 0 : 1;
}
