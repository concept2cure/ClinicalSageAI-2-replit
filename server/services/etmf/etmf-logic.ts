/**
 * eTMF deterministic logic (Capability C2C-08)
 *
 * Pure, DB-free, LLM-free: the DIA TMF Reference Model zone names, an artifact
 * auto-classifier (the deterministic baseline an LLM can refine), and the
 * completeness gap-check that feeds inspection readiness. Grounded in the
 * DIA TMF Reference Model and ICH E6(R3) Appendix C (essential records).
 *
 * The zones and artifacts are the one catalog in
 * shared/constants/domain/tmf-reference-model.ts. This module kept its own zone
 * list until 2026-10-30 (slice E1 of docs/design/ETMF_CONVERGENCE_2026-10-30.md),
 * with zone 4 spelled differently from the catalog it classified for.
 *
 * @module server/services/etmf/etmf-logic
 */

import type { ArtifactStatus } from '../../../shared/schema/etmf';
import { TMF_REFERENCE_MODEL } from '../../../shared/constants/domain/tmf-reference-model.js';

/** DIA TMF Reference Model zones (v3), from the shared catalog. */
export const TMF_ZONES: Array<{ zone: number; name: string }> = TMF_REFERENCE_MODEL.map((z) => ({
  zone: z.number,
  name: z.name,
}));

const ZONE_NAME = new Map(TMF_ZONES.map((z) => [z.zone, z.name]));
export function zoneName(zone: number): string {
  return ZONE_NAME.get(zone) ?? 'Unknown';
}

/**
 * A name reduced to lower-case words: apostrophes dropped ("Investigator's" and
 * "Investigators" read the same), every other run of non-alphanumerics one space.
 */
function words(s: string): string {
  return s.toLowerCase().replace(/['\u2019]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * The catalog, as the classifier reads it: every artifact's name in words,
 * longest first, so a name that contains another catalog name ("Sample
 * Informed Consent Form") is matched before the shorter one could be.
 */
const CATALOG_NAMES = TMF_REFERENCE_MODEL.flatMap((z) =>
  z.artifacts.map((a) => ({ zone: z.number, code: a.code, phrase: words(a.name) })),
).sort((x, y) => y.phrase.length - x.phrase.length);
const CATALOG_CODES = new Map(
  TMF_REFERENCE_MODEL.flatMap((z) => z.artifacts.map((a) => [a.code, { zone: z.number, code: a.code }] as const)),
);

/**
 * Keyword → zone rules for names that are not catalog artifacts (first match
 * wins). `section` is what Store B records for an auto-classified artifact;
 * omitted, it is the zone's name.
 *
 * 2026-10-30: the zone-3 rule matched 'form fda 1572|1572|fda' ahead of the
 * zone-5 rule's '1572', so that keyword could never fire and Form FDA 1572 (a
 * Site Management record in the DIA model) was filed under Regulatory. 1572 is
 * now its own rule, ahead of the zone-3 rule, and nowhere else.
 */
const CLASSIFY_RULES: Array<{ zone: number; section?: string; keywords: RegExp }> = [
  { zone: 4, section: 'IRB/IEC Approval', keywords: /\b(irb|iec|ethics|informed consent|consent form|icf|assent)\b/i },
  { zone: 5, keywords: /\b(form fda[ -]?1572|fda[ -]?1572|1572)\b/i },
  { zone: 3, section: 'Regulatory Submission', keywords: /\b(ind|cta|regulatory|competent authority|fda)\b/i },
  { zone: 7, keywords: /\b(sae|susar|safety|adverse|dsur|pharmacovigilance)\b/i },
  { zone: 6, section: 'IP Management', keywords: /\b(investigational product|drug accountability|ip\b|randomi[sz]ation|unblinding|label)\b/i },
  { zone: 5, keywords: /\b(site|delegation log|cv\b|curriculum vitae|training log|monitoring visit)\b/i },
  { zone: 11, keywords: /\b(statistical analysis plan|\bsap\b|randomi[sz]ation list|statistics)\b/i },
  { zone: 10, keywords: /\b(data management plan|\bdmp\b|crf|case report form|edit check|database lock)\b/i },
  { zone: 8, section: 'Testing', keywords: /\b(laboratory|lab manual|central lab|sample handling|assay)\b/i },
  { zone: 9, keywords: /\b(vendor|cro\b|contract|agreement|sow\b)\b/i },
  { zone: 2, keywords: /\b(protocol|investigator brochure|\bib\b|sample (icf|crf))\b/i },
  { zone: 1, keywords: /\b(trial plan|communication plan|tmf plan|oversight|kickoff)\b/i },
];

/** The section an artifact classified into `zone` is recorded under: its rule's, or the zone's name. */
function sectionOf(zone: number): string {
  return CLASSIFY_RULES.find((r) => r.zone === zone && r.section)?.section ?? zoneName(zone);
}

/**
 * `code` is the catalog artifact the name identifies, or null when only a
 * keyword rule matched: the zone is then known and the artifact is not.
 */
export type Classification =
  | { zone: number; zoneName: string; section: string; confidence: 'matched'; code: string | null }
  | { zone: null; zoneName: null; section: null; confidence: 'unclassified' };

/**
 * Auto-classify an artifact by name into a DIA RM zone. Pure, deterministic.
 *
 *   1. A catalog artifact code, given as the whole name ('monitoring_plan'),
 *      or a catalog artifact name found as whole words in it ("Monitoring Plan
 *      v3.pdf") identifies that artifact: its code and its own zone, under the
 *      section a keyword match into that zone records, so a name that
 *      classified correctly before keeps its section.
 *   2. Otherwise the keyword rules name a zone, with no artifact code.
 *   3. A name neither identifies is `unclassified`, with no zone.
 *
 * 2026-10-15: an unmatched name returned Zone 2 (Central Trial Documents) as
 * confidence 'default', and addArtifactTx stored that zone as if it were known.
 *
 * 2026-10-30: step 1 did not exist. Of the 41 catalog names, 10 came back
 * unclassified ("Trial Master File Plan", "Monitoring Plan", "Investigator's
 * Brochure", …) and 4 in another zone ("Sample Case Report Form" → 10, "Sample
 * Informed Consent Form" → 4, "Safety report submissions to IRB/IEC" → 4,
 * "Randomization plan" → 6) — in Store B and in Vault filing's service view.
 */
export function classifyArtifact(artifactName: string): Classification {
  const raw = artifactName.trim().toLowerCase();
  const text = ` ${words(artifactName)} `;
  const byCode = CATALOG_CODES.get(raw);
  const hit = byCode ?? CATALOG_NAMES.find((c) => c.phrase && text.includes(` ${c.phrase} `));
  if (hit) {
    return { zone: hit.zone, zoneName: zoneName(hit.zone), section: sectionOf(hit.zone), confidence: 'matched', code: hit.code };
  }
  for (const rule of CLASSIFY_RULES) {
    if (rule.keywords.test(artifactName)) {
      const name = zoneName(rule.zone);
      return { zone: rule.zone, zoneName: name, section: rule.section ?? name, confidence: 'matched', code: null };
    }
  }
  return { zone: null, zoneName: null, section: null, confidence: 'unclassified' };
}

/** An artifact "counts as present" when it is received, in review, or final. */
function isPresent(status: ArtifactStatus): boolean {
  return status === 'received' || status === 'in_review' || status === 'final';
}

export interface CompletenessArtifact {
  zone: number;
  artifactName: string;
  expected: boolean;
  completenessRequired: boolean;
  status: ArtifactStatus;
}

export interface CompletenessResult {
  /**
   * Percentage of required artifacts that are final — NULL when nothing is
   * required, because there is then no ratio and no assessment. It was 100.
   */
  completenessPct: number | null;
  totalRequired: number;
  present: number;
  gaps: Array<{ zone: number; zoneName: string; artifactName: string; status: ArtifactStatus }>;
  byZone: Record<number, { required: number; present: number }>;
  /**
   * `not_assessed` is the state of a TMF whose expected artifact set is empty:
   * nothing has been indexed, so nothing has been checked. It is NOT readiness.
   */
  verdict: 'not_assessed' | 'inspection_ready' | 'minor_gaps' | 'at_risk';
}

/**
 * Completeness gap-check. The denominator is the expected + completeness-required
 * artifacts; the numerator is those present (received/in_review/final). Missing,
 * still-expected, or in_review-but-not-final required artifacts are listed as
 * gaps. Pure — feeds inspection readiness (C2C-13).
 */
export function evaluateCompleteness(artifacts: CompletenessArtifact[]): CompletenessResult {
  const required = artifacts.filter((a) => a.expected && a.completenessRequired && a.status !== 'not_applicable');
  const byZone: Record<number, { required: number; present: number }> = {};
  const gaps: CompletenessResult['gaps'] = [];
  let present = 0;
  for (const a of required) {
    byZone[a.zone] ??= { required: 0, present: 0 };
    byZone[a.zone].required += 1;
    // For inspection readiness, "present" means final; received/in_review are partial gaps.
    if (a.status === 'final') {
      present += 1;
      byZone[a.zone].present += 1;
    } else {
      gaps.push({ zone: a.zone, zoneName: zoneName(a.zone), artifactName: a.artifactName, status: a.status });
    }
  }
  const totalRequired = required.length;

  /* An empty required set returned 100% and — since `present === totalRequired`
     is 0 === 0 — the verdict `inspection_ready`. A trial whose TMF index holds
     no expected artifacts was therefore reported to the sponsor, and by AnA in
     conversation, as "TMF 100% complete — inspection ready". Nothing had been
     indexed, so nothing had been checked: that is the absence of an assessment,
     not the result of one. ICH E6(R3) Appendix C readiness is a claim a sponsor acts on
     in front of an inspector; it is never the default. */
  if (totalRequired === 0) {
    return { completenessPct: null, totalRequired: 0, present: 0, gaps, byZone, verdict: 'not_assessed' };
  }

  const completenessPct = Math.round((present / totalRequired) * 100);
  // inspection_ready requires EVERY required artifact present (zero gaps): a single
  // missing required document is inspection-blocking and must never be masked by
  // rounding completenessPct up to >= 98 (e.g. 199/200 final rounds to 100%).
  const verdict: CompletenessResult['verdict'] =
    present === totalRequired ? 'inspection_ready' : completenessPct >= 85 ? 'minor_gaps' : 'at_risk';
  return { completenessPct, totalRequired, present, gaps, byZone, verdict };
}
