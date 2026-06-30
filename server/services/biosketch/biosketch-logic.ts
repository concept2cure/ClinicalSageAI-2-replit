/**
 * NIH Biosketch deterministic logic (Capability C2C-24B)
 *
 * Pure, DB-free, LLM-free: the required sections of the NIH biosketch that seed a
 * new biosketch, and the completeness/readiness scoring used to gate finalization.
 * The section set is grounded in the NIH biosketch format instructions (FORMS-H):
 * A. Personal Statement; B. Positions, Scientific Appointments & Honors;
 * C. Contributions to Science.
 *
 * @module server/services/biosketch/biosketch-logic
 */

const BIOSKETCH_BASIS = 'NIH Biosketch format (FORMS-H)';

export interface BiosketchSectionTemplate {
  sectionKey: string;
  title: string;
  required: boolean;
  basis: string;
}

/**
 * The required sections of an NIH biosketch (FORMS-H). Ordering is authoring (and
 * NIH form) order. All three are required.
 */
export const REQUIRED_BIOSKETCH_SECTIONS: BiosketchSectionTemplate[] = [
  { sectionKey: 'personal_statement', title: 'A. Personal Statement', required: true, basis: BIOSKETCH_BASIS },
  { sectionKey: 'positions_honors', title: 'B. Positions, Scientific Appointments & Honors', required: true, basis: BIOSKETCH_BASIS },
  { sectionKey: 'contributions_to_science', title: 'C. Contributions to Science', required: true, basis: BIOSKETCH_BASIS },
];

/** The seed templates for a new biosketch. Pure. */
export function biosketchSectionTemplates(): BiosketchSectionTemplate[] {
  return REQUIRED_BIOSKETCH_SECTIONS;
}

// ─── Completeness scoring ────────────────────────────────────────────────────

export interface BiosketchSectionView {
  sectionKey: string;
  required: boolean;
  addressed: boolean;
  content?: string | null;
}

export interface BiosketchFinding {
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

export interface BiosketchCompletenessResult {
  /** Percent of REQUIRED sections both addressed and with content (0–100). */
  addressedPct: number;
  requiredTotal: number;
  requiredAddressed: number;
  /** Section keys of required sections not yet satisfied. */
  missing: string[];
  findings: BiosketchFinding[];
  readyToFinalize: boolean;
}

/**
 * Score a biosketch's completeness. A required section counts as satisfied only
 * when it is both marked addressed and has non-empty content. `readyToFinalize`
 * requires every required section satisfied. Pure — the deterministic gate the
 * service enforces on finalize. (NIH Biosketch format, FORMS-H.)
 */
export function evaluateBiosketchCompleteness(sections: BiosketchSectionView[]): BiosketchCompletenessResult {
  const required = sections.filter((s) => s.required);
  const satisfied = (s: BiosketchSectionView): boolean => s.addressed && typeof s.content === 'string' && s.content.trim().length > 0;
  const requiredAddressed = required.filter(satisfied).length;
  const requiredTotal = required.length;
  const addressedPct = requiredTotal === 0 ? 100 : Math.round((requiredAddressed / requiredTotal) * 100);

  const missing = required.filter((s) => !satisfied(s)).map((s) => s.sectionKey);

  const findings: BiosketchFinding[] = [];
  for (const s of required.filter((x) => !satisfied(x))) {
    const why = !s.addressed ? 'not yet addressed' : 'marked addressed but has no content';
    findings.push({ severity: 'critical', message: `Required biosketch section "${s.sectionKey}" is ${why} (${BIOSKETCH_BASIS}).` });
  }
  for (const s of sections.filter((x) => !x.required && x.addressed && !satisfied(x))) {
    findings.push({ severity: 'warning', message: `Optional section "${s.sectionKey}" is marked addressed but has no content.` });
  }

  const readyToFinalize = missing.length === 0;
  return { addressedPct, requiredTotal, requiredAddressed, missing, findings, readyToFinalize };
}
