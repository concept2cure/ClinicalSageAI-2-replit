/**
 * Region-rules adapter — runs the region design-rule engine on the StudyDesign spine.
 *
 * `server/services/region-design-rules.ts` is a deterministic, unit-tested engine over
 * its own `RegionDesignInput` shape (7 agencies, ICH E5 / E17 / E14, post-Brexit UK,
 * Swiss and Brazilian local requirements, Project Orbis, the FDA diversity action
 * plan). Nothing in the platform produced that shape except one route body. This
 * module is the pure bridge: it maps the structured {@link StudyDesign} onto
 * `RegionDesignInput`, evaluates the engine, and returns the findings in this
 * directory's {@link DesignFinding} vocabulary.
 *
 * ## The honesty contract
 *
 * The design object does not carry everything the engine asks for. Every such field is
 * reported in `unmapped` with the reason it is absent, and is given the value that can
 * only make a rule report `attention` / `unmet` / not-applicable — never `met`.
 *
 * A pessimistic default is still an invented input, so a rule is only allowed to report
 * a verdict when that verdict is **invariant**: the adapter evaluates the engine across
 * every combination of the unrecorded fields, and reports a status only when all of
 * them agree. If any unrecorded field can move the rule, the rule is reported as
 * `not-assessed`, its detail names the field(s) responsible, and it is counted in
 * `notAssessed`. That is what makes "no rule passes because we invented its input" a
 * property of the construction rather than a claim.
 *
 * Agencies are derived from the design's own `targetRegions` and `framework.mrct.regions`
 * only. A design that records no region yields no agency and no finding — FDA is never
 * assumed.
 *
 * Pure and total: no I/O, no DB, no clock, no randomness. (The engine's
 * `RegionEvaluationResult.provenance` carries a wall-clock timestamp; this adapter
 * deliberately reads only `findings`, so its own output is byte-identical run to run.)
 *
 * @module server/services/study-design/region-rules-adapter
 */

import {
  evaluateRegionRules,
  listRegionRules,
  type Agency,
  type RegionDesignInput,
  type RegionFinding,
  type RegionRuleCatalogEntry,
  type RuleStatus,
} from '../region-design-rules';
import { type DesignFinding, type FindingSeverity } from './design-gates';
import { type RegulatoryStrategy, type StudyDesign, type StudyPhase } from './study-design-types';

// ─── Public shapes ───────────────────────────────────────────────────────────

/** A `RegionDesignInput` field the design does not carry, and why. */
export interface UnmappedRegionField {
  field: string;
  reason: string;
}

export interface DesignRegionMapping {
  input: RegionDesignInput;
  /** Fields the design does not carry, by RegionDesignInput field name, each with why it is absent. */
  unmapped: UnmappedRegionField[];
}

export interface DesignRegionEvaluation {
  agencies: Agency[];
  findings: DesignFinding[];
  unmapped: UnmappedRegionField[];
  /** Rules whose verdict depends on a field the design does not carry. */
  notAssessed: number;
}

/** The status a region finding carries, encoded in its `detail` lead clause. */
export type RegionFindingStatus = RuleStatus | 'not-assessed';

/** The section label every finding from this adapter carries. */
export const REGION_FINDING_SECTION = 'Region-specific design rules';

/**
 * Exhaustiveness pin: adding a field to `RegionDesignInput` fails to compile here until
 * the adapter either derives it or lists it in `unmapped`.
 */
const REGION_INPUT_FIELD_SET: Record<keyof RegionDesignInput, true> = {
  targetAgencies: true,
  phase: true,
  multiRegional: true,
  localRepresentation: true,
  ethnicSensitivityAssessed: true,
  regionalConsistencyPlan: true,
  thoroughQt: true,
  qtInRegionalPopulation: true,
  diversityPlan: true,
  localSponsorRepresentative: true,
  usesReliancePathway: true,
  oncology: true,
};

/** Every field of `RegionDesignInput`. */
export const REGION_INPUT_FIELDS = Object.keys(REGION_INPUT_FIELD_SET).sort() as Array<
  keyof RegionDesignInput
>;

/** The fields this adapter can derive from a `StudyDesign` at all. */
export const DERIVED_REGION_INPUT_FIELDS: ReadonlyArray<keyof RegionDesignInput> = [
  'targetAgencies',
  'phase',
  'multiRegional',
  'regionalConsistencyPlan',
  'localRepresentation',
];

// ─── Region → agency ─────────────────────────────────────────────────────────

const AGENCY_ORDER: readonly Agency[] = [
  'FDA', 'EMA', 'PMDA', 'MHRA', 'NMPA', 'Swissmedic', 'ANVISA',
];

/**
 * Region strings (as they appear in `StudyDesign.targetRegions`) that name each agency's
 * territory. EU member states map to EMA; this list mirrors the one the registration
 * projection uses for CTIS member states, extended with the union itself.
 */
const REGION_ALIASES: Record<Agency, readonly string[]> = {
  FDA: ['united states', 'united states of america', 'usa', 'us'],
  EMA: [
    'european union', 'eu', 'eea', 'european economic area',
    'austria', 'at', 'belgium', 'be', 'bulgaria', 'bg', 'croatia', 'hr', 'cyprus', 'cy',
    'czechia', 'czech republic', 'cz', 'denmark', 'dk', 'estonia', 'ee', 'finland', 'fi',
    'france', 'fr', 'germany', 'de', 'greece', 'gr', 'el', 'hungary', 'hu', 'ireland', 'ie',
    'italy', 'it', 'latvia', 'lv', 'lithuania', 'lt', 'luxembourg', 'lu', 'malta', 'mt',
    'netherlands', 'nl', 'poland', 'pl', 'portugal', 'pt', 'romania', 'ro', 'slovakia', 'sk',
    'slovenia', 'si', 'spain', 'es', 'sweden', 'se',
  ],
  PMDA: ['japan', 'jp'],
  MHRA: [
    'united kingdom', 'uk', 'gb', 'great britain', 'england', 'scotland', 'wales',
    'northern ireland',
  ],
  NMPA: ['china', 'cn', 'mainland china', "people's republic of china", 'prc'],
  Swissmedic: ['switzerland', 'ch', 'swiss'],
  ANVISA: ['brazil', 'brasil', 'br'],
};

const REGION_TO_AGENCY: ReadonlyMap<string, Agency> = new Map(
  AGENCY_ORDER.flatMap(agency => REGION_ALIASES[agency].map(alias => [alias, agency] as const)),
);

function normalizeRegion(region: string): string {
  return region.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
}

/** The agency that regulates a region string, or null when the engine covers no such agency. */
export function regionToAgency(region: string): Agency | null {
  return REGION_TO_AGENCY.get(normalizeRegion(region)) ?? null;
}

function orderAgencies(found: Set<Agency>): Agency[] {
  return AGENCY_ORDER.filter(a => found.has(a));
}

function designRegions(design: StudyDesign): string[] {
  return [...(design.targetRegions ?? []), ...(design.framework?.mrct?.regions ?? [])].filter(
    r => typeof r === 'string' && r.trim().length > 0,
  );
}

function deriveAgencies(regions: string[]): { agencies: Agency[]; unrecognized: string[] } {
  const found = new Set<Agency>();
  const unrecognized: string[] = [];
  const seen = new Set<string>();
  for (const region of regions) {
    const agency = regionToAgency(region);
    if (agency) {
      found.add(agency);
      continue;
    }
    const key = normalizeRegion(region);
    if (seen.has(key)) continue;
    seen.add(key);
    unrecognized.push(region.trim());
  }
  return { agencies: orderAgencies(found), unrecognized };
}

function mrctAgencies(design: StudyDesign): Agency[] {
  const found = new Set<Agency>();
  for (const region of design.framework?.mrct?.regions ?? []) {
    const agency = regionToAgency(region);
    if (agency) found.add(agency);
  }
  return orderAgencies(found);
}

// ─── Field mapping ───────────────────────────────────────────────────────────

/**
 * The engine's phase vocabulary is `1 | 2 | 3 | 4`; the design carries the finer
 * ICH/registry vocabulary. Sub-phases collapse onto their family (FIH and 1b are phase 1
 * trials, 3b is a phase 3 trial). The only rule that reads phase is FDA-DIVERSITY, which
 * can then apply to a 3b design; it is reported as not-assessed either way because the
 * design carries no diversity plan.
 */
function mapPhase(phase: StudyPhase): RegionDesignInput['phase'] {
  switch (phase) {
    case 'FIH':
    case '1':
    case '1b':
      return '1';
    case '2':
    case '2b':
      return '2';
    case '3':
    case '3b':
      return '3';
    default:
      return '4';
  }
}

function representationOf(agencies: Agency[]): RegionDesignInput['localRepresentation'] {
  const out: NonNullable<RegionDesignInput['localRepresentation']> = {};
  for (const agency of agencies) out[agency] = { included: true };
  return out;
}

function flagsOf(agencies: Agency[], value: boolean): Partial<Record<Agency, boolean>> {
  const out: Partial<Record<Agency, boolean>> = {};
  for (const agency of agencies) out[agency] = value;
  return out;
}

// ─── The unmapped ledger ─────────────────────────────────────────────────────

const NO_REGIONS_REASON =
  'the design records no target regions: StudyDesign.targetRegions and ' +
  'framework.mrct.regions are both empty, so no agency can be derived. No rule is ' +
  'evaluated and no agency is assumed — in particular FDA is not assumed.';

const NO_KNOWN_REGION_REASON =
  'the design records no target region that maps to an agency the region-rule engine ' +
  'covers (FDA, EMA, PMDA, MHRA, NMPA, Swissmedic, ANVISA). No agency is derived and ' +
  'FDA is not assumed.';

/**
 * Gaps that exist only while `design.regulatoryStrategy` does not record the
 * field. Added 2026-09-22: these were unconditional, because StudyDesign had
 * no node for any of them. It now does, so each gap is reported only when the
 * design is actually silent — and a design that records the field gets a rule
 * it can decide instead of a not-assessed.
 *
 * `localRepresentation.fraction` stays unconditional: it is a per-region
 * sample-size allocation, which is design structure rather than strategy, and
 * nothing carries it yet.
 */
const ALWAYS_GAPS: readonly UnmappedRegionField[] = [
  {
    field: 'localRepresentation.fraction',
    reason:
      'StudyDesign records no per-region sample-size allocation: framework.mrct.poolingStrategy ' +
      'is free text and StatisticalPlan.plannedSampleSize is a single total. Left undefined; no ' +
      'rule reads the fraction today, but an ICH E17 allocation threshold could not be evaluated.',
  },
];

const STRATEGY_GAPS: readonly UnmappedRegionField[] = [
  {
    field: 'ethnicSensitivityAssessed',
    reason:
      'StudyDesign has no ICH E5 intrinsic/extrinsic ethnic-factor assessment node; ' +
      'EvidenceRef.source is free text and cannot be read as a verdict. Sent as false, which can ' +
      'only make PMDA-E5-BRIDGING and NMPA-ETHNIC report attention/unmet, never met — and both ' +
      'are returned as not-assessed because the field can move them.',
  },
  {
    field: 'thoroughQt',
    reason:
      'StudyDesign records endpoints and a Schedule of Activities but carries no thorough-QT/QTc ' +
      'flag; inferring one from endpoint free text would be a guess. Sent as false, which makes ' +
      'REGIONAL-QT not apply rather than pass; it is returned as not-assessed when PMDA or NMPA ' +
      'is targeted.',
  },
  {
    field: 'qtInRegionalPopulation',
    reason:
      'StudyDesign carries no per-region assessment population (the SoA has no region dimension). ' +
      'Sent as false, so REGIONAL-QT can only reach attention, never met.',
  },
  {
    field: 'diversityPlan',
    reason:
      'StudyDesign has no enrollment-goal node for demographic subgroups (FDA diversity action ' +
      'plan / FDORA §3601); Population.targetDescription and eligibility text are not enrollment ' +
      'goals. Sent as false, so FDA-DIVERSITY can only reach unmet, never met.',
  },
  {
    field: 'localSponsorRepresentative',
    reason:
      'StudyDesign carries no sponsor and no local legal-representative data of any kind — that ' +
      'belongs to the submission plan, not the design. Sent as {}, so ANVISA-LOCAL can only reach ' +
      'unmet, never met.',
  },
  {
    field: 'usesReliancePathway',
    reason:
      'StudyDesign records no submission or reliance strategy (Access Consortium, Project Orbis); ' +
      'that is a submission-plan attribute. Sent as false, so MHRA-POST-BREXIT, ' +
      'SWISSMEDIC-SEPARATE and ORBIS-ELIGIBILITY can only reach attention, never met.',
  },
  {
    field: 'oncology',
    reason:
      'StudyDesign.indication is free text with no coded therapeutic area, and keyword-matching ' +
      'it would be a guess. Sent as false, so ORBIS-ELIGIBILITY does not apply; it is returned as ' +
      'not-assessed when two or more Project Orbis partner agencies are targeted.',
  },
];

/** Gaps that exist only while `framework.mrct` is absent from the design. */
const MRCT_GAPS: readonly UnmappedRegionField[] = [
  {
    field: 'multiRegional',
    reason:
      'framework.mrct is absent, so the design does not state whether this is one multi-regional ' +
      'trial (several target regions may equally be separate trials). Sent as false; the ICH E17 ' +
      'rules are returned as not-assessed rather than silently skipped. Maps from ' +
      'framework.mrct.regions.length >= 2 once the MRCT block is recorded.',
  },
  {
    field: 'localRepresentation',
    reason:
      'framework.mrct.regions is absent, so no region can be shown to enrol subjects; ' +
      'targetRegions names intended markets, not enrolling regions, and is deliberately not read ' +
      'as representation. Sent as {}, so PMDA-E5-BRIDGING, PMDA-E17-MRCT and NMPA-LOCAL-DATA can ' +
      'only reach unmet, never met.',
  },
  {
    field: 'regionalConsistencyPlan',
    reason:
      'framework.mrct is absent, so no ICH E17 consistency approach is recorded. Sent as false, ' +
      'so the E17 rules cannot reach met. Maps from framework.mrct.consistencyApproach once the ' +
      'MRCT block is recorded.',
  },
];


// ─── Recorded regulatory strategy ────────────────────────────────────────────

/**
 * The strategy fields this adapter reads, as a `Record<keyof
 * RegulatoryStrategy, true>` rather than a list.
 *
 * The type is the contract. A field added to `RegulatoryStrategy` will not
 * compile until it is named here, and one removed from this object will not
 * compile either. A plain array was the first attempt and it was vacuous: the
 * test that walks it to check the ledger gets WEAKER when the array shrinks,
 * so deleting an entry passed. Proved by deleting one.
 */
const STRATEGY_FIELD_SET: Record<keyof RegulatoryStrategy, true> = {
  ethnicSensitivityAssessed: true,
  thoroughQt: true,
  qtInRegionalPopulation: true,
  diversityPlan: true,
  localSponsorRepresentative: true,
  usesReliancePathway: true,
  oncology: true,
};

export const STRATEGY_FIELDS = Object.keys(STRATEGY_FIELD_SET).sort() as Array<keyof RegulatoryStrategy>;

type StrategyField = keyof RegulatoryStrategy;

/**
 * Whether the design records this field at all.
 *
 * Absence is the whole point: `undefined` means nobody stated it, and the rule
 * that reads it stays not-assessed. A recorded `false` IS a statement and the
 * rule is decided on it. Collapsing the two would turn every unfilled design
 * into a design that has declared "no" to everything.
 */
function records(design: StudyDesign, field: StrategyField): boolean {
  const v = design.regulatoryStrategy?.[field];
  if (field === 'localSponsorRepresentative') {
    return v !== undefined && v !== null && Object.keys(v as Record<string, boolean>).length > 0;
  }
  return typeof v === 'boolean';
}

function recordedBool(design: StudyDesign, field: StrategyField): boolean {
  return design.regulatoryStrategy?.[field] === true;
}

/** The agencies for which a local legal representative is recorded as appointed. */
function recordedRepresentatives(design: StudyDesign, agencies: Agency[]): Partial<Record<Agency, boolean>> {
  const recorded = design.regulatoryStrategy?.localSponsorRepresentative ?? {};
  const out: Partial<Record<Agency, boolean>> = {};
  for (const a of agencies) out[a] = recorded[a] === true;
  return out;
}

function unmappedLedger(design: StudyDesign, agencies: Agency[], hadRegions: boolean): UnmappedRegionField[] {
  const ledger: UnmappedRegionField[] = [];
  if (agencies.length === 0) {
    ledger.push({
      field: 'targetAgencies',
      reason: hadRegions ? NO_KNOWN_REGION_REASON : NO_REGIONS_REASON,
    });
  }
  if (!design.framework?.mrct) ledger.push(...MRCT_GAPS);
  ledger.push(...ALWAYS_GAPS);
  /* Only report a strategy gap the design is actually silent about. A design
     that records the field closes the gap and the rule becomes decidable. */
  ledger.push(...STRATEGY_GAPS.filter((g) => !records(design, g.field as StrategyField)));
  return ledger;
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

/**
 * Map a {@link StudyDesign} onto the region engine's input, with an explicit ledger of
 * the fields the design does not carry. Pure.
 */
export function studyDesignToRegionInput(design: StudyDesign): DesignRegionMapping {
  const regions = designRegions(design);
  const { agencies } = deriveAgencies(regions);
  const mrct = design.framework?.mrct;

  const input: RegionDesignInput = {
    targetAgencies: agencies,
    phase: mapPhase(design.phase),
    multiRegional: (mrct?.regions?.length ?? 0) >= 2,
    localRepresentation: representationOf(mrctAgencies(design)),
    regionalConsistencyPlan: Boolean(mrct?.consistencyApproach?.trim()),
    /* Recorded where the design states them; otherwise the pessimistic
       default, which is belt-and-braces only — what actually protects the
       result is the invariance sweep below, which returns not-assessed for any
       rule an unrecorded field could move. */
    ethnicSensitivityAssessed: recordedBool(design, 'ethnicSensitivityAssessed'),
    thoroughQt: recordedBool(design, 'thoroughQt'),
    qtInRegionalPopulation: recordedBool(design, 'qtInRegionalPopulation'),
    diversityPlan: recordedBool(design, 'diversityPlan'),
    localSponsorRepresentative: records(design, 'localSponsorRepresentative')
      ? recordedRepresentatives(design, agencies)
      : {},
    usesReliancePathway: recordedBool(design, 'usesReliancePathway'),
    oncology: recordedBool(design, 'oncology'),
  };

  return { input, unmapped: unmappedLedger(design, agencies, regions.length > 0) };
}

// ─── Unrecorded fields, enumerated ───────────────────────────────────────────

/** An unrecorded field, with the two inputs it could have produced. */
interface UnknownField {
  field: string;
  set(input: RegionDesignInput, value: boolean): RegionDesignInput;
}

function unknownFields(design: StudyDesign, agencies: Agency[]): UnknownField[] {
  /* Only the fields the design does NOT record go into the sweep. A recorded
     field is a fact, so its rule is decided rather than returned
     not-assessed — which is the entire point of design.regulatoryStrategy. */
  const candidates: UnknownField[] = [
    { field: 'ethnicSensitivityAssessed', set: (i, v) => ({ ...i, ethnicSensitivityAssessed: v }) },
    { field: 'thoroughQt', set: (i, v) => ({ ...i, thoroughQt: v }) },
    { field: 'qtInRegionalPopulation', set: (i, v) => ({ ...i, qtInRegionalPopulation: v }) },
    { field: 'diversityPlan', set: (i, v) => ({ ...i, diversityPlan: v }) },
    { field: 'usesReliancePathway', set: (i, v) => ({ ...i, usesReliancePathway: v }) },
    { field: 'oncology', set: (i, v) => ({ ...i, oncology: v }) },
    {
      field: 'localSponsorRepresentative',
      set: (i, v) => ({ ...i, localSponsorRepresentative: flagsOf(agencies, v) }),
    },
  ];
  const unknowns: UnknownField[] = candidates.filter((c) => !records(design, c.field as StrategyField));
  if (design.framework?.mrct) return unknowns;
  unknowns.push(
    { field: 'multiRegional', set: (i, v) => ({ ...i, multiRegional: v }) },
    { field: 'regionalConsistencyPlan', set: (i, v) => ({ ...i, regionalConsistencyPlan: v }) },
    {
      field: 'localRepresentation',
      set: (i, v) => ({ ...i, localRepresentation: v ? representationOf(agencies) : {} }),
    },
  );
  return unknowns;
}

/** Every assignment of the unrecorded fields, indexed by bitmask over `unknowns`. */
function variantInputs(base: RegionDesignInput, unknowns: UnknownField[]): RegionDesignInput[] {
  const variants: RegionDesignInput[] = [];
  for (let mask = 0; mask < 1 << unknowns.length; mask += 1) {
    let input = base;
    unknowns.forEach((unknown, bit) => {
      input = unknown.set(input, (mask & (1 << bit)) !== 0);
    });
    variants.push(input);
  }
  return variants;
}

/** The outcome of one rule under one assignment: its finding, or null when it did not apply. */
interface RuleOutcome {
  key: string;
  finding: RegionFinding | null;
}

const NOT_APPLICABLE_KEY = '\u0000did-not-apply';

function outcomeKey(finding: RegionFinding): string {
  return [finding.status, finding.severity, finding.message, finding.recommendation].join('\u0000');
}

function outcomesByRule(variants: RegionDesignInput[], ruleIds: string[]): Map<string, RuleOutcome[]> {
  const outcomes = new Map<string, RuleOutcome[]>(ruleIds.map(id => [id, []]));
  for (const variant of variants) {
    const byRule = new Map(evaluateRegionRules(variant).findings.map(f => [f.ruleId, f] as const));
    for (const id of ruleIds) {
      const finding = byRule.get(id) ?? null;
      outcomes.get(id)!.push({ key: finding ? outcomeKey(finding) : NOT_APPLICABLE_KEY, finding });
    }
  }
  return outcomes;
}

/** The unrecorded fields that can change this rule's outcome, in declaration order. */
function fieldsMoving(outcomes: RuleOutcome[], unknowns: UnknownField[]): string[] {
  return unknowns
    .filter((_unknown, bit) =>
      outcomes.some((outcome, mask) => outcome.key !== outcomes[mask ^ (1 << bit)].key),
    )
    .map(u => u.field);
}

// ─── Finding translation ─────────────────────────────────────────────────────

const STATUS_PATTERN = /^Status: (met|unmet|attention|not-applicable|not-assessed)\./;

/** The status encoded in a region finding produced by this adapter, or null. */
export function regionFindingStatus(finding: DesignFinding): RegionFindingStatus | null {
  const matched = STATUS_PATTERN.exec(finding.detail);
  return matched ? (matched[1] as RegionFindingStatus) : null;
}

function severityOf(finding: RegionFinding): FindingSeverity {
  if (finding.status === 'met' || finding.status === 'not-applicable') return 'info';
  if (finding.severity === 'error') return 'critical';
  if (finding.severity === 'warning') return 'major';
  return 'minor';
}

function toDesignFinding(finding: RegionFinding): DesignFinding {
  return {
    code: `RGN-${finding.ruleId}`,
    section: REGION_FINDING_SECTION,
    severity: severityOf(finding),
    standard: finding.guidance.source,
    title: `${finding.agency} · ${finding.title}`,
    detail:
      `Status: ${finding.status}. ${finding.message} ` +
      `Guidance: ${finding.guidance.reference}. ${finding.guidance.note}`,
    suggestedFix: finding.recommendation.length > 0 ? finding.recommendation : undefined,
  };
}

function notAssessedFinding(entry: RegionRuleCatalogEntry, fields: string[]): DesignFinding {
  const named = fields.join(', ');
  return {
    code: `RGN-${entry.id}`,
    section: REGION_FINDING_SECTION,
    severity: entry.defaultSeverity === 'info' ? 'info' : 'minor',
    standard: entry.guidance.source,
    title: `${entry.agency} · ${entry.title}`,
    detail:
      `Status: not-assessed. The verdict depends on ${named}, which the StudyDesign object does ` +
      'not carry, so no verdict is asserted for this rule. ' +
      `Guidance: ${entry.guidance.reference}. ${entry.guidance.note}`,
    suggestedFix:
      `Record ${named} on the design (or evaluate this rule through the region engine directly ` +
      'with that value supplied) so the rule can be assessed.',
  };
}

function unrecognizedRegionFinding(regions: string[]): DesignFinding {
  return {
    code: 'RGN-001',
    section: REGION_FINDING_SECTION,
    severity: 'minor',
    title: 'Target region outside the region-rule catalog',
    detail:
      `Status: not-applicable. Target region(s) ${regions.join(', ')} map to none of the ` +
      'agencies the region-rule engine covers (FDA, EMA, PMDA, MHRA, NMPA, Swissmedic, ANVISA), ' +
      'so no region rule was evaluated for them.',
    suggestedFix:
      'Use a region name the engine recognizes, or extend the region-rule catalog to cover that ' +
      'agency; do not read the absence of findings as clearance for that region.',
  };
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

function assemble(
  outcomes: Map<string, RuleOutcome[]>,
  unknowns: UnknownField[],
): { findings: DesignFinding[]; notAssessed: number } {
  const findings: DesignFinding[] = [];
  let notAssessed = 0;
  for (const entry of listRegionRules()) {
    const ruleOutcomes = outcomes.get(entry.id) ?? [];
    const distinct = new Set(ruleOutcomes.map(o => o.key));
    if (distinct.size === 1) {
      const finding = ruleOutcomes[0]?.finding;
      if (finding) findings.push(toDesignFinding(finding));
      continue;
    }
    findings.push(notAssessedFinding(entry, fieldsMoving(ruleOutcomes, unknowns)));
    notAssessed += 1;
  }
  return { findings, notAssessed };
}

/**
 * Evaluate a {@link StudyDesign} against the region design rules for the agencies its own
 * regions imply. Deterministic and side-effect free.
 *
 * A rule is reported with a status only when that status holds under every assignment of
 * the fields the design does not carry; otherwise it is reported as not-assessed and
 * counted in `notAssessed`. A design that records no region yields no agency and no rule
 * finding.
 */
export function evaluateDesignRegionRules(design: StudyDesign): DesignRegionEvaluation {
  const { input, unmapped } = studyDesignToRegionInput(design);
  const { agencies, unrecognized } = deriveAgencies(designRegions(design));
  const findings: DesignFinding[] = unrecognized.length > 0 ? [unrecognizedRegionFinding(unrecognized)] : [];

  if (agencies.length === 0) {
    return { agencies, findings, unmapped, notAssessed: 0 };
  }

  const unknowns = unknownFields(design, agencies);
  const ruleIds = listRegionRules().map(r => r.id);
  const outcomes = outcomesByRule(variantInputs(input, unknowns), ruleIds);
  const assembled = assemble(outcomes, unknowns);

  return {
    agencies,
    findings: [...findings, ...assembled.findings],
    unmapped,
    notAssessed: assembled.notAssessed,
  };
}
