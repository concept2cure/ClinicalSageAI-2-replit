/**
 * Planning inputs, continued — the external-control plan, the master-protocol
 * structure, and one SoA activity's location and specimen. Same contract as
 * planningInputForms.ts: a `C2CForm` field list, a strict parser, prefilled
 * from what the design records; nothing defaulted, nothing coerced.
 *
 * @module client/src/concept2cure/v2/surfaces/planningStructureForms
 */
import type { C2CFormField } from '../C2CForm';
import { ParseError, cell, compact, lines, num, opt, run, str, type PlanningFormSpec, type Values, type Parsed } from './planningInputForms';

type Obj = Record<string, unknown>;

const TRI = [
  { value: '', label: 'Not stated' },
  { value: 'yes', label: 'Pre-specified' },
  { value: 'no', label: 'Not planned' },
];
const tri = (v: unknown): string => (v === true ? 'yes' : v === false ? 'no' : '');
const fromTri = (s: string | undefined): boolean | undefined => (s === 'yes' ? true : s === 'no' ? false : undefined);

/* ── External-control plan ────────────────────────────────────────────────── */

function externalFields(cur: Obj | null): C2CFormField[] {
  const h = (cur?.historical ?? {}) as Obj;
  return [
    { key: 'source', label: 'External data source', type: 'text', required: true, default: str(cur?.source), placeholder: 'e.g. natural-history registry NH-X (2015–2024)' },
    { key: 'endpointName', label: 'Endpoint (name, as in the design)', type: 'text', required: true, default: str(cur?.endpointName) },
    { key: 'historicalN', label: 'External control: n', type: 'text', required: true, half: true, default: str(h.n) },
    { key: 'historicalMean', label: 'External control: mean', type: 'text', required: true, half: true, default: str(h.mean) },
    { key: 'historicalSe', label: 'External control: SE of the mean', type: 'text', required: true, half: true, default: str(h.se) },
    { key: 'method', label: 'Borrowing method', type: 'select', required: true, half: true, options: [{ value: 'power_prior', label: 'Power prior (a0)' }, { value: 'commensurate', label: 'Commensurate prior (τ²)' }], default: str(cur?.method) || 'power_prior' },
    { key: 'a0', label: 'Power-prior discount a0 (0–1)', type: 'text', half: true, default: str(cur?.a0) },
    { key: 'tau2', label: 'Commensurability variance τ²', type: 'text', half: true, default: str(cur?.tau2) },
    { key: 'plannedConcurrentControlN', label: 'Planned concurrent control n (0 if none)', type: 'text', required: true, half: true, default: str(cur?.plannedConcurrentControlN) },
    { key: 'assumedSd', label: 'Assumed SD of the endpoint', type: 'text', half: true, default: str(cur?.assumedSd) },
    { key: 'tippingPointAnalysisPlanned', label: 'Tipping-point sensitivity analysis', type: 'select', options: TRI, half: true, default: tri(cur?.tippingPointAnalysisPlanned) },
    { key: 'covariateBalancePlanned', label: 'Covariate comparability assessment', type: 'select', options: TRI, half: true, default: tri(cur?.covariateBalancePlanned) },
  ];
}

function parseExternal(v: Values): Parsed {
  return run(v, () => ({
    source: opt(v.source), endpointName: opt(v.endpointName),
    historical: { n: num('External control n', v.historicalN, true), mean: num('External control mean', v.historicalMean, true), se: num('External control SE', v.historicalSe, true) },
    method: v.method, a0: num('a0', v.a0, false), tau2: num('τ²', v.tau2, false),
    plannedConcurrentControlN: num('Planned concurrent control n', v.plannedConcurrentControlN, true),
    assumedSd: num('Assumed SD', v.assumedSd, false),
    tippingPointAnalysisPlanned: fromTri(v.tippingPointAnalysisPlanned), covariateBalancePlanned: fromTri(v.covariateBalancePlanned),
  }));
}

/* ── Master protocol ──────────────────────────────────────────────────────── */

function masterFields(cur: Obj | null): C2CFormField[] {
  const subs = Array.isArray(cur?.subStudies) ? (cur!.subStudies as Obj[]) : [];
  const shared = cur?.sharedControlArm === null ? 'none' : str(cur?.sharedControlArm);
  return [
    {
      key: 'subStudies', label: 'Sub-studies', type: 'textarea', required: true, rows: 6,
      desc: 'One per line: id | name | population | arms (comma-separated arm names) | biomarker | biomarker assay | decision rule. The last three may be blank.',
      default: subs.map((s) => [s.id, s.name, s.population, (Array.isArray(s.arms) ? (s.arms as unknown[]).join(', ') : ''), s.biomarker, s.biomarkerAssay, s.decisionRule].map(cell).join(' | ')).join('\n'),
    },
    { key: 'sharedControlArm', label: 'Shared control arm', type: 'text', default: shared, desc: 'An arm name; "none" to state there is none; blank if not yet decided.' },
    {
      key: 'nonConcurrentControls', label: 'Non-concurrent controls', type: 'select', default: str(cur?.nonConcurrentControls),
      options: [{ value: '', label: 'Not stated' }, { value: 'not_used', label: 'Not used' }, { value: 'used_with_time_adjustment', label: 'Used, with a pre-specified time-trend adjustment' }, { value: 'used', label: 'Used, with no time-trend adjustment' }],
    },
    { key: 'armAdditionProcedure', label: 'How an arm or sub-study is added', type: 'textarea', rows: 2, default: str(cur?.armAdditionProcedure) },
    { key: 'armDroppingRules', label: 'When an arm is dropped', type: 'textarea', rows: 2, default: str(cur?.armDroppingRules) },
    { key: 'multiplicityAcrossSubStudies', label: 'Type I error across sub-studies', type: 'textarea', rows: 2, default: str(cur?.multiplicityAcrossSubStudies) },
  ];
}

function parseMaster(v: Values): Parsed {
  return run(v, () => {
    const shared = opt(v.sharedControlArm);
    return {
      subStudies: lines(v.subStudies).map(([id, name, population, arms, biomarker, assay, rule], i) => {
        if (!id || !name || !population) throw new ParseError(`Sub-studies, line ${i + 1}: id, name and population are required.`);
        const armList = String(arms ?? '').split(',').map((a) => a.trim()).filter(Boolean);
        if (armList.length === 0) throw new ParseError(`Sub-studies, line ${i + 1}: name at least one arm.`);
        return compact({ id, name, population, arms: armList, biomarker: opt(biomarker), biomarkerAssay: opt(assay), decisionRule: opt(rule) });
      }),
      sharedControlArm: shared === undefined ? undefined : shared.toLowerCase() === 'none' ? null : shared,
      nonConcurrentControls: opt(v.nonConcurrentControls),
      armAdditionProcedure: opt(v.armAdditionProcedure), armDroppingRules: opt(v.armDroppingRules),
      multiplicityAcrossSubStudies: opt(v.multiplicityAcrossSubStudies),
    };
  });
}

export const EXTERNAL_FORM: PlanningFormSpec = { block: 'externalControlPlan', title: 'External-control plan', sub: 'What the protocol pre-specifies about borrowing from an external control.', fields: externalFields, parse: parseExternal };
export const MASTER_FORM: PlanningFormSpec = { block: 'masterProtocol', title: 'Master-protocol structure', sub: 'Sub-studies and the rules across them (platform, basket, umbrella, MAMS).', fields: masterFields, parse: parseMaster };

/* ── One SoA activity: location and specimen ──────────────────────────────── */

export const LOCATIONS = ['site', 'home', 'local_provider', 'local_lab', 'telehealth', 'mobile_unit'] as const;
const SPECIMENS = ['blood', 'urine', 'tissue', 'csf', 'saliva', 'stool', 'swab', 'other'] as const;

export function activityFields(activities: Obj[], selectedId: string): C2CFormField[] {
  const a = activities.find((x) => str(x.id) === selectedId) ?? activities[0] ?? {};
  const sp = (a.specimen ?? {}) as Obj;
  return [
    { key: 'activityId', label: 'Activity', type: 'select', required: true, options: activities.map((x) => ({ value: str(x.id), label: `${str(x.name)} (${str(x.category)})` })), default: str(a.id) },
    { key: 'location', label: 'Where it is performed', type: 'select', options: [{ value: '', label: 'Not stated' }, ...LOCATIONS.map((l) => ({ value: l, label: l.replace(/_/g, ' ') }))], default: str(a.location) },
    { key: 'specimenType', label: 'Specimen collected', type: 'select', options: [{ value: '', label: 'None recorded' }, ...SPECIMENS.map((s) => ({ value: s, label: s }))], default: str(sp.type) },
    { key: 'volumeMl', label: 'Volume per collection (mL)', type: 'text', half: true, default: str(sp.volumeMl) },
    { key: 'processing', label: 'Processing', type: 'text', default: str(sp.processing) },
    { key: 'storage', label: 'Storage and shipping', type: 'text', default: str(sp.storage) },
    { key: 'retention', label: 'Retention and future use', type: 'text', default: str(sp.retention) },
    { key: 'reason', label: 'Reason for change (governed)', type: 'textarea', required: true, placeholder: 'Why — at least 8 characters; written to the audit trail.' },
  ];
}

/** "Not stated" and "None recorded" clear the attribute; they are recorded acts, not defaults. */
export function parseActivity(v: Values): Parsed {
  try {
    const specimen = opt(v.specimenType)
      ? compact({ type: v.specimenType, volumeMl: num('Volume', v.volumeMl, false), processing: opt(v.processing), storage: opt(v.storage), retention: opt(v.retention) })
      : null;
    return { ok: true, value: { activityId: v.activityId, location: opt(v.location) ?? null, specimen } };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message };
    throw e;
  }
}
