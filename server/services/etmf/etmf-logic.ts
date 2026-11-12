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
 * A name as its words. `word` is the word with apostrophes dropped, so
 * "Investigator's" and "Investigators" read the same against the catalog.
 * `stem` drops a possessive or an elided article, so "IRB's approval" and
 * "l'IRB" still hold the keyword "irb". Every other run of non-alphanumerics separates words: a space, a
 * hyphen, a full stop and an underscore alike. `used` marks a word already
 * taken by a longer phrase.
 */
interface NameWord { word: string; stem: string; used: boolean }

function nameWords(s: string): NameWord[] {
  return s.toLowerCase().split(/[^a-z0-9'’]+/).flatMap((piece) => {
    const word = piece.replace(/['’]/g, '');
    if (!word) return [];
    // "irb's" → irb (a possessive); "l'irb", "dell'iec" → irb, iec (an elided article).
    const parts = piece.split(/['’]/).filter(Boolean);
    const last = parts[parts.length - 1];
    const stem = parts.length < 2 ? word : last === 's' ? parts.slice(0, -1).join('') : last;
    return [{ word, stem, used: false }];
  });
}

const phraseOf = (s: string): string[] => nameWords(s).map((w) => w.word);

/** Takes `phrase` wherever it stands, whole, in the words not yet taken; says whether it was found. */
function take(name: NameWord[], phrase: string[], form: 'word' | 'stem'): boolean {
  let found = false;
  for (let i = 0; i + phrase.length <= name.length; i += 1) {
    if (!phrase.every((w, j) => !name[i + j].used && name[i + j][form] === w)) continue;
    for (let j = 0; j < phrase.length; j += 1) name[i + j].used = true;
    found = true;
    i += phrase.length - 1;
  }
  return found;
}

/**
 * Words that say which copy of a document a file is, not which document: a
 * version, a date, a status, a file extension. "Monitoring Plan v3 FINAL
 * 2026-10-30.pdf" is the Monitoring Plan.
 */
const NOISE_WORD = new RegExp(
  '^(?:' +
    [
      'v\\d*', '\\d+', 'version', 'ver', 'rev', 'revision', 'edition', 'ed',
      'draft', 'final', 'signed', 'copy', 'scan', 'scanned', 'dated',
      'jan(?:uary)?', 'feb(?:ruary)?', 'mar(?:ch)?', 'apr(?:il)?', 'may', 'june?', 'july?', 'aug(?:ust)?',
      'sep(?:t(?:ember)?)?', 'oct(?:ober)?', 'nov(?:ember)?', 'dec(?:ember)?',
      'pdf', 'docx?', 'docm', 'dotx?', 'xlsx?', 'xlsm', 'csv', 'pptx?', 'txt', 'rtf', 'odt', 'ods', 'xml', 'json',
      'zip', 'msg', 'eml', 'html?', 'png', 'jpe?g', 'tiff?', 'gif',
    ].join('|') +
    ')$',
);
/** A name's words with the version, date, status and extension words taken out. */
function identity(s: string): string {
  return phraseOf(s).filter((w) => !NOISE_WORD.test(w)).join(' ');
}

/**
 * The catalog, as the classifier reads it: every artifact's name as words,
 * longest first, so a name that contains another catalog name ("Sample
 * Informed Consent Form") is found before the shorter one could be.
 */
const CATALOG_NAMES = TMF_REFERENCE_MODEL.flatMap((z) =>
  z.artifacts.map((a) => ({ zone: z.number, code: a.code, phrase: phraseOf(a.name) })),
).sort((x, y) => y.phrase.length - x.phrase.length);

/** Whether `inner` stands, whole and in order, inside `outer`. */
function within(inner: string[], outer: string[]): boolean {
  return outer.some((_, i) => i + inner.length <= outer.length && inner.every((w, j) => outer[i + j] === w));
}
const CATALOG_CODES = new Map(
  TMF_REFERENCE_MODEL.flatMap((z) => z.artifacts.map((a) => [a.code, { zone: z.number, code: a.code }] as const)),
);
/** Each catalog name with the same words taken out, so "is this name that artifact" compares like with like. */
const CATALOG_IDENTITIES = new Map(
  TMF_REFERENCE_MODEL.flatMap((z) => z.artifacts.map((a) => [identity(a.name), { zone: z.number, code: a.code }] as const)),
);

/**
 * Keyword → zone rules for names that are not catalog artifacts. Each keyword
 * is lower-case words, matched as whole words in the name's words. `section` is
 * what Store B records for an auto-classified artifact; omitted, it is the
 * zone's name.
 *
 * Which keyword decides: a longer keyword takes its words first, so a shorter
 * one inside it is not counted twice ("sample icf" is not also "icf"), and it
 * keeps that shorter keyword's place. Of the keywords then found, the earliest
 * place decides, as the earliest rule always did.
 *
 * History of this table:
 * - Until 2026-11-10 the rules were regular expressions read against the raw
 *   name, first match wins. `\b` does not break at an underscore, so
 *   "delegation_log_site_04.pdf" matched nothing. And three keywords could
 *   never fire: "sample icf" and "sample crf" (zone 2) lost to "icf" (zone 4)
 *   and "crf" (zone 10), and "randomisation list" (zone 11) to "randomisation"
 *   (zone 6).
 * - 2026-10-30: the zone-3 rule matched 'form fda 1572|1572|fda' ahead of the
 *   zone-5 rule's '1572', so Form FDA 1572 (a Site Management record in the DIA
 *   model) was filed under Regulatory. The investigator's own forms are the
 *   first rule since 2026-11-11, so "Form FDA 1572 - IRB copy" is the 1572 too.
 * - 2026-11-11: "financial disclosure" joined that rule. The catalog's
 *   Financial disclosure form is a zone-5 record, and "Form FDA 3455 Financial
 *   Disclosure - Dr Smith" was filed under Regulatory by the keyword "fda".
 * - 2026-11-11: "randomisation" moved from IP and Trial Supplies (zone 6) to
 *   Statistics (zone 11), in the same place in the order. The catalog's
 *   Randomization plan is a zone-11 record, and the keyword contradicted it.
 */
export const TMF_KEYWORD_RULES: ReadonlyArray<{ zone: number; section?: string; phrases: readonly string[] }> = [
  { zone: 5, phrases: ['1572', 'fda1572', 'statement of investigator', 'financial disclosure'] },
  { zone: 4, section: 'IRB/IEC Approval', phrases: ['irb', 'iec', 'ethics', 'informed consent', 'consent form', 'icf', 'assent'] },
  { zone: 3, section: 'Regulatory Submission', phrases: ['ind', 'cta', 'regulatory', 'competent authority', 'fda'] },
  { zone: 7, phrases: ['sae', 'susar', 'safety', 'adverse', 'dsur', 'pharmacovigilance'] },
  { zone: 11, phrases: ['randomisation', 'randomization'] },
  { zone: 6, section: 'IP Management', phrases: ['investigational product', 'drug accountability', 'ip', 'unblinding', 'label'] },
  { zone: 5, phrases: ['site', 'delegation log', 'cv', 'curriculum vitae', 'training log', 'monitoring visit'] },
  { zone: 11, phrases: ['sap', 'statistics'] },
  { zone: 10, phrases: ['dmp', 'crf', 'case report form', 'edit check', 'database lock'] },
  { zone: 8, section: 'Testing', phrases: ['laboratory', 'lab manual', 'central lab', 'sample handling', 'assay'] },
  { zone: 9, phrases: ['vendor', 'cro', 'contract', 'agreement', 'sow'] },
  { zone: 2, phrases: ['protocol', 'investigator brochure', 'ib', 'sample icf', 'sample crf'] },
  { zone: 1, phrases: ['trial plan', 'tmf plan', 'oversight', 'kickoff'] },
];

/**
 * Keywords that say whose document it is (which site, CRO, vendor or
 * protocol), not what it is. Beside a catalog name they are not a second
 * opinion: "SAE reports Site 101" is still the SAE reports' zone. With no
 * catalog name in the name they decide as any keyword does.
 */
export const TMF_QUALIFIER_KEYWORDS: ReadonlySet<string> = new Set(['site', 'cro', 'vendor', 'protocol']);

/**
 * Words that say a document is ABOUT a record, not the record: the site's
 * receipt or acceptance of the brochure, the signature page of the protocol,
 * the cover letter of a submission. Beside a catalog name they are a second
 * signal, so the name is left for a person: until 2026-11-12 "Investigators
 * Brochure receipt site 04.pdf" was filed with the brochure. They name no zone
 * themselves, and with no catalog name beside them they say nothing.
 */
export const TMF_ABOUT_PHRASES: readonly string[] = [
  'receipt', 'acknowledgement', 'acknowledgment', 'acceptance', 'signature page', 'cover letter', 'transmittal',
];
const ABOUT = TMF_ABOUT_PHRASES.map((p) => p.split(' '));

/**
 * Every keyword, longest first. `rule` is the keyword's own place in the
 * table. `place` is where it stands when keywords are compared: its own rule,
 * or the earlier rule of a shorter keyword it holds. "sample icf" (the last
 * rule but one) holds "icf" (the second), takes its words, and so must keep its
 * place. Until 2026-11-12 it did not, and "Sample ICF - Site 101.pdf" went to
 * whichever rule lay between: Site Management.
 */
const KEYWORDS = TMF_KEYWORD_RULES.flatMap((rule, index) =>
  rule.phrases.map((p) => ({ rule, index, phrase: p.split(' '), qualifier: TMF_QUALIFIER_KEYWORDS.has(p) })),
)
  .map((k, _i, all) => ({
    ...k,
    place: Math.min(k.index, ...all.filter((o) => o !== k && within(o.phrase, k.phrase)).map((o) => o.index)),
  }))
  .sort((x, y) => y.phrase.length - x.phrase.length || x.index - y.index);

/**
 * Where each catalog name stands among the keyword rules: the place of the
 * earliest keyword inside it that points to its own zone ("financial
 * disclosure" in "Financial disclosure form"; "irb" in "IRB/IEC approval"), or
 * nowhere. A catalog name that stands earlier than a keyword beside it keeps
 * its zone, as that keyword alone would have.
 */
const CATALOG_STANDING = new Map(
  CATALOG_NAMES.map((c) => [
    c,
    Math.min(Infinity, ...KEYWORDS.filter((k) => k.rule.zone === c.zone && within(k.phrase, c.phrase)).map((k) => k.place)),
  ]),
);

/** The section an artifact classified into `zone` is recorded under: its rule's, or the zone's name. */
function sectionOf(zone: number): string {
  return TMF_KEYWORD_RULES.find((r) => r.zone === zone && r.section)?.section ?? zoneName(zone);
}

/**
 * The keywords among the words not yet taken, the deciding one first: the
 * earliest place, and between two at the same place the keyword whose own rule
 * that is ("irb" before "sample icf", which only inherits it).
 */
function keywordsIn(name: NameWord[]): Array<(typeof KEYWORDS)[number]> {
  return KEYWORDS.filter((k) => take(name, k.phrase, 'stem')).sort((x, y) => x.place - y.place || x.index - y.index);
}

/**
 * `code` is the catalog artifact the name identifies, or null when the name
 * only points to a zone: the zone is then known and the artifact is not.
 * `conflict` is set when the name was left unclassified because it points to
 * more than one zone, and absent when nothing in it points to any.
 * `qualifierOnly` is set when the only thing that named the zone was a
 * whose-document keyword ("Site 101"): a caller that reads a name and a title
 * may let the other one decide.
 */
export type Classification =
  | { zone: number; zoneName: string; section: string; confidence: 'matched'; code: string | null; qualifierOnly?: true }
  | { zone: null; zoneName: null; section: null; confidence: 'unclassified'; conflict?: true };

const UNCLASSIFIED: Classification = Object.freeze({ zone: null, zoneName: null, section: null, confidence: 'unclassified' });
const TWO_ZONES: Classification = Object.freeze({ ...UNCLASSIFIED, conflict: true });

function inZone(zone: number, code: string | null, section = sectionOf(zone)): Extract<Classification, { confidence: 'matched' }> {
  return { zone, zoneName: zoneName(zone), section, confidence: 'matched', code };
}

/**
 * Auto-classify an artifact by name into a DIA RM zone. Pure, deterministic.
 *
 *   1. The name IS a catalog artifact: its code given as the whole name
 *      ('monitoring_plan'), or its catalog name give or take a version, a date,
 *      a status word or a file extension ("Monitoring Plan v3 FINAL.pdf"). That
 *      identifies the artifact: its code and its own zone, under the section a
 *      keyword match into that zone records.
 *   2. The name CONTAINS a catalog name among other words. That points to the
 *      artifact's zone and names no artifact (`code: null`): "SAE reports Site
 *      101", "LMN-201 Monitoring Plan v2". A keyword in the rest of the name
 *      that says what the document is, and points elsewhere, makes two signals:
 *      "IRB approval of Sample Informed Consent Form" is `unclassified`, and a
 *      person files it. So do two catalog names from different zones, and a
 *      word that says the document is about the record ("receipt"). A keyword
 *      inside the catalog name itself ("case report form" in "Sample Case Report
 *      Form") is not counted, and neither is a whose-document keyword. And a
 *      catalog name that stands earlier among the rules than the keyword beside
 *      it keeps its zone: "IRB/IEC approval - Case Report Form" is the IRB's.
 *   3. With no catalog name, the keyword rules name a zone, with no artifact.
 *   4. A name with neither is `unclassified`, with no zone.
 *
 * 2026-10-15: an unmatched name returned Zone 2 (Central Trial Documents) as
 * confidence 'default', and addArtifactTx stored that zone as if it were known.
 *
 * 2026-10-30: step 1 did not exist. Of the 41 catalog names, 10 came back
 * unclassified ("Trial Master File Plan", "Monitoring Plan", "Investigator's
 * Brochure", …) and 4 in another zone ("Sample Case Report Form" → 10, "Sample
 * Informed Consent Form" → 4, "Safety report submissions to IRB/IEC" → 4,
 * "Randomization plan" → 6) — in Store B and in Vault filing's service view.
 *
 * 2026-11-10: a catalog name found anywhere in a name identified that artifact,
 * so "Data Safety Monitoring Plan.pdf" was the Monitoring Plan and "IRB approval
 * of Sample Informed Consent Form.pdf" the sample consent form, each an
 * essential record reported as present. Step 2 is that correction.
 */
export function classifyArtifact(artifactName: string): Classification {
  const named = CATALOG_CODES.get(artifactName.trim().toLowerCase()) ?? CATALOG_IDENTITIES.get(identity(artifactName));
  if (named) return inZone(named.zone, named.code);

  const name = nameWords(artifactName);
  const contained = CATALOG_NAMES.filter((c) => take(name, c.phrase, 'word'));
  const zones = new Set(contained.map((c) => c.zone));
  if (zones.size > 1) return TWO_ZONES;

  const keywords = keywordsIn(name);
  const [zone] = zones;
  if (zone !== undefined) {
    if (ABOUT.some((phrase) => take(name, phrase, 'stem'))) return TWO_ZONES;
    const other = keywords.find((k) => !k.qualifier && k.rule.zone !== zone);
    const standing = Math.min(...contained.map((c) => CATALOG_STANDING.get(c) ?? Infinity));
    return !other || standing < other.place ? inZone(zone, null) : TWO_ZONES;
  }
  const [first] = keywords;
  if (!first) return UNCLASSIFIED;
  const matched = inZone(first.rule.zone, null, first.rule.section ?? zoneName(first.rule.zone));
  return keywords.every((k) => k.qualifier) ? { ...matched, qualifierOnly: true } : matched;
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
