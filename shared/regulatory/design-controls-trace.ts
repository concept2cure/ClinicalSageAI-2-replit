/**
 * Design-controls traceability semantics — 21 CFR 820.30 / ISO 13485 §7.3.
 *
 * ONE definition of "is this design input verified?", because there are two
 * consumers of the c2c_design_controls store and they disagreed:
 *
 *   client/src/concept2cure/v2/surfaces/DesignControls.tsx counted a row fully
 *   traced on `outputs.length && ver === 'pass' && val === 'pass'` — the
 *   recorded OUTCOME.
 *
 *   server/routes/mdx-engineering.ts labelled the same row `state: 'verified'`
 *   on `t.ver && t.val` — PRESENCE. `val` holds a status string, so the literal
 *   'pending' is truthy: a design input whose validation had not happened was
 *   reported as verified on a design history file traceability matrix, while
 *   the other surface, reading the identical row, reported it untraced.
 *
 * Presence is not outcome. A field that records "we have not validated this
 * yet" must never satisfy a verification obligation, so the predicate is
 * outcome-based and the pass value is named once, here.
 */

/** The only value of `ver` / `val` that discharges a 820.30 obligation. */
export const DESIGN_CONTROL_PASS = 'pass';

/** The verification/validation state of one design input. */
export type DesignControlTraceState = 'verified' | 'in-progress' | 'open';

/** Just the fields the traceability predicates read, so both the server row
 *  (snake_case, widened) and the client row can be adapted onto it. */
export interface DesignControlTraceFacts {
  ver: string | null;
  val: string | null;
  outputCount: number;
}

/** Verification AND validation both recorded as passed. Separate obligations
 *  under 820.30(f) and (g): one passing does not carry the other. */
export function isVerifiedAndValidated(f: DesignControlTraceFacts): boolean {
  return f.ver === DESIGN_CONTROL_PASS && f.val === DESIGN_CONTROL_PASS;
}

/**
 * Fully traced: a design output exists AND both activities passed. The output
 * leg is what makes it *traceability* rather than a pair of test results —
 * 820.30(c)→(d) requires the input to be realized in an output before
 * verification of that output means anything.
 */
export function isFullyTraced(f: DesignControlTraceFacts): boolean {
  return f.outputCount > 0 && isVerifiedAndValidated(f);
}

/**
 * The three-way state a traceability matrix renders per row.
 *
 * `in-progress` means an activity has been RECORDED (whatever its outcome) —
 * that is honest: something is underway. It is only `verified` when both
 * passed.
 */
export function designControlTraceState(f: DesignControlTraceFacts): DesignControlTraceState {
  if (isVerifiedAndValidated(f)) return 'verified';
  if (f.ver || f.val) return 'in-progress';
  return 'open';
}

/* ─── What a filing's section is: a design record, or filing content ───────── */

/**
 * Whether a section of a device filing belongs in the design and development
 * file, or is the filing's own paperwork.
 *
 * P-114 item 2 (2026-11-09, decided under the founder's delegation; MDX journey
 * M16). Under the QMSR (21 CFR 820, in force 2026-02-02, incorporating ISO
 * 13485:2016 §7.3.10) the design and development file holds design inputs and
 * outputs, verification, validation, reviews, transfer, changes and risk
 * records. The cover letter, the FDA forms, the truthful and accurate
 * statement, the financial certification and the 510(k) summary are written
 * for the filing; they are not design records. Engineering's design-history
 * list is the project's own document sections (P-60) and tagged every one of
 * them "DHF".
 *
 * The rule reads the governed outline, never a list kept here:
 *   - every FDA device outline version (k510, denovo, pma) names its own
 *     top-level group A "Administrative"; a section in that group is filing
 *     content;
 *   - the indications for use statement is Form FDA 3881 wherever an outline
 *     files it (group B in the 510(k) eSTAR outlines, group A in De Novo's).
 * Everything else keeps the design-file standing it had. A document of another
 * class, or of none, is not decided here: the EU outlines' conformity group
 * (Annex IV declaration, Notified Body certificate) was not part of P-114.
 */
export type DesignFileStanding = 'design-file' | 'filing-content';

export interface DesignFileSectionFacts {
  /** c2c_documents.doc_type of the section's document. */
  docType: string | null | undefined;
  /** The section's own label. */
  label: string | null | undefined;
  /** The label of the section's top-level outline group; null for a top-level node. */
  groupLabel: string | null | undefined;
}

const FDA_DEVICE_FILINGS: ReadonlySet<string> = new Set(['k510', 'denovo', 'pma']);
/** "Administrative", "Administrative information", "A · Administrative information (…)". */
const ADMINISTRATIVE_GROUP = /^(?:[A-Z]\s*·\s*)?Administrative\b/i;
const INDICATIONS_FOR_USE_STATEMENT = /^Indications for use(?: statement)?$/i;

export function designFileStanding(f: DesignFileSectionFacts): DesignFileStanding {
  if (!f.docType || !FDA_DEVICE_FILINGS.has(f.docType)) return 'design-file';
  const label = (f.label ?? '').trim();
  const group = (f.groupLabel ?? label).trim();
  if (ADMINISTRATIVE_GROUP.test(group) || INDICATIONS_FOR_USE_STATEMENT.test(label)) return 'filing-content';
  return 'design-file';
}
