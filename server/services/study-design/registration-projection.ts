/**
 * Registration projection — the design object rendered as a trial-registry record (module spec §8).
 *
 * A registry record (ClinicalTrials.gov under FDAAA 801, or the EU CTIS under Regulation
 * 536/2014) is another *projection* of the structured design: the scientific content —
 * phase, design, arms, interventions, conditions, outcome measures, eligibility, enrollment —
 * is the same object the protocol and SAP render from, so the registration cannot disagree
 * with the protocol. Honest by construction: a field the design object does not carry
 * (sponsor, recruitment status, dates, EU member states) is reported as a gap, never invented.
 * The mappings (phase, masking, allocation, intervention model, arm type) are deterministic.
 *
 * ELIGIBILITY comes from `eligibility-model.ts`. `projectRegistryEligibility` reads the
 * criteria as data, and this projection renders exactly what it returns:
 *
 *   - Age limits are rendered ONLY from inclusion `age` criteria, carrying the criterion's own
 *     unit and its inclusive/exclusive sense. Criteria written in mixed time units yield NO age
 *     limit — nothing is converted, rounded, or picked — and the field says so.
 *   - `Sex / gender` and `Accepts healthy volunteers` are facts a caller records; no criterion
 *     text carries either, and `StudyDesign.population` has no field for them, so both remain
 *     gaps that now NAME the field which would close them.
 *   - Every criterion appears in the record. The ones the grammar can read carry their
 *     structure on `RegistrationField.eligibility`; the ones it refuses carry their verbatim
 *     text and a machine-readable reason. A registry record that quietly dropped the criteria
 *     the parser cannot read would be worse than the joined string it replaces.
 *
 * Nothing is defaulted: this projection never emits "18 Years" because most trials use it.
 *
 * Pure: no DB, RNG, clock or LLM.
 *
 * @module server/services/study-design/registration-projection
 */

import type {
  Arm,
  BlindingLevel,
  Endpoint,
  StructuralDesign,
  StudyDesign,
  StudyPhase,
} from './study-design-types';
import { endpointTimeFrameFromSoa } from './schedule-of-activities';
import {
  projectRegistryEligibility,
  type RegistryAgeLimit,
  type RegistryEligibilityBlock,
  type RegistryEligibilityRow,
} from './eligibility-model';

export type RegistrationRegistry = 'ClinicalTrials.gov' | 'EU CTIS';
export type RegistrationFieldStatus = 'rendered' | 'partial' | 'missing';

/**
 * The structured reading behind a criteria field, from `eligibility-model.ts`.
 *
 * `criteria` carries EVERY criterion the field renders, in the design's own order: a
 * criterion the grammar could read carries its structure, one it refused carries its verbatim
 * `text` and a `free_text` structure naming the reason. `value` and `criteria` therefore
 * describe the same set — a consumer can use whichever it can, and neither loses a criterion.
 */
export interface RegistrationEligibilityStructure {
  criteria: RegistryEligibilityRow[];
  /** How many of `criteria` the grammar read as a constraint. */
  structured: number;
  /** How many it refused. These are present in `criteria` and in `value`, never dropped. */
  unstructured: number;
  /** The registry basis the eligibility engine projects against. */
  basis: string;
}

export interface RegistrationField {
  /** Registry field name, e.g. "Primary Outcome Measure". */
  name: string;
  /** Rendered value (sentence case), or null when the object is silent. */
  value: string | null;
  status: RegistrationFieldStatus;
  /** Whether the registry requires this field for a valid record. */
  required: boolean;
  /** What is missing, when status is not 'rendered'. */
  gap?: string;
  /** Present on criteria fields only: the same criteria as data. Never a different set. */
  eligibility?: RegistrationEligibilityStructure;
}

export interface RegistrationModule {
  name: string;
  fields: RegistrationField[];
}

export interface RegistrationRecord {
  registry: RegistrationRegistry;
  /** The legal/registry basis the projection follows. */
  standard: string;
  modules: RegistrationModule[];
  /** Required fields the design cannot fill, worst-first (required-missing only). */
  gaps: string[];
  completeness: {
    requiredRendered: number;
    requiredTotal: number;
    /**
     * required-rendered / required-total, as a percent. NULL when no required
     * fields exist — there is then no ratio and no assessment.
     */
    percent: number | null;
  };
  /** True only when every required field is rendered — the record is ready to submit. */
  registrable: boolean;
  /** Honesty marker: a deterministic projection, not generated content. */
  projectedFromObject: true;
}

// ─── Deterministic mappings ────────────────────────────────────────────────────

const CTGOV_PHASE: Record<StudyPhase, string> = {
  FIH: 'Phase 1',
  '1': 'Phase 1',
  '1b': 'Phase 1',
  '2': 'Phase 2',
  '2b': 'Phase 2',
  '3': 'Phase 3',
  '3b': 'Phase 3',
  '4': 'Phase 4',
};

const CTIS_PHASE: Record<StudyPhase, string> = {
  FIH: 'Human pharmacology (Phase I)',
  '1': 'Human pharmacology (Phase I)',
  '1b': 'Human pharmacology (Phase I)',
  '2': 'Therapeutic exploratory (Phase II)',
  '2b': 'Therapeutic exploratory (Phase II)',
  '3': 'Therapeutic confirmatory (Phase III)',
  '3b': 'Therapeutic confirmatory (Phase III)',
  '4': 'Therapeutic use (Phase IV)',
};

const CTGOV_MASKING: Record<BlindingLevel, string> = {
  open: 'None (open label)',
  single: 'Single',
  double: 'Double',
  triple: 'Triple',
};

const PRODUCT_TO_CTGOV_INTERVENTION: Record<string, string> = {
  drug: 'Drug',
  biologic: 'Biological',
  device: 'Device',
  ivd: 'Diagnostic test',
  combination: 'Combination product',
};

/** EU member states (and common synonyms / ISO-2 codes), lowercased, for CTIS scoping. */
const EU_MEMBER_STATES = new Set<string>([
  'austria', 'at', 'belgium', 'be', 'bulgaria', 'bg', 'croatia', 'hr', 'cyprus', 'cy',
  'czechia', 'czech republic', 'cz', 'denmark', 'dk', 'estonia', 'ee', 'finland', 'fi',
  'france', 'fr', 'germany', 'de', 'greece', 'gr', 'el', 'hungary', 'hu', 'ireland', 'ie',
  'italy', 'it', 'latvia', 'lv', 'lithuania', 'lt', 'luxembourg', 'lu', 'malta', 'mt',
  'netherlands', 'nl', 'poland', 'pl', 'portugal', 'pt', 'romania', 'ro', 'slovakia', 'sk',
  'slovenia', 'si', 'spain', 'es', 'sweden', 'se',
]);

function ctgovInterventionModel(d: StructuralDesign): string {
  switch (d) {
    case 'single_arm':
      return 'Single group assignment';
    case 'crossover':
      return 'Crossover assignment';
    case 'factorial':
      return 'Factorial assignment';
    default:
      return 'Parallel assignment';
  }
}

function ctgovArmType(arm: Arm): string {
  const roles = new Set((arm.interventions ?? []).map(i => i.role));
  if (roles.has('placebo')) return 'Placebo comparator';
  if (roles.has('investigational') || roles.has('device')) return 'Experimental';
  if (roles.has('comparator') || roles.has('standard_of_care')) return 'Active comparator';
  return 'Experimental';
}

// ─── Shared projections of the design ───────────────────────────────────────────

function present(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

/** All distinct interventions across the arms, with a registry intervention type. */
function interventionLines(design: StudyDesign): { line: string; typed: boolean } {
  const productType = design.productType;
  const ctgovType = productType ? PRODUCT_TO_CTGOV_INTERVENTION[productType] : undefined;
  const seen = new Set<string>();
  const names: string[] = [];
  for (const arm of design.arms ?? []) {
    for (const i of arm.interventions ?? []) {
      if (seen.has(i.name)) continue;
      seen.add(i.name);
      const role = i.role.replace(/_/g, ' ');
      const type = i.role === 'placebo' ? 'Drug' : ctgovType;
      names.push(type ? `${i.name} (${type}, ${role})` : `${i.name} (${role})`);
    }
  }
  return { line: names.join('; '), typed: Boolean(ctgovType) };
}

/** Outcome-measure rendering for endpoints of the given roles. */
function outcomeMeasures(design: StudyDesign, roles: Endpoint['role'][]): {
  value: string | null;
  missingTimeFrame: string[];
} {
  const eps = (design.endpoints ?? []).filter(e => roles.includes(e.role));
  if (eps.length === 0) return { value: null, missingTimeFrame: [] };
  const missingTimeFrame: string[] = [];
  const parts = eps.map(e => {
    const def = present(e.definition) ? e.definition : e.name;
    // The endpoint's own timepoint wins; otherwise derive it from the schedule it is collected at.
    const timeFrame = present(e.timepoint) ? e.timepoint : endpointTimeFrameFromSoa(design, e.name);
    if (timeFrame) return `${e.name}: ${def} (time frame: ${timeFrame})`;
    missingTimeFrame.push(e.name);
    return `${e.name}: ${def}`;
  });
  return { value: parts.join('; '), missingTimeFrame };
}

// ─── Eligibility, read as data by eligibility-model.ts ──────────────────────────

/**
 * Why `Sex / gender` and `Accepts healthy volunteers` are STILL gaps, and what would close
 * them. `projectRegistryEligibility` returns both null unless a CALLER records them: no
 * criterion text carries either fact, and reading one out of wording ("female subjects") is
 * exactly the guess `eligibility-model.ts` refuses. `StudyDesign.population`
 * (study-design-types.ts) declares no field for either, so there is nothing to record and
 * nothing to pass — and a `recorded` argument threaded through here that no caller could ever
 * fill would be the unreachable path this wiring exists to remove. The gap now names the
 * field that would settle it instead.
 */
const SEX_SETTLED_BY =
  'A `sex` recorded on StudyDesign.population, passed to projectRegistryEligibility as EligibilityRecordedFacts.sex, would settle it; Population declares no such field today.';
const HEALTHY_VOLUNTEERS_SETTLED_BY =
  'A `healthyVolunteers` recorded on StudyDesign.population, passed to projectRegistryEligibility as EligibilityRecordedFacts.healthyVolunteers, would settle it; Population declares no such field today.';

/** The engine's own reason for a field it did not emit, or `fallback` if it named none. */
function absentReason(block: RegistryEligibilityBlock, fieldName: string, fallback: string): string {
  return block.absent.find(a => a.field === fieldName)?.reason ?? fallback;
}

function criteriaRows(block: RegistryEligibilityBlock, type: 'inclusion' | 'exclusion'): RegistryEligibilityRow[] {
  return block.criteria.filter(r => r.type === type);
}

/** Every criterion's verbatim text, parsed or not. A criterion is never dropped for being unreadable. */
function criteriaText(rows: RegistryEligibilityRow[]): string | null {
  const texts = rows.map(r => r.text).filter(present);
  return texts.length ? texts.join('; ') : null;
}

function structureOf(rows: RegistryEligibilityRow[], basis: string): RegistrationEligibilityStructure {
  const structured = rows.filter(r => r.structure.kind !== 'free_text').length;
  return { criteria: rows, structured, unstructured: rows.length - structured, basis };
}

/** Attach the same criteria as data. The rendered value and the structure are one set. */
function withCriteria(f: RegistrationField, rows: RegistryEligibilityRow[], basis: string): RegistrationField {
  return { ...f, eligibility: structureOf(rows, basis) };
}

const AGE_BOUND_WORD: Record<'minimum' | 'maximum', string> = { minimum: 'above', maximum: 'below' };

/** The bound in the criterion's OWN unit, keeping its inclusive/exclusive sense. Nothing is converted. */
function ageBoundText(limit: RegistryAgeLimit, bound: 'minimum' | 'maximum'): string {
  return limit.inclusive ? `${limit.value} ${limit.unit}` : `${AGE_BOUND_WORD[bound]} ${limit.value} ${limit.unit}`;
}

/**
 * Age limits, rendered only from what the engine actually derived. A bound it did not derive
 * — because no inclusion criterion states one, or because the age criteria mix time units —
 * stays missing and carries the engine's own reason. Half the field is `partial`, not a
 * rendered field with a guessed other half.
 */
function ageLimitsField(block: RegistryEligibilityBlock): RegistrationField {
  const rendered: string[] = [];
  const missing: string[] = [];
  if (block.minimumAge) rendered.push(`Minimum age: ${ageBoundText(block.minimumAge, 'minimum')}`);
  else missing.push(absentReason(block, 'Minimum age', 'No inclusion criterion states a lower age bound.'));
  if (block.maximumAge) rendered.push(`Maximum age: ${ageBoundText(block.maximumAge, 'maximum')}`);
  else missing.push(absentReason(block, 'Maximum age', 'No inclusion criterion states an upper age bound.'));

  // Both bounds can be absent for ONE reason (mixed time units); say it once.
  const why = [...new Set(missing)].join(' ');
  if (rendered.length === 0) return gap('Age limits', true, why);
  if (missing.length > 0) return partial('Age limits', rendered.join('; '), true, why);
  return field('Age limits', rendered.join('; '), true);
}

/**
 * The EU CTIS population module. CTIS renders inclusion and exclusion as two fields, so each
 * carries its own half of the same block — and, like the ClinicalTrials.gov module, every
 * criterion appears whether or not the grammar could read it.
 *
 * CTIS gets no age / sex / healthy-volunteer field here: Regulation (EU) 536/2014 Annex I asks
 * for them, but adding them is a new required field on a registry record, which changes what
 * `registrable` means for CTIS. That is a product decision, not this wiring's to make.
 */
function ctisPopulationFields(design: StudyDesign, block: RegistryEligibilityBlock): RegistrationField[] {
  const inclusionRows = criteriaRows(block, 'inclusion');
  const exclusionRows = criteriaRows(block, 'exclusion');
  const planned = design.statisticalPlan?.plannedSampleSize;
  return [
    withCriteria(
      field('Inclusion criteria', criteriaText(inclusionRows), true, 'No inclusion criteria are defined.'),
      inclusionRows,
      block.basis,
    ),
    withCriteria(
      field('Exclusion criteria', criteriaText(exclusionRows), true, 'No exclusion criteria are defined.'),
      exclusionRows,
      block.basis,
    ),
    field('Planned subjects (overall)', planned ? String(planned) : null, true, 'No planned sample size is defined.'),
    gap('Planned subjects (in the EU)', true, 'EU-specific enrollment is not part of the design object.'),
  ];
}

/** The ClinicalTrials.gov eligibility module, straight off the engine's block. */
function ctgovEligibilityFields(design: StudyDesign, block: RegistryEligibilityBlock): RegistrationField[] {
  const inclusion = criteriaText(criteriaRows(block, 'inclusion'));
  const exclusion = criteriaText(criteriaRows(block, 'exclusion'));
  const joined = [inclusion ? `Inclusion: ${inclusion}` : '', exclusion ? `Exclusion: ${exclusion}` : '']
    .filter(Boolean)
    .join(' | ');
  const noCriteria = absentReason(block, 'Eligibility criteria', 'No eligibility criteria are defined.');
  return [
    withCriteria(field('Eligibility criteria', joined || null, true, noCriteria), block.criteria, block.basis),
    ageLimitsField(block),
    gap('Sex / gender', true, `${absentReason(block, 'Sex', 'Eligibility sex is not recorded.')} ${SEX_SETTLED_BY}`),
    gap(
      'Accepts healthy volunteers',
      true,
      `${absentReason(block, 'Accepts healthy volunteers', 'Healthy-volunteer eligibility is not recorded.')} ${HEALTHY_VOLUNTEERS_SETTLED_BY}`,
    ),
    field(
      'Enrollment (anticipated)',
      design.statisticalPlan?.plannedSampleSize ? String(design.statisticalPlan.plannedSampleSize) : null,
      true,
      'No planned sample size is defined.',
    ),
  ];
}

function euMemberStates(design: StudyDesign): string[] {
  return (design.targetRegions ?? []).filter(r => EU_MEMBER_STATES.has(r.trim().toLowerCase()));
}

// ─── Field constructors ─────────────────────────────────────────────────────────

function field(name: string, value: string | null, required: boolean, gap?: string): RegistrationField {
  const ok = present(value);
  return {
    name,
    value: ok ? (value as string) : null,
    status: ok ? 'rendered' : 'missing',
    required,
    gap: ok ? undefined : (gap ?? `${name} is not specified in the design.`),
  };
}

function partial(name: string, value: string, required: boolean, gap: string): RegistrationField {
  return { name, value, status: 'partial', required, gap };
}

function gap(name: string, required: boolean, gapText: string): RegistrationField {
  return { name, value: null, status: 'missing', required, gap: gapText };
}

// ─── Assembly ────────────────────────────────────────────────────────────────────

function assemble(registry: RegistrationRegistry, standard: string, modules: RegistrationModule[]): RegistrationRecord {
  const all = modules.flatMap(m => m.fields);
  const required = all.filter(f => f.required);
  const requiredRendered = required.filter(f => f.status === 'rendered').length;
  const requiredTotal = required.length;
  const gaps = required.filter(f => f.status !== 'rendered').map(f => f.gap ?? `${f.name} is required but not specified.`);
  return {
    registry,
    standard,
    modules,
    gaps,
    completeness: {
      requiredRendered,
      requiredTotal,
      /* `requiredTotal === 0 ? 100` scored an empty field set as fully
         rendered, and `requiredRendered === requiredTotal` is 0 === 0, so the
         record also came back registrable — ready to submit to
         ClinicalTrials.gov or CTIS with nothing in it.

         Defence in depth, and said plainly: both projectors build fixed module
         lists with required fields, so this is not reachable through
         projectRegistration today and is NOT covered by a test that has been
         seen to fail. It is here so a future registry, or a projector that
         returns no modules, cannot be reported as a submittable record. */
      percent: requiredTotal === 0 ? null : Math.round((requiredRendered / requiredTotal) * 100),
    },
    registrable: requiredTotal > 0 && requiredRendered === requiredTotal,
    projectedFromObject: true,
  };
}

// ─── ClinicalTrials.gov (FDAAA 801 / PRS) ─────────────────────────────────────────

function projectCtGov(design: StudyDesign): RegistrationRecord {
  const arms = design.arms ?? [];
  const armsValue = arms.length
    ? arms.map(a => `${a.name} (${ctgovArmType(a)})`).join('; ')
    : null;
  const interventions = interventionLines(design);
  const primary = outcomeMeasures(design, ['primary']);
  const secondary = outcomeMeasures(design, ['key_secondary', 'secondary']);
  const r = design.randomization;
  const allocation =
    design.framework?.structuralDesign === 'single_arm'
      ? 'N/A (single group)'
      : r?.allocationMethod
        ? r.allocationMethod === 'none'
          ? 'Non-randomized'
          : 'Randomized'
        : null;

  const eligibility = projectRegistryEligibility(design.population?.eligibility ?? []);

  const primaryField =
    primary.value === null
      ? gap('Primary outcome measure', true, 'No primary endpoint is defined.')
      : primary.missingTimeFrame.length
        ? partial('Primary outcome measure', primary.value, true, `Time frame is missing for: ${primary.missingTimeFrame.join(', ')}.`)
        : field('Primary outcome measure', primary.value, true);

  const modules: RegistrationModule[] = [
    {
      name: 'Study identification',
      fields: [
        field('Brief title', design.title ?? null, true),
        field('Official title', design.title ?? null, true),
      ],
    },
    {
      name: 'Study status',
      fields: [
        gap('Overall recruitment status', true, 'Recruitment status is operational and not part of the design object.'),
        gap('Study start date', true, 'Study start date is not part of the design object.'),
        gap('Primary completion date', true, 'Primary completion date is not part of the design object.'),
      ],
    },
    {
      name: 'Sponsor and oversight',
      fields: [
        gap('Responsible party / sponsor', true, 'Sponsor / responsible party is not part of the design object.'),
        field('Has data monitoring committee', design.safety?.dmcCharter?.present ? 'Yes' : null, false, 'No data monitoring committee is described.'),
      ],
    },
    {
      name: 'Study design',
      fields: [
        field('Study type', 'Interventional', true),
        gap('Primary purpose', true, 'Primary purpose (treatment, prevention, diagnostic, …) is not specified in the design.'),
        field('Phase', design.phase ? CTGOV_PHASE[design.phase] : null, true),
        field('Allocation', allocation, true, 'No randomization scheme is defined.'),
        field('Interventional model', design.framework?.structuralDesign ? ctgovInterventionModel(design.framework.structuralDesign) : null, true),
        field('Masking', r?.blinding ? CTGOV_MASKING[r.blinding] : null, true, 'No blinding level is defined.'),
        field('Number of arms', arms.length ? String(arms.length) : null, false),
      ],
    },
    {
      name: 'Conditions',
      fields: [field('Condition', design.indication ?? null, true)],
    },
    {
      name: 'Arms and interventions',
      fields: [
        field('Arms / groups', armsValue, true, 'No arms are defined.'),
        interventions.line
          ? interventions.typed
            ? field('Interventions', interventions.line, true)
            : partial('Interventions', interventions.line, true, 'Intervention type is unknown; set productType (drug/biologic/device/ivd).')
          : gap('Interventions', true, 'No interventions are defined.'),
      ],
    },
    {
      name: 'Outcome measures',
      fields: [
        primaryField,
        secondary.value ? field('Secondary outcome measures', secondary.value, false) : gap('Secondary outcome measures', false, 'No secondary endpoints are defined.'),
      ],
    },
    {
      name: 'Eligibility',
      fields: ctgovEligibilityFields(design, eligibility),
    },
  ];

  return assemble('ClinicalTrials.gov', 'FDAAA 801 / ClinicalTrials.gov PRS', modules);
}

// ─── EU CTIS (Regulation 536/2014) ────────────────────────────────────────────────

function projectCtis(design: StudyDesign): RegistrationRecord {
  const states = euMemberStates(design);
  const primaryObjective = (design.objectives ?? []).find(o => o.level === 'primary')?.text ?? null;
  const primary = outcomeMeasures(design, ['primary']);
  const secondary = outcomeMeasures(design, ['key_secondary', 'secondary']);
  const interventions = interventionLines(design);
  const r = design.randomization;
  const eligibility = projectRegistryEligibility(design.population?.eligibility ?? []);

  const randomised =
    r?.allocationMethod ? (r.allocationMethod === 'none' ? 'No' : 'Yes') : null;
  const controlled = design.framework?.controlType ? (design.framework.controlType === 'none' ? 'No' : 'Yes') : null;

  const modules: RegistrationModule[] = [
    {
      name: 'Trial identification',
      fields: [
        field('Full title', design.title ?? null, true),
        field('Trial phase', design.phase ? CTIS_PHASE[design.phase] : null, true),
      ],
    },
    {
      name: 'Sponsor',
      fields: [gap('Sponsor', true, 'Sponsor is not part of the design object.')],
    },
    {
      name: 'Member states concerned',
      fields: [
        states.length
          ? field('Member state(s) concerned', states.join(', '), true)
          : gap('Member state(s) concerned', true, 'No EU member state is listed in target regions; CTIS requires at least one concerned member state.'),
      ],
    },
    {
      name: 'Medical conditions',
      fields: [field('Medical condition', design.indication ?? null, true)],
    },
    {
      name: 'Objectives and endpoints',
      fields: [
        field('Main objective', primaryObjective, true, 'No primary objective is defined.'),
        primary.value
          ? primary.missingTimeFrame.length
            ? partial('Primary endpoint(s)', primary.value, true, `Time frame is missing for: ${primary.missingTimeFrame.join(', ')}.`)
            : field('Primary endpoint(s)', primary.value, true)
          : gap('Primary endpoint(s)', true, 'No primary endpoint is defined.'),
        secondary.value ? field('Secondary endpoint(s)', secondary.value, false) : gap('Secondary endpoint(s)', false, 'No secondary endpoints are defined.'),
      ],
    },
    {
      name: 'Trial design',
      fields: [
        field('Controlled', controlled, true, 'No control type is defined.'),
        field('Randomised', randomised, true, 'No randomization scheme is defined.'),
        field('Blinding', r?.blinding ? CTGOV_MASKING[r.blinding] : null, true, 'No blinding level is defined.'),
        field('Number of arms', (design.arms ?? []).length ? String((design.arms ?? []).length) : null, false),
      ],
    },
    {
      name: 'Population',
      fields: ctisPopulationFields(design, eligibility),
    },
    {
      name: 'Products',
      fields: [
        interventions.line
          ? interventions.typed
            ? field('Investigational medicinal product(s)', interventions.line, true)
            : partial('Investigational medicinal product(s)', interventions.line, true, 'Product type is unknown; set productType.')
          : gap('Investigational medicinal product(s)', true, 'No interventions are defined.'),
      ],
    },
  ];

  return assemble('EU CTIS', 'EU Regulation 536/2014 / CTIS', modules);
}

// ─── Public surface ───────────────────────────────────────────────────────────────

/** Project a design into a single registry record. Deterministic. */
export function projectRegistration(design: StudyDesign, registry: 'ctgov' | 'ctis'): RegistrationRecord {
  return registry === 'ctis' ? projectCtis(design) : projectCtGov(design);
}

/** Project a design into both the ClinicalTrials.gov and EU CTIS records. Deterministic. */
export function projectAllRegistrations(design: StudyDesign): { ctgov: RegistrationRecord; ctis: RegistrationRecord } {
  return { ctgov: projectCtGov(design), ctis: projectCtis(design) };
}
