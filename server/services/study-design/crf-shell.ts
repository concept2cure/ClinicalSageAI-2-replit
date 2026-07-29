/**
 * CRF shell projection — the design object rendered as a blank case-report-form set.
 *
 * The case report form is the last of the design object's named projections (protocol, SAP,
 * Schedule of Activities, registration record — and this). It is built from the Schedule of
 * Activities: each scheduled assessment becomes a form collected at the visits the SoA places it
 * at, and each endpoint an activity produces becomes the data items on that form. Eligibility,
 * exposure, adverse events and concomitant medications round out the standard CDASH domains.
 *
 * Honest by construction: forms and items are derived from what the design holds and tagged with
 * their provenance; a universally-required domain the design does not specify (demographics,
 * concomitant medications) is emitted as a clearly-marked standard scaffold, never dressed up as
 * design-derived; and where an activity has no endpoint link the items are flagged as placeholders
 * rather than invented. Pure: no DB, RNG, clock or LLM.
 *
 * @module server/services/study-design/crf-shell
 */

import type {
  Endpoint,
  ScheduleOfActivities,
  SoaActivity,
  StudyDesign,
} from './study-design-types';

export type CrfFormOrigin = 'design' | 'standard';
export type CrfItemType = 'text' | 'number' | 'date' | 'boolean' | 'category';

export interface CrfItem {
  /** The field label / question. */
  prompt: string;
  type: CrfItemType;
  /** CDASH variable hint where applicable, e.g. 'AETERM'. */
  cdashVar?: string;
  /** Units, when known. */
  units?: string;
  /** Provenance, e.g. 'endpoint:HbA1c change', 'eligibility', 'activity:a_dose', 'standard'. */
  derivedFrom: string;
  /** True when the design does not yet specify the item — a placeholder to be completed. */
  placeholder?: boolean;
}

export interface CrfForm {
  name: string;
  origin: CrfFormOrigin;
  /** CDASH domain code where applicable: DM, IE, EX, AE, CM, VS, LB, EG, QS. */
  cdashDomain?: string;
  /** SoA visit ids where the form is collected (empty when no SoA, or not visit-scheduled). */
  visitIds: string[];
  items: CrfItem[];
  /** The SoA activity this form is derived from, when applicable. */
  sourceActivityId?: string;
  /** Endpoints the form collects, when applicable. */
  sourceEndpointNames?: string[];
  /** A note about scaffolding or a gap. */
  note?: string;
}

export interface CrfShell {
  forms: CrfForm[];
  counts: {
    forms: number;
    items: number;
    designDerivedForms: number;
    standardScaffoldForms: number;
    visitScheduledForms: number;
  };
  /** Honest gap list, e.g. activities with placeholder items or a missing SoA. */
  gaps: string[];
  /** Grounding completeness over a fixed five-point checklist. */
  completeness: { satisfied: number; total: number; percent: number };
  standard: 'CDISC CDASH';
  /** Honesty marker: a deterministic projection, not generated content. */
  projectedFromObject: true;
}

// ─── Activity categories handled by a standard domain rather than their own form ──

const COVERED_BY_STANDARD_FORM = new Set(['safety', 'eligibility', 'administrative']);

const CATEGORY_ORDER: Record<string, number> = {
  administrative: 0,
  eligibility: 1,
  drug_administration: 2,
  efficacy: 3,
  patient_reported: 4,
  pk: 5,
  pd: 6,
  biomarker: 7,
  safety: 8,
};

function present(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

// ─── SoA helpers ─────────────────────────────────────────────────────────────

function screeningVisitId(soa: ScheduleOfActivities | undefined): string | undefined {
  if (!soa) return undefined;
  const visits = [...(soa.visits ?? [])].sort((a, b) => a.order - b.order);
  const screeningEpochs = new Set((soa.epochs ?? []).filter(e => e.kind === 'screening').map(e => e.id));
  return visits.find(v => screeningEpochs.has(v.epochId))?.id ?? visits[0]?.id;
}

function visitsForActivity(soa: ScheduleOfActivities, activityId: string): string[] {
  const order = new Map((soa.visits ?? []).map(v => [v.id, v.order] as const));
  const ids = new Set((soa.cells ?? []).filter(c => c.activityId === activityId).map(c => c.visitId));
  return [...ids].sort((x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0));
}

/** Visit ids in epochs of the given kinds, in column order. */
function visitsInEpochKinds(soa: ScheduleOfActivities | undefined, kinds: string[]): string[] {
  if (!soa) return [];
  const want = new Set(kinds);
  const epochIds = new Set((soa.epochs ?? []).filter(e => want.has(e.kind)).map(e => e.id));
  return [...(soa.visits ?? [])]
    .filter(v => epochIds.has(v.epochId))
    .sort((a, b) => a.order - b.order)
    .map(v => v.id);
}

// ─── Item builders ───────────────────────────────────────────────────────────

/** CRF items that collect a single endpoint's measurement. */
function endpointItems(ep: Endpoint): CrfItem[] {
  const from = `endpoint:${ep.name}`;
  const methodNote = present(ep.measurementMethod) ? ` (${ep.measurementMethod})` : '';
  switch (ep.type) {
    case 'binary':
      return [{ prompt: `${ep.name}: result${methodNote}`, type: 'boolean', derivedFrom: from }];
    case 'ordinal':
      return [{ prompt: `${ep.name}: category${methodNote}`, type: 'category', derivedFrom: from }];
    case 'count':
      return [{ prompt: `${ep.name}: count${methodNote}`, type: 'number', derivedFrom: from }];
    case 'time_to_event':
      return [
        { prompt: `${present(ep.eventDefinition) ? ep.eventDefinition : ep.name}: event occurred`, type: 'boolean', derivedFrom: from },
        { prompt: `${ep.name}: event date`, type: 'date', derivedFrom: from },
      ];
    case 'composite': {
      const components = ep.compositeComponents ?? [];
      if (components.length) {
        return components.map(c => ({ prompt: `${ep.name} — ${c}: occurred`, type: 'boolean' as const, derivedFrom: from }));
      }
      return [{ prompt: `${ep.name}: component occurred`, type: 'boolean', derivedFrom: from, placeholder: true }];
    }
    case 'patient_reported': {
      const instrument = present(ep.validatedInstrument) ? ep.validatedInstrument : null;
      return [
        {
          prompt: `${ep.name}: ${instrument ? `${instrument} score` : 'score'}`,
          type: 'number',
          derivedFrom: from,
          placeholder: !instrument,
        },
      ];
    }
    case 'continuous':
    default:
      return [{ prompt: `${ep.name}: value${methodNote}`, type: 'number', derivedFrom: from }];
  }
}

/** Items for an activity with no endpoint link, by category. */
function categoryItems(activity: SoaActivity): { items: CrfItem[]; placeholder: boolean } {
  const from = `activity:${activity.id}`;
  if (activity.category === 'drug_administration') {
    return {
      items: [
        { prompt: 'Study treatment administered', type: 'text', cdashVar: 'EXTRT', derivedFrom: from },
        { prompt: 'Dose', type: 'text', cdashVar: 'EXDOSE', derivedFrom: from },
        { prompt: 'Route', type: 'text', cdashVar: 'EXROUTE', derivedFrom: from },
        { prompt: 'Administration date', type: 'date', cdashVar: 'EXSTDTC', derivedFrom: from },
      ],
      placeholder: false,
    };
  }
  return {
    items: [
      { prompt: `${activity.name}: performed`, type: 'boolean', derivedFrom: from },
      { prompt: `${activity.name}: result`, type: 'text', derivedFrom: from, placeholder: true },
    ],
    placeholder: true,
  };
}

// ─── Standard domain forms ─────────────────────────────────────────────────────

function demographicsForm(screening: string | undefined): CrfForm {
  return {
    name: 'Demographics',
    origin: 'standard',
    cdashDomain: 'DM',
    visitIds: screening ? [screening] : [],
    items: [
      { prompt: 'Date of birth or age', type: 'date', cdashVar: 'BRTHDTC', derivedFrom: 'standard' },
      { prompt: 'Sex', type: 'category', cdashVar: 'SEX', derivedFrom: 'standard' },
      { prompt: 'Race', type: 'category', cdashVar: 'RACE', derivedFrom: 'standard' },
      { prompt: 'Ethnicity', type: 'category', cdashVar: 'ETHNIC', derivedFrom: 'standard' },
    ],
    note: 'Standard CDASH demographics domain; not specified by the design.',
  };
}

function concomitantMedsForm(): CrfForm {
  return {
    name: 'Concomitant medications',
    origin: 'standard',
    cdashDomain: 'CM',
    visitIds: [],
    items: [
      { prompt: 'Medication', type: 'text', cdashVar: 'CMTRT', derivedFrom: 'standard' },
      { prompt: 'Indication', type: 'text', cdashVar: 'CMINDC', derivedFrom: 'standard' },
      { prompt: 'Start date', type: 'date', cdashVar: 'CMSTDTC', derivedFrom: 'standard' },
      { prompt: 'End date', type: 'date', cdashVar: 'CMENDTC', derivedFrom: 'standard' },
    ],
    note: 'Standard CDASH concomitant-medications domain; not specified by the design.',
  };
}

// ─── Projection ────────────────────────────────────────────────────────────────

/**
 * Project a design into a blank CRF shell (CDASH domains). Deterministic.
 */
export function projectCrfShell(design: StudyDesign): CrfShell {
  const soa = design.scheduleOfActivities;
  const forms: CrfForm[] = [];
  const gaps: string[] = [];
  const screening = screeningVisitId(soa);

  // 1 · Demographics — standard scaffold.
  forms.push(demographicsForm(screening));

  // 2 · Eligibility — design-derived from the eligibility list.
  const eligibility = design.population?.eligibility ?? [];
  if (eligibility.length) {
    const items: CrfItem[] = eligibility.map(c => ({
      prompt: `${c.type === 'inclusion' ? 'Inclusion' : 'Exclusion'}: ${c.text}`,
      type: 'boolean' as const,
      cdashVar: c.type === 'inclusion' ? 'IEYN' : 'IEYN',
      derivedFrom: 'eligibility',
    }));
    items.push({ prompt: 'Subject meets all eligibility criteria', type: 'boolean', cdashVar: 'ELIGYN', derivedFrom: 'eligibility' });
    forms.push({
      name: 'Eligibility',
      origin: 'design',
      cdashDomain: 'IE',
      visitIds: screening ? [screening] : [],
      items,
    });
  } else {
    gaps.push('No eligibility criteria are defined, so the eligibility CRF cannot be built.');
  }

  // 3 · Assessment forms — from the SoA when present, else one per endpoint.
  const endpointsByName = new Map((design.endpoints ?? []).map(e => [e.name, e] as const));
  if (soa) {
    const activities = [...(soa.activities ?? [])].sort(
      (a, b) => (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99) || a.order - b.order,
    );
    for (const activity of activities) {
      if (COVERED_BY_STANDARD_FORM.has(activity.category)) continue; // IE / AE / DM cover these
      const visitIds = visitsForActivity(soa, activity.id);
      const linked = (activity.endpointNames ?? []).map(n => endpointsByName.get(n)).filter((e): e is Endpoint => Boolean(e));
      let items: CrfItem[];
      let note: string | undefined;
      if (linked.length) {
        items = linked.flatMap(endpointItems);
      } else {
        const built = categoryItems(activity);
        items = built.items;
        if (built.placeholder) {
          note = 'Items are a placeholder — link the activity to an endpoint or specify its fields.';
          gaps.push(`Activity "${activity.name}" has no endpoint link, so its CRF items are a placeholder.`);
        }
      }
      forms.push({
        name: activity.name,
        origin: 'design',
        visitIds,
        items,
        sourceActivityId: activity.id,
        sourceEndpointNames: linked.length ? linked.map(e => e.name) : undefined,
        note,
      });
    }
  } else {
    for (const ep of design.endpoints ?? []) {
      forms.push({
        name: `${ep.name} assessment`,
        origin: 'design',
        visitIds: [],
        items: endpointItems(ep),
        sourceEndpointNames: [ep.name],
      });
    }
    if ((design.endpoints ?? []).length) {
      gaps.push('No Schedule of Activities is attached, so CRF forms are not visit-scheduled.');
    }
  }

  // 4 · Exposure — design-derived, unless a drug-administration activity already covers it.
  const hasDrugAdminActivity = (soa?.activities ?? []).some(a => a.category === 'drug_administration');
  const interventions = (design.arms ?? []).flatMap(a => a.interventions ?? []);
  if (!hasDrugAdminActivity && interventions.length) {
    forms.push({
      name: 'Study treatment exposure',
      origin: 'design',
      cdashDomain: 'EX',
      visitIds: visitsInEpochKinds(soa, ['treatment']),
      items: [
        { prompt: 'Study treatment', type: 'text', cdashVar: 'EXTRT', derivedFrom: 'arms' },
        { prompt: 'Dose', type: 'text', cdashVar: 'EXDOSE', derivedFrom: 'arms' },
        { prompt: 'Route', type: 'text', cdashVar: 'EXROUTE', derivedFrom: 'arms' },
        { prompt: 'Start date', type: 'date', cdashVar: 'EXSTDTC', derivedFrom: 'arms' },
        { prompt: 'End date', type: 'date', cdashVar: 'EXENDTC', derivedFrom: 'arms' },
      ],
    });
  }

  // 5 · Adverse events — design-grounded when a safety design exists, else a standard scaffold.
  const safetyActivityVisits = soa
    ? [...new Set((soa.activities ?? []).filter(a => a.category === 'safety').flatMap(a => visitsForActivity(soa, a.id)))]
    : [];
  const aeVisitIds = safetyActivityVisits.length
    ? safetyActivityVisits
    : visitsInEpochKinds(soa, ['treatment', 'follow_up']);
  forms.push({
    name: 'Adverse events',
    origin: design.safety ? 'design' : 'standard',
    cdashDomain: 'AE',
    visitIds: aeVisitIds,
    items: [
      { prompt: 'Adverse event term', type: 'text', cdashVar: 'AETERM', derivedFrom: design.safety ? 'safety' : 'standard' },
      { prompt: 'Onset date', type: 'date', cdashVar: 'AESTDTC', derivedFrom: design.safety ? 'safety' : 'standard' },
      { prompt: 'Severity', type: 'category', cdashVar: 'AESEV', derivedFrom: design.safety ? 'safety' : 'standard' },
      { prompt: 'Serious', type: 'boolean', cdashVar: 'AESER', derivedFrom: design.safety ? 'safety' : 'standard' },
      { prompt: 'Relationship to study treatment', type: 'category', cdashVar: 'AEREL', derivedFrom: design.safety ? 'safety' : 'standard' },
      { prompt: 'Outcome', type: 'category', cdashVar: 'AEOUT', derivedFrom: design.safety ? 'safety' : 'standard' },
    ],
    note: design.safety
      ? present(design.safety.aeDefinitions)
        ? `Adverse-event definitions: ${design.safety.aeDefinitions}.`
        : undefined
      : 'Standard CDASH adverse-events domain; the design carries no safety section.',
  });

  // 6 · Concomitant medications — standard scaffold.
  forms.push(concomitantMedsForm());

  // ─── Roll-up ───
  const items = forms.reduce((n, f) => n + f.items.length, 0);
  const designDerivedForms = forms.filter(f => f.origin === 'design').length;
  const standardScaffoldForms = forms.filter(f => f.origin === 'standard').length;
  const visitScheduledForms = forms.filter(f => f.visitIds.length > 0).length;

  const satisfied = groundingChecklist(design).filter(Boolean).length;

  return {
    forms,
    counts: { forms: forms.length, items, designDerivedForms, standardScaffoldForms, visitScheduledForms },
    gaps,
    completeness: { satisfied, total: 5, percent: Math.round((satisfied / 5) * 100) },
    standard: 'CDISC CDASH',
    projectedFromObject: true,
  };
}

/** The five grounding signals the CRF shell quality scores against. */
function groundingChecklist(design: StudyDesign): boolean[] {
  return [
    (design.population?.eligibility ?? []).length > 0,
    (design.endpoints ?? []).some(e => present(e.measurementMethod) || present(e.validatedInstrument)),
    Boolean(design.scheduleOfActivities),
    (design.arms ?? []).some(a => (a.interventions ?? []).length > 0),
    Boolean(design.safety),
  ];
}
