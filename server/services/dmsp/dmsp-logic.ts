/**
 * NIH Data Management & Sharing Plan deterministic logic (Capability C2C-23)
 *
 * Pure, DB-free, LLM-free: the six required elements of the NIH DMS Plan that seed
 * a new plan, and the completeness/readiness scoring used to gate finalization. The
 * element set is grounded in the NIH Data Management & Sharing Policy
 * (NOT-OD-21-013) and its supplemental guidance on the elements of a DMS plan
 * (NOT-OD-21-014), so an authored plan maps to what NIH expects when the plan is
 * attached to a proposal.
 *
 * @module server/services/dmsp/dmsp-logic
 */

const DMSP_BASIS = 'NIH NOT-OD-21-013 / Final DMS Policy';

export interface DmspElementTemplate {
  elementKey: string;
  title: string;
  required: boolean;
  basis: string;
}

/**
 * The six required elements of an NIH Data Management & Sharing Plan, per the
 * Final DMS Policy (NOT-OD-21-013) and the elements guidance (NOT-OD-21-014).
 * Ordering is authoring (and NIH form) order. All six are required.
 */
export const REQUIRED_DMSP_ELEMENTS: DmspElementTemplate[] = [
  { elementKey: 'data_type', title: 'Element 1 — Data Type', required: true, basis: DMSP_BASIS },
  { elementKey: 'tools_software_code', title: 'Element 2 — Related Tools, Software &/or Code', required: true, basis: DMSP_BASIS },
  { elementKey: 'standards', title: 'Element 3 — Standards', required: true, basis: DMSP_BASIS },
  { elementKey: 'preservation_access_timelines', title: 'Element 4 — Data Preservation, Access & Associated Timelines', required: true, basis: DMSP_BASIS },
  { elementKey: 'access_distribution_reuse', title: 'Element 5 — Access, Distribution or Reuse Considerations', required: true, basis: DMSP_BASIS },
  { elementKey: 'oversight', title: 'Element 6 — Oversight of Data Management & Sharing', required: true, basis: DMSP_BASIS },
];

/** The seed templates for a new DMS plan. Pure. */
export function dmspElementTemplates(): DmspElementTemplate[] {
  return REQUIRED_DMSP_ELEMENTS;
}

// ─── Completeness scoring ────────────────────────────────────────────────────

export interface DmspElementView {
  elementKey: string;
  required: boolean;
  addressed: boolean;
  content?: string | null;
}

export interface DmspFinding {
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

export interface DmspCompletenessResult {
  /** Percent of REQUIRED elements both addressed and with content (0–100). */
  addressedPct: number;
  requiredTotal: number;
  requiredAddressed: number;
  /** Element keys of required elements not yet satisfied. */
  missing: string[];
  findings: DmspFinding[];
  readyToFinalize: boolean;
}

/**
 * Score a DMS plan's completeness. A required element counts as satisfied only
 * when it is both marked addressed and has non-empty content. `readyToFinalize`
 * requires every required element satisfied. Pure — the deterministic gate the
 * service enforces on finalize. (NIH NOT-OD-21-013.)
 */
export function evaluateDmspCompleteness(elements: DmspElementView[]): DmspCompletenessResult {
  const required = elements.filter((e) => e.required);
  const satisfied = (e: DmspElementView): boolean => e.addressed && typeof e.content === 'string' && e.content.trim().length > 0;
  const requiredAddressed = required.filter(satisfied).length;
  const requiredTotal = required.length;
  const addressedPct = requiredTotal === 0 ? 100 : Math.round((requiredAddressed / requiredTotal) * 100);

  const missing = required.filter((e) => !satisfied(e)).map((e) => e.elementKey);

  const findings: DmspFinding[] = [];
  for (const e of required.filter((x) => !satisfied(x))) {
    const why = !e.addressed ? 'not yet addressed' : 'marked addressed but has no content';
    findings.push({ severity: 'critical', message: `Required DMS plan element "${e.elementKey}" is ${why} (${DMSP_BASIS}).` });
  }
  for (const e of elements.filter((x) => !x.required && x.addressed && !satisfied(x))) {
    findings.push({ severity: 'warning', message: `Optional element "${e.elementKey}" is marked addressed but has no content.` });
  }

  const readyToFinalize = missing.length === 0;
  return { addressedPct, requiredTotal, requiredAddressed, missing, findings, readyToFinalize };
}
