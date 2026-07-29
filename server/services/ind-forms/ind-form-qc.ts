/**
 * Module 1 forms QC — FDA administrative forms cross-validation (eCTD Module 1).
 *
 * The form builders (`ind-form-data-builders`) each emit a `BuiltForm`
 * ({ formId, fields, missingRequired }) for a single FDA form. This is the
 * cross-form inspector pass over the *set* of forms assembled for an IND,
 * checking what a single form cannot:
 *
 *   - PRESENCE    — the forms an original IND requires are present: the 1571
 *                   (the IND application), at least one 1572 (Statement of
 *                   Investigator), and the 3674 (ClinicalTrials.gov certification).
 *   - COMPLETENESS— a required field still missing on any form is an error
 *                   (surfaces each form's `missingRequired`).
 *   - CONSISTENCY — identity fields shared across forms (sponsor name, drug name)
 *                   must agree; a divergent value across forms is an error.
 *   - STRUCTURE   — duplicate non-1572 forms (only the 1572 is legitimately
 *                   per-investigator) are flagged.
 *
 * Honest-by-construction verdict: `ready` is true only when there are no
 * error-severity findings. Pure / deterministic.
 *
 * @module server/services/ind-forms/ind-form-qc
 */

import type { BuiltForm, FieldValue } from './ind-form-data-builders';

export type M1QcSeverity = 'error' | 'warning';

export interface M1QcFinding {
  /** The form the finding concerns ('FDA_1571', …) or '*' for a set-level finding. */
  formId: string;
  severity: M1QcSeverity;
  /** PRESENCE / COMPLETENESS / CONSISTENCY / DUPLICATE. */
  code: string;
  message: string;
}

export interface M1QcResult {
  ready: boolean;
  /** Form ids present in the set. */
  present: string[];
  /** Required form ids that are absent. */
  missingForms: string[];
  findings: M1QcFinding[];
  counts: { errors: number; warnings: number };
}

export interface M1QcInput {
  forms: BuiltForm[];
  /** Form ids required to be present (defaults to the original-IND set). */
  requiredForms?: string[];
}

/** Forms an original IND submission requires. */
export const DEFAULT_REQUIRED_IND_FORMS = ['FDA_1571', 'FDA_1572', 'FDA_3674'] as const;

/** Identity fields that, when present on multiple forms, must agree. */
const SHARED_IDENTITY_FIELDS = ['sponsor_name', 'drug_name'] as const;

function asText(v: FieldValue | undefined): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Run the Module 1 forms cross-validation over the assembled forms.
 * Pure / deterministic; findings ordered by form id then severity.
 */
export function runM1FormsQc(input: M1QcInput): M1QcResult {
  const required = input.requiredForms ?? [...DEFAULT_REQUIRED_IND_FORMS];
  const findings: M1QcFinding[] = [];
  const counts = new Map<string, number>();

  for (const f of input.forms) {
    counts.set(f.formId, (counts.get(f.formId) ?? 0) + 1);

    // COMPLETENESS — required fields still missing.
    for (const fieldId of f.missingRequired ?? []) {
      findings.push({ formId: f.formId, severity: 'error', code: 'COMPLETENESS', message: `${f.formId}: required field "${fieldId}" is missing.` });
    }
  }

  // STRUCTURE — duplicate non-1572 forms (1572 is legitimately per-investigator).
  for (const [formId, n] of counts) {
    if (n > 1 && formId !== 'FDA_1572') {
      findings.push({ formId, severity: 'error', code: 'DUPLICATE', message: `${formId} appears ${n} times; only the 1572 is per-investigator.` });
    }
  }

  // PRESENCE — required forms that are absent.
  const presentIds = new Set(input.forms.map((f) => f.formId));
  const missingForms = required.filter((r) => !presentIds.has(r));
  for (const r of missingForms) {
    findings.push({ formId: r, severity: 'error', code: 'PRESENCE', message: `Required IND form ${r} is missing.` });
  }

  // CONSISTENCY — shared identity fields must agree across forms that carry them.
  for (const field of SHARED_IDENTITY_FIELDS) {
    const seen = new Map<string, string[]>(); // value → formIds
    for (const f of input.forms) {
      const v = asText(f.fields?.[field]);
      if (!v) continue;
      const key = v.toLowerCase();
      seen.set(key, [...(seen.get(key) ?? []), f.formId]);
    }
    if (seen.size > 1) {
      const variants = [...seen.entries()].map(([, ids]) => ids.join('/')).join(' vs ');
      findings.push({
        formId: '*',
        severity: 'error',
        code: 'CONSISTENCY',
        message: `Field "${field}" diverges across forms (${variants}); all forms must carry the same value.`,
      });
    }
  }

  findings.sort((a, b) => (a.formId === b.formId ? severityRank(a.severity) - severityRank(b.severity) : a.formId.localeCompare(b.formId)));

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;

  return {
    ready: errors === 0,
    present: [...presentIds].sort(),
    missingForms,
    findings,
    counts: { errors, warnings },
  };
}

function severityRank(s: M1QcSeverity): number {
  return s === 'error' ? 0 : 1;
}
