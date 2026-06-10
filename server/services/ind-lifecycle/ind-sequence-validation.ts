/**
 * eCTD sequence validation against the canonical IND section map.
 *
 * Distinct from the readiness evaluator (which scores AUTHORING status of
 * sections): this validates an ASSEMBLED sequence — does it actually carry a
 * leaf for every required CTD section? It compares the leaves placed in a
 * sequence against services/regulatory/ind-ectd-sections.ts and reports the
 * required sections with no leaf, plus any leaves that map to no known section.
 *
 * Pure / deterministic. Section codes are normalized (leading "m" stripped,
 * lower-cased) so 'm2.5' and '2.5' compare equal; a required section is
 * satisfied by an exact leaf or any more-granular descendant leaf.
 */

import {
  getRequiredSections,
  getAllINDSections,
} from '../../../services/regulatory/ind-ectd-sections.js';

export type SequenceFilingType = 'initial' | 'amendment';

/** The minimal leaf shape this validator reads. */
export interface SequenceLeafLike {
  sectionCode: string;
}

export interface MissingRequiredSection {
  code: string;
  title: string;
  module: string;
  regulatoryRef: string;
}

export interface SequenceValidationReport {
  filingType: SequenceFilingType;
  /** True ⇔ every required section has a leaf. */
  valid: boolean;
  requiredCount: number;
  presentCount: number;
  missing: MissingRequiredSection[];
  /** Leaf section codes that map to no known CTD section (informational). */
  unknownSections: string[];
}

/** Strip a leading "m" and lower-case so 'm2.5' and '2.5' compare equal. */
function normalize(code: string): string {
  const c = code.trim().toLowerCase();
  return c.startsWith('m') ? c.slice(1) : c;
}

/** A required section is satisfied by an exact leaf or a descendant leaf. */
function isSatisfied(requiredCode: string, leafCodes: Set<string>): boolean {
  if (leafCodes.has(requiredCode)) return true;
  const prefix = `${requiredCode}.`;
  for (const lc of leafCodes) {
    if (lc.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Validate a sequence's leaves against the required IND sections for the filing
 * type. `valid` is the gate (true ⇔ no missing required sections).
 */
export function validateSequenceLeaves(input: {
  filingType: SequenceFilingType;
  leaves: SequenceLeafLike[];
}): SequenceValidationReport {
  const isAmendment = input.filingType === 'amendment';
  const required = getRequiredSections().filter((s) =>
    isAmendment ? s.requiredForAmendment : s.required,
  );

  const leafCodes = new Set(input.leaves.map((l) => normalize(l.sectionCode)));

  const missing: MissingRequiredSection[] = [];
  for (const s of required) {
    if (!isSatisfied(normalize(s.code), leafCodes)) {
      missing.push({ code: s.code, title: s.title, module: s.module, regulatoryRef: s.regulatoryRef });
    }
  }

  // Known section codes (for the unknown-leaf check): a leaf is "known" if its
  // code equals or is a descendant of any section in the full map.
  const knownCodes = getAllINDSections().map((s) => normalize(s.code));
  const unknownSections: string[] = [];
  for (const leaf of input.leaves) {
    const nc = normalize(leaf.sectionCode);
    const known = knownCodes.some((k) => k === nc || nc.startsWith(`${k}.`) || k.startsWith(`${nc}.`));
    if (!known) unknownSections.push(leaf.sectionCode);
  }

  return {
    filingType: input.filingType,
    valid: missing.length === 0,
    requiredCount: required.length,
    presentCount: required.length - missing.length,
    missing,
    unknownSections,
  };
}
