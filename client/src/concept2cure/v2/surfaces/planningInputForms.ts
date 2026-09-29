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
 * "|", and each line's problem is reported with its line number; a line with
 * more fields than its list has is refused, so a "|" typed inside a value
 * never silently cuts it short (the server refuses "|" in those values too).
 *
 * Nothing is defaulted: a blank optional field is left out and the engine
 * reports it; a choice the design has not made (a time unit, a correlation
 * structure, a borrowing method) is not pre-selected. A value that does not
 * parse — or that the server would refuse (a range, a whole number, a
 * duplicate, a rule that depends on another field) — is refused here, never
 * coerced: only plain decimals are numbers ("0x9" is not 9).
 *
 * Editing is lossless or says it is not: each drawer is prefilled from what
 * the design records, exactly as its controls can show it ({@link drawerFor}),
 * and when parsing that prefill would not give back every recorded value, the
 * drawer names the first change and records only on an explicit choice.
 *
 * @module client/src/concept2cure/v2/surfaces/planningInputForms
 */
import type { C2CFormField } from '../C2CForm';
import { str } from './projectionFormat';

type Obj = Record<string, unknown>;
export type Values = Record<string, string>;
export type Parsed = { ok: true; value: Obj | null } | { ok: false; error: string };

export type PlanningBlock = 'doseEscalation' | 'accrualPlan' | 'mmrmAssumptions' | 'externalControlPlan' | 'masterProtocol' | 'registrationTitles';

/** Mirrors the server's MMRM_MAX_VISITS (planning-inputs.ts); a test pins the two together. */
export const MMRM_MAX_VISITS = 100;

const ACTION: C2CFormField = {
  key: 'action', label: 'Action', type: 'select', required: true,
  options: [{ value: 'record', label: 'Record these inputs' }, { value: 'clear', label: 'Clear this block from the design' }],
  default: 'record',
};
/** The action when the form cannot give back what is recorded: nothing is pre-selected, so recording is a stated choice. */
const LOSSY_ACTION: C2CFormField = {
  key: 'action', label: 'Action', type: 'select', required: true, default: '',
  options: [{ value: 'record-as-shown', label: 'Record what this form shows, replacing what it cannot show' }, { value: 'clear', label: 'Clear what is recorded' }],
};
const REASON: C2CFormField = {
  key: 'reason', label: 'Reason for change (governed)', type: 'textarea', required: true,
  placeholder: 'Why these inputs — at least 8 characters; written to the audit trail.',
};

/* ── Parsing primitives: refuse, never coerce ─────────────────────────────── */

class ParseError extends Error {}

const blank = (s: string | undefined): boolean => !s || !s.trim();

/** A plain decimal, optionally with an exponent. Hex, binary, octal and "Infinity" are not numbers here. */
const DECIMAL = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

/** A range or kind a number must satisfy, and how the refusal says it. */
export interface Rule { ok: (n: number) => boolean; says: string }
export const OPEN_UNIT: Rule = { ok: (n) => n > 0 && n < 1, says: 'strictly between 0 and 1' };
export const UNIT: Rule = { ok: (n) => n >= 0 && n <= 1, says: 'between 0 and 1' };
export const WHOLE_POSITIVE: Rule = { ok: (n) => Number.isInteger(n) && n >= 1, says: 'a whole number of at least 1' };
export const WHOLE_NON_NEGATIVE: Rule = { ok: (n) => Number.isInteger(n) && n >= 0, says: 'a whole number, 0 or more' };
export const WHOLE: Rule = { ok: (n) => Number.isInteger(n), says: 'a whole number' };
export const POSITIVE: Rule = { ok: (n) => n > 0, says: 'greater than 0' };
export const NON_NEGATIVE: Rule = { ok: (n) => n >= 0, says: '0 or more' };
const CORRELATION: Rule = { ok: (n) => n >= 0 && n < 1, says: 'at least 0 and less than 1' };
const RETENTION: Rule = { ok: (n) => n > 0 && n <= 1, says: 'greater than 0 and at most 1' };
const NON_ZERO: Rule = { ok: (n) => n !== 0, says: 'non-zero' };

function num(label: string, s: string | undefined, required: boolean, rule?: Rule): number | undefined {
  if (blank(s)) {
    if (required) throw new ParseError(`${label} is required.`);
    return undefined;
  }
  const t = String(s).trim();
  const n = DECIMAL.test(t) ? Number(t) : NaN;
  if (!Number.isFinite(n)) throw new ParseError(`${label} is not a number: "${t}".`);
  if (rule && !rule.ok(n)) throw new ParseError(`${label} must be ${rule.says}: "${t}".`);
  return n;
}

/** A required number: {@link num} with `required`, whose result is always a number. */
const must = (label: string, s: string | undefined, rule?: Rule): number => num(label, s, true, rule) as number;

const opt = (s: string | undefined): string | undefined => (blank(s) ? undefined : String(s).trim());

/** Required text, trimmed. */
function need(label: string, s: string | undefined): string {
  const t = opt(s);
  if (t === undefined) throw new ParseError(`${label} is required.`);
  return t;
}

/** A required choice: one of the allowed values, never a pre-selected one. */
function choice(label: string, s: string | undefined, allowed: readonly string[]): string {
  const t = opt(s);
  if (t === undefined) throw new ParseError(`${label} is required.`);
  if (!allowed.includes(t)) throw new ParseError(`${label} "${t}" is not one of: ${allowed.join(', ')}.`);
  return t;
}

/** One non-blank line of a list box: where it is (for messages) and its trimmed "|"-separated cells. */
export interface Line { at: string; cells: string[] }

/**
 * Non-blank lines, numbered as the author sees them. A line with more cells
 * than the list has is refused, naming the line: a "|" inside a value would
 * otherwise cut the value short.
 */
function lines(label: string, s: string | undefined, maxCells: number): Line[] {
  const out: Line[] = [];
  String(s ?? '').split('\n').forEach((raw, i) => {
    if (!raw.trim()) return;
    const at = `${label}, line ${i + 1}`;
    const cells = raw.split('|').map((c) => c.trim());
    if (cells.length > maxCells) {
      throw new ParseError(`${at}: ${cells.length} fields where this list has at most ${maxCells}; a "|" inside a value is not allowed.`);
    }
    out.push({ at, cells });
  });
  return out;
}

/** Refuse a key listed twice, naming the line that repeats it. */
function unique(ls: Line[], keys: string[], noun: string): void {
  keys.forEach((k, i) => {
    if (keys.indexOf(k) !== i) throw new ParseError(`${ls[i].at}: ${noun} "${k}" is listed twice.`);
  });
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

/* ── Lossless editing ─────────────────────────────────────────────────────── */

const optionValues = (f: C2CFormField): string[] => (f.options ?? []).map((o) => (typeof o === 'string' ? o : o.value));

/**
 * A field whose default is exactly what its control can show: a single-line
 * input holds no line break, a select holds one of its options (or "Select…").
 * The drawer then holds what it shows, so what is shown is what is recorded.
 */
function showable(f: C2CFormField): C2CFormField {
  const d = f.default ?? '';
  if (f.type === 'select') return optionValues(f).includes(d) ? f : { ...f, default: '' };
  if (f.type === 'textarea') return f;
  // As a browser's text input does (HTML value sanitization: strip newlines).
  return /[\r\n]/.test(d) ? { ...f, default: d.replace(/[\r\n]/g, '') } : f;
}

const pathOf = (p: string, k: string | number): string => (p ? `${p}.${k}` : String(k));
const shown = (v: unknown): string => JSON.stringify(v);

/** Every recorded value the form would not give back, and every value it would add. Numbers compare as text. */
export function losses(rec: unknown, got: unknown, path = ''): string[] {
  const here = path || 'the block';
  if (Array.isArray(rec) && Array.isArray(got) && rec.length === got.length) return rec.flatMap((r, i) => losses(r, got[i], pathOf(path, i)));
  const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (isObj(rec) && isObj(got)) {
    return [...new Set([...Object.keys(rec), ...Object.keys(got)])].flatMap((k) => losses(rec[k], got[k], pathOf(path, k)));
  }
  if (rec === undefined && got === undefined) return [];
  if (got === undefined) return [`${here}: recorded ${shown(rec)}; this form would drop it`];
  if (rec === undefined) return [`${here}: not recorded; this form would record ${shown(got)}`];
  const same = typeof rec !== 'object' && typeof got !== 'object' ? String(rec) === String(got) : shown(rec) === shown(got);
  return same ? [] : [`${here}: recorded ${shown(rec)}; this form would record ${shown(got)}`];
}

export interface Drawer {
  fields: C2CFormField[];
  /** What the author must know before recording: the recorded block fails the form's checks, or cannot be shown exactly. */
  note: string | null;
}

/**
 * The drawer for one recorded block (or activity). `recorded` is null when
 * nothing is recorded. When parsing the drawer's own prefill would not give
 * back every recorded value — a key the form has no field for, text a control
 * cannot hold, a value no option shows — recording would change the block
 * without an edit: the drawer names what would change and nothing is
 * pre-selected, so recording that is a stated choice, or the block is
 * cleared. A recorded block the form's checks refuse opens for correction,
 * with the refusal shown.
 */
export function drawerFor(fields: C2CFormField[], parse: (v: Values) => Parsed, recorded: Obj | null, action: C2CFormField | null = ACTION): Drawer {
  const safe = fields.map(showable);
  const standard = { fields: [...(action ? [action] : []), ...safe, REASON], note: null };
  if (recorded === null) return standard;
  const back = parse({ ...Object.fromEntries(safe.map((f) => [f.key, f.default ?? ''])), action: 'record' });
  if (!back.ok) return { ...standard, note: `As recorded, this does not pass the form's checks: ${back.error} Correct it before recording.` };
  const lost = losses(recorded, back.value ?? {});
  if (lost.length === 0) return standard;
  const more = lost.length > 3 ? `; and ${lost.length - 3} more` : '';
  return {
    fields: [LOSSY_ACTION, ...safe, REASON],
    note: `This form cannot show exactly what is recorded (${lost.slice(0, 3).join('; ')}${more}). Recording from it changes that even without an edit, so choose the action deliberately.`,
  };
}

/* ── BOIN dose escalation ─────────────────────────────────────────────────── */

function doseFields(cur: Obj | null): C2CFormField[] {
  const levels = Array.isArray(cur?.doseLevels) ? (cur!.doseLevels as Obj[]) : [];
  const start = typeof cur?.startingDoseIndex === 'number' ? str(levels[cur.startingDoseIndex as number]?.label) : '';
  const engineDefault = 'Optional. Blank uses the engine default, labelled as such in the projection.';
  return [
    { key: 'targetToxicity', label: 'Target DLT rate (0–1)', type: 'text', required: true, half: true, default: str(cur?.targetToxicity) },
    { key: 'cohortSize', label: 'Cohort size', type: 'text', required: true, half: true, default: str(cur?.cohortSize) },
    { key: 'maxSampleSize', label: 'Maximum patients', type: 'text', required: true, half: true, default: str(cur?.maxSampleSize) },
    { key: 'stopWhenAtDoseN', label: 'Stop at N on one dose (optional)', type: 'text', half: true, default: str(cur?.stopWhenAtDoseN) },
    {
      key: 'doseLevels', label: 'Dose levels, lowest first', type: 'textarea', required: true, rows: 4,
      desc: 'One per line: label | dose (dose optional). Each label once; no "|" inside a value.', placeholder: 'DL1 | 10 mg\nDL2 | 20 mg',
      default: levels.map((l) => [str(l.label), str(l.dose)].filter(Boolean).join(' | ')).join('\n'),
    },
    { key: 'startingDose', label: 'Starting dose level (label)', type: 'text', half: true, default: start },
    { key: 'phi1', label: 'φ1 — highest DLT rate still acceptable as under-dosing', type: 'text', half: true, default: str(cur?.phi1), desc: engineDefault },
    { key: 'phi2', label: 'φ2 — lowest DLT rate that is over-dosing', type: 'text', half: true, default: str(cur?.phi2), desc: engineDefault },
    { key: 'eliminationThreshold', label: 'Elimination threshold (optional)', type: 'text', half: true, default: str(cur?.eliminationThreshold), desc: engineDefault },
  ];
}

function doseLevelsOf(v: Values): Obj[] {
  const ls = lines('Dose levels', v.doseLevels, 2);
  const levels = ls.map(({ at, cells: [label, dose] }) => {
    if (!label) throw new ParseError(`${at}: a label is required.`);
    return compact({ label, dose: opt(dose) });
  });
  if (levels.length < 2) throw new ParseError('Dose levels: at least two are needed to escalate.');
  unique(ls, levels.map((l) => String(l.label)), 'dose level');
  return levels;
}

function startIndexOf(levels: Obj[], s: string | undefined): number | undefined {
  const start = opt(s);
  if (start === undefined) return undefined;
  const idx = levels.findIndex((l) => l.label === start);
  if (idx === -1) throw new ParseError(`Starting dose "${start}" is not one of the dose levels.`);
  return idx;
}

/** A supplied φ must sit on its side of the target; a blank one is the engine's, which the server checks with the engine itself. */
function neighbourhoodOf(v: Values, target: number): Obj {
  const phi1 = num('φ1', v.phi1, false, OPEN_UNIT);
  const phi2 = num('φ2', v.phi2, false, OPEN_UNIT);
  if (phi1 !== undefined && !(phi1 < target)) throw new ParseError(`φ1 must be below the target DLT rate (${target}): "${phi1}".`);
  if (phi2 !== undefined && !(phi2 > target)) throw new ParseError(`φ2 must be above the target DLT rate (${target}): "${phi2}".`);
  return { phi1, phi2 };
}

function parseDose(v: Values): Parsed {
  return run(v, () => {
    const doseLevels = doseLevelsOf(v);
    const targetToxicity = must('Target DLT rate', v.targetToxicity, OPEN_UNIT);
    const cohortSize = must('Cohort size', v.cohortSize, WHOLE_POSITIVE);
    const maxSampleSize = must('Maximum patients', v.maxSampleSize, WHOLE_POSITIVE);
    if (maxSampleSize < cohortSize) throw new ParseError('Maximum patients is smaller than one cohort.');
    const stopWhenAtDoseN = num('Stop at N on one dose', v.stopWhenAtDoseN, false, WHOLE_POSITIVE);
    if (stopWhenAtDoseN !== undefined && stopWhenAtDoseN < cohortSize) {
      throw new ParseError('Stop at N on one dose is smaller than one cohort: no cohort would complete at a dose.');
    }
    return {
      method: 'boin', targetToxicity, doseLevels, cohortSize, maxSampleSize,
      startingDoseIndex: startIndexOf(doseLevels, v.startingDose), stopWhenAtDoseN,
      ...neighbourhoodOf(v, targetToxicity),
      eliminationThreshold: num('Elimination threshold', v.eliminationThreshold, false, OPEN_UNIT),
    };
  });
}

/* ── Accrual plan ─────────────────────────────────────────────────────────── */

function accrualFields(cur: Obj | null): C2CFormField[] {
  const sites = Array.isArray(cur?.sites) ? (cur!.sites as Obj[]) : [];
  return [
    { key: 'timeUnit', label: 'Time unit of rates and activation', type: 'select', required: true, options: ['month', 'week'], default: str(cur?.timeUnit) },
    {
      key: 'sites', label: 'Sites', type: 'textarea', required: true, rows: 6,
      desc: 'One per line: site id | country | mean patients per time unit | rate CV (optional) | activation time (optional). Each id once; no "|" inside a value.',
      placeholder: 'US-01 | US | 1.5 | 0.5 | 0\nDE-01 | DE | 0.8 | | 3',
      default: sites.map((s) => [s.id, s.country, s.meanRate, s.rateCv, s.activationTime].map(str).join(' | ')).join('\n'),
    },
    { key: 'rateSource', label: 'Where the rates come from', type: 'text', default: str(cur?.rateSource), placeholder: 'e.g. site feasibility questionnaires, 2026-08' },
    { key: 'seed', label: 'Simulation seed (optional)', type: 'text', half: true, default: str(cur?.seed) },
  ];
}

function parseAccrual(v: Values): Parsed {
  return run(v, () => {
    const ls = lines('Sites', v.sites, 5);
    if (ls.length === 0) throw new ParseError('Sites: record at least one site.');
    const sites = ls.map(({ at, cells: [id, country, rate, cv, act] }) => {
      if (!id) throw new ParseError(`${at}: a site id is required.`);
      return compact({
        id, country: opt(country), meanRate: must(`${at}: mean rate`, rate, NON_NEGATIVE),
        rateCv: num(`${at}: rate CV`, cv, false, NON_NEGATIVE), activationTime: num(`${at}: activation time`, act, false, NON_NEGATIVE),
      });
    });
    unique(ls, sites.map((s) => String(s.id)), 'site');
    return { timeUnit: choice('Time unit', v.timeUnit, ['month', 'week']), sites, rateSource: opt(v.rateSource), seed: num('Seed', v.seed, false, WHOLE) };
  });
}

/* ── MMRM assumptions ─────────────────────────────────────────────────────── */

function mmrmFields(cur: Obj | null): C2CFormField[] {
  return [
    { key: 'endpointName', label: 'Endpoint (name, as in the design)', type: 'text', required: true, default: str(cur?.endpointName) },
    { key: 'visits', label: `Post-baseline visits (at most ${MMRM_MAX_VISITS})`, type: 'text', required: true, half: true, default: str(cur?.visits) },
    { key: 'covariance', label: 'Correlation structure', type: 'select', required: true, half: true, options: [{ value: 'compound_symmetry', label: 'Compound symmetry' }, { value: 'ar1', label: 'AR(1)' }], default: str(cur?.covariance) },
    { key: 'rho', label: 'Correlation ρ (0 ≤ ρ < 1)', type: 'text', required: true, half: true, default: str(cur?.rho) },
    { key: 'sigma', label: 'SD at each visit', type: 'text', required: true, half: true, default: str(cur?.sigma) },
    { key: 'delta', label: 'Difference to detect at the target visit', type: 'text', required: true, half: true, default: str(cur?.delta) },
    { key: 'targetVisit', label: 'Target visit (optional; default final)', type: 'text', half: true, default: str(cur?.targetVisit) },
    { key: 'retention', label: 'Retention at each visit', type: 'text', required: true, desc: 'Comma-separated, one per visit, never increasing, e.g. 0.95, 0.9, 0.85.', default: Array.isArray(cur?.retention) ? (cur!.retention as unknown[]).map(str).join(', ') : '' },
    { key: 'allocationRatio', label: 'Allocation ratio n₂/n₁ (optional)', type: 'text', half: true, default: str(cur?.allocationRatio) },
    { key: 'source', label: 'Where the assumptions come from', type: 'text', default: str(cur?.source) },
  ];
}

/** One value per visit, in order: an empty slot is refused by position rather than dropped (which would shift every later visit). */
function retentionOf(s: string | undefined, visits: number): number[] {
  if (blank(s)) throw new ParseError('Retention at each visit is required.');
  const vals = String(s).split(',').map((x, i) => {
    if (blank(x)) throw new ParseError(`Retention value ${i + 1} is empty.`);
    return must(`Retention value ${i + 1}`, x, RETENTION);
  });
  if (vals.length !== visits) throw new ParseError(`Retention has ${vals.length} values for ${visits} visits: give one per visit.`);
  const rise = vals.findIndex((r, i) => i > 0 && r > vals[i - 1]);
  if (rise > 0) throw new ParseError(`Retention value ${rise + 1} (${vals[rise]}) is above value ${rise} (${vals[rise - 1]}): retention never increases.`);
  return vals;
}

function parseMmrm(v: Values): Parsed {
  return run(v, () => {
    const visits = must('Visits', v.visits, WHOLE_POSITIVE);
    if (visits > MMRM_MAX_VISITS) throw new ParseError(`Visits must be at most ${MMRM_MAX_VISITS}: "${visits}".`);
    const targetVisit = num('Target visit', v.targetVisit, false, WHOLE_POSITIVE);
    if (targetVisit !== undefined && targetVisit > visits) throw new ParseError(`Target visit ${targetVisit} is not one of the ${visits} modelled visits.`);
    return {
      endpointName: need('Endpoint', v.endpointName), visits,
      covariance: choice('Correlation structure', v.covariance, ['compound_symmetry', 'ar1']),
      rho: must('ρ', v.rho, CORRELATION), sigma: must('SD', v.sigma, POSITIVE), delta: must('Difference', v.delta, NON_ZERO),
      retention: retentionOf(v.retention, visits), targetVisit,
      allocationRatio: num('Allocation ratio', v.allocationRatio, false, POSITIVE), source: opt(v.source),
    };
  });
}

/* ── Registration titles ──────────────────────────────────────────────────── */

/** ClinicalTrials.gov's limits (PRS data element definitions), shown so the author sees them while typing. */
const BRIEF_TITLE_LIMIT = 300;
const ACRONYM_LIMIT = 14;

function titlesFields(cur: Obj | null, design: Obj): C2CFormField[] {
  const official = str(design.title);
  return [
    {
      key: 'publicTitle', label: 'Public (lay-language) title', type: 'text', default: str(cur?.publicTitle),
      desc: `What registries publish for the public (ClinicalTrials.gov Brief Title, at most ${BRIEF_TITLE_LIMIT} characters; WHO item 9; the EU CTIS public title). ` +
        `Written for the lay public — not the official title${official ? ` ("${official}")` : ''}, which is never used in its place.`,
    },
    { key: 'acronym', label: 'Acronym', type: 'text', half: true, default: str(cur?.acronym), desc: `If the study has one (ClinicalTrials.gov accepts at most ${ACRONYM_LIMIT} characters).` },
  ];
}

function parseTitles(v: Values): Parsed {
  return run(v, () => {
    const publicTitle = opt(v.publicTitle);
    const acronym = opt(v.acronym);
    if (publicTitle === undefined && acronym === undefined) throw new ParseError('Record a public title or an acronym, or choose Clear.');
    return { publicTitle, acronym };
  });
}

/** One block's form. `design` is the design the block belongs to (a sub-study names the design's own arms). */
export interface PlanningFormSpec {
  block: PlanningBlock;
  title: string;
  sub: string;
  fields: (current: Obj | null, design: Obj) => C2CFormField[];
  parse: (values: Values, design: Obj) => Parsed;
}

export const DOSE_FORM: PlanningFormSpec = { block: 'doseEscalation', title: 'Dose-escalation rules (BOIN)', sub: 'The BOIN engine computes the boundaries and the decision table from these.', fields: doseFields, parse: parseDose };
export const ACCRUAL_FORM: PlanningFormSpec = { block: 'accrualPlan', title: 'Site accrual plan', sub: 'Sponsor inputs: nothing here is assumed. The enrollment forecast runs on these rates.', fields: accrualFields, parse: parseAccrual };
export const MMRM_FORM: PlanningFormSpec = { block: 'mmrmAssumptions', title: 'MMRM planning assumptions', sub: 'Sponsor assumptions for the MMRM-analysed endpoint. Nothing is sized from a missing one.', fields: mmrmFields, parse: parseMmrm };
export const TITLES_FORM: PlanningFormSpec = { block: 'registrationTitles', title: 'Registration titles', sub: 'The public title and acronym registries publish beside the official title. Nothing is derived from the official title.', fields: titlesFields, parse: parseTitles };

export function withGovernance(fields: C2CFormField[]): C2CFormField[] {
  return [ACTION, ...fields, REASON];
}
export { ParseError, num, must, opt, need, choice, lines, unique, compact, run };
