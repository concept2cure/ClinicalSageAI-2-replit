/**
 * Planning inputs — the governed forms that record, on a persisted study
 * design, the sponsor inputs the planning engines read (dose escalation, the
 * accrual plan, MMRM assumptions, the external-control plan, the master
 * protocol, and each SoA activity's location and specimen).
 *
 * Each form is a `C2CForm` field list (the one governed data-entry drawer) and
 * a strict parser from its string values to the block the server validates
 * again (`server/services/study-design/planning-inputs.ts`). Lists — dose
 * levels, sites, sub-studies — are one entry per line, fields separated by
 * "|", and each line's problem is reported with its line number. Nothing is
 * defaulted: a blank optional field is left out and the engine reports it; a
 * value that does not parse is refused, never coerced. Each form is prefilled
 * from what the design already records, so editing is not re-typing.
 *
 * @module client/src/concept2cure/v2/surfaces/planningInputForms
 */
import type { C2CFormField } from '../C2CForm';

type Obj = Record<string, unknown>;
export type Values = Record<string, string>;
export type Parsed = { ok: true; value: Obj | null } | { ok: false; error: string };

export type PlanningBlock = 'doseEscalation' | 'accrualPlan' | 'mmrmAssumptions' | 'externalControlPlan' | 'masterProtocol';

const ACTION: C2CFormField = {
  key: 'action', label: 'Action', type: 'select', required: true,
  options: [{ value: 'record', label: 'Record these inputs' }, { value: 'clear', label: 'Clear this block from the design' }],
  default: 'record',
};
const REASON: C2CFormField = {
  key: 'reason', label: 'Reason for change (governed)', type: 'textarea', required: true,
  placeholder: 'Why these inputs — at least 8 characters; written to the audit trail.',
};

/* ── Parsing primitives: refuse, never coerce ─────────────────────────────── */

class ParseError extends Error {}

const blank = (s: string | undefined): boolean => !s || !s.trim();

function num(label: string, s: string | undefined, required: boolean): number | undefined {
  if (blank(s)) {
    if (required) throw new ParseError(`${label} is required.`);
    return undefined;
  }
  const n = Number(String(s).trim());
  if (!Number.isFinite(n)) throw new ParseError(`${label} is not a number: "${String(s).trim()}".`);
  return n;
}

const opt = (s: string | undefined): string | undefined => (blank(s) ? undefined : String(s).trim());

/** Non-blank lines, each split on "|" into trimmed cells. */
function lines(s: string | undefined): string[][] {
  return String(s ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split('|').map((c) => c.trim()));
}

/** Drop undefined keys so the server's strict schema sees only what was entered. */
function compact(o: Obj): Obj {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

function run(values: Values, build: () => Obj): Parsed {
  if (values.action === 'clear') return { ok: true, value: null };
  try {
    return { ok: true, value: compact(build()) };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message };
    throw e;
  }
}

const str = (v: unknown): string => (v == null ? '' : String(v));
const cell = (v: unknown): string => str(v).replace(/\|/g, '/');

/* ── BOIN dose escalation ─────────────────────────────────────────────────── */

function doseFields(cur: Obj | null): C2CFormField[] {
  const levels = Array.isArray(cur?.doseLevels) ? (cur!.doseLevels as Obj[]) : [];
  const start = typeof cur?.startingDoseIndex === 'number' ? str(levels[cur.startingDoseIndex as number]?.label) : '';
  return [
    { key: 'targetToxicity', label: 'Target DLT rate (0–1)', type: 'text', required: true, half: true, default: str(cur?.targetToxicity) },
    { key: 'cohortSize', label: 'Cohort size', type: 'text', required: true, half: true, default: str(cur?.cohortSize) },
    { key: 'maxSampleSize', label: 'Maximum patients', type: 'text', required: true, half: true, default: str(cur?.maxSampleSize) },
    { key: 'stopWhenAtDoseN', label: 'Stop at N on one dose (optional)', type: 'text', half: true, default: str(cur?.stopWhenAtDoseN) },
    {
      key: 'doseLevels', label: 'Dose levels, lowest first', type: 'textarea', required: true, rows: 4,
      desc: 'One per line: label | dose (dose optional).', placeholder: 'DL1 | 10 mg\nDL2 | 20 mg',
      default: levels.map((l) => [cell(l.label), cell(l.dose)].filter(Boolean).join(' | ')).join('\n'),
    },
    { key: 'startingDose', label: 'Starting dose level (label)', type: 'text', half: true, default: start },
    { key: 'eliminationThreshold', label: 'Elimination threshold (optional)', type: 'text', half: true, default: str(cur?.eliminationThreshold), desc: 'Blank uses the engine default, labelled as such.' },
  ];
}

function parseDose(v: Values): Parsed {
  return run(v, () => {
    const levels = lines(v.doseLevels).map(([label, dose], i) => {
      if (!label) throw new ParseError(`Dose levels, line ${i + 1}: a label is required.`);
      return compact({ label, dose: opt(dose) });
    });
    const start = opt(v.startingDose);
    const idx = start === undefined ? undefined : levels.findIndex((l) => l.label === start);
    if (idx === -1) throw new ParseError(`Starting dose "${start}" is not one of the dose levels.`);
    return {
      method: 'boin', targetToxicity: num('Target DLT rate', v.targetToxicity, true), doseLevels: levels,
      cohortSize: num('Cohort size', v.cohortSize, true), maxSampleSize: num('Maximum patients', v.maxSampleSize, true),
      startingDoseIndex: idx, stopWhenAtDoseN: num('Stop at N', v.stopWhenAtDoseN, false),
      eliminationThreshold: num('Elimination threshold', v.eliminationThreshold, false),
    };
  });
}

/* ── Accrual plan ─────────────────────────────────────────────────────────── */

function accrualFields(cur: Obj | null): C2CFormField[] {
  const sites = Array.isArray(cur?.sites) ? (cur!.sites as Obj[]) : [];
  return [
    { key: 'timeUnit', label: 'Time unit of rates and activation', type: 'select', required: true, options: ['month', 'week'], default: str(cur?.timeUnit) || 'month' },
    {
      key: 'sites', label: 'Sites', type: 'textarea', required: true, rows: 6,
      desc: 'One per line: site id | country | mean patients per time unit | rate CV (optional) | activation time (optional).',
      placeholder: 'US-01 | US | 1.5 | 0.5 | 0\nDE-01 | DE | 0.8 | | 3',
      default: sites.map((s) => [s.id, s.country, s.meanRate, s.rateCv, s.activationTime].map(cell).join(' | ')).join('\n'),
    },
    { key: 'rateSource', label: 'Where the rates come from', type: 'text', default: str(cur?.rateSource), placeholder: 'e.g. site feasibility questionnaires, 2026-08' },
    { key: 'seed', label: 'Simulation seed (optional)', type: 'text', half: true, default: str(cur?.seed) },
  ];
}

function parseAccrual(v: Values): Parsed {
  return run(v, () => ({
    timeUnit: v.timeUnit,
    sites: lines(v.sites).map(([id, country, rate, cv, act], i) => {
      if (!id) throw new ParseError(`Sites, line ${i + 1}: a site id is required.`);
      return compact({
        id, country: opt(country), meanRate: num(`Sites, line ${i + 1}: mean rate`, rate, true),
        rateCv: num(`Sites, line ${i + 1}: rate CV`, cv, false), activationTime: num(`Sites, line ${i + 1}: activation time`, act, false),
      });
    }),
    rateSource: opt(v.rateSource),
    seed: num('Seed', v.seed, false),
  }));
}

/* ── MMRM assumptions ─────────────────────────────────────────────────────── */

function mmrmFields(cur: Obj | null): C2CFormField[] {
  return [
    { key: 'endpointName', label: 'Endpoint (name, as in the design)', type: 'text', required: true, default: str(cur?.endpointName) },
    { key: 'visits', label: 'Post-baseline visits', type: 'text', required: true, half: true, default: str(cur?.visits) },
    { key: 'covariance', label: 'Correlation structure', type: 'select', required: true, half: true, options: [{ value: 'compound_symmetry', label: 'Compound symmetry' }, { value: 'ar1', label: 'AR(1)' }], default: str(cur?.covariance) || 'compound_symmetry' },
    { key: 'rho', label: 'Correlation ρ (0 ≤ ρ < 1)', type: 'text', required: true, half: true, default: str(cur?.rho) },
    { key: 'sigma', label: 'SD at each visit', type: 'text', required: true, half: true, default: str(cur?.sigma) },
    { key: 'delta', label: 'Difference to detect at the target visit', type: 'text', required: true, half: true, default: str(cur?.delta) },
    { key: 'targetVisit', label: 'Target visit (optional; default final)', type: 'text', half: true, default: str(cur?.targetVisit) },
    { key: 'retention', label: 'Retention at each visit', type: 'text', required: true, desc: 'Comma-separated, one per visit, never increasing, e.g. 0.95, 0.9, 0.85.', default: Array.isArray(cur?.retention) ? (cur!.retention as unknown[]).join(', ') : '' },
    { key: 'allocationRatio', label: 'Allocation ratio n₂/n₁ (optional)', type: 'text', half: true, default: str(cur?.allocationRatio) },
    { key: 'source', label: 'Where the assumptions come from', type: 'text', default: str(cur?.source) },
  ];
}

function parseMmrm(v: Values): Parsed {
  return run(v, () => ({
    endpointName: opt(v.endpointName), visits: num('Visits', v.visits, true), covariance: v.covariance,
    rho: num('ρ', v.rho, true), sigma: num('SD', v.sigma, true), delta: num('Difference', v.delta, true),
    retention: String(v.retention ?? '').split(',').filter((x) => x.trim()).map((x, i) => num(`Retention value ${i + 1}`, x, true)),
    targetVisit: num('Target visit', v.targetVisit, false), allocationRatio: num('Allocation ratio', v.allocationRatio, false), source: opt(v.source),
  }));
}

export interface PlanningFormSpec {
  block: PlanningBlock;
  title: string;
  sub: string;
  fields: (current: Obj | null) => C2CFormField[];
  parse: (values: Values) => Parsed;
}

export const DOSE_FORM: PlanningFormSpec = { block: 'doseEscalation', title: 'Dose-escalation rules (BOIN)', sub: 'The BOIN engine computes the boundaries and the decision table from these.', fields: doseFields, parse: parseDose };
export const ACCRUAL_FORM: PlanningFormSpec = { block: 'accrualPlan', title: 'Site accrual plan', sub: 'Sponsor inputs: nothing here is assumed. The enrollment forecast runs on these rates.', fields: accrualFields, parse: parseAccrual };
export const MMRM_FORM: PlanningFormSpec = { block: 'mmrmAssumptions', title: 'MMRM planning assumptions', sub: 'Sponsor assumptions for the MMRM-analysed endpoint. Nothing is sized from a missing one.', fields: mmrmFields, parse: parseMmrm };

export function withGovernance(fields: C2CFormField[]): C2CFormField[] {
  return [ACTION, ...fields, REASON];
}
export { ParseError, num, opt, lines, compact, run, str, cell };
