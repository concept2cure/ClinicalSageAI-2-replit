/**
 * Registration projection — the design object rendered as a trial-registry record (module spec §8).
 *
 * A registry record (ClinicalTrials.gov under FDAAA 801, or the EU CTIS under Regulation
 * 536/2014) is another *projection* of the structured design: the scientific content —
 * phase, design, arms, interventions, conditions, outcome measures, eligibility, enrollment —
 * is the same object the protocol and SAP render from, so the registration cannot disagree
 * with the protocol. Honest by construction: a field the design object does not carry
 * (sponsor, sex/age eligibility, recruitment status, dates, EU member states) is reported as a
 * gap, never invented. The mappings (phase, masking, allocation, intervention model, arm type)
 * are deterministic.
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

export type RegistrationRegistry = 'ClinicalTrials.gov' | 'EU CTIS';
export type RegistrationFieldStatus = 'rendered' | 'partial' | 'missing';

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
    /** required-rendered / required-total, as a percent. */
    percent: number;
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
    if (present(e.timepoint)) return `${e.name}: ${def} (time frame: ${e.timepoint})`;
    missingTimeFrame.push(e.name);
    return `${e.name}: ${def}`;
  });
  return { value: parts.join('; '), missingTimeFrame };
}

function eligibilityText(design: StudyDesign, type: 'inclusion' | 'exclusion'): string | null {
  const items = (design.population?.eligibility ?? []).filter(e => e.type === type).map(e => e.text);
  return items.length ? items.join('; ') : null;
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
      percent: requiredTotal === 0 ? 100 : Math.round((requiredRendered / requiredTotal) * 100),
    },
    registrable: requiredRendered === requiredTotal,
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

  const inclusion = eligibilityText(design, 'inclusion');
  const exclusion = eligibilityText(design, 'exclusion');
  const eligibility =
    inclusion || exclusion
      ? [inclusion ? `Inclusion: ${inclusion}` : '', exclusion ? `Exclusion: ${exclusion}` : ''].filter(Boolean).join(' | ')
      : null;

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
      fields: [
        field('Eligibility criteria', eligibility, true, 'No eligibility criteria are defined.'),
        gap('Sex / gender', true, 'Eligibility sex is not part of the design object.'),
        gap('Age limits', true, 'Minimum/maximum age is not part of the design object.'),
        gap('Accepts healthy volunteers', true, 'Healthy-volunteers eligibility is not part of the design object.'),
        field('Enrollment (anticipated)', design.statisticalPlan?.plannedSampleSize ? String(design.statisticalPlan.plannedSampleSize) : null, true, 'No planned sample size is defined.'),
      ],
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
  const inclusion = eligibilityText(design, 'inclusion');
  const exclusion = eligibilityText(design, 'exclusion');

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
      fields: [
        field('Inclusion criteria', inclusion, true, 'No inclusion criteria are defined.'),
        field('Exclusion criteria', exclusion, true, 'No exclusion criteria are defined.'),
        field('Planned subjects (overall)', design.statisticalPlan?.plannedSampleSize ? String(design.statisticalPlan.plannedSampleSize) : null, true, 'No planned sample size is defined.'),
        gap('Planned subjects (in the EU)', true, 'EU-specific enrollment is not part of the design object.'),
      ],
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
