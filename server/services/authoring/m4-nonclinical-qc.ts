/**
 * Module 4 nonclinical assembly QC — CTD Module 4.2.x (ICH M4S(R2) / M3(R2)).
 *
 * The nonclinical study-report builder (`nonclinical-study-report-builder`)
 * drafts ONE report per study and reports each section's status/gaps. This is
 * the assembly-level inspector pass over the *set* of study reports that feed
 * the M2.4 Nonclinical Overview, checking what a single report cannot:
 *
 *   - COVERAGE     — the ICH M3(R2)-recommended study disciplines are present
 *                    (primary pharmacology, safety pharmacology, PK/ADME,
 *                    repeat-dose toxicology, genotoxicity).
 *   - SECTIONS     — every required study-report section is rendered (a required
 *                    section still 'missing' is an error; 'partial' is a warning).
 *   - PLACEMENT    — each report's CTD 4.2.x section matches the study type
 *                    (`ctdSection`); a mismatch/empty placement is an error.
 *   - GLP          — pivotal toxicology studies should be GLP; a non-GLP tox
 *                    study is a warning.
 *   - STRUCTURE    — no duplicate study ids.
 *
 * The verdict is honest-by-construction: `ready` is true only when there are no
 * error-severity findings (coverage gaps are warnings by default; set
 * `requireCoverage` to make them blocking). Pure / deterministic.
 *
 * @module server/services/authoring/m4-nonclinical-qc
 */

import { ctdSection, disciplineFor, type NSRSectionStatus } from './nonclinical-study-report-builder';

/** Minimal per-study-report shape this QC needs (a projection of the builder's job). */
export interface M4StudyReportInput {
  studyId: string;
  /** Study type key understood by `disciplineFor` / `ctdSection` (e.g. 'repeat_dose_tox'). */
  studyType: string;
  /** CTD Module 4.2.x section the report is filed under. */
  reportSection: string;
  /** The report's sections with their rendered status. */
  sections: Array<{ number: string; title: string; required: boolean; status: NSRSectionStatus }>;
  glpStatus?: 'GLP' | 'non-GLP';
}

export type M4QcSeverity = 'error' | 'warning';

export interface M4QcFinding {
  /** The study id the finding concerns, or '*' for a set-level (coverage) finding. */
  studyId: string;
  severity: M4QcSeverity;
  /** COVERAGE / SECTION_MISSING / SECTION_PARTIAL / PLACEMENT / GLP / DUPLICATE. */
  code: string;
  message: string;
}

export interface M4QcResult {
  ready: boolean;
  /** Study ids that were checked. */
  checked: string[];
  /** Disciplines present across the program. */
  disciplinesPresent: string[];
  /** Recommended study types that were not found. */
  missingCoverage: string[];
  findings: M4QcFinding[];
  counts: { errors: number; warnings: number };
}

export interface M4QcInput {
  reports: M4StudyReportInput[];
  /** Study types whose presence is recommended (defaults to the ICH M3(R2) core). */
  expectedStudyTypes?: string[];
  /** When true, missing coverage is an error (blocks `ready`) instead of a warning. */
  requireCoverage?: boolean;
}

/** ICH M3(R2) core nonclinical program for first-in-human / IND support. */
export const DEFAULT_EXPECTED_STUDY_TYPES = [
  'pharmacology',
  'safety_pharmacology',
  'pharmacokinetics',
  'repeat_dose_tox',
  'genotoxicity',
] as const;

/**
 * Run the Module 4 nonclinical assembly QC over the set of study reports.
 * Pure / deterministic; findings ordered by study id then severity.
 */
export function runM4NonclinicalQc(input: M4QcInput): M4QcResult {
  const expected = input.expectedStudyTypes ?? [...DEFAULT_EXPECTED_STUDY_TYPES];
  const coverageSeverity: M4QcSeverity = input.requireCoverage ? 'error' : 'warning';

  const findings: M4QcFinding[] = [];
  const seen = new Set<string>();
  const disciplines = new Set<string>();

  for (const r of input.reports) {
    // STRUCTURE — duplicate study ids.
    if (seen.has(r.studyId)) {
      findings.push({ studyId: r.studyId, severity: 'error', code: 'DUPLICATE', message: `Duplicate nonclinical study report id "${r.studyId}".` });
      continue;
    }
    seen.add(r.studyId);
    disciplines.add(disciplineFor(r.studyType));

    // PLACEMENT — CTD 4.2.x section must match the study type.
    const expectedSection = ctdSection(r.studyType);
    if (!r.reportSection || r.reportSection.trim() === '') {
      findings.push({ studyId: r.studyId, severity: 'error', code: 'PLACEMENT', message: `Study "${r.studyId}" has no CTD 4.2.x placement (expected ${expectedSection}).` });
    } else if (r.reportSection !== expectedSection) {
      findings.push({
        studyId: r.studyId,
        severity: 'error',
        code: 'PLACEMENT',
        message: `Study "${r.studyId}" (${r.studyType}) is placed at ${r.reportSection} but ICH M4 expects ${expectedSection}.`,
      });
    }

    // SECTIONS — required sections must be rendered.
    for (const s of r.sections ?? []) {
      if (!s.required) continue;
      if (s.status === 'missing') {
        findings.push({ studyId: r.studyId, severity: 'error', code: 'SECTION_MISSING', message: `Study "${r.studyId}" required section ${s.number} (${s.title}) is missing.` });
      } else if (s.status === 'partial') {
        findings.push({ studyId: r.studyId, severity: 'warning', code: 'SECTION_PARTIAL', message: `Study "${r.studyId}" required section ${s.number} (${s.title}) is only partially rendered.` });
      }
    }

    // GLP — pivotal toxicology should be GLP.
    if (disciplineFor(r.studyType) === 'toxicology' && r.glpStatus === 'non-GLP') {
      findings.push({ studyId: r.studyId, severity: 'warning', code: 'GLP', message: `Toxicology study "${r.studyId}" is non-GLP; pivotal tox supporting an IND should be GLP (21 CFR 58).` });
    }
  }

  // COVERAGE — recommended study types not represented in the program.
  const presentTypes = new Set(input.reports.map((r) => r.studyType));
  const missingCoverage = expected.filter((t) => !presentTypes.has(t));
  for (const t of missingCoverage) {
    findings.push({ studyId: '*', severity: coverageSeverity, code: 'COVERAGE', message: `No ${t.replace(/_/g, ' ')} study found in the nonclinical program (ICH M3(R2)).` });
  }

  findings.sort((a, b) =>
    a.studyId === b.studyId ? severityRank(a.severity) - severityRank(b.severity) : a.studyId.localeCompare(b.studyId),
  );

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;

  return {
    ready: errors === 0,
    checked: [...seen].sort(),
    disciplinesPresent: [...disciplines].sort(),
    missingCoverage,
    findings,
    counts: { errors, warnings },
  };
}

function severityRank(s: M4QcSeverity): number {
  return s === 'error' ? 0 : 1;
}
