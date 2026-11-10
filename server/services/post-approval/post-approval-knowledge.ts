/**
 * Post-Approval Lifecycle Management (ICH Q12) — Deterministic Knowledge Engine
 * ============================================================================
 *
 * Pure, closed-form, reproducible TypeScript. NO LLM, NO network, NO database.
 * Its imports: the licensed-biologic annual-report record
 * (ind/ctd/us-biotech-bla-reports-sources.ts, which itself imports only types),
 * so planAnnualReport gives a BLA its own 21 CFR 601.12(d) parts rather than a
 * copy of them (2026-10-29), and the shared input readers, which refuse a
 * malformed value (ComputationRefusal). Identical input always yields identical output.
 *
 * This module encodes the regulatory science of managing chemistry, manufacturing
 * and controls (CMC) changes AFTER a product is approved — the "lifecycle" phase
 * of the product. It is grounded in and cites:
 *
 *   • ICH Q12 (2019) — Technical and Regulatory Considerations for Pharmaceutical
 *     Product Lifecycle Management. Introduces Established Conditions (ECs), the
 *     Post-Approval Change Management Protocol (PACMP), and the Product Lifecycle
 *     Management (PLCM) document. FDA adopted Q12 in May 2021 (guidance + annex).
 *   • 21 CFR 314.70 — "Supplements and other changes to an approved NDA". Defines
 *     Prior Approval Supplement (PAS), Changes Being Effected in 30 days (CBE-30),
 *     Changes Being Effected (CBE-0), and Annual Report (AR) reporting categories.
 *   • 21 CFR 314.71 / 314.97 (ANDA analogues) and 21 CFR 601.12 (biologics, BLA).
 *   • FDA Guidance "Changes to an Approved NDA or ANDA" (April 2004) and the
 *     scale-up and post-approval changes (SUPAC) guidances (SUPAC-IR 1995,
 *     SUPAC-MR 1997, SUPAC-SS 1997).
 *   • FDA Guidance "Comparability Protocols — Chemistry, Manufacturing, and
 *     Controls Information" (2016, draft) and "CMC Postapproval Manufacturing
 *     Changes To Be Documented in Annual Reports" (2014).
 *   • EU Variations Regulation (EC) No 1234/2008 and the "Guidelines on the
 *     details of the various categories of variations" (2013/C 223/01). Defines
 *     Type IA / IAIN (Immediate Notification), Type IB, and Type II variations,
 *     plus Extensions of marketing authorisation.
 *   • ICH Q8(R2) Pharmaceutical Development, Q9(R1) Quality Risk Management,
 *     Q10 Pharmaceutical Quality System, Q11 Development & Manufacture of Drug
 *     Substances — the "QbD" quintet that establishes the science/risk basis for
 *     the regulatory flexibility codified in Q12.
 *   • ICH Q5E — Comparability of Biotechnological/Biological Products Subject to
 *     Changes in Their Manufacturing Process.
 *
 * Rule 2 S5d (2026-11-09): an omitted or null true/false input reads as
 * not_stated (inputStates) and is never read as true or false. A risk score or
 * tier, reporting category, variation type, SUPAC level, established-condition
 * status, comparability extent or ICH Q12 tool that an unstated fact could
 * change is null, and undecided names the facts and what each answer gives. A
 * malformed value is refused by field. An omitted modality, magnitude,
 * development approach or change stage keeps its default, said in the result.
 *
 * IMPORTANT — every numeric threshold, category mapping, and citation in this file
 * is reproduced from the public regulatory texts above. Callers (including LLM
 * agents) must report the returned values and citations verbatim. A fabricated or
 * misattributed regulatory citation in a post-approval submission is a critical
 * defect.
 *
 * @module server/services/post-approval/post-approval-knowledge
 */

import { US_BLA_REPORT_SOURCES, US_BLA_REPORT_SOURCE_IDS } from '../ind/ctd/us-biotech-bla-reports-sources.js';
import { ComputationRefusal, refuseUnlessStated } from '../ana-biostats/computation-engine.js';
import {
  decidingFacts,
  everyAnswer,
  listed,
  oneOfInput,
  shown,
  statedBoolean,
  statedList,
  statedNumber,
  statedOneOf,
  statedText,
} from '../immunogenicity/immunogenicity-reference.js';
import {
  CHANGE_AREA_PROFILES, CITATIONS, EC_BASE_RULES, defaultPacmpTests, euProcedure, supacLevelFromTier, usDistributionRule,
  usRegulationFor, type ChangeAreaProfile, type CitationRecord, type EcBaseRule,
} from './post-approval-reference.js';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 0 — Shared types
// ─────────────────────────────────────────────────────────────────────────────

/** US (FDA) post-approval reporting categories under 21 CFR 314.70 / 601.12. */
export type UsReportingCategory =
  | 'PAS' // Prior Approval Supplement — 314.70(b); FDA must approve before distribution
  | 'CBE-30' // Changes Being Effected in 30 days — 314.70(c)(3); distribute 30 days after FDA receipt
  | 'CBE-0' // Changes Being Effected (immediately) — 314.70(c)(6); distribute upon FDA receipt
  | 'Annual Report'; // Minor change — 314.70(d); document in next annual report

/** EU variation classifications under Reg (EC) 1234/2008. */
export type EuVariationType =
  | 'IA' // Type IA — minor, "Do and Tell"; notify within 12 months
  | 'IAIN' // Type IA requiring Immediate Notification; notify within 14 days of implementation
  | 'IB' // Type IB — minor, "Tell, Wait and Do"; default for unclassified minor changes
  | 'II' // Type II — major; requires approval before implementation
  | 'Extension'; // Line extension — new application annex

/** Overall change-risk tier from quality risk management (ICH Q9). */
export type ChangeRiskTier = 'low' | 'moderate' | 'high';

/** Development approach affects EC granularity and regulatory flexibility (Q8/Q11/Q12). */
export type DevelopmentApproach = 'minimal' | 'enhanced'; // "enhanced" = QbD

/** Product modality — biologics get tighter comparability rules (Q5E, 601.12). */
export type ProductModality =
  | 'small_molecule'
  | 'biologic' // mAb, fusion protein, recombinant
  | 'vaccine'
  | 'cell_gene_therapy'
  | 'peptide_oligonucleotide';

/** A single regulatory citation with a short scope note. */
export interface RegulatoryCitation {
  source: string;
  reference: string;
  note: string;
}

/** Generic structured result envelope used across the engine. */
export interface EngineProvenance {
  engine: string;
  version: string;
  deterministic: true;
}

const ENGINE_VERSION = '1.0.0';

function provenance(engine: string): EngineProvenance {
  return { engine, version: ENGINE_VERSION, deterministic: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Canonical citation library
// ─────────────────────────────────────────────────────────────────────────────

// The citation library, the change-area profiles, the US and EU category texts, the established-condition base
// rules and the default PACMP test panels are in post-approval-reference.ts (moved unchanged 2026-11-09, S5d).

function cite(...keys: string[]): RegulatoryCitation[] {
  const out: RegulatoryCitation[] = [];
  for (const k of keys) {
    const rec = CITATIONS.find((c: CitationRecord) => c.key === k);
    if (rec) {
      out.push({ source: rec.source, reference: rec.reference, note: rec.note });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Change taxonomy reference tables
// ─────────────────────────────────────────────────────────────────────────────

/** Top-level CMC change areas recognized by this engine. */
export type ChangeArea =
  | 'manufacturing_site'
  | 'manufacturing_process'
  | 'scale'
  | 'equipment'
  | 'composition_excipient'
  | 'specification'
  | 'analytical_method'
  | 'container_closure'
  | 'stability_shelf_life'
  | 'drug_substance_source'
  | 'drug_substance_process'
  | 'starting_material'
  | 'labeling_cmc'
  | 'facility_administrative';

/** Magnitude qualifier supplied by the caller for the proposed change. */
export type ChangeMagnitude = 'minor' | 'moderate' | 'major';

/** SUPAC level mapping for solid oral products. */
export type SupacLevel = 'Level 1' | 'Level 2' | 'Level 3' | 'N/A';

function profileFor(area: ChangeArea): ChangeAreaProfile {
  const p = CHANGE_AREA_PROFILES.find((x: ChangeAreaProfile) => x.area === area);
  // Fallback profile (conservative) — should not occur for valid ChangeArea.
  return (
    p ?? {
      area,
      label: 'Unclassified change',
      defaultUs: 'PAS',
      defaultEu: 'II',
      comparabilitySensitive: true,
      supacGoverned: false,
      scope: 'Unclassified change — treated conservatively as a major change.',
      citationKeys: ['cfr_314_70', 'eu_variations_reg'],
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Input readers (Rule 2 S5d, 2026-11-09). Omitted or null is not stated; a value
// of the wrong kind is refused by field, never read as another value.
// ─────────────────────────────────────────────────────────────────────────────

/** A true/false input: true, false or not_stated. */
type BooleanState = boolean | 'not_stated';

/** A conclusion an unstated fact leaves open: the facts it turns on, and what each answer gives. */
export interface Undecided {
  conclusion: string;
  decidingFacts: string[];
  couldBe: Array<string | number | boolean>;
}

const CHANGE_AREAS: readonly ChangeArea[] = CHANGE_AREA_PROFILES.map((p: ChangeAreaProfile) => p.area);
const MODALITIES = ['small_molecule', 'biologic', 'vaccine', 'cell_gene_therapy', 'peptide_oligonucleotide'] as const;
const MAGNITUDES = ['minor', 'moderate', 'major'] as const;
const US_CATEGORIES = ['PAS', 'CBE-30', 'CBE-0', 'Annual Report'] as const;
const DEV_APPROACHES = ['minimal', 'enhanced'] as const;
const CHANGE_STAGES = ['upstream', 'downstream', 'formulation', 'analytical', 'fill_finish'] as const;
const FREQUENCIES = ['one_time', 'recurring', 'multiple_sites'] as const;
const REGIONS = ['US', 'EU', 'global'] as const;
/** The five risk qualifiers, in the order the risk model reads them. */
const RISK_FLAGS = ['affectsCqa', 'affectsControlStrategy', 'sterileProcess', 'withinDesignSpace', 'priorKnowledge'] as const;
type RiskFlag = (typeof RISK_FLAGS)[number];

function refuse(field: string, expected: string, value: unknown): never {
  throw new ComputationRefusal('invalid_input', `${field} must be ${expected} (got ${shown(value)}). Leave it out if it is not known.`, field);
}

/** A stated object, or undefined when omitted or null. */
function statedObject(field: string, value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : refuse(field, 'an object', value);
}

/** A required value from a fixed vocabulary, refused by name when missing or outside it. */
function requiredOneOf<T extends string>(field: string, value: unknown, allowed: readonly T[]): T {
  refuseUnlessStated('post-approval', [oneOfInput(field, value, allowed)], 'classified');
  return value as T;
}

/** The entries of a stated list of objects, each refused by its index when it is not an object. */
function objects(field: string, value: unknown): Array<Record<string, unknown>> {
  return (statedList(field, value) ?? []).map((v: unknown, i: number) => statedObject(`${field}[${i}]`, v) ?? refuse(`${field}[${i}]`, 'an object', v));
}

/** The stated risk qualifiers, each true, false or undefined; the magnitude is checked against its vocabulary. */
function readRisk(field: string, value: unknown): ChangeRiskInputs {
  const r = statedObject(field, value) ?? {};
  const out: ChangeRiskInputs = { magnitude: statedOneOf(`${field}.magnitude`, r.magnitude, MAGNITUDES) };
  for (const k of RISK_FLAGS) out[k] = statedBoolean(`${field}.${k}`, r[k]);
  return out;
}

/** The inputStates entries of a risk object. */
function riskStates(field: string, risk: ChangeRiskInputs): Record<string, BooleanState> {
  return Object.fromEntries(RISK_FLAGS.map((k: RiskFlag) => [`${field}.${k}`, risk[k] ?? 'not_stated']));
}

/** The one value every answer gives, or null with an undecided entry naming the facts it turns on. */
function settled<K extends string, T>(
  conclusion: string,
  stated: Record<K, boolean | undefined>,
  on: (answer: Record<K, boolean>) => T,
  undecided: Undecided[],
  name: (key: K) => string = (key: K) => key,
): T | null {
  const values = everyAnswer(stated).map(on);
  const distinct = [...new Set(values.map((v: T) => JSON.stringify(v)))];
  if (distinct.length === 1) return values[0];
  undecided.push({
    conclusion,
    decidingFacts: decidingFacts(stated, (a: Record<K, boolean>) => JSON.stringify(on(a))).map(name),
    couldBe: distinct.map((v: string) => JSON.parse(v) as string | number | boolean),
  });
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Risk scoring primitives (ICH Q9)
// ─────────────────────────────────────────────────────────────────────────────

/** Inputs that move the change-risk score. */
export interface ChangeRiskInputs {
  /** Does the change affect a CQA (critical quality attribute)? */
  affectsCqa?: boolean;
  /** Does the change affect the control strategy / an established condition? */
  affectsControlStrategy?: boolean;
  /** Does the change touch a sterile / aseptic operation? */
  sterileProcess?: boolean;
  /** Is the change within an approved design space (enhanced approach)? */
  withinDesignSpace?: boolean;
  /** Has equivalent change been validated on similar products before? */
  priorKnowledge?: boolean;
  /** Magnitude qualifier supplied by the caller. */
  magnitude?: ChangeMagnitude;
}

interface RiskFactor {
  label: string;
  delta: number;
  applies: boolean;
}

interface RiskScore {
  score: number;
  tier: ChangeRiskTier;
  factors: RiskFactor[];
}

/**
 * Deterministic additive risk model. Base score by magnitude, then bounded
 * factor adjustments. Tier thresholds are fixed: <3 low, 3–6 moderate, >6 high.
 */
function scoreChangeRisk(
  modality: ProductModality,
  inputs: ChangeRiskInputs,
  comparabilitySensitiveArea: boolean,
): RiskScore {
  const base =
    inputs.magnitude === 'major' ? 6 : inputs.magnitude === 'moderate' ? 3 : inputs.magnitude === 'minor' ? 1 : 3;

  const factors: RiskFactor[] = [
    { label: 'Affects a critical quality attribute (CQA)', delta: 2, applies: inputs.affectsCqa === true },
    { label: 'Affects the control strategy or an established condition', delta: 2, applies: inputs.affectsControlStrategy === true },
    { label: 'Involves a sterile / aseptic operation', delta: 2, applies: inputs.sterileProcess === true },
    {
      label: 'Biologic / vaccine / cell-gene modality (process-sensitive)',
      delta: 2,
      applies: modality === 'biologic' || modality === 'vaccine' || modality === 'cell_gene_therapy',
    },
    {
      label: 'Comparability-sensitive change area',
      delta: 1,
      applies: comparabilitySensitiveArea === true,
    },
    { label: 'Change is within an approved design space', delta: -2, applies: inputs.withinDesignSpace === true },
    { label: 'Supported by prior knowledge / platform experience', delta: -1, applies: inputs.priorKnowledge === true },
  ];

  let score = base;
  for (const f of factors) {
    if (f.applies) score += f.delta;
  }
  if (score < 0) score = 0;

  const tier: ChangeRiskTier = score > 6 ? 'high' : score >= 3 ? 'moderate' : 'low';
  return { score, tier, factors };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — classifyPostApprovalChange
// ─────────────────────────────────────────────────────────────────────────────

export interface ClassifyPostApprovalChangeParams {
  changeArea: ChangeArea;
  description?: string;
  modality?: ProductModality;
  magnitude?: ChangeMagnitude;
  /** Solid oral IR/MR product? Enables SUPAC level mapping. */
  solidOralProduct?: boolean;
  /** Modified-release product (affects SUPAC-MR severity). */
  modifiedRelease?: boolean;
  risk?: ChangeRiskInputs;
  /** Is this filed against a BLA (biologic) rather than an NDA/ANDA? */
  biologicLicense?: boolean;
}

export interface ClassifyPostApprovalChangeResult {
  changeArea: ChangeArea;
  changeLabel: string;
  modality: ProductModality;
  /** A null field is not determined: an unstated fact could change it (see undecided). */
  us: {
    category: UsReportingCategory | null;
    regulation: string | null;
    distributionRule: string | null;
    rationale: string;
  };
  eu: {
    variationType: EuVariationType | null;
    procedure: string | null;
    rationale: string;
  };
  supac: {
    applicable: boolean | null;
    level: SupacLevel | null;
    note: string;
  };
  /** A factor's applies is null while its fact is not stated. */
  risk: { score: number | null; tier: ChangeRiskTier | null; factors: Array<Omit<RiskFactor, 'applies'> & { applies: boolean | null }> };
  comparabilityLikelyRequired: boolean | null;
  /** The tools every answer to the unstated facts recommends. */
  recommendedTools: string[];
  warnings: string[];
  /** Each true/false input: true, false or not_stated. */
  inputStates: Record<string, BooleanState>;
  /** The conclusions an unstated fact leaves open. */
  undecided: Undecided[];
  citations: RegulatoryCitation[];
  provenance: EngineProvenance;
}

function adjustUsCategory(base: UsReportingCategory, tier: ChangeRiskTier): UsReportingCategory {
  const order: UsReportingCategory[] = ['Annual Report', 'CBE-0', 'CBE-30', 'PAS'];
  let idx = order.indexOf(base);
  if (tier === 'high') idx = Math.min(order.length - 1, idx + 1);
  if (tier === 'low') idx = Math.max(0, idx - 1);
  return order[idx];
}

function adjustEuType(base: EuVariationType, tier: ChangeRiskTier): EuVariationType {
  // Linear severity ladder excluding Extension (handled separately).
  const order: EuVariationType[] = ['IA', 'IAIN', 'IB', 'II'];
  if ((base as EuVariationType) === 'Extension') return 'Extension';
  let idx = order.indexOf(base);
  if (idx < 0) idx = 2; // default to IB
  if (tier === 'high') idx = Math.min(order.length - 1, idx + 1);
  if (tier === 'low') idx = Math.max(0, idx - 1);
  return order[idx];
}

/** The true/false facts a classification turns on. */
const CLASSIFY_FACTS = [...RISK_FLAGS, 'solidOralProduct', 'modifiedRelease', 'biologicLicense'] as const;
type ClassifyFact = (typeof CLASSIFY_FACTS)[number];
type ClassifyAnswer = Record<ClassifyFact, boolean>;

/** A classification on one full answer to its true/false facts. */
interface ClassifyOutcome {
  risk: RiskScore;
  usCategory: UsReportingCategory;
  euType: EuVariationType;
  supacApplicable: boolean;
  supacLevel: SupacLevel;
  supacNote: string;
  comparabilityLikelyRequired: boolean;
  recommendedTools: string[];
  warnings: string[];
  citationKeys: string[];
  biologic: boolean;
}

/** The classification on one full answer (the pre-S5d rules, with every fact stated). */
function classifyOn(area: ChangeArea, modality: ProductModality, magnitude: ChangeMagnitude | undefined, a: ClassifyAnswer): ClassifyOutcome {
  const profile = profileFor(area);
  const risk = scoreChangeRisk(modality, { ...a, magnitude }, profile.comparabilitySensitive);
  const warnings: string[] = [];

  // Start from the area default, then move with risk tier.
  let usCategory = adjustUsCategory(profile.defaultUs, risk.tier);
  let euType = adjustEuType(profile.defaultEu, risk.tier);

  // Hard overrides — certain conditions always escalate to PAS / Type II.
  if (a.sterileProcess && (area === 'manufacturing_process' || area === 'manufacturing_site')) {
    usCategory = 'PAS';
    euType = 'II';
    warnings.push(
      'Change to a sterile/aseptic process or site is generally a Prior Approval Supplement (PAS) / Type II variation regardless of computed risk tier.',
    );
  }
  if (a.affectsCqa && usCategory === 'Annual Report') {
    usCategory = 'CBE-30';
    warnings.push('A change affecting a CQA cannot be a minor (Annual Report) change; escalated to CBE-30 minimum.');
  }
  if (modality === 'cell_gene_therapy' && risk.tier !== 'low') {
    usCategory = 'PAS';
    euType = 'II';
    warnings.push('Cell & gene therapy manufacturing changes of moderate+ risk are treated as PAS / Type II given limited comparability tools.');
  }
  // If the change is explicitly within an approved design space, it may not need a submission at all.
  if (a.withinDesignSpace && risk.tier === 'low') {
    warnings.push(
      'Movement within an approved design space is not a change requiring a regulatory submission per ICH Q8(R2); confirm the parameter range is covered by the approved design space before relying on this.',
    );
  }

  // SUPAC mapping for solid oral products.
  const supacApplicable = a.solidOralProduct && profile.supacGoverned;
  let supacLevel: SupacLevel = supacApplicable ? supacLevelFromTier(risk.tier) : 'N/A';
  let supacNote = supacApplicable
    ? `Maps to SUPAC ${supacLevel} for a ${a.modifiedRelease ? 'modified-release (SUPAC-MR)' : 'immediate-release (SUPAC-IR)'} solid oral product. Level 1 = annual report, Level 2 = CBE-30, Level 3 = PAS for most categories.`
    : 'SUPAC level framework does not apply to this change area / product type.';
  if (supacApplicable && a.modifiedRelease && area === 'composition_excipient') {
    supacLevel = 'Level 3';
    supacNote =
      'A change to a release-controlling excipient in a modified-release product is a SUPAC-MR Level 3 change (PAS), per SUPAC-MR (1997).';
    usCategory = 'PAS';
    euType = 'II';
  }

  const comparabilityLikelyRequired =
    profile.comparabilitySensitive &&
    (modality === 'biologic' || modality === 'vaccine' || modality === 'cell_gene_therapy' || risk.tier === 'high');

  const recommendedTools: string[] = ['classify_post_approval_change'];
  if (comparabilityLikelyRequired) recommendedTools.push('assess_postapproval_comparability');
  if (risk.tier === 'high' || usCategory === 'PAS') recommendedTools.push('design_pacmp');
  recommendedTools.push('assess_established_conditions');

  const citationKeys = [...profile.citationKeys, 'ich_q9', 'ich_q12', a.biologicLicense ? 'cfr_601_12' : 'cfr_314_70'];
  return {
    risk, usCategory, euType, supacApplicable, supacLevel, supacNote, comparabilityLikelyRequired,
    recommendedTools: Array.from(new Set(recommendedTools)), warnings, citationKeys, biologic: a.biologicLicense,
  };
}

/** The stated facts of a classification, and the defaults it used for an omitted modality or magnitude. */
function classifyFacts(params: ClassifyPostApprovalChangeParams, field = ''): {
  area: ChangeArea; modality: ProductModality; magnitude: ChangeMagnitude | undefined;
  stated: Record<ClassifyFact, boolean | undefined>; defaults: string[];
} {
  const area = requiredOneOf(`${field}changeArea`, params.changeArea, CHANGE_AREAS);
  const modalityStated = statedOneOf(`${field}modality`, params.modality, MODALITIES);
  const risk = readRisk(`${field}risk`, params.risk);
  // Before S5d a risk object without a magnitude dropped the stated top-level magnitude.
  const magnitude = risk.magnitude ?? statedOneOf(`${field}magnitude`, params.magnitude, MAGNITUDES);
  if (risk.magnitude !== undefined) statedOneOf(`${field}magnitude`, params.magnitude, MAGNITUDES);
  const stated = {
    ...(Object.fromEntries(RISK_FLAGS.map((k: RiskFlag) => [k, risk[k]])) as Record<RiskFlag, boolean | undefined>),
    solidOralProduct: statedBoolean(`${field}solidOralProduct`, params.solidOralProduct),
    modifiedRelease: statedBoolean(`${field}modifiedRelease`, params.modifiedRelease),
    biologicLicense: statedBoolean(`${field}biologicLicense`, params.biologicLicense),
  };
  const defaults = [
    ...(modalityStated === undefined ? ['modality was not stated: the change is classified for a small molecule.'] : []),
    ...(magnitude === undefined ? ['magnitude was not stated: the risk score starts from a moderate change (3).'] : []),
  ];
  return { area, modality: modalityStated ?? 'small_molecule', magnitude, stated, defaults };
}

/**
 * Classify a CMC change into a US reporting category (PAS / CBE-30 / CBE-0 /
 * Annual Report) and an EU variation type (IA / IAIN / IB / II), with a
 * quality-risk assessment per ICH Q9.
 */
export function classifyPostApprovalChange(
  params: ClassifyPostApprovalChangeParams,
): ClassifyPostApprovalChangeResult {
  // 2026-11-09 (S5d): an omitted risk qualifier, solidOralProduct or biologicLicense read as false, so a category,
  // SUPAC level and regulation were given from facts nobody stated; 'true' read as false; an unknown area was
  // classified as PAS; a risk object without a magnitude dropped the stated one.
  const { area, modality, magnitude, stated, defaults } = classifyFacts(params);
  const profile = profileFor(area);
  const undecided: Undecided[] = [];
  const seen = new Map<string, ClassifyOutcome>();
  const on = (a: ClassifyAnswer): ClassifyOutcome => {
    const key = CLASSIFY_FACTS.map((k: ClassifyFact) => (a[k] ? 1 : 0)).join('');
    if (!seen.has(key)) seen.set(key, classifyOn(area, modality, magnitude, a));
    return seen.get(key)!;
  };
  const outcomes = everyAnswer(stated).map(on);
  const name = (k: ClassifyFact): string => ((RISK_FLAGS as readonly string[]).includes(k) ? `risk.${k}` : k);
  const settle = <T>(conclusion: string, get: (o: ClassifyOutcome) => T): T | null =>
    settled(conclusion, stated, (a: ClassifyAnswer) => get(on(a)), undecided, name);

  const score = settle('risk.score', (o) => o.risk.score);
  const tier = settle('risk.tier', (o) => o.risk.tier);
  const usCategory = settle('us.category', (o) => o.usCategory);
  const regulation = settle('us.regulation', (o) => usRegulationFor(o.usCategory, o.biologic));
  const euType = settle('eu.variationType', (o) => o.euType);
  const supacApplicable = settle('supac.applicable', (o) => o.supacApplicable);
  const supacLevel = settle('supac.level', (o) => o.supacLevel);
  const supacNote = settle('supac.note', (o) => o.supacNote);
  const comparabilityLikelyRequired = settle('comparabilityLikelyRequired', (o) => o.comparabilityLikelyRequired);
  const every = <T>(lists: T[][]): T[] => lists[0].filter((x: T) => lists.every((l: T[]) => l.includes(x)));
  const why = (conclusion: string): string => {
    const u = undecided.find((x: Undecided) => x.conclusion === conclusion)!;
    return `it turns on ${listed(u.decidingFacts)}, not stated (could be ${u.couldBe.join(' or ')})`;
  };

  const usRationale = [
    `Area default for ${profile.label} is ${profile.defaultUs}.`,
    tier === null ? `Quality risk tier not determined: ${why('risk.tier')}.` : `Quality risk tier computed as ${tier} (score ${score ?? 'not determined'}).`,
    usCategory === null ? `Final US category not determined: ${why('us.category')}.` : `Final US category: ${usCategory}.`,
  ].join(' ');

  const euRationale = [
    `Area default EU type for ${profile.label} is ${profile.defaultEu}.`,
    euType === null ? `After risk adjustment: not determined (${why('eu.variationType')}).` : `After risk adjustment: ${euType}.`,
    'EU default for an unclassified minor change is Type IB ("Tell, Wait and Do").',
  ].join(' ');

  const factorStates: Record<string, boolean | undefined> = {
    'Affects a critical quality attribute (CQA)': stated.affectsCqa,
    'Affects the control strategy or an established condition': stated.affectsControlStrategy,
    'Involves a sterile / aseptic operation': stated.sterileProcess,
    'Change is within an approved design space': stated.withinDesignSpace,
    'Supported by prior knowledge / platform experience': stated.priorKnowledge,
  };
  const factors: Array<Omit<RiskFactor, 'applies'> & { applies: boolean | null }> = outcomes[0].risk.factors.map((f: RiskFactor) =>
    f.label in factorStates ? { ...f, applies: factorStates[f.label] ?? null } : f,
  );

  return {
    changeArea: area,
    changeLabel: profile.label,
    modality,
    us: {
      category: usCategory,
      regulation,
      distributionRule: usCategory === null ? null : usDistributionRule(usCategory),
      rationale: usRationale,
    },
    eu: {
      variationType: euType,
      procedure: euType === null ? null : euProcedure(euType),
      rationale: euRationale,
    },
    supac: {
      applicable: supacApplicable,
      level: supacLevel,
      note: supacNote ?? `SUPAC not determined: ${why('supac.note')}.`,
    },
    risk: { score, tier, factors },
    comparabilityLikelyRequired,
    recommendedTools: every(outcomes.map((o: ClassifyOutcome) => o.recommendedTools)),
    warnings: [
      ...every(outcomes.map((o: ClassifyOutcome) => o.warnings)),
      ...defaults,
      ...undecided.map((u: Undecided) => `${u.conclusion} not determined: ${listed(u.decidingFacts)} not stated (could be ${u.couldBe.join(' or ')}).`),
    ],
    inputStates: Object.fromEntries(CLASSIFY_FACTS.map((k: ClassifyFact) => [name(k), stated[k] ?? 'not_stated'])),
    undecided,
    citations: cite(...Array.from(new Set(outcomes.flatMap((o: ClassifyOutcome) => o.citationKeys)))),
    provenance: provenance('classifyPostApprovalChange'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — assessEstablishedConditions (ICH Q12)
// ─────────────────────────────────────────────────────────────────────────────

/** A CTD/dossier element that may or may not be an Established Condition. */
export type DossierElementType =
  | 'drug_substance_synthesis_step'
  | 'drug_substance_specification'
  | 'manufacturing_process_step'
  | 'process_parameter'
  | 'in_process_control'
  | 'drug_product_composition'
  | 'drug_product_specification'
  | 'analytical_procedure'
  | 'container_closure'
  | 'control_strategy_element'
  | 'shelf_life'
  | 'facility_site';

export interface DossierElementInput {
  elementType: DossierElementType;
  name: string;
  /** Is this element described as a parameter range (enhanced) or a fixed value (minimal)? */
  parameterRange?: boolean;
  /** Does this element have a direct, demonstrated impact on a CQA? */
  cqaImpact?: boolean;
  /** Is this element fully controlled downstream (so it need not be an EC)? */
  controlledDownstream?: boolean;
  /** Is this part of an approved design space? */
  withinDesignSpace?: boolean;
}

export interface AssessEstablishedConditionsParams {
  developmentApproach?: DevelopmentApproach;
  modality?: ProductModality;
  elements: DossierElementInput[];
}

export interface EstablishedConditionAssessment {
  name: string;
  elementType: DossierElementType;
  /** TRUE = legally binding Established Condition; FALSE = supportive information; null = an unstated fact decides it. */
  isEstablishedCondition: boolean | null;
  classification: 'established_condition' | 'supportive_information' | 'not_determined';
  /** Reporting category that a future CHANGE to this element would attract; null while not determined. */
  changeReportingCategory: UsReportingCategory | null;
  euChangeType: EuVariationType | null;
  rationale: string;
}

export interface AssessEstablishedConditionsResult {
  developmentApproach: DevelopmentApproach;
  modality: ProductModality;
  summary: {
    totalElements: number;
    establishedConditions: number;
    supportiveInformation: number;
    /** Elements whose EC status an unstated fact decides. */
    notDetermined: number;
    enhancedApproachBenefit: string;
  };
  assessments: EstablishedConditionAssessment[];
  guidance: string[];
  /** Each true/false input: true, false or not_stated. */
  inputStates: Record<string, BooleanState>;
  /** The conclusions an unstated fact leaves open. */
  undecided: Undecided[];
  citations: RegulatoryCitation[];
  provenance: EngineProvenance;
}

function ecRuleFor(elementType: DossierElementType): EcBaseRule {
  const r = EC_BASE_RULES.find((x: EcBaseRule) => x.elementType === elementType);
  return (
    r ?? {
      elementType,
      defaultEc: true,
      defaultUs: 'PAS',
      defaultEu: 'II',
      description: 'Unclassified element treated conservatively as an EC.',
    }
  );
}

/** EC status, and the reporting a change to the element attracts, on one full answer (the pre-S5d rules). */
function ecOn(
  rule: EcBaseRule, elementType: DossierElementType, approach: DevelopmentApproach,
  a: { cqaImpact: boolean; controlledDownstream: boolean; withinDesignSpace: boolean },
): { isEc: boolean; us: UsReportingCategory; eu: EuVariationType; rationale: string } {
  let isEc = rule.defaultEc;
  // Enhanced approach: a parameter within a design space, fully controlled
  // downstream and without direct CQA impact, can be classified as
  // supportive information rather than an EC (Q12 Annex examples).
  if (a.controlledDownstream && !a.cqaImpact) isEc = false;
  if (a.withinDesignSpace) isEc = false;
  if (elementType === 'process_parameter') isEc = a.cqaImpact && !a.controlledDownstream;
  // CQA impact forces EC regardless of approach.
  if (a.cqaImpact && !a.withinDesignSpace) isEc = true;

  // Reporting category for a change to the element.
  let us = rule.defaultUs;
  let eu = rule.defaultEu;
  if (!isEc) {
    // Changes to supportive information generally need no submission (notify in AR at most).
    us = 'Annual Report';
    eu = 'IA';
  } else if (approach === 'enhanced') {
    // Enhanced approach can lower the reporting category by one tier for
    // parameter-level ECs that remain within the demonstrated knowledge space.
    if (elementType === 'process_parameter' || elementType === 'analytical_procedure') {
      us = adjustUsCategory(us, 'low');
      eu = adjustEuType(eu, 'low');
    }
  }

  const rationaleParts: string[] = [rule.description];
  if (!isEc) {
    rationaleParts.push(
      a.withinDesignSpace
        ? 'Element is within an approved design space, so movement is not a change requiring a submission (supportive information).'
        : 'Element is fully controlled downstream without direct CQA impact, so it is supportive information rather than an EC.',
    );
  } else if (approach === 'enhanced') {
    rationaleParts.push(
      'Enhanced (QbD) development can justify a parameter-level EC with a reduced reporting category for changes within the demonstrated knowledge space (Q12 Annex).',
    );
  } else {
    rationaleParts.push('Minimal development approach: element described as a fixed condition and is an EC.');
  }
  return { isEc, us, eu, rationale: rationaleParts.join(' ') };
}

/**
 * Assess which dossier elements are Established Conditions (legally binding) vs
 * supportive information, and the reporting category a future change to each
 * would attract — modulated by development approach (minimal vs enhanced/QbD)
 * per ICH Q12 Section 3 and its Annex.
 */
export function assessEstablishedConditions(
  params: AssessEstablishedConditionsParams,
): AssessEstablishedConditionsResult {
  // 2026-11-09 (S5d): an omitted cqaImpact, controlledDownstream or withinDesignSpace read as false, so an element was
  // called an EC (or supportive information) from facts nobody stated; an unknown element type was an EC.
  refuseUnlessStated('assessEstablishedConditions', [{ field: 'elements', value: params.elements, ok: Array.isArray(params.elements), expected: 'a list' }], 'classified');
  const approachStated = statedOneOf('developmentApproach', params.developmentApproach, DEV_APPROACHES);
  const modalityStated = statedOneOf('modality', params.modality, MODALITIES);
  const approach: DevelopmentApproach = approachStated ?? 'minimal';
  const modality: ProductModality = modalityStated ?? 'small_molecule';
  const ELEMENT_TYPES = EC_BASE_RULES.map((r: EcBaseRule) => r.elementType);
  const inputStates: Record<string, BooleanState> = {};
  const undecided: Undecided[] = [];

  const assessments: EstablishedConditionAssessment[] = objects('elements', params.elements).map(
    (el: Record<string, unknown>, i: number): EstablishedConditionAssessment => {
      const elementType = requiredOneOf(`elements[${i}].elementType`, el.elementType, ELEMENT_TYPES);
      const name = statedText(`elements[${i}].name`, el.name) ?? '';
      const stated = {
        cqaImpact: statedBoolean(`elements[${i}].cqaImpact`, el.cqaImpact),
        controlledDownstream: statedBoolean(`elements[${i}].controlledDownstream`, el.controlledDownstream),
        withinDesignSpace: statedBoolean(`elements[${i}].withinDesignSpace`, el.withinDesignSpace),
      };
      for (const [k, v] of Object.entries(stated)) inputStates[`elements[${i}].${k}`] = v ?? 'not_stated';
      const rule = ecRuleFor(elementType);
      const on = (a: Record<keyof typeof stated, boolean>) => ecOn(rule, elementType, approach, a);
      const own: Undecided[] = [];
      const field = (k: string): string => `elements[${i}].${k}`;
      const isEc = settled(`elements[${i}].isEstablishedCondition`, stated, (a) => on(a).isEc, own, field);
      const us = settled(`elements[${i}].changeReportingCategory`, stated, (a) => on(a).us, own, field);
      const eu = settled(`elements[${i}].euChangeType`, stated, (a) => on(a).eu, own, field);
      const rationale = settled(`elements[${i}].rationale`, stated, (a) => on(a).rationale, [], field);
      undecided.push(...own);
      const open = own.find((u: Undecided) => u.conclusion.endsWith('isEstablishedCondition'));
      return {
        name,
        elementType,
        isEstablishedCondition: isEc,
        classification: isEc === null ? 'not_determined' : isEc ? 'established_condition' : 'supportive_information',
        changeReportingCategory: us,
        euChangeType: eu,
        rationale:
          rationale ??
          (isEc === null
            ? `${rule.description} Not determined: whether it is an EC turns on ${listed(open?.decidingFacts ?? [])}, not stated.`
            : `${rule.description} ${isEc ? 'An established condition' : 'Supportive information'} on every answer to ` +
              `${listed(Object.keys(stated).filter((k) => stated[k as keyof typeof stated] === undefined).map(field))}, not stated.`),
      };
    },
  );

  const ecCount = assessments.filter((a: EstablishedConditionAssessment) => a.isEstablishedCondition === true).length;
  const siCount = assessments.filter((a: EstablishedConditionAssessment) => a.isEstablishedCondition === false).length;

  const enhancedBenefit =
    approach === 'enhanced'
      ? 'Enhanced (QbD) development supports parameter-level ECs and lower reporting categories for in-design-space changes, increasing post-approval regulatory flexibility (ICH Q12 Annex, ICH Q8(R2)).'
      : 'Minimal development typically yields more ECs at fixed values and higher reporting categories; consider an enhanced approach for elements where post-approval flexibility is valuable.';

  const guidance: string[] = [
    'Established Conditions (ECs) are the legally binding elements considered necessary to assure product quality; a change to an EC requires the indicated regulatory submission (ICH Q12 Section 3).',
    'Supportive information is descriptive material that is NOT legally binding; updating it does not by itself require a submission.',
    'Document the ECs and their reporting categories in the PLCM document (ICH Q12 Section 5).',
  ];
  if (modality === 'biologic' || modality === 'vaccine' || modality === 'cell_gene_therapy') {
    guidance.push(
      'For biologics, more process parameters tend to be ECs because the process defines the product; comparability (ICH Q5E) underpins any EC change.',
    );
  }
  if (approachStated === undefined) guidance.push('developmentApproach was not stated: the minimal approach is assumed.');
  if (modalityStated === undefined) guidance.push('modality was not stated: the elements are assessed for a small molecule.');

  return {
    developmentApproach: approach,
    modality,
    summary: {
      totalElements: assessments.length,
      establishedConditions: ecCount,
      supportiveInformation: siCount,
      notDetermined: assessments.length - ecCount - siCount,
      enhancedApproachBenefit: enhancedBenefit,
    },
    assessments,
    guidance,
    inputStates,
    undecided,
    citations: cite('ich_q12', 'ich_q12_ec', 'ich_q12_annex', 'ich_q8', 'ich_q11', 'ich_q14'),
    provenance: provenance('assessEstablishedConditions'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — designPACMP (ICH Q12 Section 4)
// ─────────────────────────────────────────────────────────────────────────────

export interface PacmpTestInput {
  attribute: string;
  test: string;
  acceptanceCriterion: string;
  /** Is this attribute a CQA? Drives whether comparability is implicated. */
  cqa?: boolean;
}

export interface DesignPacmpParams {
  plannedChangeArea: ChangeArea;
  plannedChangeDescription: string;
  modality?: ProductModality;
  /** Current (pre-PACMP) reporting category if filed as a one-off change. */
  currentCategoryIfNoProtocol?: UsReportingCategory;
  /** Proposed reduced category the applicant wants to achieve via the PACMP. */
  proposedReducedCategory?: UsReportingCategory;
  tests?: PacmpTestInput[];
  /** Will a stability commitment be part of the protocol? */
  includeStability?: boolean;
  risk?: ChangeRiskInputs;
}

export interface PacmpStep {
  step: number;
  title: string;
  detail: string;
}

export interface DesignPacmpResult {
  plannedChange: {
    area: ChangeArea;
    label: string;
    description: string;
  };
  modality: ProductModality;
  protocolType: 'PACMP (ICH Q12)' | 'Comparability Protocol (FDA)';
  twoStepDescription: string;
  testPlan: Array<{
    attribute: string;
    test: string;
    acceptanceCriterion: string;
    /** null while tests[i].cqa is not stated. */
    cqa: boolean | null;
    purpose: string;
  }>;
  stabilityCommitment: string | null;
  /** A null field is not determined: an unstated fact could change it (see undecided). */
  reportingCategory: {
    withoutProtocol: UsReportingCategory | null;
    proposedWithProtocol: UsReportingCategory | null;
    euMechanism: string;
    feasible: boolean | null;
    rationale: string;
  };
  executionSteps: PacmpStep[];
  prerequisites: string[];
  warnings: string[];
  /** Each true/false input: true, false or not_stated. */
  inputStates: Record<string, BooleanState>;
  /** The conclusions an unstated fact leaves open. */
  undecided: Undecided[];
  citations: RegulatoryCitation[];
  provenance: EngineProvenance;
}

/** One-tier reduction is the typical PACMP/CP benefit; deeper reduction needs justification. */
function reduceCategoryOneTier(cat: UsReportingCategory): UsReportingCategory {
  return adjustUsCategory(cat, 'low');
}

/**
 * Design a Post-Approval Change Management Protocol (PACMP) — the ICH Q12 tool
 * that gives an applicant predictability by pre-agreeing the tests/studies and
 * acceptance criteria for a specific planned change, in exchange for a reduced
 * reporting category at the time of implementation.
 */
export function designPACMP(params: DesignPacmpParams): DesignPacmpResult {
  // 2026-11-09 (S5d): an omitted risk qualifier read as false in the category without a protocol and the sterile
  // check, an omitted cqa as "not a CQA", and an omitted includeStability as no commitment, with nothing said.
  const area = requiredOneOf('plannedChangeArea', params.plannedChangeArea, CHANGE_AREAS);
  refuseUnlessStated('designPACMP', [{
    field: 'plannedChangeDescription', value: params.plannedChangeDescription,
    ok: typeof params.plannedChangeDescription === 'string' && params.plannedChangeDescription.trim().length > 0, expected: 'non-empty text',
  }], 'designed');
  const modalityStated = statedOneOf('modality', params.modality, MODALITIES);
  const modality: ProductModality = modalityStated ?? 'small_molecule';
  const profile = profileFor(area);
  const risk = readRisk('risk', params.risk);
  const currentStated = statedOneOf('currentCategoryIfNoProtocol', params.currentCategoryIfNoProtocol, US_CATEGORIES);
  const proposedStated = statedOneOf('proposedReducedCategory', params.proposedReducedCategory, US_CATEGORIES);
  const includeStability = statedBoolean('includeStability', params.includeStability);
  const testsStated = objects('tests', params.tests).map((t: Record<string, unknown>, i: number): PacmpTestInput => {
    const text = (k: string): string => {
      refuseUnlessStated('designPACMP', [{ field: `tests[${i}].${k}`, value: t[k], ok: typeof t[k] === 'string', expected: 'text' }], 'designed');
      return t[k] as string;
    };
    return { attribute: text('attribute'), test: text('test'), acceptanceCriterion: text('acceptanceCriterion'), cqa: statedBoolean(`tests[${i}].cqa`, t.cqa) };
  });
  const undecided: Undecided[] = [];
  const warnings: string[] = [];

  // Without a stated category, it is the classification's, on every answer to the facts it turns on.
  let withoutProtocol: UsReportingCategory | null = currentStated ?? null;
  if (currentStated === undefined) {
    const c = classifyPostApprovalChange({ changeArea: area, modality, risk: params.risk });
    withoutProtocol = c.us.category;
    if (withoutProtocol === null) {
      const u = c.undecided.find((x: Undecided) => x.conclusion === 'us.category')!;
      undecided.push({ conclusion: 'reportingCategory.withoutProtocol', decidingFacts: u.decidingFacts, couldBe: u.couldBe });
      warnings.push(
        `The category without a protocol is not determined: it turns on ${listed(u.decidingFacts)}, not stated. ` +
          'State currentCategoryIfNoProtocol, or the risk facts (classify_post_approval_change takes the others).',
      );
    }
  }

  // Default proposed category: one tier down from the unprotocoled category.
  const proposed = proposedStated ?? (withoutProtocol === null ? null : reduceCategoryOneTier(withoutProtocol));

  // Feasibility: PACMP cannot reduce below CBE-0 to Annual Report for CQA-affecting
  // changes, and cannot turn a sterile process change into a notification.
  const order: UsReportingCategory[] = ['Annual Report', 'CBE-0', 'CBE-30', 'PAS'];
  let feasible: boolean | null = proposed === null || withoutProtocol === null ? null : order.indexOf(proposed) <= order.indexOf(withoutProtocol);
  if (feasible === false) {
    warnings.push('Proposed reduced category is not lower than the unprotocoled category; a PACMP provides no reporting benefit here.');
  }
  if (risk.sterileProcess === true && proposed === 'Annual Report') {
    feasible = false;
    warnings.push('A sterile/aseptic process change cannot be reduced to an Annual Report category even with a PACMP.');
  } else if (risk.sterileProcess === undefined && proposed === 'Annual Report' && feasible !== false) {
    feasible = null;
    undecided.push({ conclusion: 'reportingCategory.feasible', decidingFacts: ['risk.sterileProcess'], couldBe: [false, true] });
    warnings.push('risk.sterileProcess was not stated: a sterile/aseptic process change cannot be reduced to an Annual Report category.');
  }
  if ((modality === 'cell_gene_therapy') && proposed !== null && order.indexOf(proposed) < order.indexOf('CBE-30')) {
    warnings.push('For cell & gene therapies, regulators rarely accept reduction below CBE-30 due to limited comparability assurance.');
  }

  // Build the test plan. If the caller supplies tests, annotate them; otherwise
  // generate a sensible default panel for the change area.
  const suppliedTests: PacmpTestInput[] = params.tests === undefined || params.tests === null ? defaultPacmpTests(area, modality) : testsStated;
  if (params.tests === undefined || params.tests === null) {
    warnings.push('No tests were stated: the test plan is this engine\'s default panel for the change area; confirm each acceptance criterion against the approved specification.');
  }
  const testPlan = suppliedTests.map((t: PacmpTestInput, i: number) => ({
    attribute: t.attribute,
    test: t.test,
    acceptanceCriterion: t.acceptanceCriterion,
    cqa: t.cqa ?? null,
    purpose: t.cqa === true
      ? 'Demonstrate the CQA remains within criteria after the change (comparability anchor).'
      : t.cqa === false
        ? 'Confirm the quality attribute is unaffected by the change.'
        : `Not stated whether the attribute is a CQA (tests[${i}].cqa); if it is, this test is a comparability anchor.`,
  }));

  const stabilityByArea = profile.area === 'container_closure' || profile.area === 'stability_shelf_life';
  const stabilityCommitment =
    includeStability === true || stabilityByArea
      ? 'Place the first 1–3 production batches manufactured under the change on the approved stability protocol (e.g., long-term 25°C/60%RH and accelerated 40°C/75%RH per ICH Q1A) and commit to report any out-of-trend results; confirm shelf life is unaffected.'
      : null;
  if (includeStability === undefined && !stabilityByArea) {
    warnings.push('includeStability was not stated: no stability commitment is included for this change area.');
  }
  if (modalityStated === undefined) warnings.push('modality was not stated: the protocol is designed for a small molecule.');

  const protocolType: 'PACMP (ICH Q12)' | 'Comparability Protocol (FDA)' = 'PACMP (ICH Q12)';
  const reduced = proposed ?? 'the agreed reduced category (not determined)';
  const unreduced = withoutProtocol ?? 'the category without a protocol (not determined)';

  const executionSteps: PacmpStep[] = [
    {
      step: 1,
      title: 'Submit the PACMP (Step 1)',
      detail:
        'File the PACMP as a Prior Approval Supplement describing the planned change, the risk assessment, the tests/studies, acceptance criteria, and the proposed reduced reporting category for implementation. FDA/EMA review and agree the protocol up front (ICH Q12 Section 4).',
    },
    {
      step: 2,
      title: 'Execute the change and tests',
      detail:
        'Implement the change and run the pre-agreed test plan and any stability commitment. Compare results to the agreed acceptance criteria.',
    },
    {
      step: 3,
      title: 'Report under the reduced category (Step 2)',
      detail: `If all acceptance criteria are met, implement and report the change under the agreed reduced category (${reduced}) rather than ${unreduced}. If any criterion fails, the reduced category does not apply and the change reverts to ${unreduced}.`,
    },
  ];

  const prerequisites: string[] = [
    'A documented control strategy and defined CQAs for the affected attribute(s) (ICH Q8/Q11).',
    'Quality risk management assessment of the planned change (ICH Q9).',
    'A Pharmaceutical Quality System capable of managing the change (ICH Q10).',
  ];
  if (modality === 'biologic' || modality === 'vaccine' || modality === 'cell_gene_therapy') {
    prerequisites.push('A comparability strategy consistent with ICH Q5E for the biologic.');
  }

  return {
    plannedChange: {
      area,
      label: profile.label,
      description: params.plannedChangeDescription,
    },
    modality,
    protocolType,
    twoStepDescription:
      'A PACMP is a two-step regulatory tool: Step 1 — submit and obtain agreement on the change description, tests, and acceptance criteria; Step 2 — after executing the change and meeting the criteria, report under the pre-agreed reduced category (ICH Q12 Section 4). The FDA Comparability Protocol (2016 draft) is the analogous US mechanism.',
    testPlan,
    stabilityCommitment,
    reportingCategory: {
      withoutProtocol,
      proposedWithProtocol: feasible === true ? proposed : feasible === false ? withoutProtocol : null,
      euMechanism:
        'In the EU, the equivalent mechanism is a Post-Approval Change Management Protocol submitted as a Type II variation; once approved, the subsequent change can be implemented as a lower-tier variation (often Type IB or IA) as agreed in the protocol.',
      feasible,
      rationale: feasible === true
        ? `A PACMP can reduce the reporting category from ${withoutProtocol} to ${proposed} because the assessment of the change is performed up front against agreed criteria.`
        : feasible === false
          ? `The proposed reduction to ${proposed} is not supportable; the change should be reported as ${withoutProtocol}.`
          : `Not determined: ${listed(undecided.flatMap((u: Undecided) => u.decidingFacts))} not stated.`,
    },
    executionSteps,
    prerequisites,
    warnings,
    inputStates: {
      includeStability: includeStability ?? 'not_stated',
      ...Object.fromEntries(testsStated.map((t: PacmpTestInput, i: number) => [`tests[${i}].cqa`, t.cqa ?? 'not_stated'])),
      ...riskStates('risk', risk),
    },
    undecided,
    citations: cite('ich_q12', 'ich_q12_pacmp', 'fda_comparability_protocols', 'ich_q9', 'ich_q10', 'eu_variations_reg'),
    provenance: provenance('designPACMP'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — planAnnualReport / PLCM (ICH Q12 Section 5)
// ─────────────────────────────────────────────────────────────────────────────

export interface AnnualReportChangeInput {
  changeArea: ChangeArea;
  description: string;
  /** The category the applicant believes this change attracts. */
  assertedCategory?: UsReportingCategory;
  modality?: ProductModality;
  magnitude?: ChangeMagnitude;
}

export interface PlanAnnualReportParams {
  productName?: string;
  reportingPeriod?: string;
  modality?: ProductModality;
  /**
   * The product is licensed under a BLA (21 CFR part 601). Absent, a biologic,
   * vaccine or cell/gene therapy modality is taken as licensed; false keeps the
   * NDA annual report (21 CFR 314.81(b)(2)).
   */
  biologicLicense?: boolean;
  changes?: AnnualReportChangeInput[];
  stabilityProtocolOngoing?: boolean;
  includePlcmDocument?: boolean;
}

export interface AnnualReportableChange {
  changeArea: ChangeArea;
  description: string;
  /** null while the facts the classification turns on are not stated (and no category was asserted). */
  classifiedCategory: UsReportingCategory | null;
  annualReportable: boolean | null;
  note: string;
}

export interface PlcmSection {
  section: string;
  title: string;
  contents: string;
}

export interface PlanAnnualReportResult {
  productName: string;
  reportingPeriod: string;
  modality: ProductModality;
  annualReportContents: {
    /** The governing annual report: the NDA report under 314.81(b)(2), or the BLA report of minor changes under 601.12(d). */
    regime: 'NDA 21 CFR 314.81(b)(2)' | 'BLA 21 CFR 601.12(d)';
    /** The lifecycle record the BLA parts are read from; null for the NDA list. */
    sourceRecord: string | null;
    requiredSections: string[];
    reportableChanges: AnnualReportableChange[];
    nonAnnualReportableFlagged: AnnualReportableChange[];
    /** Changes whose category the facts stated do not decide. */
    notDetermined: AnnualReportableChange[];
    stabilityUpdate: string;
  };
  plcmDocument: {
    included: boolean;
    purpose: string;
    sections: PlcmSection[];
  };
  guidance: string[];
  /** Each true/false input: true, false or not_stated. */
  inputStates: Record<string, BooleanState>;
  citations: RegulatoryCitation[];
  provenance: EngineProvenance;
}

/** The BLA annual report's own parts, read from its lifecycle record (never a copy). */
function blaAnnualReportSections(): { record: string; sections: string[] } {
  const ids = US_BLA_REPORT_SOURCE_IDS.annual;
  const record = US_BLA_REPORT_SOURCES.find((r) => r.id === ids.id);
  if (!record) throw new Error('The BLA annual-report lifecycle record is unavailable.');
  return {
    record: `LIFECYCLE_DOCUMENT_TYPES:${record.id}`,
    sections: record.components.map((c) => `${c.title}${c.required ? '' : ' (conditional)'} — ${c.guidance}`),
  };
}

/** Licensed under a BLA: as stated, else taken from a biologic, vaccine or cell/gene therapy modality. */
function isLicensedBiologic(params: PlanAnnualReportParams, modality: ProductModality): boolean {
  const stated = statedBoolean('biologicLicense', params.biologicLicense);
  if (stated !== undefined) return stated;
  return modality === 'biologic' || modality === 'vaccine' || modality === 'cell_gene_therapy';
}

/** The report's sections: the BLA record's parts, or the NDA list. */
function annualReportSections(licensed: boolean): { record: string | null; sections: string[] } {
  return licensed ? blaAnnualReportSections() : { record: null, sections: [...NDA_ANNUAL_SECTIONS] };
}

/** The NDA annual report's sections (21 CFR 314.81(b)(2)), unchanged from before 2026-10-29. */
const NDA_ANNUAL_SECTIONS: readonly string[] = [
  'Summary of significant new information from the previous year (21 CFR 314.81 / 314.70(d) annual report).',
  'Distribution data.',
  'Labeling changes (with current labeling).',
  'CMC changes made under the annual report category (minor changes).',
  'Nonclinical/clinical data summaries as applicable.',
  'Stability data and shelf-life status update.',
];

/** The per-change note: the rule a minor change is reported under, or why it is not annual-reportable. */
function annualChangeNote(classified: UsReportingCategory, licensed: boolean): string {
  if (classified === 'Annual Report') {
    return licensed
      ? 'Minor change — describe it in the BLA annual report under 21 CFR 601.12(d); no supplement required.'
      : 'Minor change — document in the annual report under 21 CFR 314.70(d); no supplement required.';
  }
  return `This change is classified ${classified} and requires a supplement${licensed ? ' under 21 CFR 601.12(b) or (c)' : ''}; it is NOT merely annual-reportable. Include only after the supplement is filed/approved as appropriate.`;
}

function annualStabilityUpdate(licensed: boolean, protocolOngoing: boolean | undefined): string {
  if (licensed) return 'Stability data appear in this report only as data supporting a minor change it describes, or where an approved commitment requires them; this planner does not decide that. Confirm against the BLA\'s approved commitments.';
  const ongoing = 'Include updated stability data for batches on the approved stability protocol, any commitment batches, and a statement of conformance to the approved shelf life. Report any confirmed out-of-specification or significant out-of-trend results promptly (these may require a separate field alert or supplement).';
  const none = 'Provide a statement on stability status; if no new long-term data are available this period, state so and reference the approved stability commitment.';
  if (protocolOngoing === undefined) {
    return `Whether a stability protocol or commitment is ongoing was not stated (stabilityProtocolOngoing). If one is: ${ongoing} If not: ${none}`;
  }
  return protocolOngoing ? ongoing : none;
}

/** The regime lines of the guidance: which rule governs, and what is a separate report. */
function annualRegimeGuidance(licensed: boolean, licenceStated: boolean): string[] {
  if (!licensed) return ['The annual report captures minor (Annual Report category) CMC changes; moderate/major changes need CBE-30/CBE-0/PAS supplements respectively (21 CFR 314.70).'];
  return [
    'The BLA annual report describes minor changes (21 CFR 601.12(d)); moderate changes need a CBE-30 or CBE-0 supplement (601.12(c)) and major changes a prior approval supplement (601.12(b)).',
    'A licensed biologic\'s pediatric report (21 CFR 601.28), postmarketing requirement and commitment status report (601.70), distribution report (600.81) and periodic adverse experience report (600.80(c)(2)) are separate reports with their own records; they are not sections of this one.',
    ...(licenceStated ? [] : ['Licensure was taken from the modality. If the product is not licensed under a BLA, plan with biologicLicense: false.']),
  ];
}

/**
 * Plan the content of an annual report and (optionally) the ICH Q12 Product
 * Lifecycle Management (PLCM) document: which changes are annual-reportable,
 * stability updates, and the PLCM structure that centralizes ECs and reporting
 * categories.
 */
export function planAnnualReport(params: PlanAnnualReportParams): PlanAnnualReportResult {
  // 2026-11-09 (S5d): a change with no asserted category was classified with its risk facts read as false (this tool
  // takes none), an omitted stabilityProtocolOngoing read as false, and 'true' read as false or crashed.
  const modality: ProductModality = statedOneOf('modality', params.modality, MODALITIES) ?? 'small_molecule';
  const licensed = isLicensedBiologic(params, modality);
  const productName = statedText('productName', params.productName) ?? 'the product';
  const reportingPeriod = statedText('reportingPeriod', params.reportingPeriod) ?? 'the current annual reporting period';
  const stabilityOngoing = statedBoolean('stabilityProtocolOngoing', params.stabilityProtocolOngoing);
  const includePlcm = statedBoolean('includePlcmDocument', params.includePlcmDocument);

  const reportable: AnnualReportableChange[] = [];
  const nonReportableFlagged: AnnualReportableChange[] = [];
  const notDetermined: AnnualReportableChange[] = [];

  objects('changes', params.changes).forEach((ch: Record<string, unknown>, i: number) => {
    const at = `changes[${i}].`;
    const changeArea = requiredOneOf(`${at}changeArea`, ch.changeArea, CHANGE_AREAS);
    const description = statedText(`${at}description`, ch.description) ?? '';
    const asserted = statedOneOf(`${at}assertedCategory`, ch.assertedCategory, US_CATEGORIES);
    const changeModality = statedOneOf(`${at}modality`, ch.modality, MODALITIES) ?? modality;
    const magnitude = statedOneOf(`${at}magnitude`, ch.magnitude, MAGNITUDES);
    const c = asserted === undefined ? classifyPostApprovalChange({ changeArea, modality: changeModality, magnitude }) : undefined;
    const classified = asserted ?? c!.us.category;
    if (classified === null) {
      const u = c!.undecided.find((x: Undecided) => x.conclusion === 'us.category')!;
      notDetermined.push({
        changeArea, description, classifiedCategory: null, annualReportable: null,
        note: `Not determined: the category could be ${u.couldBe.join(' or ')}, and turns on ${listed(u.decidingFacts)}, which this planner does not take. State assertedCategory, or classify the change with classify_post_approval_change and its risk facts.`,
      });
      return;
    }
    const isAr = classified === 'Annual Report';
    const entry: AnnualReportableChange = {
      changeArea,
      description,
      classifiedCategory: classified,
      annualReportable: isAr,
      note: annualChangeNote(classified, licensed),
    };
    if (isAr) reportable.push(entry);
    else nonReportableFlagged.push(entry);
  });

  const stabilityUpdate = annualStabilityUpdate(licensed, stabilityOngoing);

  // A licensed biologic's annual report is the 601.12(d) report of minor changes,
  // read from its own record. Until 2026-10-29 a biologic got the NDA sections
  // with a one-line note.
  const { record: sourceRecord, sections: requiredSections } = annualReportSections(licensed);

  const plcmIncluded = includePlcm === true;
  const plcmSections: PlcmSection[] = plcmIncluded
    ? [
        {
          section: '1',
          title: 'Established Conditions (ECs) and reporting categories',
          contents: 'Tabulate ECs for drug substance and drug product with the reporting category for a future change to each (ICH Q12 Section 3 & 5).',
        },
        {
          section: '2',
          title: 'Post-Approval CMC commitments',
          contents: 'List outstanding commitments (e.g., stability commitments, process validation lifecycle stage 3 monitoring) with timelines.',
        },
        {
          section: '3',
          title: 'PACMPs / Comparability Protocols',
          contents: 'Reference any approved PACMPs/CPs and the reduced reporting categories they enable.',
        },
        {
          section: '4',
          title: 'Change history',
          contents: 'Summarize implemented post-approval changes and their reporting categories since approval.',
        },
      ]
    : [];

  const guidance: string[] = [
    ...annualRegimeGuidance(licensed, params.biologicLicense !== undefined && params.biologicLicense !== null),
    'The PLCM document is a structured, living summary of ECs, their reporting categories, PACMPs, and post-approval commitments that travels with the dossier (ICH Q12 Section 5).',
    'Keep the PLCM document consistent with the approved application; update it whenever ECs or reporting categories change.',
    ...(includePlcm === undefined ? ['includePlcmDocument was not stated: the PLCM document structure is not included.'] : []),
  ];

  return {
    productName,
    reportingPeriod,
    modality,
    annualReportContents: {
      regime: licensed ? 'BLA 21 CFR 601.12(d)' : 'NDA 21 CFR 314.81(b)(2)',
      sourceRecord,
      requiredSections,
      reportableChanges: reportable,
      nonAnnualReportableFlagged: nonReportableFlagged,
      notDetermined,
      stabilityUpdate,
    },
    plcmDocument: {
      included: plcmIncluded,
      purpose:
        'The PLCM document (ICH Q12 Section 5) is a central repository describing how the applicant intends to manage post-approval CMC changes: it lists ECs, their reporting categories, approved PACMPs, and post-approval commitments.',
      sections: plcmSections,
    },
    guidance,
    inputStates: {
      biologicLicense: statedBoolean('biologicLicense', params.biologicLicense) ?? 'not_stated',
      stabilityProtocolOngoing: stabilityOngoing ?? 'not_stated',
      includePlcmDocument: includePlcm ?? 'not_stated',
    },
    citations: cite('ich_q12', 'ich_q12_plcm', ...(licensed ? ['cfr_601_12', 'fda_bio_cmc_changes'] : ['cfr_314_70d', 'fda_ar_changes'])),
    provenance: provenance('planAnnualReport'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — assessPostApprovalComparability (ICH Q5E)
// ─────────────────────────────────────────────────────────────────────────────

export interface AssessPostApprovalComparabilityParams {
  changeArea: ChangeArea;
  modality?: ProductModality;
  changeDescription?: string;
  /** Does the change occur upstream (e.g., cell line, fermentation) or downstream (fill/finish)? */
  changeStage?: 'upstream' | 'downstream' | 'formulation' | 'analytical' | 'fill_finish';
  affectsCqa?: boolean;
  /** Are validated, sensitive analytical methods available for all CQAs? */
  analyticalCoverageComplete?: boolean;
  /** Existing PK/PD or clinical data that could bridge? */
  clinicalDataAvailable?: boolean;
  risk?: ChangeRiskInputs;
}

export type ComparabilityExtent = 'analytical_only' | 'analytical_plus_nonclinical' | 'analytical_plus_clinical';

export interface AssessPostApprovalComparabilityResult {
  modality: ProductModality;
  changeArea: ChangeArea;
  comparabilityApplicable: boolean;
  framework: string;
  /** A null field is not determined: an unstated fact could change it (see undecided). */
  extent: ComparabilityExtent | null;
  analyticalComparability: {
    required: boolean;
    recommendedAttributes: string[];
    note: string;
  };
  functionalBiologicalComparability: {
    required: boolean | null;
    note: string;
  };
  bridgingStudies: {
    nonclinicalRequired: boolean | null;
    clinicalRequired: boolean | null;
    pkPdRequired: boolean | null;
    rationale: string;
  };
  riskBasedExtentRationale: string;
  decisionTree: string[];
  warnings: string[];
  /** Each true/false input: true, false or not_stated. */
  inputStates: Record<string, BooleanState>;
  /** The conclusions an unstated fact leaves open. */
  undecided: Undecided[];
  citations: RegulatoryCitation[];
  provenance: EngineProvenance;
}

/** The true/false facts a comparability assessment turns on. */
const COMPARABILITY_FACTS = ['affectsCqa', 'analyticalCoverageComplete', 'clinicalDataAvailable', ...RISK_FLAGS.map((k: RiskFlag) => `risk.${k}` as const)] as const;
type ComparabilityFact = (typeof COMPARABILITY_FACTS)[number];

/** The extent, bridging and warnings on one full answer (the pre-S5d rules, with every fact stated). */
function comparabilityOn(
  area: ChangeArea, modality: ProductModality, stage: NonNullable<AssessPostApprovalComparabilityParams['changeStage']>,
  magnitude: ChangeMagnitude | undefined, a: Record<ComparabilityFact, boolean>,
): {
  tier: ChangeRiskTier; extent: ComparabilityExtent; nonclinicalRequired: boolean; clinicalRequired: boolean;
  pkPdRequired: boolean; functionalRequired: boolean; cqaAffected: boolean; warnings: string[];
} {
  const isBiologic = modality === 'biologic' || modality === 'vaccine' || modality === 'cell_gene_therapy' || modality === 'peptide_oligonucleotide';
  const profile = profileFor(area);
  const risk = scoreChangeRisk(modality, {
    affectsCqa: a['risk.affectsCqa'], affectsControlStrategy: a['risk.affectsControlStrategy'], sterileProcess: a['risk.sterileProcess'],
    withinDesignSpace: a['risk.withinDesignSpace'], priorKnowledge: a['risk.priorKnowledge'], magnitude,
  }, profile.comparabilitySensitive);
  const warnings: string[] = [];
  const upstream = stage === 'upstream';
  const cqaAffected = a.affectsCqa || a['risk.affectsCqa'];
  const analyticalComplete = a.analyticalCoverageComplete;

  let extent: ComparabilityExtent;
  let nonclinicalRequired = false;
  let clinicalRequired = false;
  let pkPdRequired = false;

  if (isBiologic) {
    if (!analyticalComplete) {
      // Gaps in analytical coverage push toward bridging studies.
      extent = 'analytical_plus_clinical';
      clinicalRequired = true;
      pkPdRequired = true;
      warnings.push('Incomplete analytical coverage of CQAs typically necessitates clinical/PK bridging per ICH Q5E.');
    } else if (upstream && cqaAffected && risk.tier === 'high') {
      extent = 'analytical_plus_clinical';
      clinicalRequired = true;
      pkPdRequired = true;
    } else if ((upstream && cqaAffected) || risk.tier === 'high') {
      extent = 'analytical_plus_nonclinical';
      nonclinicalRequired = true;
      pkPdRequired = cqaAffected;
    } else {
      extent = 'analytical_only';
    }
  } else {
    // Small molecule: analytical/in vitro only in nearly all cases.
    extent = 'analytical_only';
    if (cqaAffected && risk.tier === 'high') {
      pkPdRequired = true;
      extent = 'analytical_plus_clinical';
      warnings.push('A high-risk change affecting a CQA of a small molecule (e.g., affecting bioavailability) may require an in vivo bioequivalence/PK study.');
    }
  }

  // If clinical exists already, a new study may be avoidable.
  if (clinicalRequired && a.clinicalDataAvailable) {
    warnings.push('Existing clinical/PK data may bridge the change; confirm relevance and avoid a new clinical study if the prior data cover the affected CQAs.');
  }
  return {
    tier: risk.tier, extent, nonclinicalRequired, clinicalRequired, pkPdRequired,
    functionalRequired: isBiologic && (cqaAffected || risk.tier !== 'low'), cqaAffected, warnings,
  };
}

/**
 * Assess comparability for a manufacturing change: analytical and biological
 * comparability, whether nonclinical/clinical bridging is needed, and the
 * risk-based extent — grounded in ICH Q5E (biologics) and the comparability
 * principles underlying FDA/EU change assessment.
 */
export function assessPostApprovalComparability(
  params: AssessPostApprovalComparabilityParams,
): AssessPostApprovalComparabilityResult {
  // 2026-11-09 (S5d): an omitted analyticalCoverageComplete read as true and an omitted CQA or risk fact as false, so
  // the extent and the bridging studies were chosen from facts nobody stated; 'false' read as complete coverage.
  const area = requiredOneOf('changeArea', params.changeArea, CHANGE_AREAS);
  const modalityStated = statedOneOf('modality', params.modality, MODALITIES);
  const modality: ProductModality = modalityStated ?? 'small_molecule';
  const isBiologic = modality === 'biologic' || modality === 'vaccine' || modality === 'cell_gene_therapy' || modality === 'peptide_oligonucleotide';
  const profile = profileFor(area);
  const risk = readRisk('risk', params.risk);
  const stageStated = statedOneOf('changeStage', params.changeStage, CHANGE_STAGES);
  const stage = stageStated ?? (profile.comparabilitySensitive ? 'upstream' : 'downstream');
  const cqaTop = statedBoolean('affectsCqa', params.affectsCqa);
  const inputStates: Record<string, BooleanState> = {
    affectsCqa: cqaTop ?? 'not_stated',
    analyticalCoverageComplete: statedBoolean('analyticalCoverageComplete', params.analyticalCoverageComplete) ?? 'not_stated',
    clinicalDataAvailable: statedBoolean('clinicalDataAvailable', params.clinicalDataAvailable) ?? 'not_stated',
    ...riskStates('risk', risk),
  };
  // affectsCqa and risk.affectsCqa state one fact: either, stated, answers the other, and with neither stated the
  // search tries it once (risk.affectsCqa follows affectsCqa), never as two facts that disagree.
  const cqaOneFact = cqaTop === undefined && risk.affectsCqa === undefined;
  const stated = {
    ...(Object.fromEntries(COMPARABILITY_FACTS.map((k: ComparabilityFact) => [k, inputStates[k] === 'not_stated' ? undefined : inputStates[k]])) as
      Record<ComparabilityFact, boolean | undefined>),
    affectsCqa: cqaTop ?? risk.affectsCqa,
    'risk.affectsCqa': cqaOneFact ? false : risk.affectsCqa ?? cqaTop,
  };
  const undecided: Undecided[] = [];
  const on = (a: Record<ComparabilityFact, boolean>) =>
    comparabilityOn(area, modality, stage, risk.magnitude, cqaOneFact ? { ...a, 'risk.affectsCqa': a.affectsCqa } : a);
  const settle = <T>(conclusion: string, get: (o: ReturnType<typeof on>) => T): T | null =>
    settled(conclusion, stated, (a: Record<ComparabilityFact, boolean>) => get(on(a)), undecided);
  const extent = settle('extent', (o) => o.extent);
  const nonclinicalRequired = settle('bridgingStudies.nonclinicalRequired', (o) => o.nonclinicalRequired);
  const clinicalRequired = settle('bridgingStudies.clinicalRequired', (o) => o.clinicalRequired);
  const pkPdRequired = settle('bridgingStudies.pkPdRequired', (o) => o.pkPdRequired);
  const functionalRequired = settle('functionalBiologicalComparability.required', (o) => o.functionalRequired);
  const cqaAffected = settle('cqaAffected', (o) => o.cqaAffected);
  const tier = settle('riskTier', (o) => o.tier);
  const outcomes = everyAnswer(stated).map(on);
  const warnings: string[] = outcomes[0].warnings.filter((w: string) => outcomes.every((o) => o.warnings.includes(w)));
  if (stated.clinicalDataAvailable === undefined && clinicalRequired !== false) {
    warnings.push('clinicalDataAvailable was not stated: existing clinical/PK data may bridge the change if they cover the affected CQAs.');
  }
  if (stageStated === undefined) warnings.push(`changeStage was not stated: taken as ${stage} from the change area.`);
  if (modalityStated === undefined) warnings.push('modality was not stated: the change is assessed for a small molecule.');
  for (const u of undecided) {
    if (u.conclusion !== 'cqaAffected' && u.conclusion !== 'riskTier') {
      warnings.push(`${u.conclusion} not determined: ${listed(u.decidingFacts)} not stated (could be ${u.couldBe.join(' or ')}).`);
    }
  }

  // For small molecules, formal Q5E comparability is generally not invoked; instead
  // physicochemical equivalence + dissolution + impurities suffices.
  const comparabilityApplicable = isBiologic || profile.comparabilitySensitive;

  const framework = isBiologic
    ? 'ICH Q5E — Comparability of Biotechnological/Biological Products Subject to Changes in Their Manufacturing Process'
    : 'Physicochemical and in vitro equivalence per FDA Changes Guidance and SUPAC (no formal Q5E comparability exercise for small molecules)';
  const shownOr = (v: unknown, open: string): string => (v === null ? `not determined: ${open}` : String(v));
  const analyticalComplete = stated.analyticalCoverageComplete;

  const recommendedAttributes: string[] = isBiologic
    ? [
        'Primary structure (peptide map, intact/subunit mass)',
        'Higher-order structure (CD, DSC, HDX-MS as applicable)',
        'Purity & impurities (SEC, CE-SDS, rCE-SDS)',
        'Charge heterogeneity (iCIEF, IEX)',
        'Glycosylation / post-translational modifications',
        'Potency / biological activity (validated bioassay)',
        'Product- and process-related impurities (HCP, residual DNA)',
      ]
    : [
        'Assay / content',
        'Related substances & degradation products',
        'Dissolution profile (f2 where applicable)',
        'Polymorphic form / particle size (if CQA)',
        'Residual solvents / elemental impurities',
      ];

  const decisionTree: string[] = [
    '1. Define the CQAs potentially affected by the change (ICH Q8/Q11).',
    '2. Perform analytical comparability across release and characterization attributes (ICH Q5E for biologics).',
    '3. If analytical methods fully characterize the affected CQAs and results are comparable → analytical comparability may suffice.',
    '4. If residual uncertainty remains (limited analytical sensitivity, upstream change, CQA impact) → add nonclinical (functional/animal) comparability.',
    '5. If uncertainty persists or the affected CQA links to clinical safety/efficacy (e.g., immunogenicity, PK) → add clinical/PK bridging.',
    '6. Conclude comparable / not comparable; if not comparable, the change may be treated as a new product requiring additional data.',
  ];

  return {
    modality,
    changeArea: params.changeArea,
    comparabilityApplicable,
    framework,
    extent,
    analyticalComparability: {
      required: comparabilityApplicable,
      recommendedAttributes,
      note: isBiologic
        ? 'Use orthogonal, validated, sensitive methods; compare pre- and post-change material side-by-side against predefined comparability acceptance criteria (ICH Q5E).'
        : 'Compare physicochemical and in vitro release attributes of pre- and post-change batches against the approved specification and pre-change profile.',
    },
    functionalBiologicalComparability: {
      required: functionalRequired,
      note: isBiologic
        ? 'Include potency/bioactivity and, where mechanism-relevant, binding (e.g., FcRn, FcγR) and functional (ADCC/CDC) assays.'
        : 'Functional/biological comparability assays are generally not applicable to small molecules.',
    },
    bridgingStudies: {
      nonclinicalRequired,
      clinicalRequired,
      pkPdRequired,
      rationale: `Extent "${shownOr(extent, 'see undecided')}" selected from change stage (${stage}), CQA impact (${shownOr(cqaAffected, 'not stated')}), analytical coverage (${analyticalComplete === undefined ? 'not stated' : analyticalComplete ? 'complete' : 'incomplete'}), and risk tier (${shownOr(tier, 'turns on facts not stated')}).`,
    },
    riskBasedExtentRationale:
      'ICH Q5E and quality risk management (ICH Q9) direct a risk-based, stepwise approach: the extent of comparability data is proportionate to the potential of the change to affect quality, safety, and efficacy. Analytical data are the foundation; nonclinical/clinical bridging is added only when residual uncertainty warrants it.',
    decisionTree,
    warnings,
    inputStates,
    undecided,
    citations: isBiologic
      ? cite('ich_q5e', 'ich_q9', 'ich_q12', 'ich_q8', 'cfr_601_12')
      : cite('fda_changes_guidance', 'supac_ir', 'ich_q9', 'ich_q12'),
    provenance: provenance('assessPostApprovalComparability'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 — planLifecycleManagement (integrated, ICH Q12 tools selection)
// ─────────────────────────────────────────────────────────────────────────────

export interface PlannedChangeSummary {
  changeArea: ChangeArea;
  description?: string;
  expectedFrequency?: 'one_time' | 'recurring' | 'multiple_sites';
  magnitude?: ChangeMagnitude;
  risk?: ChangeRiskInputs;
}

export interface HistoricalChangeSummary {
  changeArea: ChangeArea;
  description?: string;
  reportedCategory?: UsReportingCategory;
  yearImplemented?: number;
}

export interface PlanLifecycleManagementParams {
  productName?: string;
  modality?: ProductModality;
  developmentApproach?: DevelopmentApproach;
  marketedRegions?: Array<'US' | 'EU' | 'global'>;
  plannedChanges?: PlannedChangeSummary[];
  changeHistory?: HistoricalChangeSummary[];
}

export type Q12Tool =
  | 'Established Conditions (ECs)'
  | 'PACMP / Comparability Protocol'
  | 'PLCM Document'
  | 'Design Space (ICH Q8)'
  | 'Annual Report category'
  | 'Standard supplement/variation';

export interface LifecycleToolRecommendation {
  changeArea: ChangeArea;
  description: string;
  /** A null field is not determined: the change's unstated risk facts could change it (see undecided). */
  recommendedTool: Q12Tool | null;
  defaultUsCategory: UsReportingCategory | null;
  defaultEuType: EuVariationType | null;
  rationale: string;
}

export interface PlanLifecycleManagementResult {
  productName: string;
  modality: ProductModality;
  developmentApproach: DevelopmentApproach;
  marketedRegions: Array<'US' | 'EU' | 'global'>;
  ecStrategy: {
    approachNote: string;
    recommendation: string;
  };
  toolRecommendations: LifecycleToolRecommendation[];
  pacmpCandidates: ChangeArea[];
  changeHistorySummary: {
    totalChanges: number;
    byCategory: Record<string, number>;
    note: string;
  };
  plcmDocumentPlan: PlcmSection[];
  integratedPlan: string[];
  /** The defaults used for omitted inputs, and the conclusions not determined. */
  notes: string[];
  /** Each true/false input: true, false or not_stated. */
  inputStates: Record<string, BooleanState>;
  /** The conclusions an unstated fact leaves open. */
  undecided: Undecided[];
  citations: RegulatoryCitation[];
  provenance: EngineProvenance;
}

/** The ICH Q12 tool for a planned change with a known US category (the pre-S5d rules). */
function lifecycleToolFor(category: UsReportingCategory, area: ChangeArea, frequency: PlannedChangeSummary['expectedFrequency'], approach: DevelopmentApproach): Q12Tool {
  if (category === 'Annual Report') return 'Annual Report category';
  if (frequency === 'recurring' || frequency === 'multiple_sites') return 'PACMP / Comparability Protocol';
  if (approach === 'enhanced' && (area === 'manufacturing_process' || area === 'process_parameter' as ChangeArea)) return 'Design Space (ICH Q8)';
  if (category === 'PAS' && profileFor(area).comparabilitySensitive) return 'PACMP / Comparability Protocol';
  return 'Standard supplement/variation';
}

/**
 * Build an integrated lifecycle management plan: EC strategy, ICH Q12 tool
 * selection per planned change, PACMP candidates, change-history summary, and
 * the PLCM document structure.
 */
export function planLifecycleManagement(
  params: PlanLifecycleManagementParams,
): PlanLifecycleManagementResult {
  // 2026-11-09 (S5d): a planned change's omitted risk facts read as false, so its category and ICH Q12 tool were
  // chosen from facts nobody stated; a history entry with no reported category was classified the same way.
  const modalityStated = statedOneOf('modality', params.modality, MODALITIES);
  const approachStated = statedOneOf('developmentApproach', params.developmentApproach, DEV_APPROACHES);
  const regionsStated = statedList('marketedRegions', params.marketedRegions)?.map((r: unknown, i: number) => requiredOneOf(`marketedRegions[${i}]`, r, REGIONS));
  const modality: ProductModality = modalityStated ?? 'small_molecule';
  const approach: DevelopmentApproach = approachStated ?? 'minimal';
  const productName = statedText('productName', params.productName) ?? 'the product';
  const regions = regionsStated ?? ['global'];
  const notes: string[] = [
    ...(modalityStated === undefined ? ['modality was not stated: the plan is for a small molecule.'] : []),
    ...(approachStated === undefined ? ['developmentApproach was not stated: the minimal approach is assumed.'] : []),
    ...(regionsStated === undefined ? ['marketedRegions was not stated: the plan is global.'] : []),
  ];
  const inputStates: Record<string, BooleanState> = {};
  const undecided: Undecided[] = [];

  const toolRecommendations: LifecycleToolRecommendation[] = objects('plannedChanges', params.plannedChanges).map(
    (pcIn: Record<string, unknown>, i: number): LifecycleToolRecommendation => {
      const at = `plannedChanges[${i}].`;
      const pc: PlannedChangeSummary = {
        changeArea: requiredOneOf(`${at}changeArea`, pcIn.changeArea, CHANGE_AREAS),
        description: statedText(`${at}description`, pcIn.description),
        expectedFrequency: statedOneOf(`${at}expectedFrequency`, pcIn.expectedFrequency, FREQUENCIES),
        magnitude: statedOneOf(`${at}magnitude`, pcIn.magnitude, MAGNITUDES),
        risk: readRisk(`${at}risk`, pcIn.risk),
      };
      Object.assign(inputStates, riskStates(`${at}risk`, pc.risk!));
      const classified = classifyPostApprovalChange({ changeArea: pc.changeArea, modality, magnitude: pc.magnitude, risk: pcIn.risk as ChangeRiskInputs });
      const profile = profileFor(pc.changeArea);
      const category = classified.undecided.find((u: Undecided) => u.conclusion === 'us.category');
      const categories = (category?.couldBe ?? [classified.us.category]) as UsReportingCategory[];
      const tools = [...new Set(categories.map((c: UsReportingCategory) => lifecycleToolFor(c, pc.changeArea, pc.expectedFrequency, approach)))];
      const tool: Q12Tool | null = tools.length === 1 ? tools[0] : null;
      for (const u of classified.undecided.filter((x: Undecided) => x.conclusion === 'us.category' || x.conclusion === 'eu.variationType')) {
        undecided.push({ ...u, conclusion: `toolRecommendations[${i}].${u.conclusion}`, decidingFacts: u.decidingFacts.map((f: string) => `${at}${f}`) });
      }
      if (tool === null) {
        undecided.push({ conclusion: `toolRecommendations[${i}].recommendedTool`, decidingFacts: category!.decidingFacts.map((f: string) => `${at}${f}`), couldBe: tools });
      }

      const rationale =
        tool === null
          ? `Not determined: the tool turns on the change's reporting category (${categories.join(' or ')}), which turns on ${listed(category!.decidingFacts.map((f: string) => `${at}${f}`))}, not stated.`
          : tool === 'PACMP / Comparability Protocol'
            ? 'A recurring/major comparability-sensitive change benefits from a pre-agreed PACMP to gain predictability and a reduced reporting category (ICH Q12 Section 4).'
            : tool === 'Design Space (ICH Q8)'
              ? 'An enhanced (QbD) process change may be managed within an approved design space, avoiding a submission for in-space movement (ICH Q8(R2)).'
              : tool === 'Annual Report category'
                ? 'A minor change is managed via the annual report category without a supplement (21 CFR 314.70(d)).'
                : 'A standard one-time change is best handled with a conventional supplement/variation.';

      return {
        changeArea: pc.changeArea,
        description: pc.description ?? profile.label,
        recommendedTool: tool,
        defaultUsCategory: classified.us.category,
        defaultEuType: classified.eu.variationType,
        rationale,
      };
    },
  );

  const pacmpCandidates: ChangeArea[] = Array.from(
    new Set(
      toolRecommendations
        .filter((t: LifecycleToolRecommendation) => t.recommendedTool === 'PACMP / Comparability Protocol')
        .map((t: LifecycleToolRecommendation) => t.changeArea),
    ),
  );

  // Change-history summary.
  const byCategory: Record<string, number> = {};
  const history = objects('changeHistory', params.changeHistory);
  history.forEach((h: Record<string, unknown>, i: number) => {
    const changeArea = requiredOneOf(`changeHistory[${i}].changeArea`, h.changeArea, CHANGE_AREAS);
    statedText(`changeHistory[${i}].description`, h.description);
    statedNumber(`changeHistory[${i}].yearImplemented`, h.yearImplemented, Number.isInteger, 'a whole year');
    const cat =
      statedOneOf(`changeHistory[${i}].reportedCategory`, h.reportedCategory, US_CATEGORIES) ??
      classifyPostApprovalChange({ changeArea, modality }).us.category ??
      'not determined';
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  });
  if (byCategory['not determined']) {
    notes.push(`${byCategory['not determined']} history change(s) with no reportedCategory are counted as not determined: their category turns on risk facts this planner does not take.`);
  }
  const totalHistory = history.length;

  const ecStrategy = {
    approachNote:
      approach === 'enhanced'
        ? 'Enhanced (QbD) development: define ECs at the parameter level with justified ranges and design spaces, enabling lower reporting categories for in-space changes (ICH Q12 Annex, ICH Q8).'
        : 'Minimal development: ECs default to fixed conditions; consider targeted enhanced characterization for elements where post-approval flexibility is valuable.',
    recommendation:
      'Explicitly propose ECs and their reporting categories in the dossier and capture them in the PLCM document so that future changes have a predictable regulatory pathway.',
  };

  const plcmDocumentPlan: PlcmSection[] = [
    { section: '1', title: 'Established Conditions table', contents: 'ECs for DS and DP with the reporting category for each potential change.' },
    { section: '2', title: 'Reporting category justifications', contents: 'Rationale (risk + development approach) for each proposed reporting category.' },
    { section: '3', title: 'Approved PACMPs / Comparability Protocols', contents: 'List of pre-agreed protocols and the reduced categories they enable.' },
    { section: '4', title: 'Post-approval CMC commitments', contents: 'Stability commitments, process validation stage-3 monitoring, and timelines.' },
    { section: '5', title: 'Change history', contents: 'Chronological log of implemented post-approval changes with categories.' },
  ];

  const integratedPlan: string[] = [
    `1. Establish the control strategy and CQAs for ${productName} (ICH Q8/Q9/Q10/Q11).`,
    '2. Define Established Conditions and their reporting categories; document them in the PLCM (ICH Q12 Section 3 & 5).',
    '3. For recurring or comparability-sensitive changes, prepare PACMPs/Comparability Protocols to lock in reduced reporting (ICH Q12 Section 4).',
    '4. For enhanced-development process changes, use design space to avoid submissions for in-space movement (ICH Q8).',
    '5. Route minor changes through the annual report; moderate/major changes through CBE-30/CBE-0/PAS (US) or Type IA/IB/II (EU).',
    '6. Maintain the PLCM document as a living record and keep it consistent across all marketed regions.',
  ];

  const regionNote = regions.includes('EU') || regions.includes('global')
    ? 'For EU-marketed products, map each US category to the corresponding variation type (IA/IB/II) and follow Reg (EC) 1234/2008 procedures and timelines.'
    : 'Product is US-focused; apply 21 CFR 314.70 / 601.12 categories.';
  integratedPlan.push(`7. ${regionNote}`);

  return {
    productName,
    modality,
    developmentApproach: approach,
    marketedRegions: regions,
    ecStrategy,
    toolRecommendations,
    pacmpCandidates,
    changeHistorySummary: {
      totalChanges: totalHistory,
      byCategory,
      note:
        totalHistory === 0
          ? 'No change history supplied; the PLCM change-history section will be initialized empty.'
          : 'Change history summarized by reporting category; use it to demonstrate a robust, well-managed PQS (ICH Q10).',
    },
    plcmDocumentPlan,
    integratedPlan,
    notes: [...notes, ...undecided.map((u: Undecided) => `${u.conclusion} not determined: ${listed(u.decidingFacts)} not stated (could be ${u.couldBe.join(' or ')}).`)],
    inputStates,
    undecided,
    citations: cite('ich_q12', 'ich_q12_ec', 'ich_q12_pacmp', 'ich_q12_plcm', 'ich_q8', 'ich_q9', 'ich_q10', 'ich_q11', 'cfr_314_70', 'eu_variations_reg'),
    provenance: provenance('planLifecycleManagement'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10 — Reference accessors (deterministic, no side effects)
// ─────────────────────────────────────────────────────────────────────────────

/** Return the full citation library (copy) for callers that need to enumerate it. */
export function listCitations(): RegulatoryCitation[] {
  return CITATIONS.map((c: CitationRecord) => ({ source: c.source, reference: c.reference, note: c.note }));
}

/** Return the change-area taxonomy (copy) for callers that need to enumerate it. */
export function listChangeAreas(): Array<{ area: ChangeArea; label: string; scope: string }> {
  return CHANGE_AREA_PROFILES.map((p: ChangeAreaProfile) => ({ area: p.area, label: p.label, scope: p.scope }));
}
