/**
 * Planning inputs, continued — the external-control plan, the master-protocol
 * structure, and one SoA activity's location and specimen. Same contract as
 * planningInputForms.ts: a `C2CForm` field list, a strict parser, prefilled
 * from what the design records; nothing defaulted, nothing coerced.
 *
 * A sub-study's arms are the design's own: they are separated by ";" (an arm
 * name may contain a comma) and each must be one of the design's arms, and
 * the shared control is chosen from them — not typed, so no word ("none")
 * can be mistaken for an arm name. The external-control plan sends only the
 * discount its method reads. The activity drawer edits the one activity it
 * was opened for; it has no activity picker whose change could carry one
 * activity's values onto another.
 *
 * @module client/src/concept2cure/v2/surfaces/planningStructureForms
 */
import type { C2CFormField } from '../C2CForm';
import { rows, str } from './projectionFormat';
import {
  NON_NEGATIVE, POSITIVE, ParseError, UNIT, WHOLE_NON_NEGATIVE, WHOLE_POSITIVE,
  choice, compact, lines, must, need, num, opt, run, unique, type PlanningFormSpec, type Values, type Parsed,
} from './planningInputForms';

type Obj = Record<string, unknown>;

const TRI = [
  { value: '', label: 'Not stated' },
  { value: 'yes', label: 'Pre-specified' },
  { value: 'no', label: 'Not planned' },
];
const tri = (v: unknown): string => (v === true ? 'yes' : v === false ? 'no' : '');
const fromTri = (s: string | undefined): boolean | undefined => (s === 'yes' ? true : s === 'no' ? false : undefined);

/* ── External-control plan ────────────────────────────────────────────────── */

const METHODS = ['power_prior', 'commensurate'] as const;

function externalFields(cur: Obj | null): C2CFormField[] {
  const h = (cur?.historical ?? {}) as Obj;
  return [
    { key: 'source', label: 'External data source', type: 'text', required: true, default: str(cur?.source), placeholder: 'e.g. natural-history registry NH-X (2015–2024)' },
    { key: 'endpointName', label: 'Endpoint (name, as in the design)', type: 'text', required: true, default: str(cur?.endpointName) },
    { key: 'historicalN', label: 'External control: n', type: 'text', required: true, half: true, default: str(h.n) },
    { key: 'historicalMean', label: 'External control: mean', type: 'text', required: true, half: true, default: str(h.mean) },
    { key: 'historicalSe', label: 'External control: SE of the mean', type: 'text', required: true, half: true, default: str(h.se) },
    { key: 'method', label: 'Borrowing method', type: 'select', required: true, half: true, options: [{ value: 'power_prior', label: 'Power prior (a0)' }, { value: 'commensurate', label: 'Commensurate prior (τ²)' }], default: str(cur?.method) },
    { key: 'a0', label: 'Power-prior discount a0 (0–1)', type: 'text', half: true, default: str(cur?.a0), desc: 'Read only for a power prior.' },
    { key: 'tau2', label: 'Commensurability variance τ²', type: 'text', half: true, default: str(cur?.tau2), desc: 'Read only for a commensurate prior.' },
    { key: 'plannedConcurrentControlN', label: 'Planned concurrent control n (0 if none)', type: 'text', required: true, half: true, default: str(cur?.plannedConcurrentControlN) },
    { key: 'assumedSd', label: 'Assumed SD of the endpoint', type: 'text', half: true, default: str(cur?.assumedSd) },
    { key: 'tippingPointAnalysisPlanned', label: 'Tipping-point sensitivity analysis', type: 'select', options: TRI, half: true, default: tri(cur?.tippingPointAnalysisPlanned) },
    { key: 'covariateBalancePlanned', label: 'Covariate comparability assessment', type: 'select', options: TRI, half: true, default: tri(cur?.covariateBalancePlanned) },
  ];
}

function parseExternal(v: Values): Parsed {
  return run(v, () => {
    const method = choice('Borrowing method', v.method, METHODS);
    return {
      source: need('External data source', v.source), endpointName: need('Endpoint', v.endpointName),
      historical: {
        n: must('External control n', v.historicalN, WHOLE_POSITIVE), mean: must('External control mean', v.historicalMean),
        se: must('External control SE', v.historicalSe, POSITIVE),
      },
      method,
      // Only the chosen method's discount: the other would sit unused until a
      // later switch of method silently put it back in force.
      ...(method === 'power_prior' ? { a0: must('a0 (power prior)', v.a0, UNIT) } : { tau2: must('τ² (commensurate prior)', v.tau2, NON_NEGATIVE) }),
      plannedConcurrentControlN: must('Planned concurrent control n', v.plannedConcurrentControlN, WHOLE_NON_NEGATIVE),
      assumedSd: num('Assumed SD', v.assumedSd, false, POSITIVE),
      tippingPointAnalysisPlanned: fromTri(v.tippingPointAnalysisPlanned), covariateBalancePlanned: fromTri(v.covariateBalancePlanned),
    };
  });
}

/* ── Master protocol ──────────────────────────────────────────────────────── */

const NON_CONCURRENT = ['not_used', 'used_with_time_adjustment', 'used'] as const;

/** The design's arm names, as a sub-study must name them. */
export const armNamesOf = (design: Obj): string[] => rows(design.arms).map((a) => str(a.name)).filter(Boolean);

/** "Not stated", "None", or one of the design's arms; a recorded arm the design does not carry stays choosable, marked as such. */
function sharedOptions(arms: string[], recorded: unknown): { value: string; label: string }[] {
  const out = [{ value: '', label: 'Not stated' }, { value: 'none', label: 'None — no sub-studies share a control' }, ...arms.map((a) => ({ value: `arm:${a}`, label: a }))];
  if (typeof recorded === 'string' && !arms.includes(recorded)) out.push({ value: `arm:${recorded}`, label: `${recorded} (not one of the design's arms)` });
  return out;
}
const sharedDefault = (v: unknown): string => (v === null ? 'none' : typeof v === 'string' ? `arm:${v}` : '');

function masterFields(cur: Obj | null, design: Obj): C2CFormField[] {
  const subs = Array.isArray(cur?.subStudies) ? (cur!.subStudies as Obj[]) : [];
  const arms = armNamesOf(design);
  return [
    {
      key: 'subStudies', label: 'Sub-studies', type: 'textarea', required: true, rows: 6,
      desc: 'One per line: id | name | population | arms | biomarker | biomarker assay | decision rule. The last three may be blank; no "|" inside a value. ' +
        `Arms are the design's own, separated by ";" — ${arms.length ? arms.join('; ') : 'the design records no arms yet'}.`,
      default: subs
        .map((s) => [s.id, s.name, s.population, Array.isArray(s.arms) ? (s.arms as unknown[]).map(str).join('; ') : '', s.biomarker, s.biomarkerAssay, s.decisionRule].map(str).join(' | '))
        .join('\n'),
    },
    { key: 'sharedControlArm', label: 'Shared control arm', type: 'select', options: sharedOptions(arms, cur?.sharedControlArm), default: sharedDefault(cur?.sharedControlArm) },
    {
      key: 'nonConcurrentControls', label: 'Non-concurrent controls', type: 'select', default: str(cur?.nonConcurrentControls),
      options: [{ value: '', label: 'Not stated' }, { value: 'not_used', label: 'Not used' }, { value: 'used_with_time_adjustment', label: 'Used, with a pre-specified time-trend adjustment' }, { value: 'used', label: 'Used, with no time-trend adjustment' }],
    },
    { key: 'armAdditionProcedure', label: 'How an arm or sub-study is added', type: 'textarea', rows: 2, default: str(cur?.armAdditionProcedure) },
    { key: 'armDroppingRules', label: 'When an arm is dropped', type: 'textarea', rows: 2, default: str(cur?.armDroppingRules) },
    { key: 'multiplicityAcrossSubStudies', label: 'Type I error across sub-studies', type: 'textarea', rows: 2, default: str(cur?.multiplicityAcrossSubStudies) },
  ];
}

/** A sub-study's arms: ";"-separated, each one of the design's arms, each once. */
function armsOf(at: string, cell: string | undefined, designArms: string[]): string[] {
  const arms = String(cell ?? '').split(';').map((a) => a.trim()).filter(Boolean);
  if (arms.length === 0) throw new ParseError(`${at}: name at least one arm.`);
  const unknown = arms.find((a) => !designArms.includes(a));
  if (unknown !== undefined) {
    throw new ParseError(`${at}: arm "${unknown}" is not one of the design's arms (${designArms.length ? designArms.join('; ') : 'it records none'}).`);
  }
  const twice = arms.find((a, i) => arms.indexOf(a) !== i);
  if (twice !== undefined) throw new ParseError(`${at}: arm "${twice}" is listed twice.`);
  return arms;
}

function sharedOf(s: string | undefined): string | null | undefined {
  const t = s ?? '';
  if (t === '') return undefined;
  if (t === 'none') return null;
  if (t.startsWith('arm:') && t.length > 4) return t.slice(4);
  throw new ParseError(`Shared control arm "${t}" is not one of the choices.`);
}

function parseMaster(v: Values, design: Obj): Parsed {
  return run(v, () => {
    const designArms = armNamesOf(design);
    const ls = lines('Sub-studies', v.subStudies, 7);
    if (ls.length === 0) throw new ParseError('Sub-studies: record at least one.');
    const subStudies = ls.map(({ at, cells: [id, name, population, arms, biomarker, assay, rule] }) => {
      if (!id || !name || !population) throw new ParseError(`${at}: id, name and population are required.`);
      return compact({ id, name, population, arms: armsOf(at, arms, designArms), biomarker: opt(biomarker), biomarkerAssay: opt(assay), decisionRule: opt(rule) });
    });
    unique(ls, subStudies.map((s) => String(s.id)), 'sub-study id');
    const ncc = opt(v.nonConcurrentControls);
    if (ncc !== undefined && !(NON_CONCURRENT as readonly string[]).includes(ncc)) throw new ParseError(`Non-concurrent controls "${ncc}" is not one of the choices.`);
    return {
      subStudies, sharedControlArm: sharedOf(v.sharedControlArm), nonConcurrentControls: ncc,
      armAdditionProcedure: opt(v.armAdditionProcedure), armDroppingRules: opt(v.armDroppingRules),
      multiplicityAcrossSubStudies: opt(v.multiplicityAcrossSubStudies),
    };
  });
}

export const EXTERNAL_FORM: PlanningFormSpec = { block: 'externalControlPlan', title: 'External-control plan', sub: 'What the protocol pre-specifies about borrowing from an external control.', fields: externalFields, parse: parseExternal };
export const MASTER_FORM: PlanningFormSpec = { block: 'masterProtocol', title: 'Master-protocol structure', sub: 'Sub-studies and the rules across them (platform, basket, umbrella, MAMS).', fields: masterFields, parse: parseMaster };

/* ── One SoA activity: location and specimen ──────────────────────────────── */

/** Mirrors SOA_ACTIVITY_LOCATIONS (dct-profile.ts) and SPECIMEN_TYPES (planning-inputs.ts); a test pins each to the server's. */
export const LOCATIONS = ['site', 'home', 'local_provider', 'local_lab', 'telehealth', 'mobile_unit'] as const;
export const SPECIMENS = ['blood', 'urine', 'tissue', 'csf', 'saliva', 'stool', 'swab', 'other'] as const;

/** The fields for the one activity the drawer was opened for (the governed drawer adds the reason). */
export function activityFields(activity: Obj): C2CFormField[] {
  const sp = (activity.specimen ?? {}) as Obj;
  return [
    { key: 'location', label: 'Where it is performed', type: 'select', options: [{ value: '', label: 'Not stated' }, ...LOCATIONS.map((l) => ({ value: l, label: l.replace(/_/g, ' ') }))], default: str(activity.location) },
    { key: 'specimenType', label: 'Specimen collected', type: 'select', options: [{ value: '', label: 'None recorded' }, ...SPECIMENS.map((s) => ({ value: s, label: s }))], default: str(sp.type) },
    { key: 'volumeMl', label: 'Volume per collection (mL)', type: 'text', half: true, default: str(sp.volumeMl) },
    { key: 'processing', label: 'Processing', type: 'text', default: str(sp.processing) },
    { key: 'storage', label: 'Storage and shipping', type: 'text', default: str(sp.storage) },
    { key: 'retention', label: 'Retention and future use', type: 'text', default: str(sp.retention) },
  ];
}

/** What an activity records, in the shape `parseActivity` gives back: the drawer's lossless check and the write's precondition. */
export const activityRecorded = (activity: Obj): Obj => ({ location: activity.location ?? null, specimen: activity.specimen ?? null });

function member(label: string, s: string | undefined, allowed: readonly string[]): string | undefined {
  const t = opt(s);
  if (t !== undefined && !allowed.includes(t)) throw new ParseError(`${label} "${t}" is not one of the choices.`);
  return t;
}

/**
 * The activity is the one the drawer was opened for, never a field. "Not
 * stated" clears the location; "None recorded" clears the specimen and all
 * that is recorded about it. Both are recorded acts, not defaults.
 */
export function parseActivity(v: Values, activityId: string): Parsed {
  if (v.action === 'clear') return { ok: true, value: { activityId, location: null, specimen: null } };
  try {
    const location = member('Location', v.location, LOCATIONS);
    const type = member('Specimen', v.specimenType, SPECIMENS);
    const specimen = type
      ? compact({ type, volumeMl: num('Volume', v.volumeMl, false, POSITIVE), processing: opt(v.processing), storage: opt(v.storage), retention: opt(v.retention) })
      : null;
    return { ok: true, value: { activityId, location: location ?? null, specimen } };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message };
    throw e;
  }
}

