/**
 * Device classification engine — deterministic risk classification for EU MDR
 * (Annex VIII), EU IVDR (Annex VIII), and an FDA pathway recommendation.
 *
 * THE ONE EU RECORD: `EU_MDR_RULES` (Regulation (EU) 2017/745 Annex VIII
 * Chapter III, Rules 1–22) and `EU_IVDR_RULES` (Regulation (EU) 2017/746 Annex
 * VIII, Rules 1–7) are the platform's single encoding of the EU classification
 * rules. Each row is one rule or sub-provision: the class it gives, the fact
 * predicate that triggers it, a paraphrase of its text and a `RegulatoryBasis`.
 * `classifyMdr` / `classifyIvdr` evaluate the table, take the highest class that
 * fires (the "strictest rule" implementing rule) and return the rule trace.
 *
 * BASIS: every row is `recall` — paraphrased from memory of the regulation,
 * corroborated by secondary search extracts on 2026-10-05 — with the EUR-Lex
 * URL where the text can be read. The EUR-Lex host is egress-blocked in the
 * environment that wrote this, so the wording has NOT been checked against the
 * Official Journal text; a row is promoted to `regulator-text` only with a
 * `checked` date once someone has read it (see
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-eu-mdr-ivdr-rule-table-facts.md).
 *
 * HONESTY ABOUT SCOPE: the rules are evaluated from the facts supplied. The
 * Chapter II implementing rules that decide which facts apply (accessories
 * classified in their own right, software that drives a device takes the
 * device's class, calibrators/controls with assigned values take the class of
 * the device) are the caller's to apply. Confirm against Annex VIII and
 * MDCG 2021-24 / MDCG 2020-16.
 *
 * FAIL CLOSED (DECISIONS.md #1, 2026-10-05):
 *   - a fact the engine cannot read — an unknown key, a value of the wrong type
 *     or outside its closed set, an unreadable Rule 2 marker, Rule 3 sub-point or
 *     Rule 4(a) analyte, contradictory invasiveness — throws
 *     `DeviceClassificationFactError` (`code: 'VALIDATION'`), because ignoring it
 *     would state the class of a device without that fact;
 *   - when a fact the class depends on was never given, the result is
 *     `class: null`, `ruleApplied: 'not determined'` with `missingFacts`, unless
 *     a rule already gives the highest class (MDR III, IVDR D). Those facts are:
 *     MDR — whether the device is invasive (an implant falls under Rule 8, so
 *     every lower class depends on it), the kind of invasiveness, the duration,
 *     and the fact a qualifier qualifies (ionising radiation, a hazardous
 *     energy exchange or administration, an inhalation device's essential
 *     impact); IVDR — the marker a blood-grouping device determines (Rule 2 C
 *     vs D), and, before the Rule 6 default, whether each higher-class rule
 *     (1, 2, 3, 4) applies. The default rules (MDR Rules 1 and 13, IVDR Rule 6)
 *     are never a verdict on facts nobody gave;
 *   - an absent (or null) boolean fact otherwise reads as false: the caller
 *     states the properties the device has;
 *   - a qualifier stated true whose own fact is stated false, or Rule 2 / Rule 3
 *     facts that contradict each other, are refused like invasive: false with
 *     an invasive kind;
 *   - where the regulation lists items (Rule 2 markers, Rule 3 points, Rule 4(a)
 *     analytes) they are read through closed lookup tables, never an open
 *     pattern; free text is capped at `MAX_FACT_TEXT_LENGTH` characters.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/device-classification
 */

import { basisLabel, type RegulatoryBasis } from '../../../shared/regulatory/regulatory-basis';

/** One row of an EU classification rule table. */
export interface EuClassificationRule<C extends string, V> {
  /** Unique row id ("mdr-8-active-implantable", "ivdr-3f", "ivdr-1-second-indent"). */
  id: string;
  /**
   * The citation the result names ("Rule 8", "Rule 3(f)", "Rule 1, second indent"). MDR rules are cited by number
   * only; their indents are described in `ruleText`. IVDR Rule 1 has unlettered dash indents and is cited by indent,
   * the form MDCG 2020-16 uses (secondary corroboration; the guidance itself was not opened). IVDR Rules 3, 4 and 5
   * have lettered points (recall): 3(a)–(m) and 4(a)–(b) are cited by letter; Rule 5's (a)–(c) share one row, cited
   * "Rule 5", whose text names all three.
   */
  rule: string;
  class: C;
  /** Fact predicate; the row fires when it returns true. */
  applies: (facts: V) => boolean;
  /** Paraphrase of the rule or sub-provision (recall unless `basis` says otherwise). */
  ruleText: string;
  basis: RegulatoryBasis;
  /** A default rule ("unless another rule applies"): evaluated only when no non-residual row fired. */
  residual?: boolean;
}

/** One fired row, as returned to callers. */
export interface RuleTraceEntry<C extends string> {
  id: string;
  rule: string;
  class: C;
  ruleText: string;
  basis: RegulatoryBasis;
  /** `basisLabel(basis)` — how the wording must be presented to a reader. */
  basisLabel: string;
}

const MDR_URL = 'https://eur-lex.europa.eu/eli/reg/2017/745/oj';
const IVDR_URL = 'https://eur-lex.europa.eu/eli/reg/2017/746/oj';
const RECALL_NOTE = 'Paraphrase from recall, corroborated by secondary search extracts on 2026-10-05; EUR-Lex text not read (host egress-blocked). Verbatim re-read owed.';

const mdrBasis = (rule: string): RegulatoryBasis => ({ ref: `Regulation (EU) 2017/745 (MDR) Annex VIII Chapter III, ${rule}`, confidence: 'recall', url: MDR_URL, note: RECALL_NOTE });
const ivdrBasis = (rule: string): RegulatoryBasis => ({ ref: `Regulation (EU) 2017/746 (IVDR) Annex VIII, ${rule}`, confidence: 'recall', url: IVDR_URL, note: RECALL_NOTE });

/** Evaluate a rule table: non-residual rows first, residual rows only when none fired. */
function evaluate<C extends string, V>(table: ReadonlyArray<EuClassificationRule<C, V>>, view: V): RuleTraceEntry<C>[] {
  const toTrace = (r: EuClassificationRule<C, V>): RuleTraceEntry<C> => ({ id: r.id, rule: r.rule, class: r.class, ruleText: r.ruleText, basis: r.basis, basisLabel: basisLabel(r.basis) });
  const fired = table.filter((r) => !r.residual && r.applies(view));
  if (fired.length > 0) return fired.map(toTrace);
  return table.filter((r) => r.residual && r.applies(view)).map(toTrace);
}

/** The highest class in the trace, the distinct rules that gave it, and their texts. */
function top<C extends string>(trace: RuleTraceEntry<C>[], order: Record<C, number>): { cls: C; rule: string; why: string } | null {
  if (trace.length === 0) return null;
  const max = Math.max(...trace.map((t) => order[t.class]));
  const winners = trace.filter((t) => order[t.class] === max);
  return { cls: winners[0].class, rule: Array.from(new Set(winners.map((w) => w.rule))).join('; '), why: winners.map((w) => w.ruleText).join(' ') };
}

/** Ids of the default rows ("unless another rule applies") in a table. */
function residualIds<C extends string, V>(table: ReadonlyArray<EuClassificationRule<C, V>>): ReadonlySet<string> {
  return new Set(table.filter((r) => r.residual).map((r) => r.id));
}

// ── Reading the supplied facts (fail closed) ──────────────────────────────────

/**
 * A supplied fact the engine cannot read. Thrown instead of classifying, because ignoring it would state the
 * class the device has without that fact — often a lower one (fail closed). `code: 'VALIDATION'` maps to HTTP 400
 * in the routes' error table (POST /device/classify, /device/blueprint); the AnA tool handlers return the message
 * as their error.
 */
export class DeviceClassificationFactError extends Error {
  readonly code = 'VALIDATION' as const;
  constructor(message: string) {
    super(message);
    this.name = 'DeviceClassificationFactError';
  }
}

/** The longest free-text fact value read (a marker, a sub-point, an analyte). Longer values are refused unread. */
export const MAX_FACT_TEXT_LENGTH = 100;
/** The most values a list-valued fact may carry. */
const MAX_FACT_LIST_LENGTH = 50;

/** How one fact is read: a boolean, one of a closed set of strings, or by its own reader ('text'). */
type FactSpec = 'boolean' | readonly string[] | 'text';

/** A short rendering of a refused value for an error message. */
function shown(value: unknown): string {
  const s = typeof value === 'string' ? JSON.stringify(value) : (JSON.stringify(value) ?? String(value));
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

/**
 * Read a facts object against its closed key set. `null`/`undefined` (the whole object or one value) means not
 * given. An unknown key, a non-boolean where a boolean is read, or a value outside a closed set is refused.
 */
function readFacts(framework: 'MDR' | 'IVDR', raw: unknown, spec: Readonly<Record<string, FactSpec>>): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new DeviceClassificationFactError(`${framework} facts must be an object of named facts; got ${shown(raw)}. No class is stated.`);
  }
  const keys = Object.keys(raw);
  const unknown = keys.filter((k) => !Object.prototype.hasOwnProperty.call(spec, k));
  if (unknown.length > 0) {
    throw new DeviceClassificationFactError(
      `${framework} facts: ${unknown.map(shown).join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not a fact the engine reads. `
      + `The facts it reads: ${Object.keys(spec).join(', ')}. No class is stated, because ignoring a fact would state the class of a device without it.`,
    );
  }
  const read: Record<string, unknown> = {};
  const bad: string[] = [];
  for (const k of keys) {
    const value = (raw as Record<string, unknown>)[k];
    if (value === undefined || value === null) continue;
    const problem = factValueProblem(spec[k], value);
    if (problem) bad.push(`${k}: ${shown(value)} ${problem}`);
    else read[k] = value;
  }
  if (bad.length > 0) throw new DeviceClassificationFactError(`${framework} facts: ${bad.join('; ')}. No class is stated.`);
  return read;
}

/** Why a given value does not fit its spec, or null when it does ('text' values are checked by their own reader). */
function factValueProblem(spec: FactSpec, value: unknown): string | null {
  if (spec === 'text') return null;
  if (spec === 'boolean') return typeof value === 'boolean' ? null : 'is not true or false';
  return typeof value === 'string' && spec.includes(value) ? null : `is not one of ${spec.join(', ')}`;
}

// ── MDR (Annex VIII) ──────────────────────────────────────────────────────────

export type MdrClass = 'I' | 'IIa' | 'IIb' | 'III';

export interface MdrDeviceFacts {
  /**
   * Invasive in some way. Name the kind (bodyOrificeInvasive / surgicallyInvasive / implantable) — without it the class is not
   * determined. State `invasive: false` for a non-invasive device: without it (or a kind) no class below III is stated, because
   * the same device implanted falls under Rule 8.
   */
  invasive?: boolean;
  /** Invasive with respect to a body orifice, not surgically invasive (Rules 5, 20). */
  bodyOrificeInvasive?: boolean;
  /** Surgically invasive (penetrates the body through its surface) (Rules 6–8). */
  surgicallyInvasive?: boolean;
  /**
   * Implantable device (Rule 8). With any active fact — including the Rule 11 software facts, since software is an
   * active device (MDR Article 2(4)) — it is an active implantable device (Rule 8 → III). Describe only the implant's
   * own software here; classify separate companion software as its own device (Rules 9 and 11).
   */
  implantable?: boolean;
  /** Active device (depends on a source of energy other than the body or gravity). */
  active?: boolean;
  /** Active therapeutic device intended to administer or exchange energy (Rule 9). */
  activeTherapeutic?: boolean;
  /** Active device for diagnosis/monitoring that supplies energy absorbed by the body, images radiopharmaceutical distribution, or directly diagnoses/monitors vital physiological processes (Rule 10). */
  activeDiagnostic?: boolean;
  /** Active implantable device or an accessory to one (Rule 8 → III). Implied by `implantable` + any active fact, software facts included. */
  activeImplantable?: boolean;
  /** Breast implant or surgical mesh (Rule 8 → III). */
  breastImplantOrMesh?: boolean;
  /** Total or partial joint replacement — not its ancillary screws, wedges, plates or instruments (Rule 8 → III). */
  jointReplacement?: boolean;
  /** Spinal disc replacement or implant in contact with the spinal column — not screws, wedges, plates or instruments (Rule 8 → III). */
  spinalImplant?: boolean;
  /** Placed in the teeth (Rule 7 chemical-change exception; Rule 8 → IIa). */
  placedInTeeth?: boolean;
  /** Reusable surgical instrument (Rule 6 → I). */
  reusableSurgicalInstrument?: boolean;
  /** Intended to undergo chemical change in the body (Rule 7 → IIb, Rule 8 → III). */
  chemicalChange?: boolean;
  /**
   * Supplies energy in the form of, or emits, ionising radiation (Rules 6, 7, 9, 10 → IIb). Read with `activeTherapeutic`
   * (Rule 9), `activeDiagnostic` (Rule 10), a transient or short-term `surgicallyInvasive` device (Rules 6/7) or within Rule 8;
   * otherwise the class is not determined and `missingFacts` says which to state.
   */
  ionisingRadiation?: boolean;
  /** Software providing information used to take diagnostic/therapeutic decisions (Rule 11 → IIa). */
  softwareDecisionSupport?: boolean;
  /** Those decisions may cause serious deterioration of health or a surgical intervention (Rule 11 → IIb). */
  softwareSeriousDeterioration?: boolean;
  /** Those decisions may cause death or irreversible deterioration of health (Rule 11 → III). */
  softwareSeriousDecisions?: boolean;
  /** Software intended to monitor physiological processes (Rule 11 → IIa). */
  softwarePhysiologicalMonitoring?: boolean;
  /** Software monitoring vital physiological parameters whose variations could result in immediate danger (Rule 11 → IIb). */
  softwareVitalParameterMonitoring?: boolean;
  /** Software not otherwise described (Rule 11 → I). Software is an active device: with `implantable` it makes an active implantable (Rule 8 → III). */
  software?: boolean;
  /** Active device monitoring vital physiological parameters whose variations could result in immediate danger (Rule 10 → IIb). Makes the device active: with `implantable` it is an active implantable (Rule 8 → III). */
  monitorsVitalParametersImmediateDanger?: boolean;
  /** Active device intended for diagnosis in clinical situations where the patient is in immediate danger (Rule 10 → IIb). Makes the device active: with `implantable` it is an active implantable (Rule 8 → III). */
  diagnosisPatientInImmediateDanger?: boolean;
  /** Active therapeutic device that may administer or exchange energy in a potentially hazardous way (Rule 9 → IIb). Needs `activeTherapeutic`. */
  energyExchangePotentiallyHazardous?: boolean;
  /** Active device that controls/monitors or directly influences an active therapeutic Class IIb device (Rule 9 → IIb). Makes the device active: with `implantable` it is an active implantable (Rule 8 → III). */
  controlsActiveTherapeuticIIb?: boolean;
  /** Active device that controls/monitors or directly influences an active implantable device (Rule 9 → III). Makes the device active: with `implantable` it is an active implantable (Rule 8 → III). */
  controlsActiveImplantable?: boolean;
  /** Administers (or, if active, removes) medicinal products / body liquids / substances (Rules 6, 7, 8, 12). */
  administersMedicine?: boolean;
  /**
   * That administration is done in a potentially hazardous manner (Rules 6, 12 → IIb). Needs `administersMedicine`, and a
   * device one of those rules covers (active, Rule 12; transient surgically invasive, Rule 6) or one already at IIb or above
   * for administering medicine (short-term surgically invasive, Rule 7; Rule 8's scope); otherwise not determined.
   */
  administrationPotentiallyHazardous?: boolean;
  /** Incorporates a medicinal substance with ancillary action (Rule 14 → III). */
  incorporatesMedicinalSubstance?: boolean;
  /** Direct contact with the heart, central circulatory system or central nervous system (Rules 6, 7, 8 → III). */
  contactsCnsOrCentralCirculation?: boolean;
  /** Has a biological effect / is wholly or mainly absorbed (Rule 6 → IIb, Rules 7/8 → III). */
  biologicalEffectOrAbsorbed?: boolean;
  /** Duration of continuous use: transient (<60 min), short-term (60 min–30 days), long-term (>30 days). */
  duration?: 'transient' | 'short_term' | 'long_term';
  /** Body-orifice device used in the oral cavity as far as the pharynx, the ear canal up to the ear drum, or the nasal cavity (Rule 5 exceptions). */
  orificeSiteOralEarNasal?: boolean;
  /** Liable to be absorbed by the mucous membrane (Rule 5 long-term exception does not apply). */
  absorbedByMucousMembrane?: boolean;
  /** Intended for connection to a Class IIa, IIb or III active device (Rules 2, 5 → IIa). */
  connectsToActiveDeviceIIaOrHigher?: boolean;
  /** Non-invasive device for channelling or storing blood, body liquids, cells, tissues, liquids or gases for eventual infusion/administration/introduction (Rule 2 → I). */
  channelsOrStoresForAdministration?: boolean;
  /** ... for channelling blood, or storing/channelling other body liquids, or storing organs, parts of organs or body cells and tissues (Rule 2 → IIa). */
  channelsBloodOrStoresBodyLiquidsOrOrgans?: boolean;
  /** Blood bag (Rule 2 → IIb). */
  bloodBag?: boolean;
  /** Non-invasive device modifying the biological/chemical composition of tissues, cells, blood or body liquids for implantation/administration (Rule 3 → IIb). */
  modifiesCompositionForAdministration?: boolean;
  /** ... where the treatment is only filtration, centrifugation or exchange of gas or heat (Rule 3 → IIa). */
  modificationByFiltrationCentrifugationGasHeat?: boolean;
  /** Substance used in vitro in direct contact with human cells, tissues or organs, or embryos, before implantation/administration (Rule 3 → III). */
  inVitroContactWithHumanCellsOrEmbryos?: boolean;
  /** Non-invasive device in contact with injured skin or mucous membrane, by principal intent (Rule 4). */
  injuredSkinOrMucosaContact?: 'mechanical_barrier' | 'breached_dermis_secondary_intent' | 'micro_environment' | 'other';
  /** Contraception or prevention of sexually transmitted disease (Rule 15). */
  contraceptionOrStdPrevention?: boolean;
  /** Disinfecting, cleaning, rinsing or hydrating contact lenses (Rule 16 → IIb). */
  contactLensCare?: boolean;
  /** Disinfecting or sterilising medical devices (Rule 16 → IIa). */
  disinfectsOrSterilisesDevices?: boolean;
  /** Disinfecting solution / washer-disinfector for invasive devices as the end point of processing (Rule 16 → IIb). */
  disinfectsInvasiveDevicesEndpoint?: boolean;
  /** Specifically intended for recording diagnostic images generated by X-ray radiation (Rule 17 → IIa). */
  xrayImageRecording?: boolean;
  /** Manufactured utilising non-viable (or rendered non-viable) human or animal tissues or cells, or derivatives (Rule 18 → III). */
  nonViableHumanOrAnimalTissue?: boolean;
  /** ... animal tissues in contact with intact skin only (Rule 18 exception). */
  animalTissueIntactSkinOnly?: boolean;
  /** Incorporates or consists of nanomaterial, by potential for internal exposure (Rule 19). */
  nanomaterialInternalExposure?: 'high' | 'medium' | 'low' | 'negligible';
  /** Body-orifice device administering medicinal products by inhalation (Rule 20 → IIa). */
  inhalationMedicinalProduct?: boolean;
  /** ... whose mode of action essentially impacts the medicine's efficacy/safety, or treats life-threatening conditions (Rule 20 → IIb). Needs `inhalationMedicinalProduct`. */
  inhalationEssentialImpactOrLifeThreatening?: boolean;
  /** Substance-based device introduced via an orifice or applied to the skin and absorbed/locally dispersed (Rule 21). */
  substanceBasedDevice?: 'systemically_absorbed' | 'gi_tract_systemically_absorbed' | 'skin_nasal_oral_local' | 'other';
  /** Active therapeutic device with an integrated diagnostic function that significantly determines patient management (closed loop, AED) (Rule 22 → III). */
  closedLoopDiagnosticFunction?: boolean;
}

/** The facts with the derived properties the rules read. */
export interface MdrFactView extends MdrDeviceFacts {
  isActive: boolean;
  isActiveImplantable: boolean;
  anyInvasive: boolean;
  /** Implantable or long-term surgically invasive (Rule 8's scope). */
  rule8Scope: boolean;
  /** Surgically invasive, not implantable, of the given duration (Rules 6/7 scope). */
  siTransient: boolean;
  siShortTerm: boolean;
}

/**
 * Facts that make a device active (software is an active device, MDR Article 2(4)). Every fact whose rule row
 * describes an active device is here, so that the rule firing on it and `isActive` agree: the software facts
 * (Rule 11) and the Rule 9/10 facts a row reads without `active` (controlling an active therapeutic IIb or an active
 * implantable device; monitoring vital parameters or diagnosing a patient in immediate danger). With `implantable`
 * each makes an active implantable (Rule 8 → III). Leaving one out would state a lower class (IIb) for such a device —
 * an implantable loop recorder was IIb under 'Rule 8; Rule 10' — the fail-open direction.
 */
const ACTIVE_FACTS: ReadonlyArray<keyof MdrDeviceFacts> = [
  'active', 'activeTherapeutic', 'activeDiagnostic', 'activeImplantable', 'closedLoopDiagnosticFunction', 'software',
  'softwareDecisionSupport', 'softwareSeriousDeterioration', 'softwareSeriousDecisions', 'softwarePhysiologicalMonitoring',
  'softwareVitalParameterMonitoring', 'monitorsVitalParametersImmediateDanger', 'diagnosisPatientInImmediateDanger',
  'controlsActiveTherapeuticIIb', 'controlsActiveImplantable',
];
/** Facts that make a device implantable (Rule 8's named implants are implantable by definition). */
const IMPLANT_FACTS: ReadonlyArray<keyof MdrDeviceFacts> = ['implantable', 'breastImplantOrMesh', 'jointReplacement', 'spinalImplant'];
const INVASIVE_FACTS: ReadonlyArray<keyof MdrDeviceFacts> = ['invasive', 'bodyOrificeInvasive', 'surgicallyInvasive'];

function mdrView(f: MdrDeviceFacts): MdrFactView {
  const isActive = ACTIVE_FACTS.some((k) => !!f[k]);
  const isActiveImplantable = !!f.activeImplantable || (!!f.implantable && isActive);
  const implantable = isActiveImplantable || IMPLANT_FACTS.some((k) => !!f[k]);
  const anyInvasive = implantable || INVASIVE_FACTS.some((k) => !!f[k]);
  const siNotImplant = !!f.surgicallyInvasive && !implantable;
  return {
    ...f, implantable, isActive, isActiveImplantable, anyInvasive,
    rule8Scope: implantable || (!!f.surgicallyInvasive && f.duration === 'long_term'),
    siTransient: siNotImplant && f.duration === 'transient', siShortTerm: siNotImplant && f.duration === 'short_term',
  };
}

type MdrRule = EuClassificationRule<MdrClass, MdrFactView>;

function mdr(id: string, n: number, cls: MdrClass, applies: (v: MdrFactView) => boolean, ruleText: string): MdrRule {
  const rule = `Rule ${n}`;
  return { id: `mdr-${n}-${id}`, rule, class: cls, applies, ruleText, basis: mdrBasis(rule) };
}

/** Mark a row as a default rule ("unless another rule applies"). */
function residual<R extends { residual?: boolean }>(row: R): R {
  return { ...row, residual: true };
}

const orificeDuration = (v: MdrFactView) => !!v.bodyOrificeInvasive && !v.surgicallyInvasive && !v.implantable && !v.connectsToActiveDeviceIIaOrHigher;
const rule11Other = (v: MdrFactView) =>
  !!v.software && !v.softwareDecisionSupport && !v.softwareSeriousDeterioration && !v.softwareSeriousDecisions
  && !v.softwarePhysiologicalMonitoring && !v.softwareVitalParameterMonitoring;

/** MDR Annex VIII Chapter III, Rules 1–22 — the one EU medical-device rule table. */
export const EU_MDR_RULES: readonly MdrRule[] = Object.freeze([
  // Non-invasive devices
  residual(mdr('default', 1, 'I', (v) => !v.anyInvasive && !v.isActive, 'All non-invasive devices are Class I unless one of the following rules applies.')),
  mdr('channel-store', 2, 'I', (v) => !!v.channelsOrStoresForAdministration && !v.connectsToActiveDeviceIIaOrHigher && !v.channelsBloodOrStoresBodyLiquidsOrOrgans && !v.bloodBag,
    'Non-invasive devices for channelling or storing blood, body liquids, cells, tissues, liquids or gases for eventual infusion, administration or introduction into the body are Class I in all other cases.'),
  mdr('connects-active', 2, 'IIa', (v) => !!v.channelsOrStoresForAdministration && !!v.connectsToActiveDeviceIIaOrHigher,
    'Such a channelling/storing device that may be connected to a Class IIa, IIb or III active device is Class IIa.'),
  mdr('blood-organs', 2, 'IIa', (v) => !!v.channelsBloodOrStoresBodyLiquidsOrOrgans,
    'Such a device used for channelling blood, or storing or channelling other body liquids, or storing organs, parts of organs or body cells and tissues is Class IIa.'),
  mdr('blood-bag', 2, 'IIb', (v) => !!v.bloodBag, 'Blood bags are Class IIb.'),
  mdr('modify-composition', 3, 'IIb', (v) => !!v.modifiesCompositionForAdministration && !v.modificationByFiltrationCentrifugationGasHeat,
    'Non-invasive devices modifying the biological or chemical composition of human tissues or cells, blood, other body liquids or other liquids intended for implantation or administration into the body are Class IIb.'),
  mdr('filtration', 3, 'IIa', (v) => !!v.modificationByFiltrationCentrifugationGasHeat,
    'Where that treatment consists of filtration, centrifugation or exchanges of gas or heat, the device is Class IIa.'),
  mdr('in-vitro-contact', 3, 'III', (v) => !!v.inVitroContactWithHumanCellsOrEmbryos,
    'Devices consisting of a substance or mixture used in vitro in direct contact with human cells, tissues or organs taken from the body, or with human embryos, before their implantation or administration are Class III.'),
  mdr('wound-barrier', 4, 'I', (v) => v.injuredSkinOrMucosaContact === 'mechanical_barrier',
    'Non-invasive devices contacting injured skin or mucous membrane, intended as a mechanical barrier, for compression or for absorption of exudates, are Class I.'),
  mdr('wound-breached-dermis', 4, 'IIb', (v) => v.injuredSkinOrMucosaContact === 'breached_dermis_secondary_intent',
    'Those principally intended for injuries to skin which have breached the dermis or mucous membrane and can only heal by secondary intent are Class IIb.'),
  mdr('wound-micro-environment', 4, 'IIa', (v) => v.injuredSkinOrMucosaContact === 'micro_environment' || v.injuredSkinOrMucosaContact === 'other',
    'Those principally intended to manage the micro-environment of injured skin or mucous membrane, and those in all other cases, are Class IIa.'),
  // Invasive devices
  mdr('orifice-transient', 5, 'I', (v) => orificeDuration(v) && v.duration === 'transient',
    'Invasive devices with respect to body orifices (not surgically invasive, not connected to a Class IIa+ active device) for transient use are Class I.'),
  mdr('orifice-short-term', 5, 'IIa', (v) => orificeDuration(v) && v.duration === 'short_term' && !v.orificeSiteOralEarNasal,
    'Such devices for short-term use are Class IIa.'),
  mdr('orifice-short-term-site', 5, 'I', (v) => orificeDuration(v) && v.duration === 'short_term' && !!v.orificeSiteOralEarNasal,
    'Short-term use in the oral cavity as far as the pharynx, in an ear canal up to the ear drum or in the nasal cavity is Class I.'),
  mdr('orifice-long-term', 5, 'IIb', (v) => orificeDuration(v) && v.duration === 'long_term' && !(v.orificeSiteOralEarNasal && !v.absorbedByMucousMembrane),
    'Such devices for long-term use are Class IIb.'),
  mdr('orifice-long-term-site', 5, 'IIa', (v) => orificeDuration(v) && v.duration === 'long_term' && !!v.orificeSiteOralEarNasal && !v.absorbedByMucousMembrane,
    'Long-term use in the oral cavity as far as the pharynx, an ear canal up to the ear drum or the nasal cavity, not liable to be absorbed by the mucous membrane, is Class IIa.'),
  mdr('orifice-connected', 5, 'IIa', (v) => !!v.bodyOrificeInvasive && !v.surgicallyInvasive && !!v.connectsToActiveDeviceIIaOrHigher,
    'Invasive devices with respect to body orifices (not surgically invasive) intended for connection to a Class IIa, IIb or III active device are Class IIa.'),
  mdr('transient-default', 6, 'IIa', (v) => v.siTransient && !v.reusableSurgicalInstrument,
    'All surgically invasive devices intended for transient use are Class IIa unless a sub-provision below applies.'),
  mdr('reusable-instrument', 6, 'I', (v) => v.siTransient && !!v.reusableSurgicalInstrument, 'Reusable surgical instruments are Class I.'),
  mdr('transient-heart-cns', 6, 'III', (v) => v.siTransient && !!v.contactsCnsOrCentralCirculation,
    'Transient surgically invasive devices specifically intended to control, diagnose, monitor or correct a defect of the heart or central circulatory system through direct contact, or for direct contact with the heart, central circulatory system or central nervous system, are Class III.'),
  mdr('transient-ionising', 6, 'IIb', (v) => v.siTransient && !!v.ionisingRadiation,
    'Transient surgically invasive devices intended to supply energy in the form of ionising radiation are Class IIb.'),
  mdr('transient-absorbed', 6, 'IIb', (v) => v.siTransient && !!v.biologicalEffectOrAbsorbed,
    'Transient surgically invasive devices that have a biological effect or are wholly or mainly absorbed are Class IIb.'),
  mdr('transient-medicine', 6, 'IIb', (v) => v.siTransient && !!v.administersMedicine && !!v.administrationPotentiallyHazardous,
    'Transient surgically invasive devices administering medicinal products by a delivery system, where that is done in a potentially hazardous manner, are Class IIb.'),
  mdr('short-term-default', 7, 'IIa', (v) => v.siShortTerm,
    'All surgically invasive devices intended for short-term use are Class IIa unless a sub-provision below applies.'),
  mdr('short-term-heart-cns', 7, 'III', (v) => v.siShortTerm && !!v.contactsCnsOrCentralCirculation,
    'Short-term surgically invasive devices to control, diagnose, monitor or correct a defect of the heart or central circulatory system through direct contact, or for direct contact with the heart, central circulatory system or central nervous system, are Class III.'),
  mdr('short-term-ionising', 7, 'IIb', (v) => v.siShortTerm && !!v.ionisingRadiation,
    'Short-term surgically invasive devices supplying energy in the form of ionising radiation are Class IIb.'),
  mdr('short-term-absorbed', 7, 'III', (v) => v.siShortTerm && !!v.biologicalEffectOrAbsorbed,
    'Short-term surgically invasive devices that have a biological effect or are wholly or mainly absorbed are Class III.'),
  mdr('short-term-chemical-change', 7, 'IIb', (v) => v.siShortTerm && !!v.chemicalChange && !v.placedInTeeth,
    'Short-term surgically invasive devices intended to undergo chemical change in the body, except devices placed in the teeth, are Class IIb.'),
  mdr('short-term-medicine', 7, 'IIb', (v) => v.siShortTerm && !!v.administersMedicine,
    'Short-term surgically invasive devices intended to administer medicinal products are Class IIb.'),
  mdr('implant-default', 8, 'IIb', (v) => v.rule8Scope && !v.placedInTeeth,
    'All implantable devices and long-term surgically invasive devices are Class IIb unless a sub-provision below applies.'),
  mdr('implant-teeth', 8, 'IIa', (v) => v.rule8Scope && !!v.placedInTeeth, 'Those intended to be placed in the teeth are Class IIa.'),
  mdr('implant-heart-cns', 8, 'III', (v) => v.rule8Scope && !!v.contactsCnsOrCentralCirculation,
    'Those used in direct contact with the heart, the central circulatory system or the central nervous system are Class III.'),
  mdr('implant-absorbed', 8, 'III', (v) => v.rule8Scope && !!v.biologicalEffectOrAbsorbed,
    'Those that have a biological effect or are wholly or mainly absorbed are Class III.'),
  mdr('implant-chemical-change', 8, 'III', (v) => v.rule8Scope && !!v.chemicalChange && !v.placedInTeeth,
    'Those intended to undergo chemical change in the body, except devices placed in the teeth, are Class III.'),
  mdr('implant-medicine', 8, 'III', (v) => v.rule8Scope && !!v.administersMedicine, 'Those intended to administer medicinal products are Class III.'),
  mdr('active-implantable', 8, 'III', (v) => v.isActiveImplantable, 'Active implantable devices or their accessories are Class III.'),
  mdr('breast-implant-mesh', 8, 'III', (v) => !!v.breastImplantOrMesh, 'Breast implants and surgical meshes are Class III.'),
  mdr('joint-replacement', 8, 'III', (v) => !!v.jointReplacement,
    'Total or partial joint replacements are Class III, except ancillary components such as screws, wedges, plates and instruments.'),
  mdr('spinal', 8, 'III', (v) => !!v.spinalImplant,
    'Spinal disc replacement implants and implantable devices in contact with the spinal column are Class III, except components such as screws, wedges, plates and instruments.'),
  // Active devices
  mdr('active-therapeutic', 9, 'IIa', (v) => !!v.activeTherapeutic, 'All active therapeutic devices intended to administer or exchange energy are Class IIa.'),
  mdr('energy-hazardous', 9, 'IIb', (v) => !!v.activeTherapeutic && !!v.energyExchangePotentiallyHazardous,
    'Where they may administer or exchange energy with the body in a potentially hazardous way, taking account of the nature, density and site of application of the energy, they are Class IIb.'),
  mdr('controls-iib-therapeutic', 9, 'IIb', (v) => !!v.controlsActiveTherapeuticIIb,
    'Active devices intended to control or monitor the performance of active therapeutic Class IIb devices, or to directly influence their performance, are Class IIb.'),
  mdr('therapeutic-ionising', 9, 'IIb', (v) => !!v.activeTherapeutic && !!v.ionisingRadiation,
    'Active devices intended to emit ionising radiation for therapeutic purposes, including devices which control or monitor them, are Class IIb.'),
  mdr('controls-active-implantable', 9, 'III', (v) => !!v.controlsActiveImplantable,
    'Active devices intended to control, monitor or directly influence the performance of active implantable devices are Class III.'),
  mdr('active-diagnostic', 10, 'IIa', (v) => !!v.activeDiagnostic,
    'Active devices for diagnosis and monitoring are Class IIa if they supply energy absorbed by the body, image in vivo distribution of radiopharmaceuticals, or allow direct diagnosis or monitoring of vital physiological processes; a device intended only to illuminate the patient\'s body in the visible spectrum is Class I (no fact selects that carve-out, so it is never stated here).'),
  mdr('vital-parameters', 10, 'IIb', (v) => !!v.monitorsVitalParametersImmediateDanger,
    'Active devices specifically intended to monitor vital physiological parameters whose variations could result in immediate danger to the patient are Class IIb.'),
  mdr('diagnosis-immediate-danger', 10, 'IIb', (v) => !!v.diagnosisPatientInImmediateDanger,
    'Active devices intended for diagnosis in clinical situations where the patient is in immediate danger are Class IIb.'),
  mdr('diagnostic-ionising', 10, 'IIb', (v) => !!v.activeDiagnostic && !!v.ionisingRadiation,
    'Active devices intended to emit ionising radiation for diagnostic or therapeutic radiology, including interventional radiology and devices which control or monitor them, are Class IIb.'),
  mdr('software-decisions', 11, 'IIa', (v) => !!v.softwareDecisionSupport,
    'Software intended to provide information used to take decisions with diagnostic or therapeutic purposes is Class IIa.'),
  mdr('software-serious-deterioration', 11, 'IIb', (v) => !!v.softwareSeriousDeterioration,
    'Where such decisions may cause a serious deterioration of health or a surgical intervention, the software is Class IIb.'),
  mdr('software-death', 11, 'III', (v) => !!v.softwareSeriousDecisions,
    'Where such decisions may cause death or an irreversible deterioration of health, the software is Class III.'),
  mdr('software-monitoring', 11, 'IIa', (v) => !!v.softwarePhysiologicalMonitoring, 'Software intended to monitor physiological processes is Class IIa.'),
  mdr('software-vital-parameters', 11, 'IIb', (v) => !!v.softwareVitalParameterMonitoring,
    'Software monitoring vital physiological parameters whose variations could result in immediate danger to the patient is Class IIb.'),
  mdr('software-other', 11, 'I', rule11Other, 'All other software is Class I.'),
  mdr('administer-remove', 12, 'IIa', (v) => v.isActive && !!v.administersMedicine,
    'Active devices intended to administer and/or remove medicinal products, body liquids or other substances to or from the body are Class IIa.'),
  mdr('administer-hazardous', 12, 'IIb', (v) => v.isActive && !!v.administersMedicine && !!v.administrationPotentiallyHazardous,
    'Where this is done in a potentially hazardous manner, taking account of the substances, the part of the body and the mode of application, they are Class IIb.'),
  residual(mdr('other-active', 13, 'I', (v) => v.isActive, 'All other active devices are Class I.')),
  // Special rules
  mdr('medicinal-substance', 14, 'III', (v) => !!v.incorporatesMedicinalSubstance,
    'Devices incorporating, as an integral part, a substance which used separately would be a medicinal product (including one derived from human blood or plasma) with action ancillary to the device are Class III.'),
  mdr('contraception', 15, 'IIb', (v) => !!v.contraceptionOrStdPrevention,
    'Devices used for contraception or prevention of the transmission of sexually transmitted diseases are Class IIb.'),
  mdr('contraception-implant', 15, 'III', (v) => !!v.contraceptionOrStdPrevention && (v.rule8Scope || (v.anyInvasive && v.duration === 'long_term')),
    'Where they are implantable or long-term invasive devices, they are Class III.'),
  mdr('contact-lens-care', 16, 'IIb', (v) => !!v.contactLensCare, 'Devices specifically intended for disinfecting, cleaning, rinsing or hydrating contact lenses are Class IIb.'),
  mdr('disinfect-devices', 16, 'IIa', (v) => !!v.disinfectsOrSterilisesDevices && !v.disinfectsInvasiveDevicesEndpoint,
    'Devices specifically intended for disinfecting or sterilising medical devices are Class IIa.'),
  mdr('disinfect-invasive-endpoint', 16, 'IIb', (v) => !!v.disinfectsInvasiveDevicesEndpoint,
    'Disinfecting solutions or washer-disinfectors intended specifically for disinfecting invasive devices as the end point of processing are Class IIb.'),
  mdr('xray-recording', 17, 'IIa', (v) => !!v.xrayImageRecording, 'Devices specifically intended for recording diagnostic images generated by X-ray radiation are Class IIa.'),
  mdr('non-viable-tissue', 18, 'III', (v) => !!v.nonViableHumanOrAnimalTissue && !v.animalTissueIntactSkinOnly,
    'Devices manufactured utilising non-viable (or rendered non-viable) tissues or cells of human or animal origin, or their derivatives, are Class III, unless made with non-viable animal tissues that contact intact skin only.'),
  mdr('nano-high-medium', 19, 'III', (v) => v.nanomaterialInternalExposure === 'high' || v.nanomaterialInternalExposure === 'medium',
    'Devices incorporating or consisting of nanomaterial are Class III if they present a high or medium potential for internal exposure.'),
  mdr('nano-low', 19, 'IIb', (v) => v.nanomaterialInternalExposure === 'low', '... Class IIb if they present a low potential for internal exposure.'),
  mdr('nano-negligible', 19, 'IIa', (v) => v.nanomaterialInternalExposure === 'negligible', '... Class IIa if they present a negligible potential for internal exposure.'),
  mdr('inhalation', 20, 'IIa', (v) => !!v.inhalationMedicinalProduct,
    'Invasive devices with respect to body orifices (not surgically invasive) intended to administer medicinal products by inhalation are Class IIa.'),
  mdr('inhalation-essential', 20, 'IIb', (v) => !!v.inhalationMedicinalProduct && !!v.inhalationEssentialImpactOrLifeThreatening,
    'Where their mode of action has an essential impact on the efficacy and safety of the administered medicinal product, or they treat life-threatening conditions, they are Class IIb.'),
  mdr('substance-systemic', 21, 'III', (v) => v.substanceBasedDevice === 'systemically_absorbed' || v.substanceBasedDevice === 'gi_tract_systemically_absorbed',
    'Substance-based devices introduced via a body orifice or applied to the skin are Class III if they or their metabolites are systemically absorbed to achieve the intended purpose, including those acting in the stomach or lower gastrointestinal tract that are systemically absorbed.'),
  mdr('substance-local', 21, 'IIa', (v) => v.substanceBasedDevice === 'skin_nasal_oral_local',
    'They are Class IIa if applied to the skin, or in the nasal or oral cavity as far as the pharynx, and achieve their intended purpose there.'),
  mdr('substance-other', 21, 'IIb', (v) => v.substanceBasedDevice === 'other', 'They are Class IIb in all other cases.'),
  mdr('closed-loop', 22, 'III', (v) => !!v.closedLoopDiagnosticFunction,
    'Active therapeutic devices with an integrated or incorporated diagnostic function that significantly determines the patient management by the device (closed-loop systems, automated external defibrillators) are Class III.'),
]);

const BOOL = 'boolean' as const;
/** Every MDR fact and how it is read; the mapped type makes a new fact without an entry a compile error. */
const MDR_FACT_SPEC: { readonly [K in keyof Required<MdrDeviceFacts>]: FactSpec } = Object.freeze({
  invasive: BOOL, bodyOrificeInvasive: BOOL, surgicallyInvasive: BOOL, implantable: BOOL, active: BOOL, activeTherapeutic: BOOL,
  activeDiagnostic: BOOL, activeImplantable: BOOL, breastImplantOrMesh: BOOL, jointReplacement: BOOL, spinalImplant: BOOL,
  placedInTeeth: BOOL, reusableSurgicalInstrument: BOOL, chemicalChange: BOOL, ionisingRadiation: BOOL, softwareDecisionSupport: BOOL,
  softwareSeriousDeterioration: BOOL, softwareSeriousDecisions: BOOL, softwarePhysiologicalMonitoring: BOOL,
  softwareVitalParameterMonitoring: BOOL, software: BOOL, monitorsVitalParametersImmediateDanger: BOOL,
  diagnosisPatientInImmediateDanger: BOOL, energyExchangePotentiallyHazardous: BOOL, controlsActiveTherapeuticIIb: BOOL,
  controlsActiveImplantable: BOOL, administersMedicine: BOOL, administrationPotentiallyHazardous: BOOL,
  incorporatesMedicinalSubstance: BOOL, contactsCnsOrCentralCirculation: BOOL, biologicalEffectOrAbsorbed: BOOL,
  duration: ['transient', 'short_term', 'long_term'], orificeSiteOralEarNasal: BOOL, absorbedByMucousMembrane: BOOL,
  connectsToActiveDeviceIIaOrHigher: BOOL, channelsOrStoresForAdministration: BOOL, channelsBloodOrStoresBodyLiquidsOrOrgans: BOOL,
  bloodBag: BOOL, modifiesCompositionForAdministration: BOOL, modificationByFiltrationCentrifugationGasHeat: BOOL,
  inVitroContactWithHumanCellsOrEmbryos: BOOL,
  injuredSkinOrMucosaContact: ['mechanical_barrier', 'breached_dermis_secondary_intent', 'micro_environment', 'other'],
  contraceptionOrStdPrevention: BOOL, contactLensCare: BOOL, disinfectsOrSterilisesDevices: BOOL, disinfectsInvasiveDevicesEndpoint: BOOL,
  xrayImageRecording: BOOL, nonViableHumanOrAnimalTissue: BOOL, animalTissueIntactSkinOnly: BOOL,
  nanomaterialInternalExposure: ['high', 'medium', 'low', 'negligible'], inhalationMedicinalProduct: BOOL,
  inhalationEssentialImpactOrLifeThreatening: BOOL,
  substanceBasedDevice: ['systemically_absorbed', 'gi_tract_systemically_absorbed', 'skin_nasal_oral_local', 'other'],
  closedLoopDiagnosticFunction: BOOL,
});

/** The MDR facts the engine reads, for a caller (or AnA's tool definition) to list. */
export const MDR_FACT_KEYS: readonly string[] = Object.freeze(Object.keys(MDR_FACT_SPEC));

/** Render a fact spec as AnA's tool definition lists it: a bare key is true/false. */
function factVocabulary(spec: Readonly<Record<string, FactSpec>>): string {
  return Object.entries(spec)
    .map(([k, v]) => (v === BOOL ? k : v === 'text' ? `${k} (text)` : `${k} (${v.join('|')})`))
    .join(', ');
}

/** The MDR facts with their value kinds, for AnA's classify_device definition. */
export const MDR_FACT_VOCABULARY: string = factVocabulary(MDR_FACT_SPEC);

/**
 * Facts that qualify another fact: a rule reads them only together with it. Given true without it, the qualifier would
 * be dropped and a lower class stated — an X-ray generator described as { active, ionisingRadiation } would be Rule 13's
 * Class I, not Rule 10's IIb — so the class is not determined and `missing` is named instead. `base`, when stated false
 * with the qualifier true, is a contradiction and is refused.
 */
const MDR_QUALIFIERS: ReadonlyArray<{
  fact: keyof MdrDeviceFacts; base?: keyof MdrDeviceFacts; read: (v: MdrFactView) => boolean; missing: string | ((v: MdrFactView) => string);
}> = [
  { fact: 'energyExchangePotentiallyHazardous', base: 'activeTherapeutic', read: (v) => !!v.activeTherapeutic,
    missing: 'activeTherapeutic (energyExchangePotentiallyHazardous qualifies an active therapeutic device, Rule 9)' },
  // Only Rule 6 (transient surgically invasive) and Rule 12 (active) read it; Rule 7 (short-term surgically invasive) and
  // Rule 8 already give IIb / III for administering medicine. On any other device — a passive non-invasive or body-orifice
  // one — no row reads it, so it would be dropped silently.
  { fact: 'administrationPotentiallyHazardous', base: 'administersMedicine',
    read: (v) => !!v.administersMedicine && (v.isActive || v.siTransient || v.siShortTerm || v.rule8Scope),
    missing: (v) => (v.administersMedicine
      ? 'active (Rule 12) | surgicallyInvasive with a transient duration (Rule 6) (administrationPotentiallyHazardous is read only by those rules; for any other device no rule reads it — state which applies, or leave it out)'
      : 'administersMedicine (administrationPotentiallyHazardous qualifies a device administering medicinal products, Rules 6 and 12)') },
  { fact: 'inhalationEssentialImpactOrLifeThreatening', base: 'inhalationMedicinalProduct', read: (v) => !!v.inhalationMedicinalProduct,
    missing: 'inhalationMedicinalProduct (inhalationEssentialImpactOrLifeThreatening qualifies an inhalation device, Rule 20)' },
  { fact: 'ionisingRadiation', read: (v) => !!v.activeTherapeutic || !!v.activeDiagnostic || v.siTransient || v.siShortTerm || v.rule8Scope,
    missing: 'activeTherapeutic | activeDiagnostic | surgicallyInvasive with a transient or short_term duration (which device emits the ionising radiation: Rule 9, Rule 10 or Rules 6/7)' },
];

/** Read and check MDR facts: unknown keys, wrong types and contradictory facts are refused. */
function readMdrFacts(raw: unknown): MdrDeviceFacts {
  const f = readFacts('MDR', raw, MDR_FACT_SPEC) as MdrDeviceFacts;
  const contradictions: string[] = [];
  if (f.invasive === false) {
    const kinds = [...INVASIVE_FACTS, ...IMPLANT_FACTS, 'activeImplantable' as const].filter((k) => k !== 'invasive' && !!f[k]);
    if (kinds.length > 0) contradictions.push(`invasive: false contradicts ${kinds.map((k) => `${k}: true`).join(', ')}`);
  }
  for (const q of MDR_QUALIFIERS) {
    if (q.base && f[q.fact] === true && f[q.base] === false) contradictions.push(`${q.fact}: true contradicts ${q.base}: false`);
  }
  if (contradictions.length > 0) {
    throw new DeviceClassificationFactError(`MDR facts: ${contradictions.join('; ')}. No class is stated; give one reading.`);
  }
  return f;
}

/** The fact named when nothing says whether the device is invasive (`invasive: false` or a kind of invasiveness). */
export const MDR_MISSING_INVASIVE = 'invasive (state invasive: false for a non-invasive device, or the kind of invasiveness)';

/** Facts a rule needs that were not given; with any of these, the class is not determined below Class III. */
function mdrMissingFacts(v: MdrFactView): string[] {
  const missing: string[] = [];
  // Rule 8 covers every implant, so every class below III depends on whether the device is invasive. Reading an
  // unstated invasiveness as "not invasive" would make Rules 1 and 13 — defaults reached by the absence of every other
  // fact — a verdict: an active implantable described only as { active: true } would come out Class I, not III, and an
  // implanted contraceptive given only as { contraceptionOrStdPrevention: true } IIb, not III.
  if (v.invasive !== false && !v.anyInvasive) missing.push(MDR_MISSING_INVASIVE);
  for (const q of MDR_QUALIFIERS) {
    if (v[q.fact] === true && !q.read(v)) missing.push(typeof q.missing === 'function' ? q.missing(v) : q.missing);
  }
  return [...missing, ...mdrInvasiveMissingFacts(v)];
}

/** For an invasive device: the kind of invasiveness and, for the kinds whose rules turn on it, the duration. */
function mdrInvasiveMissingFacts(v: MdrFactView): string[] {
  if (!v.anyInvasive) return [];
  if (!v.bodyOrificeInvasive && !v.surgicallyInvasive && !v.implantable) {
    return ['bodyOrificeInvasive | surgicallyInvasive | implantable (which kind of invasive device)'];
  }
  const siNeedsDuration = !!v.surgicallyInvasive && !v.implantable;
  const orificeNeedsDuration = !!v.bodyOrificeInvasive && !v.surgicallyInvasive && !v.implantable && !v.connectsToActiveDeviceIIaOrHigher;
  return (siNeedsDuration || orificeNeedsDuration) && !v.duration ? ['duration'] : [];
}

export interface MdrClassification {
  /** The highest applicable class; null when a fact that decides it is missing (see `missingFacts`). */
  class: MdrClass | null;
  /** The rule(s) that gave the class, or 'not determined'. */
  ruleApplied: string;
  rationale: string;
  caveat: string;
  /** Every rule row that fired, in table order. */
  ruleTrace: RuleTraceEntry<MdrClass>[];
  /** Facts that must be supplied before a class below III can be stated. */
  missingFacts: string[];
}

const MDR_ORDER: Record<MdrClass, number> = { I: 0, IIa: 1, IIb: 2, III: 3 };
const MDR_CAVEAT =
  'Annex VIII Rules 1–22 evaluated from the supplied facts, highest applicable class. Rule wording is a recall paraphrase, not checked against the EUR-Lex text. Chapter II implementing rules (accessories, software that drives a device) are not applied. Confirm against Regulation (EU) 2017/745 Annex VIII and MDCG 2021-24.';

/**
 * Classify an EU medical device per MDR Annex VIII (`EU_MDR_RULES`).
 * @throws DeviceClassificationFactError when a fact cannot be read (unknown key, wrong type, value outside its set,
 *   contradictory invasiveness).
 */
export function classifyMdr(facts: MdrDeviceFacts): MdrClassification {
  const view = mdrView(readMdrFacts(facts));
  const ruleTrace = evaluate(EU_MDR_RULES, view);
  const missingFacts = mdrMissingFacts(view);
  const best = top(ruleTrace, MDR_ORDER);
  if (missingFacts.length > 0 && best?.cls !== 'III') {
    const reach = best ? ` The facts given reach at least Class ${best.cls} (${best.rule}).` : '';
    return { class: null, ruleApplied: 'not determined', rationale: `The class cannot be determined without: ${missingFacts.join('; ')}.${reach}`, caveat: MDR_CAVEAT, ruleTrace, missingFacts };
  }
  if (!best) {
    // Unreachable with the residual rows (non-invasive → Rule 1, active → Rule 13); fail closed if it ever is.
    return { class: null, ruleApplied: 'not determined', rationale: 'No Annex VIII rule fired for the facts given.', caveat: MDR_CAVEAT, ruleTrace, missingFacts };
  }
  return { class: best.cls, ruleApplied: best.rule, rationale: best.why, caveat: MDR_CAVEAT, ruleTrace, missingFacts };
}

// ── IVDR (Annex VIII) ─────────────────────────────────────────────────────────

export type IvdrClass = 'A' | 'B' | 'C' | 'D';

/** A string fact value, refused unread when it is longer than `MAX_FACT_TEXT_LENGTH`. */
function boundedText(name: string, value: string): string {
  if (value.length > MAX_FACT_TEXT_LENGTH) {
    throw new DeviceClassificationFactError(`${name}: a value is longer than ${MAX_FACT_TEXT_LENGTH} characters and is not read. No class is stated.`);
  }
  return value;
}

/** One value or a list → the list. An empty or over-long list is refused: it names nothing, or more than a device does. */
function factList(name: string, raw: unknown): unknown[] {
  if (raw === undefined || raw === null) return [];
  const values: unknown[] = Array.isArray(raw) ? raw : [raw];
  if (values.length === 0) throw new DeviceClassificationFactError(`${name}: an empty list names nothing; leave the fact out instead. No class is stated.`);
  if (values.length > MAX_FACT_LIST_LENGTH) throw new DeviceClassificationFactError(`${name}: more than ${MAX_FACT_LIST_LENGTH} values are not read. No class is stated.`);
  return values;
}

/** Lower-case with every run of whitespace removed (linear; no nested quantifier). */
const squeeze = (s: string): string => s.toLowerCase().replace(/\s+/g, '');

// ── Rule 3 sub-points ──

/** The Rule 3 sub-points, (a)–(m). */
export const IVDR_RULE3_POINTS = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'] as const);
export type IvdrRule3Point = (typeof IVDR_RULE3_POINTS)[number];

/** Closed table: every accepted spelling of a Rule 3 point, lower-cased with whitespace removed ("Rule 3 (h)" → "rule3(h)"). */
const RULE3_POINT_SPELLINGS: ReadonlyMap<string, IvdrRule3Point> = new Map(
  IVDR_RULE3_POINTS.flatMap((p) => [p, `(${p})`, `3${p}`, `3(${p})`, `rule3${p}`, `rule3(${p})`].map((k) => [k, p] as const)),
);

/** Read `rule3Points` (one value or a list) into sub-point letters; any value that names no point (a)–(m) is refused. */
export function normaliseRule3Points(raw: unknown): IvdrRule3Point[] {
  const points: IvdrRule3Point[] = [];
  const unrecognised: string[] = [];
  for (const value of factList('rule3Points', raw)) {
    const p = typeof value === 'string' ? RULE3_POINT_SPELLINGS.get(squeeze(boundedText('rule3Points', value))) : undefined;
    if (p) points.push(p);
    else unrecognised.push(shown(value));
  }
  if (unrecognised.length > 0) {
    throw new DeviceClassificationFactError(
      `rule3Points: ${unrecognised.join(', ')} ${unrecognised.length === 1 ? 'is' : 'are'} not an IVDR Annex VIII Rule 3 sub-point. `
      + 'Give one or more of the letters (a)–(m), e.g. "h" or "3(h)". No class is stated, because ignoring the value would state a lower one.',
    );
  }
  return points;
}

// ── Rule 4(a) self-test analytes ──

/** Self-test analytes that Rule 4(a) places in Class B instead of C. */
export const IVDR_RULE4A_CLASS_B_ANALYTES = Object.freeze(['pregnancy', 'fertility', 'cholesterol', 'urine_glucose', 'urine_erythrocytes', 'urine_leucocytes', 'urine_bacteria'] as const);
export type IvdrRule4aClassBAnalyte = (typeof IVDR_RULE4A_CLASS_B_ANALYTES)[number];

/** Lower-case; every run of characters other than a–z/0–9 becomes one "_"; leading/trailing "_" dropped. */
function analyteKey(s: string): string {
  const k = s.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  let a = 0;
  let b = k.length;
  while (a < b && k[a] === '_') a++;
  while (b > a && k[b - 1] === '_') b--;
  return k.slice(a, b);
}

/**
 * Closed table of `selfTestAnalyte` spellings (platform convention, recorded in the step's facts file): the Rule 4(a)
 * Class B analytes, their usual synonyms, and "other" for any analyte not on that list (Class C). Anything else is
 * refused: a misspelt exception would otherwise read as "other" and state C where the Annex gives B.
 */
const RULE4A_ANALYTE_SPELLINGS: ReadonlyMap<string, IvdrRule4aClassBAnalyte | 'other'> = new Map<string, IvdrRule4aClassBAnalyte | 'other'>([
  ...IVDR_RULE4A_CLASS_B_ANALYTES.map((a) => [a, a] as const),
  ['pregnancy_test', 'pregnancy'], ['fertility_test', 'fertility'], ['cholesterol_level', 'cholesterol'],
  ['glucose_in_urine', 'urine_glucose'], ['urinary_glucose', 'urine_glucose'],
  ['erythrocytes_in_urine', 'urine_erythrocytes'], ['urinary_erythrocytes', 'urine_erythrocytes'],
  ['urine_leukocytes', 'urine_leucocytes'], ['leucocytes_in_urine', 'urine_leucocytes'], ['leukocytes_in_urine', 'urine_leucocytes'],
  ['urinary_leucocytes', 'urine_leucocytes'], ['urinary_leukocytes', 'urine_leucocytes'],
  ['bacteria_in_urine', 'urine_bacteria'], ['urinary_bacteria', 'urine_bacteria'],
  ['other', 'other'],
]);

/** Read `selfTestAnalyte`: a Rule 4(a) Class B analyte, 'other', or undefined when not given. Anything else is refused. */
function readSelfTestAnalyte(raw: unknown, selfTesting: boolean | undefined): IvdrRule4aClassBAnalyte | 'other' | undefined {
  if (raw === undefined) return undefined;
  if (selfTesting !== true) {
    throw new DeviceClassificationFactError('selfTestAnalyte is read only for a self-test; give selfTesting: true with it. No class is stated.');
  }
  const a = typeof raw === 'string' ? RULE4A_ANALYTE_SPELLINGS.get(analyteKey(boundedText('selfTestAnalyte', raw))) : undefined;
  if (a) return a;
  throw new DeviceClassificationFactError(
    `selfTestAnalyte: ${shown(raw)} is not a Rule 4(a) analyte the engine reads. Give one of ${IVDR_RULE4A_CLASS_B_ANALYTES.join(', ')} `
    + '(the Class B exceptions), or "other" for any other analyte (Class C). No class is stated.',
  );
}

// ── Rule 2 blood-grouping markers ──

/**
 * The Rule 2 markers that make a blood-grouping device Class D, as the Annex lists them (ISBT designations).
 * "RHW1" is read here as Cw (ISBT RH8); one secondary source reads it as weak D. Both readings map to D below, so
 * the class does not depend on which is right (recall; see the step's facts file).
 */
export const IVDR_RULE2_CLASS_D_MARKERS = Object.freeze(['ABO1', 'ABO2', 'ABO3', 'RH1', 'RHW1', 'RH2', 'RH3', 'RH4', 'RH5', 'KEL1', 'JK1', 'JK2', 'FY1', 'FY2'] as const);
const RULE2_LISTED_CODES: ReadonlySet<string> = new Set(IVDR_RULE2_CLASS_D_MARKERS);

/*
 * How a `bloodGroupingMarker` value is read — closed tables only (platform convention, recorded in the step's facts file):
 * - traditional antigen names match case-sensitively (C is RH2, c is RH4; K is KEL1, k is KEL2);
 * - ISBT codes, system names and aliases match case-insensitively. A system that contains listed markers maps to
 *   them — conservatively D, since the Annex itself names the "ABO system", "Rhesus system" and so on;
 * - a recognised marker, system or typing that contains no listed marker (Lewis, KEL2, HLA ...) reads as not listed,
 *   but only from a token with no whitespace in it, so words run together can never hide a listed marker;
 * - an ISBT code is a system symbol from `ISBT_SYMBOLS` followed by an antigen number 1–999 with no leading zero
 *   (ISBT has no antigen 0): "RH01" and "KEL0" are refused, not read as non-listed antigens;
 * - anything else is unreadable and refused. Symbols that are also English words ("in", "do", "I", "H", "P", "OK")
 *   are left out of the alias list, so free text cannot match them.
 * Values are space-separated lists of the listed markers each name denotes.
 */
const RULE2_LISTED_NAMES: ReadonlyMap<string, string> = new Map(Object.entries({
  A: 'ABO1', B: 'ABO2', AB: 'ABO3', 'A,B': 'ABO3', D: 'RH1', Du: 'RH1', Cw: 'RHW1', C: 'RH2', E: 'RH3', c: 'RH4', e: 'RH5',
  K: 'KEL1', Jka: 'JK1', 'Jk(a)': 'JK1', Jkb: 'JK2', 'Jk(b)': 'JK2', Fya: 'FY1', 'Fy(a)': 'FY1', Fyb: 'FY2', 'Fy(b)': 'FY2',
}));
const RULE2_OTHER_NAMES: ReadonlySet<string> = new Set('A1 M N S s U P1 k Kpa Kpb Jsa Jsb Lua Lub Lea Leb Dia Dib Wra Xga Yta Ytb Fy3 Jk3'.split(' '));
const RH_LISTED = 'RH1 RHW1 RH2 RH3 RH4 RH5';
/** Keys: lower-cased, with whitespace, hyphens, brackets and slashes removed ("Rh(D)" → "rhd", "Rh0(D)" → "rh0d"). */
const RULE2_LISTED_ALIASES: ReadonlyMap<string, string> = new Map(Object.entries({
  abo: 'ABO1 ABO2 ABO3', rh: RH_LISTED, rhesus: RH_LISTED, rhd: 'RH1', weakd: 'RH1', partiald: 'RH1',
  // Wiener's notation for D ("Rh0", "Rho(D)").
  rh0: 'RH1', rho: 'RH1', rh0d: 'RH1', rhod: 'RH1',
  rhcw: 'RHW1', rh8: 'RHW1',
  // Lower-casing loses C vs c and E vs e, so these name both — each pair is listed either way.
  rhc: 'RH2 RH4', rhe: 'RH3 RH5', rhce: 'RH2 RH3 RH4 RH5',
  kel: 'KEL1', kell: 'KEL1', k1: 'KEL1', jk: 'JK1 JK2', kidd: 'JK1 JK2', jka: 'JK1', jkb: 'JK2',
  fy: 'FY1 FY2', duffy: 'FY1 FY2', fya: 'FY1', fyb: 'FY2',
}));
const RULE2_OTHER_SYSTEMS: ReadonlySet<string> = new Set(('mns mnss lu lutheran lewis p1pk di diego yt cartwright xg sc scianna dombrock colton lw '
  + 'rg chido rodgers chidorodgers xk kx gerbich crom cromer kn knops indian raph jmh globoside gil rhag fors jr langereis vel').split(' '));
/** ISBT blood-group system symbols (recall). A code is one of these plus an antigen number; the listed codes are matched first. */
const ISBT_SYMBOLS: ReadonlySet<string> = new Set(('ABO MNS P1PK RH LU KEL LE FY JK DI YT XG SC DO CO LW CH RG XK GE CROM KN IN OK RAPH JMH '
  + 'GLOB GIL RHAG FORS JR LAN VEL').split(' '));
/*
 * Rule 2's tissue typing, and the platelet / neutrophil antigen systems: recognised, none listed. Read by a closed
 * grammar (platform convention, recorded in the step's facts file), never an open character set, so a listed marker
 * joined on ("HLA-ABO", "HLA-A:RhD", "HPA-RHD") is refused, not read as typing:
 *   HLA | HLA-<locus>[<serological number> | W<number> | *<allele>]   locus from HLA_LOCI; allele = digit groups
 *                                                                     joined by ":", with an optional expression suffix;
 *   HPA | HPA-<number>[A|B][W]      HNA | HNA-<number>[A|B|C|D][W]   (upper-cased input).
 */
const HLA_LOCI: readonly string[] = Object.freeze(['A', 'B', 'C', 'E', 'F', 'G', 'DR', 'DRA', 'DRB1', 'DRB3', 'DRB4', 'DRB5', 'DQ', 'DQA1',
  'DQB1', 'DP', 'DPA1', 'DPB1', 'MICA', 'MICB'].sort((x, y) => y.length - x.length));
const HLA_EXPRESSION_SUFFIXES: ReadonlySet<string> = new Set(['N', 'L', 'S', 'C', 'A', 'Q']);
const PLATELET_NEUTROPHIL_ALLELES: Readonly<Record<'HPA' | 'HNA', ReadonlySet<string>>> = {
  HPA: new Set(['', 'A', 'B', 'AW', 'BW']),
  HNA: new Set(['', 'A', 'B', 'C', 'D', 'AW', 'BW', 'CW', 'DW']),
};

/** Length of the run of digits at `s[i]`. */
function digitRun(s: string, i: number): number {
  let j = i;
  while (j < s.length && s[j] >= '0' && s[j] <= '9') j++;
  return j - i;
}

/** An HLA allele after "*": 1–4 groups of 2–4 digits joined by ":", then an optional expression suffix ("02:01", "15:01:01:01N"). */
function isHlaAllele(s: string): boolean {
  let i = 0;
  for (let group = 0; group < 4; group++) {
    const n = digitRun(s, i);
    if (n < 2 || n > 4) return false;
    i += n;
    if (s[i] !== ':') break;
    i++;
  }
  const rest = s.slice(i);
  return rest === '' || HLA_EXPRESSION_SUFFIXES.has(rest);
}

/** What may follow an HLA locus: nothing, a serological number ("B27"), a "W" number ("BW4") or "*" and an allele. */
function isHlaLocusTail(tail: string): boolean {
  if (tail === '') return true;
  if (tail[0] === '*') return isHlaAllele(tail.slice(1));
  const start = tail[0] === 'W' ? 1 : 0;
  const n = digitRun(tail, start);
  return n >= 1 && n <= 4 && start + n === tail.length;
}
/** Words in free text that say nothing about which marker it names. */
const MARKER_FILLER: ReadonlySet<string> = new Set(('system systems antigen antigens blood group groups grouping typing type types factor phenotype '
  + 'phenotyping genotype genotyping reagent reagents test tests assay determination marker markers a an and or the of for in to with anti '
  + 'antisera antiserum monoclonal class ii red cell cells rbc kit card gel screen screening confirmation confirmatory positive negative weak partial variant variants').split(' '));
const OPEN_BRACKETS = '([';
const CLOSE_BRACKETS = ')]';
const TRAILING_PUNCTUATION = '.:,;';

/** An ISBT code ("LE1", "KEL2"): the listed marker it is, [] for a non-listed antigen, or null when it is not a code. */
function readIsbtCode(code: string): string[] | null {
  let i = 0;
  while (i < code.length && code[i] >= 'A' && code[i] <= 'Z') i++;
  const symbol = code.slice(0, i);
  const num = code.slice(i);
  if (!ISBT_SYMBOLS.has(symbol) || num.length === 0 || num.length > 3 || num[0] === '0') return null;
  for (const ch of num) if (ch < '0' || ch > '9') return null;
  return RULE2_LISTED_CODES.has(code) ? [code] : [];
}

/** HLA / HPA / HNA typing ("HLA-A*02:01", "HLA-B27", "HPA-1A"), upper-cased: the closed grammar above, checked without a pattern. */
function isTyping(code: string): boolean {
  const prefix = code.slice(0, 3);
  if (prefix !== 'HLA' && prefix !== 'HPA' && prefix !== 'HNA') return false;
  if (code.length === 3) return true;
  if (code[3] !== '-') return false;
  const rest = code.slice(4);
  if (prefix === 'HLA') {
    const locus = HLA_LOCI.find((l) => rest.startsWith(l) && isHlaLocusTail(rest.slice(l.length)));
    return locus !== undefined;
  }
  const n = digitRun(rest, 0);
  return n >= 1 && n <= 2 && PLATELET_NEUTROPHIL_ALLELES[prefix].has(rest.slice(n));
}

/** Strip trailing punctuation, and a pair of brackets that wraps the token ("(LE1)") or one left unpaired by splitting. */
function trimToken(raw: string): string {
  let t = raw.trim();
  while (t.length > 0 && TRAILING_PUNCTUATION.includes(t[t.length - 1])) t = t.slice(0, -1);
  t = t.trim();
  if (t.length >= 2 && OPEN_BRACKETS.includes(t[0]) && CLOSE_BRACKETS.includes(t[t.length - 1])) return t.slice(1, -1).trim();
  const open = Math.max(t.indexOf('('), t.indexOf('['));
  const pairInside = open >= 0 && (t.indexOf(')', open) > open || t.indexOf(']', open) > open);
  if (!pairInside) {
    if (t.length > 0 && OPEN_BRACKETS.includes(t[0])) t = t.slice(1);
    if (t.length > 0 && CLOSE_BRACKETS.includes(t[t.length - 1])) t = t.slice(0, -1);
  }
  return t.trim();
}

/** "anti-D", "anti D", "antiD" → the antigen ("D"); null for a token that is not an antibody name ("antigen", "antisera"). */
function antibodyTarget(t: string): string | null {
  if (t.length <= 4 || t.slice(0, 4).toLowerCase() !== 'anti') return null;
  const sep = t[4] === '-' || t[4] === ' ';
  const rest = sep ? t.slice(5) : t.slice(4);
  return sep || (rest[0] >= 'A' && rest[0] <= 'Z') ? rest : null;
}

/** A trimmed token looked up in the closed tables: listed markers, [] for recognised-not-listed, or null. */
function lookUpMarker(t: string): string[] | null {
  const code = t.toUpperCase().replace(/\s+/g, '');
  const key = t.toLowerCase().replace(/[\s\-()[\]/]+/g, '');
  const listed = RULE2_LISTED_NAMES.get(t) ?? (RULE2_LISTED_CODES.has(code) ? code : undefined) ?? RULE2_LISTED_ALIASES.get(key);
  if (listed) return listed.split(' ');
  // Only a token without whitespace can read as not listed: "HLA and RhD" run together must never hide RhD.
  if (/\s/.test(t)) return null;
  if (RULE2_OTHER_NAMES.has(t) || RULE2_OTHER_SYSTEMS.has(key)) return [];
  return readIsbtCode(code) ?? (isTyping(code) ? [] : null);
}

/** One token → the listed markers it names ([] = recognised, not listed), or null when it names nothing recognised. */
function readMarkerToken(raw: string): string[] | null {
  const t = trimToken(raw);
  if (t === '') return null;
  const antigen = antibodyTarget(t);
  // One level only: "anti-anti-D" is not read.
  return antigen === null ? lookUpMarker(t) : lookUpMarker(trimToken(antigen));
}

/**
 * Read one `bloodGroupingMarker` value: the listed Rule 2 markers it names ([] for a recognised marker that is not
 * listed), or null when it names no marker the engine recognises. Free text is read token by token ("Lewis (LE1)",
 * "ABO/RhD", "anti-A, anti-B and anti-D reagent"): recognised only when a token names a marker and every other token
 * is a filler word. Values longer than `MAX_FACT_TEXT_LENGTH` are refused unread.
 */
export function readRule2Marker(value: string): string[] | null {
  boundedText('bloodGroupingMarker', value);
  const whole = readMarkerToken(value);
  if (whole) return whole;
  const tokens = value.split(/[\s/,;+&]+/).filter((x) => x.replace(/[()[\].:]/g, '') !== '');
  const read = tokens.map((tok) => readMarkerToken(tok));
  const readable = read.every((r, i) => r !== null || MARKER_FILLER.has(tokens[i].toLowerCase().replace(/[()[\].:]/g, '')));
  return readable && read.some((r) => r !== null) ? [...new Set(read.flatMap((r) => r ?? []))] : null;
}

/** Read `bloodGroupingMarker` (one value or a list) into the listed markers it names; an unreadable value is refused. */
function readRule2Markers(raw: unknown): { given: boolean; listed: string[] } {
  const values = factList('bloodGroupingMarker', raw);
  const read = values.map((v) => (typeof v === 'string' ? readRule2Marker(v) : null));
  const bad = values.filter((_, i) => read[i] === null).map(shown);
  if (bad.length > 0) {
    throw new DeviceClassificationFactError(
      `bloodGroupingMarker: ${bad.join(', ')} ${bad.length === 1 ? 'is' : 'are'} not a blood-group or tissue-typing marker the engine recognises. `
      + 'Give an ISBT code (e.g. "RH1", "LE1"), an antigen name (e.g. "D", "Jka"), or a system name (e.g. "ABO", "Rh", "Kell", "Lewis", "HLA"). '
      + 'No class is stated, because reading it as a non-listed marker would state Class C where a listed one is Class D.',
    );
  }
  return { given: values.length > 0, listed: [...new Set(read.flatMap((r) => r ?? []))] };
}

// ── IVDR facts ──

export interface IvdrDeviceFacts {
  /** Detects a transmissible agent in blood, blood components, cells, tissues or organs to assess suitability for transfusion, transplantation or cell administration (Rule 1, first indent → D). */
  bloodDonationScreening?: boolean;
  /** Detects a transmissible agent causing a life-threatening disease with a high or suspected high risk of propagation (Rule 1, second indent → D). */
  lifeThreateningHighPropagation?: boolean;
  /** Determines the infectious load of a life-threatening disease where monitoring is critical to patient management (Rule 1, third indent → D). */
  infectiousLoadLifeThreatening?: boolean;
  /** Blood grouping or tissue typing to ensure immunological compatibility for transfusion, transplantation or cell administration (Rule 2 → C). */
  bloodGrouping?: boolean;
  /**
   * The marker(s) the blood-grouping device determines: an ISBT code, antigen name, system name or free text naming
   * them ("ABO", "RhD", "anti-D", "Kell", "Lewis (LE1)", "HLA-A"). A listed ABO/Rh/Kell/Kidd/Duffy marker
   * (`IVDR_RULE2_CLASS_D_MARKERS`) → D; any other recognised marker → C; a value naming no recognised marker is
   * refused (`DeviceClassificationFactError`).
   */
  bloodGroupingMarker?: string | ReadonlyArray<string>;
  /**
   * The device determines a listed Rule 2 marker (ABO, RH1/RHW1/RH2–RH5, KEL1, JK1/JK2, FY1/FY2) → D; false → C. Prefer
   * `bloodGroupingMarker`. With `bloodGrouping: true` and neither this nor a marker, the class is not determined (most
   * blood-grouping devices type ABO/RhD, which is D).
   */
  bloodGroupingHighRisk?: boolean;
  /** Companion diagnostic (Rule 3(f) → C). */
  companionDiagnostic?: boolean;
  /**
   * Rule 3 sub-points that apply (each → C): (a) sexually transmitted agent; (b) infectious agent in CSF or blood without high propagation risk; (c) infectious agent where an erroneous result could cause death or severe disability; (d) pre-natal screening of immune status to transmissible agents; (e) infective-disease or immune status with life-threatening management risk; (f) companion diagnostic; (g) disease staging with life-threatening management risk; (h) cancer screening, diagnosis or staging; (i) human genetic testing; (j) monitoring medicinal-product/substance/biological-component levels with life-threatening management risk; (k) managing patients with a life-threatening disease; (l) screening for congenital disorders in the embryo or foetus; (m) screening new-borns for congenital disorders where failure to detect could be life-threatening or severely disabling.
   * One value or a list; each may be written "h", "H", "(h)", "3(h)" or "Rule 3(h)". A value naming no point (a)–(m) is refused (`DeviceClassificationFactError`).
   */
  rule3Points?: IvdrRule3Point | string | ReadonlyArray<IvdrRule3Point | string>;
  /**
   * Coarse fact: some Rule 3 sub-point (a)–(m) applies, not identified (→ C). Prefer `rule3Points`. `false` states that no
   * Rule 3 sub-point applies — one of the facts the Rule 6 default needs.
   */
  infectiousOrCancerOrGenetic?: boolean;
  /** Intended for self-testing (Rule 4(a) → C, or B for the enumerated analytes). Near-patient tests are classified in their own right (Rule 4(b)) by the other rules. */
  selfTesting?: boolean;
  /** The self-test's analyte: one of `IVDR_RULE4A_CLASS_B_ANALYTES` (or a listed synonym) → B, or "other" → C. Anything else is refused; read only with `selfTesting: true`. */
  selfTestAnalyte?: IvdrRule4aClassBAnalyte | 'other' | string;
  /** General laboratory product, accessory without critical characteristics, buffer/washing solution, culture medium or stain; IVD instrument; or specimen receptacle (Rule 5 → A). */
  generalLabOrInstrumentOrReceptacle?: boolean;
  /** A control without a quantitative or qualitative assigned value (Rule 7 → B). A control with an assigned value takes the class of the device it controls. */
  controlWithoutAssignedValue?: boolean;
}

/** Every IVDR fact and how it is read; the mapped type makes a new fact without an entry a compile error. */
const IVDR_FACT_SPEC: { readonly [K in keyof Required<IvdrDeviceFacts>]: FactSpec } = Object.freeze({
  bloodDonationScreening: BOOL, lifeThreateningHighPropagation: BOOL, infectiousLoadLifeThreatening: BOOL, bloodGrouping: BOOL,
  bloodGroupingMarker: 'text', bloodGroupingHighRisk: BOOL, companionDiagnostic: BOOL, rule3Points: 'text',
  infectiousOrCancerOrGenetic: BOOL, selfTesting: BOOL, selfTestAnalyte: 'text', generalLabOrInstrumentOrReceptacle: BOOL,
  controlWithoutAssignedValue: BOOL,
});

/** The IVDR facts the engine reads, for a caller (or AnA's tool definition) to list. */
export const IVDR_FACT_KEYS: readonly string[] = Object.freeze(Object.keys(IVDR_FACT_SPEC));

/** The IVDR facts with their value kinds, for AnA's classify_device definition. */
export const IVDR_FACT_VOCABULARY: string = factVocabulary(IVDR_FACT_SPEC);

/** The facts with the derived properties the rules read. */
export interface IvdrFactView extends Omit<IvdrDeviceFacts, 'rule3Points' | 'bloodGroupingMarker' | 'selfTestAnalyte'> {
  /** A marker was supplied (so the device is a blood-grouping device). */
  markersGiven: boolean;
  listedMarkers: string[];
  points: Set<IvdrRule3Point>;
  rule4aClassB: boolean;
}

function ivdrView(f: IvdrDeviceFacts): IvdrFactView {
  const markers = readRule2Markers(f.bloodGroupingMarker);
  const rule3Points = normaliseRule3Points(f.rule3Points);
  const contradictions = ivdrContradictions(f, markers, rule3Points);
  if (contradictions.length > 0) {
    throw new DeviceClassificationFactError(`IVDR facts: ${contradictions.join('; ')}. No class is stated; give one reading.`);
  }
  const points = new Set<IvdrRule3Point>(rule3Points);
  if (f.companionDiagnostic) points.add('f');
  const analyte = readSelfTestAnalyte(f.selfTestAnalyte, f.selfTesting);
  return { ...f, markersGiven: markers.given, listedMarkers: markers.listed, points, rule4aClassB: analyte !== undefined && analyte !== 'other' };
}

/** Rule 2 and Rule 3 facts that state opposite things; each is refused rather than resolved one way. */
function ivdrContradictions(f: IvdrDeviceFacts, markers: { given: boolean; listed: string[] }, rule3Points: IvdrRule3Point[]): string[] {
  const out: string[] = [];
  if (f.bloodGrouping === false && markers.given) out.push('bloodGrouping: false contradicts a bloodGroupingMarker');
  if (f.bloodGrouping === false && f.bloodGroupingHighRisk === true) out.push('bloodGrouping: false contradicts bloodGroupingHighRisk: true');
  if (f.bloodGroupingHighRisk === false && markers.listed.length > 0) {
    out.push(`bloodGroupingHighRisk: false contradicts bloodGroupingMarker naming listed marker(s) ${markers.listed.join(', ')}`);
  }
  if (f.bloodGroupingHighRisk === true && markers.given && markers.listed.length === 0) {
    out.push('bloodGroupingHighRisk: true contradicts a bloodGroupingMarker that names no listed marker');
  }
  if (f.companionDiagnostic === false && rule3Points.includes('f')) out.push('companionDiagnostic: false contradicts rule3Points (f)');
  if (f.infectiousOrCancerOrGenetic === false && (rule3Points.length > 0 || f.companionDiagnostic === true)) {
    out.push('infectiousOrCancerOrGenetic: false (no Rule 3 sub-point applies) contradicts a Rule 3 sub-point given');
  }
  return out;
}

type IvdrRule = EuClassificationRule<IvdrClass, IvdrFactView>;

function ivdr(rule: string, cls: IvdrClass, applies: (v: IvdrFactView) => boolean, ruleText: string, idSuffix = ''): IvdrRule {
  const id = `ivdr-${rule.replace(/^Rule /, '').replace(/[()]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}${idSuffix}`;
  return { id, rule, class: cls, applies, ruleText, basis: ivdrBasis(rule) };
}

const RULE3_TEXT: Readonly<Record<IvdrRule3Point, string>> = {
  a: 'detecting the presence of, or exposure to, a sexually transmitted agent',
  b: 'detecting the presence in cerebrospinal fluid or blood of an infectious agent without a high or suspected high risk of propagation',
  c: 'detecting the presence of an infectious agent where there is a significant risk that an erroneous result would cause death or severe disability to the individual, foetus or embryo being tested, or to the individual\'s offspring',
  d: 'pre-natal screening of women to determine their immune status towards transmissible agents',
  e: 'determining infective disease status or immune status where an erroneous result could lead to a patient-management decision resulting in a life-threatening situation for the patient or the patient\'s offspring',
  f: 'use as companion diagnostics',
  g: 'disease staging, where an erroneous result could lead to a patient-management decision resulting in a life-threatening situation',
  h: 'screening, diagnosis or staging of cancer',
  i: 'human genetic testing',
  j: 'monitoring levels of medicinal products, substances or biological components, where an erroneous result could lead to a life-threatening patient-management decision',
  k: 'management of patients suffering from a life-threatening disease or condition',
  l: 'screening for congenital disorders in the embryo or foetus',
  m: 'screening for congenital disorders in new-born babies where failure to detect and treat could lead to life-threatening situations or severe disabilities',
};

/** IVDR Annex VIII, Rules 1–7 — the one EU IVD rule table. */
export const EU_IVDR_RULES: readonly IvdrRule[] = Object.freeze([
  // Rule 1's three dash indents are unlettered; MDCG 2020-16 cites them as "Rule 1, first/second/third indent"
  // (secondary corroboration, see the facts file).
  ivdr('Rule 1, first indent', 'D', (v) => !!v.bloodDonationScreening,
    'Devices detecting the presence of, or exposure to, a transmissible agent in blood, blood components, cells, tissues or organs, or their derivatives, to assess suitability for transfusion, transplantation or cell administration are Class D.'),
  ivdr('Rule 1, second indent', 'D', (v) => !!v.lifeThreateningHighPropagation,
    'Devices detecting the presence of, or exposure to, a transmissible agent that causes a life-threatening disease with a high or suspected high risk of propagation are Class D.'),
  ivdr('Rule 1, third indent', 'D', (v) => !!v.infectiousLoadLifeThreatening,
    'Devices determining the infectious load of a life-threatening disease where monitoring is critical in the process of patient management are Class D.'),
  ivdr('Rule 2', 'C', (v) => (!!v.bloodGrouping || v.markersGiven) && v.listedMarkers.length === 0 && !v.bloodGroupingHighRisk,
    'Devices for blood grouping or tissue typing to ensure the immunological compatibility of blood, blood components, cells, tissues or organs for transfusion, transplantation or cell administration are Class C.', '-c'),
  ivdr('Rule 2', 'D', (v) => v.listedMarkers.length > 0 || !!v.bloodGroupingHighRisk,
    'Except when intended to determine a listed marker — ABO system [ABO1 (A), ABO2 (B), ABO3 (AB)]; Rhesus system [RH1 (D), RHW1, RH2 (C), RH3 (E), RH4 (c), RH5 (e)]; Kell system [KEL1 (K)]; Kidd system [JK1 (Jka), JK2 (Jkb)]; Duffy system [FY1 (Fya), FY2 (Fyb)] — in which case they are Class D.', '-d'),
  ...IVDR_RULE3_POINTS.map((p) =>
    ivdr(`Rule 3(${p})`, 'C', (v) => v.points.has(p), `Devices intended for ${RULE3_TEXT[p]} are Class C.`)),
  ivdr('Rule 3', 'C', (v) => !!v.infectiousOrCancerOrGenetic && v.points.size === 0,
    'Devices for the Rule 3 purposes (infectious agents, cancer, human genetic testing, disease staging, congenital screening and the other listed purposes) are Class C. The sub-point was not identified from the facts given.', '-unspecified'),
  ivdr('Rule 4(a)', 'C', (v) => !!v.selfTesting && !v.rule4aClassB, 'Devices intended for self-testing are Class C.', '-c'),
  ivdr('Rule 4(a)', 'B', (v) => !!v.selfTesting && v.rule4aClassB,
    'Except devices for the detection of pregnancy, for fertility testing and for determining cholesterol level, and devices for the detection of glucose, erythrocytes, leucocytes and bacteria in urine, which are Class B.', '-b'),
  ivdr('Rule 5', 'A', (v) => !!v.generalLabOrInstrumentOrReceptacle,
    'One row for the three lettered points: (a) products for general laboratory use, accessories without critical characteristics, buffer solutions, washing solutions, general culture media and histological stains intended for IVD procedures; (b) instruments intended specifically for IVD procedures; (c) specimen receptacles — all Class A.'),
  residual(ivdr('Rule 6', 'B', () => true, 'Devices not covered by the above classification rules are Class B.')),
  ivdr('Rule 7', 'B', (v) => !!v.controlWithoutAssignedValue, 'Devices which are controls without a quantitative or qualitative assigned value are Class B.'),
]);

/** The fact named when a blood-grouping device names no marker and does not say whether it determines a listed one. */
export const IVDR_MISSING_RULE2_MARKER = 'bloodGroupingMarker (or bloodGroupingHighRisk: false for a device that determines no listed marker)';

/**
 * The facts that say a higher-class rule (Rule 1's three indents → D, Rule 2 → C/D, Rule 3 → C, Rule 4(a) → C/B) does not
 * apply. Rule 6 is the default for "devices not covered by the above rules", so its Class B is stated only when each of
 * these was stated — an unstated one could be the rule that covers the device.
 */
const IVDR_RULE6_FACTS: ReadonlyArray<keyof IvdrDeviceFacts> = Object.freeze([
  'bloodDonationScreening', 'lifeThreateningHighPropagation', 'infectiousLoadLifeThreatening', 'bloodGrouping', 'infectiousOrCancerOrGenetic', 'selfTesting',
] as const);
const ivdrRule6Missing = (k: string): string => `${k} (true or false)`;
/** `missingFacts` when no IVDR fact was given at all. */
export const IVDR_RULE6_MISSING: readonly string[] = Object.freeze(IVDR_RULE6_FACTS.map(ivdrRule6Missing));
const IVDR_RESIDUAL_IDS = residualIds(EU_IVDR_RULES);

/** Facts a rule needs that were not given; with any of these, the class is not determined below Class D. */
function ivdrMissingFacts(f: IvdrDeviceFacts, v: IvdrFactView, trace: ReadonlyArray<RuleTraceEntry<IvdrClass>>): string[] {
  const missing: string[] = [];
  // Rule 2 gives C or D by the marker; most blood-grouping devices type ABO/RhD (D), so an unnamed marker is not C.
  if (f.bloodGrouping === true && !v.markersGiven && f.bloodGroupingHighRisk === undefined) missing.push(IVDR_MISSING_RULE2_MARKER);
  if (trace.every((t) => IVDR_RESIDUAL_IDS.has(t.id))) {
    for (const k of IVDR_RULE6_FACTS) if (f[k] === undefined) missing.push(ivdrRule6Missing(k));
  }
  return missing;
}

export interface IvdrClassification {
  /** The highest applicable class; null when a fact that decides it is missing (see `missingFacts`). */
  class: IvdrClass | null;
  /** The rule(s) that gave the class, or 'not determined'. */
  ruleApplied: string;
  rationale: string;
  caveat: string;
  /** Every rule row that fired, in table order. */
  ruleTrace: RuleTraceEntry<IvdrClass>[];
  /** Facts that must be supplied before a class below D can be stated. */
  missingFacts: string[];
}

const IVDR_ORDER: Record<IvdrClass, number> = { A: 0, B: 1, C: 2, D: 3 };
const IVDR_CAVEAT =
  'Annex VIII Rules 1–7 evaluated from the supplied facts, highest applicable class. Rule wording is a recall paraphrase, not checked against the EUR-Lex text. Implementing rules (calibrators and controls with assigned values take the class of the device) are not applied. Confirm against Regulation (EU) 2017/746 Annex VIII and MDCG 2020-16.';

/**
 * Classify an EU IVD per IVDR Annex VIII (`EU_IVDR_RULES`).
 * @throws DeviceClassificationFactError when a fact cannot be read (an unknown key, a wrong type, a `rule3Points`
 *   value naming no sub-point, a `bloodGroupingMarker` value naming no recognised marker, a `selfTestAnalyte` outside
 *   its table).
 */
export function classifyIvdr(facts: IvdrDeviceFacts): IvdrClassification {
  const read = readFacts('IVDR', facts, IVDR_FACT_SPEC) as IvdrDeviceFacts;
  const view = ivdrView(read);
  const ruleTrace = evaluate(EU_IVDR_RULES, view);
  const best = top(ruleTrace, IVDR_ORDER);
  // Rule 6 is residual and always applies, so this cannot happen; fail loudly rather than invent a class.
  if (!best) throw new Error('IVDR rule table produced no result (Rule 6 must always apply).');
  const missingFacts = ivdrMissingFacts(read, view, ruleTrace);
  if (missingFacts.length > 0 && best.cls !== 'D') {
    const reach = best.rule === 'Rule 6'
      ? ' Only the Rule 6 default (Class B, for a device no other rule covers) would apply, and these facts do not yet say the other rules do not.'
      : ` The facts given reach at least Class ${best.cls} (${best.rule}).`;
    return {
      class: null, ruleApplied: 'not determined', caveat: IVDR_CAVEAT, ruleTrace, missingFacts,
      rationale: `The class cannot be determined without: ${missingFacts.join('; ')}.${reach}`,
    };
  }
  return { class: best.cls, ruleApplied: best.rule, rationale: best.why, caveat: IVDR_CAVEAT, ruleTrace, missingFacts };
}

// ── FDA pathway recommendation (heuristic) ────────────────────────────────────

export type FdaClass = 'I' | 'II' | 'III';
export type FdaPathway = 'exempt' | '510k' | 'de_novo' | 'pma';

export interface FdaPathwayFacts {
  /** FDA device class, if known. */
  fdaClass?: FdaClass;
  /** A legally marketed predicate device exists. */
  predicateAvailable?: boolean;
  /** Class I (or II) 510(k)-exempt per the classification regulation. */
  exempt?: boolean;
  /** Novel device of low-to-moderate risk with no predicate (De Novo candidate). */
  novelLowModerateRisk?: boolean;
}

export interface FdaPathwayRecommendation {
  pathway: FdaPathway;
  rationale: string;
  caveat: string;
}

const FDA_CAVEAT =
  'Heuristic recommendation from the supplied facts — confirm against the FDA product classification database (21 CFR 862–892) and the device’s classification regulation.';

/** Recommend an FDA premarket pathway from structured facts. */
export function recommendFdaPathway(facts: FdaPathwayFacts): FdaPathwayRecommendation {
  if (facts.exempt) return { pathway: 'exempt', rationale: 'Device type is 510(k)-exempt per its classification regulation.', caveat: FDA_CAVEAT };
  if (facts.fdaClass === 'III') return { pathway: 'pma', rationale: 'Class III devices require Premarket Approval (reasonable assurance of safety and effectiveness).', caveat: FDA_CAVEAT };
  if (facts.predicateAvailable) return { pathway: '510k', rationale: 'A legally marketed predicate exists; demonstrate substantial equivalence via 510(k).', caveat: FDA_CAVEAT };
  if (facts.novelLowModerateRisk) return { pathway: 'de_novo', rationale: 'Novel low-to-moderate-risk device with no predicate; request De Novo classification with special controls.', caveat: FDA_CAVEAT };
  // No predicate and not clearly low-risk novel → PMA is the conservative default for higher risk.
  return { pathway: 'pma', rationale: 'No predicate available and risk not established as low-to-moderate; PMA is the conservative default (re-evaluate against the classification database).', caveat: FDA_CAVEAT };
}

export default { classifyMdr, classifyIvdr, recommendFdaPathway };
