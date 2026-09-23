/**
 * MDR / IVDR technical-documentation engine (EU MedTech device & IVD)
 *
 * Projects the canonical submission content onto the EU technical-documentation
 * structure required by Regulation (EU) 2017/745 (MDR, Annex II/III) or
 * 2017/746 (IVDR, Annex II/III), and reports completeness — which required
 * tech-doc sections (incl. the GSPR / Performance Evaluation evidence) are
 * present vs missing — so a manufacturer sees Notified-Body readiness before
 * compiling EUDAMED.
 *
 * MDR/IVDR is NOT eCTD (spec §3) — this is the "one canonical core, many
 * projections" principle applied to the device/IVD pathway. It maps and
 * gap-checks; it does not submit to EUDAMED or a Notified Body.
 *
 * PURE + DETERMINISTIC + HONEST-BY-CONSTRUCTION: no DB, no network, no LLM. A
 * section with no matching source leaf is a gap, never invented.
 *
 * @module server/services/pathway-engines/mdr-ivdr/tech-doc-assembler
 */

export type EuRegulation = 'mdr' | 'ivdr';

/** A canonical leaf as tech-doc input (device docs are keyed by documentType). */
export interface TechDocInputLeaf {
  /** CTD section code or a device tech-doc code (free text). */
  sectionCode: string;
  title: string;
  /** Document-type hint, e.g. 'device_description', 'risk_management', 'cer', 'per'. */
  documentType?: string;
}

export interface TechDocSlot {
  id: string;
  label: string;
  /** The MDR/IVDR annex reference for this section. */
  annex: string;
  required: boolean;
}

export interface TechDocSlotStatus extends TechDocSlot {
  present: boolean;
  /** Section code (or title, when the leaf has no code) of each matched leaf. */
  sources: string[];
  /**
   * The matched leaves themselves: indices into the `leaves` array the result
   * was assembled from, parallel to `sources`.
   *
   * 2026-09-23 (W5/D7, residual repair): a slot matches by document type and
   * title as well as by code, so two leaves can share a code and belong to
   * different slots (a bench report and the CER both at II.6.1.b). `sources`
   * alone cannot say which of them a slot took; the technical-file packager
   * re-found each leaf from the string and filled the CER slot with the first
   * leaf that had the code. The packager places exactly these leaves.
   */
  leafIndices: number[];
  /**
   * 2026-09-23 (W5/D7, final pass): the subset of `leafIndices` this slot
   * matched by title alone — the slot would not match the leaf with its title
   * blanked (no outline key, document type or code prefix of the slot's).
   * Every Vault-built sequence leaf is such a leaf (CTD code, no document type,
   * titled with its file name), so a title-only match is not refused — that
   * would refuse the Vault flow — but it is reported, never presented as a
   * keyed placement (technical-file-packager.ts, `matchedByTitleOnly`).
   */
  titleOnlyLeafIndices: number[];
}

export interface TechDocResult {
  regulation: EuRegulation;
  sections: TechDocSlotStatus[];
  summary: {
    missingRequired: string[];
    /** True when every required tech-doc section has a source leaf. */
    ready: boolean;
  };
}

type Matcher = (l: TechDocInputLeaf) => boolean;
const docType = (...t: string[]): Matcher => (l) => !!l.documentType && t.includes(l.documentType);

/**
 * The Annex II / III key trees of the eu-mdr-2017-745 / eu-ivdr-2017-746
 * outlines (migrations/20260810b_eu_mdr_ivdr_outlines.sql): the key itself or a
 * dotted descendant ('II', 'II.6.1.a', 'III.1'; not 'IIa', not 'IV'). This is
 * the technical documentation the technical-file ZIP holds; the packager counts
 * an unclaimed leaf under it against `ready` (technical-file-packager.ts).
 */
export const ANNEX_II_III_KEY = /^(?:II|III)(?:\.|$)/;

/**
 * Every key of those outlines — Annex II, Annex III and the conformity group IV.
 *
 * 2026-09-23 (W5/D7, residual repair — round 3): a leaf keyed here is placed by
 * its key (and by its document type), never by its title. The title matchers
 * are a fallback for leaves the outline does not key (CTD codes, free text).
 * Matching a keyed leaf by title filed a II.6.1.a bench report titled
 * "Preclinical evaluation - biocompatibility" as the MDR Annex XIV CER, and a
 * II.6.1.a "Analytical performance evaluation report" as the IVDR Annex XIII
 * PER: the required slot was filled by the wrong document and the file
 * reported ready with no CER / PER in it. For the same reason the IVDR
 * II.6.2.a scientific-validity section no longer stands in for the II.6.2.c
 * PER by its title.
 *
 * 2026-09-23 (W5/D7, final pass) — amends the round-3 note, which said more
 * than the code did. Document-type matching still applies to an Annex II/III
 * keyed leaf (the bench-and-CER-at-II.6.1.b case needs it), and documentType
 * is a free field on PUT /sequences/:seqId/leaves: an II.6.2.a leaf that
 * declares documentType 'scientific_validity' is still placed in the PER slot,
 * because that document type is one of the PER slot's own. A group IV leaf is
 * now claimed by no slot by any matcher — key, title or document type
 * (evalSlot, EU_GROUP_IV_KEY) — so an IV.4 SSCP with documentType 'cer' no
 * longer fills the CER slot.
 *
 * Tested against euOutlineKey(sectionCode), not the raw code.
 */
const EU_OUTLINE_KEY = /^(?:II|III|IV)(?:\.|$)/;
const EU_GROUP_IV_KEY = /^IV(?:\.|$)/;

/**
 * 2026-09-23 (W5/D7, final pass): the section code as the outline spells its
 * keys — trimmed, the Roman annex numeral uppercased and the rest lowercased
 * (' ii.6.1.G' → 'II.6.1.g'). A code that does not start with an outline
 * numeral is returned trimmed and otherwise unchanged. Every key matcher here
 * and the packager's ANNEX_II_III_KEY test read the code through this, so a
 * code sent with stray whitespace or in another case is still the outline key
 * (it was title-matched as unkeyed, and the packager did not count it as
 * Annex II/III documentation).
 */
export function euOutlineKey(sectionCode: string | null | undefined): string {
  const code = (sectionCode ?? '').trim();
  const m = /^(iii|ii|iv)(?=\.|$)/i.exec(code);
  return m ? m[1].toUpperCase() + code.slice(m[1].length).toLowerCase() : code;
}

/**
 * 2026-09-23 (W5/D7, final pass): a title as lowercase letter tokens. Every
 * non-letter separates tokens ('_', '-', digits, whitespace, punctuation), and
 * so does a lower-to-upper case transition ('eIFU' → e, ifu;
 * 'PerformanceEvaluationReport' → performance, evaluation, report). A run of
 * capitals followed by lower-case letters is read by capitalRun().
 *
 * Supersedes the round-3 phraseRe, which bounded a phrase with (?<![\w-]) /
 * (?![\w-]): '_' counted as a word character, so the single-token matchers no
 * longer matched the titles the Vault flow produces — a Vault document is
 * titled with its file name minus the extension
 * (client/src/concept2cure/v2/useVaultUpload.ts) and placed at a CTD code, so
 * the title is the only signal — and 'IFU_EN_rev3' / 'GSPR_Checklist_v2' left
 * their required slots empty.
 */
function tokens(s: string): string[] {
  return s
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}{2,})(\p{Ll}+)/gu, capitalRun)
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
}

/**
 * 2026-09-23 (W5/D7, final pass — repair): the capitals the registry's title
 * phrases spell as acronyms. See capitalRun().
 */
const TITLE_ACRONYMS = new Set(['IFU', 'EIFU', 'GSPR', 'PMS']);

/**
 * 2026-09-23 (W5/D7, final pass — repair): a capital run followed by
 * lower-case letters. A run that is one of TITLE_ACRONYMS is that acronym and
 * the letters after it are a word of their own ('GSPRchecklist' → gspr,
 * checklist; 'IFUs' → ifu, s; 'IFUen' → ifu, en). Otherwise the last capital
 * starts the next word ('IFUManual' → ifu, manual; 'PMSPlan' → pms, plan).
 * Supersedes the first token rewrite, which always split before the last
 * capital: 'IFUs' became 'if' + 'us' and 'GSPRchecklist' 'gsp' + 'rchecklist',
 * so plural and glued acronyms HEAD filed were left out of the technical file.
 */
function capitalRun(_m: string, run: string, rest: string): string {
  if (TITLE_ACRONYMS.has(run)) return `${run} ${rest}`;
  return `${run.slice(0, -1)} ${run.slice(-1)}${rest}`;
}

/**
 * A phrase matched as a token sequence of the title. The phrase starts at a
 * token, so a longer word that ends in it is not it ('Gifu' is not 'ifu',
 * 'preclinical' is not 'clinical'). Its inner tokens are whole. Its last token
 * may continue into the title token (2026-09-23, W5/D7, final pass — repair):
 * 'IFUs', 'descriptions', 'evaluations', 'managementfile' — as HEAD's
 * substring match did on that side; the letters it continues into are read
 * as the next word for `notBefore` ('evaluationplan' is a plan).
 *
 * `notAfter` lists tokens that, directly before the phrase, make it a
 * different thing ('pre' / 'non' before 'clinical evaluation'; 'analytical' /
 * 'clinical' before 'performance evaluation'); `notBefore` lists words that,
 * directly after it, do ('plan': a clinical evaluation plan is not the CER) —
 * a following word that begins with one ('plans', 'planning') counts, since
 * skipping an occurrence only ever leaves a slot unfilled — unless the title
 * also has a `notBeforeUnless` token or its plural ('Performance evaluation
 * plan and report' is the outline's own II.6.2.c label for the PER). An
 * occurrence that is so qualified is skipped and any other occurrence still
 * matches.
 */
interface PhraseRule {
  phrase: string[];
  notAfter: string[];
  notBefore: string[];
  notBeforeUnless: string[];
}
interface Qualifiers {
  notAfter?: string[];
  notBefore?: string[];
  notBeforeUnless?: string[];
}
const phrase = (x: string, q: Qualifiers = {}): PhraseRule => ({
  phrase: tokens(x),
  notAfter: q.notAfter ?? [],
  notBefore: q.notBefore ?? [],
  notBeforeUnless: q.notBeforeUnless ?? [],
});
const PLURAL_ENDINGS = ['', 's', 'es'];
/** The word after the phrase occurrence ending at title token `last`, or '' when there is none. */
function wordAfter(t: string[], last: number, p: string): string {
  const rest = t[last].slice(p.length);
  if (!PLURAL_ENDINGS.includes(rest)) return rest;
  return t[last + 1] ?? '';
}
function occurrenceAt(t: string[], i: number, r: PhraseRule): boolean {
  const n = r.phrase.length;
  const inner = r.phrase.slice(0, -1).every((p, j) => t[i + j] === p);
  return inner && t[i + n - 1].startsWith(r.phrase[n - 1]);
}
function phraseIn(t: string[], r: PhraseRule): boolean {
  const n = r.phrase.length;
  const beforeApplies = !r.notBeforeUnless.some((u) => t.some((x) => PLURAL_ENDINGS.some((e) => x === u + e)));
  for (let i = 0; i + n <= t.length; i++) {
    if (!occurrenceAt(t, i, r)) continue;
    if (i > 0 && r.notAfter.includes(t[i - 1])) continue;
    const next = wordAfter(t, i + n - 1, r.phrase[n - 1]);
    if (beforeApplies && r.notBefore.some((b) => next.startsWith(b))) continue;
    return true;
  }
  return false;
}
const unkeyed = (l: TechDocInputLeaf) => !EU_OUTLINE_KEY.test(euOutlineKey(l.sectionCode));
const titleMatches = (rules: PhraseRule[]): Matcher => (l) => {
  if (!unkeyed(l)) return false;
  const t = tokens(l.title ?? '');
  return rules.some((r) => phraseIn(t, r));
};
/** Title fallback for a leaf the EU outline does not key (see EU_OUTLINE_KEY): any of the phrases, as tokens. */
const titleHas = (...n: string[]): Matcher => titleMatches(n.map((x) => phrase(x)));
/** As titleHas for one phrase, skipping an occurrence the qualifiers make a different thing. */
const titleHasUnqualified = (x: string, q: Qualifiers): Matcher => titleMatches([phrase(x, q)]);
/** A plan is not the report it plans, unless the title says it is both. */
const NOT_THE_PLAN: Qualifiers = { notBefore: ['plan'], notBeforeUnless: ['report'] };
const codeStarts = (...p: string[]): Matcher => (l) => p.some((x) => l.sectionCode.startsWith(x));
const any = (...m: Matcher[]): Matcher => (l) => m.some((f) => f(l));
const all = (...m: Matcher[]): Matcher => (l) => m.every((f) => f(l));
const not = (m: Matcher): Matcher => (l) => !m(l);

/**
 * Rule-pack section keys — the codes the GOVERNED authoring store carries for
 * an EU technical file. These are the `key` values of the eu-mdr-2017-745 /
 * eu-ivdr-2017-746 outlines seeded by
 * migrations/20260810b_eu_mdr_ivdr_outlines.sql (Annex II §1–6, Annex III
 * PMS, and the conformity group IV). Without these matchers an authored
 * Annex II section reached the packager with no slot and was dropped.
 *
 * `annexKey('II.1')` claims the key itself and every dotted descendant
 * ('II.1.a', 'II.1.b', …) — and nothing else: 'II.10' is not under 'II.1'.
 * Both key matchers read euOutlineKey(sectionCode) (2026-09-23, W5/D7, final
 * pass).
 */
const annexKey = (...keys: string[]): Matcher => (l) => {
  const code = euOutlineKey(l.sectionCode);
  return keys.some((k) => code === k || code.startsWith(`${k}.`));
};
const exactKey = (...keys: string[]): Matcher => (l) => keys.includes(euOutlineKey(l.sectionCode));

// Shared tech-doc spine (MDR Annex II & IVDR Annex II are structurally parallel).
/*
 * Title phrases (2026-09-23, W5/D7, final pass) are matched as token sequences
 * (tokens(), phraseIn()). 'ifu' also matches 'eIFU' through the case
 * transition (e, ifu); 'eifu' is listed so the single-token spellings 'EIFU'
 * and 'eifu' — the electronic instructions for use of Regulation (EU)
 * 2021/2226 — are the IFU too. The CER phrase skips an occurrence after 'pre' /
 * 'non' ('Pre clinical evaluation', 'Non-clinical evaluation', 'nonClinical
 * evaluation'; 'preclinical' is one token and never matched) and before
 * 'plan' in a title with no 'report' (the CEP); the PER phrase does the same
 * after 'analytical' / 'clinical' and for the performance evaluation plan.
 * Since the repair of the same date a phrase's last token may continue into
 * the title token ('IFUs', 'GSPRs_checklist', 'Device descriptions'), and a
 * capital run that is one of TITLE_ACRONYMS is that acronym before lower-case
 * letters ('GSPRchecklist', 'IFUen') — see phraseIn() and capitalRun().
 */
const commonSlots = (annexPrefix: string): Array<TechDocSlot & { match: Matcher }> => [
  { id: 'device-description', label: 'Device description & specification', annex: `${annexPrefix} 1`, required: true, match: any(docType('device_description', 'device_specification'), titleHas('device description', 'intended purpose'), annexKey('II.1')) },
  { id: 'manufacturer-information', label: 'Information supplied by the manufacturer (labelling/IFU)', annex: `${annexPrefix} 2`, required: true, match: any(docType('ifu', 'labelling', 'label'), titleHas('instructions for use', 'ifu', 'eifu', 'labelling'), annexKey('II.2')) },
  { id: 'design-manufacturing', label: 'Design & manufacturing information', annex: `${annexPrefix} 3`, required: true, match: any(docType('design_manufacturing', 'manufacturing'), titleHas('design and manufacturing', 'manufacturing process'), annexKey('II.3')) },
  { id: 'gspr', label: 'General safety & performance requirements (GSPR) checklist', annex: 'Annex I', required: true, match: any(docType('gspr', 'gspr_checklist'), titleHas('general safety and performance', 'gspr'), annexKey('II.4')) },
  { id: 'risk-management', label: 'Benefit-risk analysis & risk management', annex: `${annexPrefix} 5`, required: true, match: any(docType('risk_management', 'benefit_risk'), titleHas('risk management', 'benefit-risk'), annexKey('II.5')) },
];

const MDR_SECTIONS: Array<TechDocSlot & { match: Matcher }> = [
  ...commonSlots('Annex II'),
  { id: 'preclinical-clinical', label: 'Product verification & validation (preclinical + clinical)', annex: 'Annex II 6', required: true, match: any(docType('preclinical', 'verification_validation'), codeStarts('4', '5'), titleHas('preclinical', 'verification and validation'), all(annexKey('II.6'), not(exactKey('II.6.1.g')))) },
  { id: 'clinical-evaluation', label: 'Clinical Evaluation Report (CER)', annex: 'Annex XIV', required: true, match: any(docType('cer', 'clinical_evaluation'), titleHasUnqualified('clinical evaluation', { notAfter: ['pre', 'non'], ...NOT_THE_PLAN }), exactKey('II.6.1.g')) },
  { id: 'pms-plan', label: 'Post-market surveillance plan', annex: 'Annex III', required: true, match: any(docType('pms_plan', 'pms'), titleHas('post-market surveillance', 'pms plan'), annexKey('III')) },
];

/*
 * 2026-09-23 (W5/D7, residual repair): the eu-ivdr-2017-746 outline
 * (migrations/20260810b_eu_mdr_ivdr_outlines.sql) defines II.6.3 stability
 * (mandatory), II.6.4 software and cybersecurity (optional) and II.6.5
 * usability (optional), and this registry had no slot for any of them: an
 * authored II.6.3 section was left out of the technical file and a complete
 * IVDR program was reported not ready. The three slots follow the PER, each
 * matched by its outline key tree (stability also by the 'stability' document
 * type), and `required` is the outline's `mandatory` flag. II.6.1.f (specimen
 * stability) is analytical performance and stays there.
 * 2026-09-23 (W5/D7, final pass, lead's repair): the three slots had no title
 * fallback, so a Vault-built sequence — CTD section codes, no document type —
 * could never fill the required stability slot, and a complete IVDR technical
 * file built through the Vault flow could never be ready. Each now matches by
 * title like every other slot: stability / shelf life (not after 'specimen' or
 * 'sample', which is Annex II 6.1(f) analytical performance), cybersecurity /
 * software verification / software validation, usability / human factors.
 */
const IVDR_SECTIONS: Array<TechDocSlot & { match: Matcher }> = [
  ...commonSlots('Annex II'),
  { id: 'analytical-performance', label: 'Analytical performance', annex: 'Annex II 6.1', required: true, match: any(docType('analytical_performance'), titleHas('analytical performance'), annexKey('II.6.1')) },
  { id: 'clinical-performance', label: 'Clinical performance', annex: 'Annex II 6.2', required: true, match: any(docType('clinical_performance'), titleHas('clinical performance'), all(annexKey('II.6.2'), not(exactKey('II.6.2.c')))) },
  { id: 'performance-evaluation', label: 'Performance Evaluation Report (PER) & scientific validity', annex: 'Annex XIII', required: true, match: any(docType('per', 'performance_evaluation', 'scientific_validity'), titleHasUnqualified('performance evaluation', { notAfter: ['analytical', 'clinical'], ...NOT_THE_PLAN }), titleHas('scientific validity'), exactKey('II.6.2.c')) },
  { id: 'stability', label: 'Stability (shelf life, in-use, transport)', annex: 'Annex II 6.3', required: true, match: any(docType('stability'), titleHasUnqualified('stability', { notAfter: ['specimen', 'sample'] }), titleHas('shelf life'), annexKey('II.6.3')) },
  { id: 'software-cybersecurity', label: 'Software verification & cybersecurity', annex: 'Annex II 6.4', required: false, match: any(titleHas('cybersecurity', 'software verification', 'software validation'), annexKey('II.6.4')) },
  { id: 'usability', label: 'Usability & human factors', annex: 'Annex II 6.5', required: false, match: any(titleHas('usability', 'human factors'), annexKey('II.6.5')) },
  { id: 'pms-plan', label: 'Post-market performance follow-up plan', annex: 'Annex III', required: true, match: any(docType('pmpf_plan', 'pms_plan', 'pms'), titleHas('post-market performance follow-up', 'pms plan'), annexKey('III')) },
];

/*
 * Outside the technical documentation, by rule: the eu-mdr / eu-ivdr outlines'
 * group IV (EU declaration of conformity — MDR/IVDR Annex IV, Article 19/17;
 * Notified Body certificate; EUDAMED actor/device/UDI registration — Articles
 * 29–31 / 26–28; the SSCP/SSP — Article 32/29; the PRRC — Article 15; the
 * authorised-representative mandate — Article 11; EU reference laboratory
 * testing) is mandatory in the outline for IV.1, IV.3 and IV.5 but is not part
 * of the Annex II/III technical documentation, so no slot here claims it —
 * not by key, and (2026-09-23, W5/D7 residual repair — round 3) not by title
 * either, since a keyed leaf is never title-matched (EU_OUTLINE_KEY). The
 * round-3 note over-claimed: a group IV leaf was still matched by its document
 * type (an IV.4 SSCP with documentType 'cer' filled the CER slot). Since
 * 2026-09-23 (W5/D7, final pass) evalSlot skips a group IV leaf for every
 * slot, so the statement above now holds for every matcher. The
 * technical-file packager reports such a leaf as unmapped with
 * inTechnicalDocumentation false and does not count it against `ready`; an
 * unclaimed Annex II/III key does count (technical-file-packager.ts,
 * ANNEX_II_III_KEY).
 */

function evalSlot(slot: TechDocSlot & { match: Matcher }, leaves: TechDocInputLeaf[]): TechDocSlotStatus {
  const leafIndices: number[] = [];
  const titleOnlyLeafIndices: number[] = [];
  leaves.forEach((l, i) => {
    // Group IV is outside the technical documentation: no matcher claims it.
    if (EU_GROUP_IV_KEY.test(euOutlineKey(l.sectionCode)) || !slot.match(l)) return;
    leafIndices.push(i);
    // Matched, but not without its title: the title was the only signal.
    if (!slot.match({ ...l, title: '' })) titleOnlyLeafIndices.push(i);
  });
  const sources = leafIndices.map((i) => leaves[i].sectionCode || leaves[i].title);
  const { match, ...rest } = slot;
  return { ...rest, present: sources.length > 0, sources, leafIndices, titleOnlyLeafIndices };
}

export interface AssembleTechDocInput {
  leaves: TechDocInputLeaf[];
  regulation: EuRegulation;
}

/** Assemble the MDR/IVDR technical-documentation structure + completeness report. */
export function assembleTechDoc(input: AssembleTechDocInput): TechDocResult {
  const leaves = Array.isArray(input.leaves) ? input.leaves : [];
  const registry = input.regulation === 'ivdr' ? IVDR_SECTIONS : MDR_SECTIONS;
  const sections = registry.map((s) => evalSlot(s, leaves));
  const missingRequired = sections.filter((s) => s.required && !s.present).map((s) => s.id);
  return {
    regulation: input.regulation,
    sections,
    summary: { missingRequired, ready: missingRequired.length === 0 },
  };
}

export default { assembleTechDoc };
