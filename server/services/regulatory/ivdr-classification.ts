/**
 * IVDR Annex VIII classification — the form-shaped adapter, and the one
 * IVDR Article 48 conformity-route table.
 *
 * `classifyIvdrAnnexVIII` is what /api/ivdr/classify, /api/ivd-lifecycle/classify/ivdr,
 * the IVD program plan and drift detection call. It holds NO rule logic: it maps
 * its form-shaped input onto the canonical IVDR facts and delegates to
 * `classifyIvdr` in server/services/market-specs/device-classification.ts, whose
 * `EU_IVDR_RULES` is the platform's one encoding of IVDR Annex VIII. It keeps the
 * output shape those callers persist and compare (classification, ruleTrace,
 * notifiedBodyRequired, confidence, knowledgeRefs, conformityRoute).
 *
 * `IVDR_CONFORMITY_ROUTES` is the platform's one statement of the IVDR Article 48
 * conformity-assessment routes per class. global-ri/device-classification.ts reads
 * it; nothing else may restate the routes.
 *
 * FAIL CLOSED (DECISIONS.md #1): when the inputs cannot decide the class — a blood
 * grouping device that names no marker, a transmissible-agent test that is not
 * blood screening — the canonical engine returns no class and this adapter throws
 * `DeviceClassificationFactError` (`code: 'VALIDATION'`) naming the missing facts.
 * No class is stated, so none is persisted.
 *
 * BASIS: recall — see
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-ivdr-adapter-and-conformity-routes-facts.md.
 * Regulatory backbone: Regulation (EU) 2017/746 (IVDR) Annex VIII and Article 48; MDCG 2020-16.
 */

import { basisLabel, type RegulatoryBasis } from '../../../shared/regulatory/regulatory-basis';
import {
  classifyIvdr,
  readRule2Marker,
  DeviceClassificationFactError,
  EU_IVDR_RULES,
  IVDR_RULE4A_CLASS_B_ANALYTES,
  type IvdrClass,
  type IvdrDeviceFacts,
} from '../market-specs/device-classification';

export type { IvdrClass } from '../market-specs/device-classification';

export interface IvdrClassificationInput {
  deviceName?: string;
  intendedPurpose: string;
  isSelfTest?: boolean;
  isNearPatient?: boolean;
  isCompanionDiagnostic?: boolean;
  detectsTransmissibleAgent?: boolean;
  bloodScreening?: boolean;
  detectsCancer?: boolean;
  prenatalScreening?: boolean;
  /** Not an Annex VIII criterion: it never changes the class (it used to decide the Rule 4(a) exception). */
  riskToPatient?: 'low' | 'medium' | 'high';
  isGeneticTest?: boolean;
  /** A self-test's analytes (Rule 4(a) exceptions), or a blood-grouping device's markers (Rule 2). */
  analytes?: string[];
}

export interface RuleTraceEntry {
  /** Canonical row id in `EU_IVDR_RULES`. */
  id: string;
  rule: string;
  description: string;
  matched: boolean;
  /** How the rule wording must be presented (recall until checked against EUR-Lex). */
  basisLabel: string;
}

export interface IvdrClassificationResult {
  classification: IvdrClass;
  /** The canonical rule(s) that gave the class. */
  ruleApplied: string;
  ruleTrace: RuleTraceEntry[];
  matchedRules: RuleTraceEntry[];
  /** Class A (non-sterile) self-declares; B/C/D require a notified body. */
  notifiedBodyRequired: boolean;
  /** Confidence in the classification given the completeness of the inputs. */
  confidence: 'high' | 'moderate' | 'low';
  /** Notes where the inputs were sparse, were read by assumption, or multiple rules competed. */
  ambiguityNotes: string[];
  /** The likely-corresponding US FDA pathway (cross-jurisdiction orientation). */
  fdaEquivalentPathway: string;
  /** Plain-language conformity-route summary for the resulting class, from `IVDR_CONFORMITY_ROUTES`. */
  conformityRoute: string;
  /** Ids into the IVD knowledge base explaining/justifying this classification. */
  knowledgeRefs: string[];
}

// ── IVDR Article 48 conformity routes — held once ────────────────────────────

const IVDR_URL = 'https://eur-lex.europa.eu/eli/reg/2017/746/oj';
const ROUTE_NOTE =
  'Paraphrase from recall, corroborated by secondary search extracts on 2026-10-05 (TÜV SÜD IVDR Article 48 page; MDCG 2019-13 rev.1 listed on health.ec.europa.eu, not opened); EUR-Lex text not read (host egress-blocked). Verbatim re-read owed.';
const routeBasis = (detail: string): RegulatoryBasis => ({
  ref: `Regulation (EU) 2017/746 (IVDR) Article 48; ${detail}`,
  confidence: 'recall',
  url: IVDR_URL,
  note: ROUTE_NOTE,
});

export interface IvdrConformityRoute {
  class: IvdrClass;
  /** Whether a notified body is involved (Class A: only for a sterile device, and only for its sterility aspects). */
  notifiedBodyRequired: boolean;
  /** The routes the manufacturer chooses between. */
  options: readonly string[];
  /** What applies on top of the chosen route. */
  additional: readonly string[];
  /** The annexes the routes run through, for a citation line. */
  annexes: string;
  /** One line for a result field: the options, then the additions. */
  summary: string;
  basis: RegulatoryBasis;
}

/** Annex IX section 5.1: technical-documentation assessment of self-testing and near-patient devices (recall). */
const SELF_TEST_ASSESSMENT = 'Self-testing and near-patient devices: the notified body also assesses the technical documentation under Annex IX section 5.1.';
/** Annex IX section 5.2 / Annex X section 3(k): companion-diagnostic consultation (recall). */
export const IVDR_CDX_CONSULTATION =
  'Companion diagnostics: the notified body consults a medicines authority (a national competent authority under Directive 2001/83/EC, or the EMA) under Annex IX section 5.2 or Annex X section 3(k).';

function route(cls: IvdrClass, notifiedBodyRequired: boolean, options: string[], additional: string[], annexes: string): IvdrConformityRoute {
  const summary = `${options.join('; or ')}.${additional.length ? ` ${additional.join(' ')}` : ''}`;
  return Object.freeze({
    class: cls, notifiedBodyRequired, options: Object.freeze(options), additional: Object.freeze(additional), annexes, summary,
    basis: routeBasis(annexes),
  });
}

/** IVDR Article 48 conformity-assessment routes by class — the platform's one statement of them. */
export const IVDR_CONFORMITY_ROUTES: Readonly<Record<IvdrClass, IvdrConformityRoute>> = Object.freeze({
  A: route('A', false,
    ['EU declaration of conformity (Article 17) on the technical documentation of Annexes II and III, without a notified body'],
    ['A sterile Class A device: a notified body assesses only the aspects of establishing, securing and maintaining sterile conditions, under Annex IX or Annex XI.'],
    'Annexes II and III; Annex IX or XI for sterile devices'),
  B: route('B', true,
    ['Notified body: Annex IX Chapters I and III (quality management system), with assessment of the technical documentation of at least one representative device per category of devices'],
    [SELF_TEST_ASSESSMENT],
    'Annex IX Chapters I and III'),
  C: route('C', true,
    [
      'Notified body: Annex IX Chapters I and III (quality management system), with assessment of the technical documentation of at least one representative device per generic device group',
      'Notified body: Annex X coupled with Annex XI (EU type-examination, then production quality assurance)',
    ],
    [SELF_TEST_ASSESSMENT, IVDR_CDX_CONSULTATION],
    'Annex IX Chapters I and III; Annexes X and XI'),
  D: route('D', true,
    [
      'Notified body: Annex IX Chapters I, II (except section 5) and III (quality management system and technical-documentation assessment of each device)',
      'Notified body: Annex X coupled with Annex XI (EU type-examination, then production quality assurance)',
    ],
    [
      'Where an EU reference laboratory is designated for the device, it verifies the performance claimed and compliance with the common specifications, and tests manufactured batches.',
      'Where no common specifications exist, the notified body consults the expert panel on the performance evaluation report.',
      SELF_TEST_ASSESSMENT,
      IVDR_CDX_CONSULTATION,
    ],
    'Annex IX Chapters I, II and III; Annexes X and XI'),
});

// ── FDA orientation (heuristic) ──────────────────────────────────────────────

const FDA_PATHWAY_BY_CLASS: Record<IvdrClass, string> = {
  A: 'US: typically Class I (often 510(k)-exempt) under general controls.',
  B: 'US: typically Class II via 510(k) with special controls.',
  C: 'US: typically Class II 510(k)/De Novo, or Class III PMA for higher-risk / companion diagnostics.',
  D: 'US: typically Class III PMA (or biologics licensure for blood-screening/transfusion assays).',
};

/* Class A self-declares (notified body only for sterile aspects); B, C and D all require one. */
const NOTIFIED_BODY_REQUIRED_BY_CLASS: Record<IvdrClass, boolean> = {
  A: IVDR_CONFORMITY_ROUTES.A.notifiedBodyRequired,
  B: IVDR_CONFORMITY_ROUTES.B.notifiedBodyRequired,
  C: IVDR_CONFORMITY_ROUTES.C.notifiedBodyRequired,
  D: IVDR_CONFORMITY_ROUTES.D.notifiedBodyRequired,
};

// ── Mapping the form onto the canonical facts ────────────────────────────────

/** Intended-purpose phrases that make the device a Rule 2 blood-grouping / tissue-typing device. */
const RULE2_PURPOSE_PHRASES: readonly string[] = ['blood group', 'blood typing', 'tissue typing'];

/** How a Rule 4(a) self-test analyte was read by the canonical reader, and the spelling it read. */
interface Rule4aReading {
  reading: 'B' | 'C' | 'unread';
  spelling: string;
}

/**
 * Read one free-text analyte through the canonical Rule 4(a) table (`classifyIvdr`'s own `selfTestAnalyte` reader).
 * A form tag like "glucose (urine)" is also tried urine-first ("urine glucose").
 */
function readRule4aAnalyte(analyte: string): Rule4aReading {
  const words = analyte.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const candidates = [analyte];
  const site = words.findIndex((w) => w === 'urine' || w === 'urinary');
  if (site >= 0 && words.length > 1) candidates.push(['urine', ...words.filter((_, i) => i !== site)].join(' '));
  for (const spelling of candidates) {
    try {
      const fired = classifyIvdr({ selfTesting: true, selfTestAnalyte: spelling }).ruleTrace.map((t) => t.id);
      if (fired.includes('ivdr-4a-b')) return { reading: 'B', spelling };
      if (fired.includes('ivdr-4a-c')) return { reading: 'C', spelling };
    } catch (e) {
      if (!(e instanceof DeviceClassificationFactError)) throw e;
    }
  }
  return { reading: 'unread', spelling: analyte };
}

/** Read `readRule2Marker` without letting an over-long value throw (it then names nothing readable). */
function markerOf(value: string): string[] | null {
  try {
    return readRule2Marker(value);
  } catch (e) {
    if (e instanceof DeviceClassificationFactError) return null;
    throw e;
  }
}

const quoted = (xs: string[]): string => xs.map((x) => JSON.stringify(x)).join(', ');

/**
 * Rule 1 and Rule 3. Rule 1's second and third indents (life-threatening high-propagation agents; infectious load) and
 * Rule 3(a)–(e) concern transmissible agents: with no transmissible agent stated they do not apply; with one stated
 * outside blood screening this form does not say which applies, so those facts are left unstated.
 */
function mapRules1And3(input: IvdrClassificationInput, facts: IvdrDeviceFacts, notes: string[]): void {
  const transmissible = input.detectsTransmissibleAgent === true;
  facts.bloodDonationScreening = transmissible && input.bloodScreening === true;
  const agentResolved = !transmissible || facts.bloodDonationScreening;
  if (agentResolved) {
    facts.lifeThreateningHighPropagation = false;
    facts.infectiousLoadLifeThreatening = false;
  }
  const points: string[] = [];
  if (input.detectsCancer) points.push('h');
  if (input.isGeneticTest) points.push('i');
  if (points.length) facts.rule3Points = points;
  if (input.isCompanionDiagnostic) facts.companionDiagnostic = true;
  if (input.prenatalScreening) {
    facts.infectiousOrCancerOrGenetic = true;
    notes.push('Pre-natal screening is Rule 3(d) (immune status towards transmissible agents) or Rule 3(l) (congenital disorders in the embryo or foetus); both are Class C — record which applies.');
  } else if (agentResolved) {
    facts.infectiousOrCancerOrGenetic = points.length > 0 || input.isCompanionDiagnostic === true;
  }
}

/** Rule 2: blood grouping / tissue typing by intended purpose; the markers named (analytes, purpose) decide C or D. */
function mapRule2(input: IvdrClassificationInput, analytes: string[], facts: IvdrDeviceFacts, notes: string[]): void {
  const purpose = input.intendedPurpose.toLowerCase();
  facts.bloodGrouping = RULE2_PURPOSE_PHRASES.some((p) => purpose.includes(p));
  if (!facts.bloodGrouping) return;
  const listed = new Set<string>();
  const notListed: string[] = [];
  const unread: string[] = [];
  const take = (value: string, m: string[]) => (m.length ? m.forEach((x) => listed.add(x)) : notListed.push(value));
  for (const a of analytes) {
    const m = markerOf(a);
    if (m === null) unread.push(a);
    else take(a, m);
  }
  // Purpose tokens of two or more characters, so a sentence-initial "A" is never read as the A antigen.
  for (const token of input.intendedPurpose.split(/[\s,;/+&]+/)) {
    const m = token.replace(/[()[\].:]/g, '').length < 2 ? null : markerOf(token);
    if (m !== null) take(token, m);
  }
  // A listed marker decides D; otherwise C needs every named analyte read (an unread one could be a listed marker).
  if (listed.size) facts.bloodGroupingMarker = [...listed];
  else if (notListed.length && unread.length === 0) facts.bloodGroupingMarker = notListed;
  if (!listed.size && unread.length) notes.push(`Rule 2: ${quoted(unread)} not read as a blood-group or tissue-typing marker.`);
}

/** Rule 4(a): the self-test's analytes decide the Class B exception — B only when every analyte is one. */
function mapRule4a(analytes: string[], facts: IvdrDeviceFacts, notes: string[]): void {
  if (!facts.selfTesting) return;
  const readings = analytes.map((a) => ({ a, ...readRule4aAnalyte(a) }));
  const unread = readings.filter((x) => x.reading === 'unread').map((x) => x.a);
  facts.selfTestAnalyte = readings.length > 0 && readings.every((x) => x.reading === 'B') ? readings[0].spelling : 'other';
  const exceptions = IVDR_RULE4A_CLASS_B_ANALYTES.join(', ');
  if (readings.length === 0) {
    notes.push(`Rule 4(a): no analyte was named, so the self-test is Class C. Class B applies only to ${exceptions}.`);
  } else if (unread.length) {
    notes.push(`Rule 4(a): ${quoted(unread)} not recognised as a Class B exception (${exceptions}), so read as another analyte (Class C). Name it as one of these if it is.`);
  }
}

function mapToFacts(input: IvdrClassificationInput): { facts: IvdrDeviceFacts; notes: string[] } {
  const notes: string[] = [];
  const analytes = (input.analytes ?? []).filter((a) => typeof a === 'string' && a.trim() !== '');
  const facts: IvdrDeviceFacts = { selfTesting: input.isSelfTest === true };
  mapRules1And3(input, facts, notes);
  mapRule2(input, analytes, facts, notes);
  mapRule4a(analytes, facts, notes);
  return { facts, notes };
}

// ── Reading the canonical result into the form's shape ───────────────────────

const TRANSMISSIBLE_AGENT_MISSING =
  'whether Rule 1 (second or third indent: a life-threatening agent with a high risk of propagation, or an infectious load) or a Rule 3 sub-point (a)–(e) applies to the transmissible agent';

/** Notes on what the form could not say, or said without effect. */
function resultNotes(input: IvdrClassificationInput, byCatchAll: boolean): string[] {
  const notes: string[] = [];
  if (byCatchAll) {
    notes.push(
      'Class B by the Annex VIII Rule 6 catch-all (no other rule matched) — confirm the intended purpose does not trigger Rules 1–4 or Rule 3 points this form does not ask about (g, j, k, m).',
      'Class A is not inferable from these inputs: Annex VIII reaches it only through Rule 5 (general laboratory use, IVD instruments, specimen receptacles), which the manufacturer must assert.',
    );
  }
  if (input.isNearPatient) notes.push('Near-patient testing is classified in its own right (Rule 4(b)): the setting sets no class; the other rules do.');
  if (input.riskToPatient !== undefined) notes.push('riskToPatient is not an Annex VIII criterion and does not change the class.');
  const ruleThreeTriggers = [input.isCompanionDiagnostic, input.detectsCancer, input.isGeneticTest, input.prenatalScreening].filter(Boolean).length;
  if (ruleThreeTriggers > 1) notes.push('Multiple Rule 3 criteria apply; Class C governs, but document each applicable criterion.');
  return notes;
}

function confidenceOf(input: IvdrClassificationInput, matched: RuleTraceEntry[], byCatchAll: boolean): IvdrClassificationResult['confidence'] {
  if (matched.some((r) => /^Annex VIII, Rule [123]\b/.test(r.rule))) return 'high';
  if (!byCatchAll) return 'moderate';
  const booleanInputs = [
    input.isSelfTest, input.isNearPatient, input.isCompanionDiagnostic, input.detectsTransmissibleAgent,
    input.bloodScreening, input.detectsCancer, input.prenatalScreening, input.isGeneticTest,
  ].filter((v) => v !== undefined).length;
  return booleanInputs >= 2 ? 'moderate' : 'low';
}

function knowledgeRefsOf(fired: ReadonlySet<string>, cls: IvdrClass): string[] {
  const refs = new Set<string>(['eu.ivdr.classification-rules', 'eu.ivdr.conformity-routes', 'mdcg.2020-16-classification']);
  const byRow: ReadonlyArray<[string, string[]]> = [
    ['ivdr-3f', ['eu.ivdr.companion-diagnostics', 'fda.ivd.cdx']],
    ['ivdr-3h', ['bio.her2']],
    ['ivdr-3i', ['legal.ivd.data-privacy']],
    ['ivdr-1-first-indent', ['bio.hiv']],
  ];
  for (const [row, ids] of byRow) if (fired.has(row)) ids.forEach((id) => refs.add(id));
  if (cls === 'D') refs.add('eu.ivdr.notified-bodies');
  return [...refs];
}

/** The class's Article 48 summary, plus the CDx consultation when Rule 3(f) fired and the class's routes do not name it. */
function conformityRouteOf(cls: IvdrClass, fired: ReadonlySet<string>): string {
  const routes = IVDR_CONFORMITY_ROUTES[cls];
  return fired.has('ivdr-3f') && !routes.additional.includes(IVDR_CDX_CONSULTATION)
    ? `${routes.summary} ${IVDR_CDX_CONSULTATION}`
    : routes.summary;
}

// ── The adapter ──────────────────────────────────────────────────────────────

/**
 * Classify an IVD from the form-shaped input by delegating to the canonical IVDR Annex VIII engine (`classifyIvdr`).
 * Pure: same input → same output, no I/O.
 * @throws DeviceClassificationFactError (`code: 'VALIDATION'`) when the inputs do not decide the class.
 */
export function classifyIvdrAnnexVIII(input: IvdrClassificationInput): IvdrClassificationResult {
  const { facts, notes } = mapToFacts(input);
  const canonical = classifyIvdr(facts);
  /* A transmissible agent outside blood screening may fall under Rule 1's second or third indent (Class D), which
     this form does not ask; so no class below D is stated for it, whatever else fired. */
  const transmissibleUnresolved = facts.lifeThreateningHighPropagation === undefined;
  if (canonical.class === null || (transmissibleUnresolved && canonical.class !== 'D')) {
    const missing = transmissibleUnresolved ? [...canonical.missingFacts, TRANSMISSIBLE_AGENT_MISSING] : canonical.missingFacts;
    throw new DeviceClassificationFactError(
      `IVDR class not determined from these inputs: ${[...new Set(missing)].join('; ')}.${notes.length ? ` ${notes.join(' ')}` : ''} No class is stated.`,
    );
  }
  const cls = canonical.class;
  const fired = new Set(canonical.ruleTrace.map((t) => t.id));
  const ruleTrace: RuleTraceEntry[] = EU_IVDR_RULES.map((row) => ({
    id: row.id,
    rule: `Annex VIII, ${row.rule} (Class ${row.class})`,
    description: row.ruleText,
    matched: fired.has(row.id),
    basisLabel: basisLabel(row.basis),
  }));
  const matched = ruleTrace.filter((r) => r.matched);
  const byCatchAll = fired.has('ivdr-6') && fired.size === 1;

  return {
    classification: cls,
    ruleApplied: canonical.ruleApplied,
    ruleTrace,
    matchedRules: matched,
    notifiedBodyRequired: NOTIFIED_BODY_REQUIRED_BY_CLASS[cls],
    confidence: confidenceOf(input, matched, byCatchAll),
    ambiguityNotes: [...notes, ...resultNotes(input, byCatchAll)],
    fdaEquivalentPathway: FDA_PATHWAY_BY_CLASS[cls],
    conformityRoute: conformityRouteOf(cls, fired),
    knowledgeRefs: knowledgeRefsOf(fired, cls),
  };
}
