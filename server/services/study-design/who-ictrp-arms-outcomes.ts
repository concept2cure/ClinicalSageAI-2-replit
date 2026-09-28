/**
 * WHO Trial Registration Data Set projection, part 2 — the arm and endpoint items
 * (TRDS v1.3.1 item 13 Intervention(s), item 19 Primary Outcome(s), item 20 Key
 * Secondary Outcomes), and the item-rendering constructors both parts share.
 * Split from `who-ictrp-registration.ts` for size; that module assembles the record
 * and is the only consumer.
 *
 * ── The need ──────────────────────────────────────────────────────────────────
 * TRDS item 13 asks, for each arm, for an intervention name and a description
 * "sufficiently detailed ... to distinguish between the arms", giving for drugs the
 * example "dosage form, dosage, frequency and duration". Items 19 and 20 ask, for
 * each outcome, for its name, the metric or method of measurement, and the
 * timepoint(s) — for a primary outcome, the timepoint(s) of primary interest. The
 * TRDS describes secondary outcomes as those of secondary interest or measured at
 * timepoints of secondary interest, so item 20 is the protocol's secondary
 * outcomes, not only the ICH E9 confirmatory "key secondary" tier.
 *
 * ── Honesty contract (CLAUDE.md — fail closed, never fabricate) ──────────────
 *   - Item 13 is `rendered` only when every intervention is named and carries the
 *     TRDS drug detail the design has a field for: dosage (`dose`), frequency
 *     (`regimen`) and duration. A placebo or a device is not asked for a dosage.
 *     Dosage form has no StudyDesign field and is not checked; route is rendered
 *     when recorded but is not treated as dosage form. Whether the recorded detail
 *     actually tells the arms apart is a reviewer's judgment, not decided here.
 *   - An unnamed arm is referred to by position ("arm 2 (unnamed)"), never as ": …".
 *   - A timepoint is only ever the one stated on the endpoint. When the endpoint
 *     states none, the Schedule of Activities visits that collect it are shown as
 *     "collected at (Schedule of Activities)" — screening and baseline included,
 *     each annotated when unscheduled, optional or conditional — and the item is
 *     `partial`: a collection visit is not a stated timepoint of interest. A cell
 *     pointing at a visit id that resolves to no visit is never shown; it is a gap.
 *   - An endpoint with neither name nor definition yields no outcome line; an
 *     unnamed one is named by its position in `StudyDesign.endpoints`.
 *   - Item 20 renders key secondary endpoints, then secondary ones, each labelled
 *     with its role. With no key secondary it is `partial` and says the secondary
 *     outcomes are unranked. Safety and exploratory endpoints are not rendered.
 *
 * Pure: no DB, RNG, clock or model call.
 *
 * Basis: WHO ICTRP Trial Registration Data Set (TRDS) v1.3.1, items 13, 19 and 20.
 *
 * @module server/services/study-design/who-ictrp-arms-outcomes
 */

import type { Arm, Endpoint, EndpointRole, Intervention, SoaCellState, SoaVisit, StudyDesign } from './study-design-types';
import type { RegistrationFieldStatus } from './registration-projection';
import { projectScheduleOfActivities, type SoaProjection } from './schedule-of-activities';
import { describeIntervention, NO_INTERVENTION_LABEL } from './trial-schema';
import { present } from './usdm-types';

export const WHO_ICTRP_ARMS_OUTCOMES_BASIS =
  'WHO ICTRP Trial Registration Data Set (TRDS) v1.3.1 — item 13 Intervention(s), item 19 Primary Outcome(s), item 20 Key Secondary Outcomes';

// ─── Item constructors (shared with who-ictrp-registration.ts) ───────────────

/** One item's rendering, before its number and official name are attached. */
export interface Rendering {
  status: RegistrationFieldStatus;
  value: string | string[] | null;
  gap?: string;
  source?: string;
}

export function rendered(value: string | string[], source: string): Rendering {
  return { status: 'rendered', value, source };
}

export function partial(value: string[], gap: string, source: string): Rendering {
  return { status: 'partial', value, gap, source };
}

export function missing(gap: string): Rendering {
  return { status: 'missing', value: null, gap };
}

/** Rendered when nothing is absent, partial when something is, missing when nothing is present. */
export function fromParts(values: string[], gaps: string[], source: string, emptyGap: string): Rendering {
  if (values.length === 0) return missing(gaps.length ? gaps.join(' ') : emptyGap);
  return gaps.length ? partial(values, gaps.join(' '), source) : rendered(values, source);
}

// ─── Item 13: interventions ──────────────────────────────────────────────────

/** The intervention fields that carry TRDS item 13's drug detail. */
export type TrdsInterventionDetail = 'dose' | 'regimen' | 'duration';

const DETAIL_LABEL: Readonly<Record<TrdsInterventionDetail, string>> = Object.freeze({
  dose: 'dosage (dose)',
  regimen: 'frequency (regimen)',
  duration: 'duration',
});

const DETAIL_GAP_LEAD =
  'TRDS item 13 asks for a description detailed enough to tell the arms apart (for drugs, e.g. dosage, frequency and duration)';

/**
 * The TRDS item-13 detail an intervention of this role must record: dosage,
 * frequency and duration; a placebo or a device carries no dosage. An
 * unrecognised role is asked for all three (fail closed).
 */
export function trdsRequiredInterventionDetail(role: Intervention['role']): TrdsInterventionDetail[] {
  return role === 'placebo' || role === 'device' ? ['regimen', 'duration'] : ['dose', 'regimen', 'duration'];
}

function armLabel(a: Arm, k: number): string {
  return present(a.name) ? a.name : `arm ${k + 1} (unnamed)`;
}

function armRef(a: Arm, k: number): string {
  return present(a.name) ? `arm "${a.name}"` : `arm ${k + 1} (unnamed)`;
}

/** trial-schema's "name dose route regimen", plus the duration and the role the arm gives it. */
function interventionText(i: Intervention): string {
  const duration = present(i.duration) ? `; duration ${i.duration}` : '';
  const role = present(i.role) ? i.role.replace(/_/g, ' ') : 'role not recorded';
  return `${describeIntervention(i)}${duration} (${role})`;
}

function interventionShortfall(i: Intervention, j: number, arm: string): string | null {
  const lacking = [
    ...(present(i.name) ? [] : ['name']),
    ...trdsRequiredInterventionDetail(i.role).filter(f => !present(i[f])).map(f => DETAIL_LABEL[f]),
  ];
  if (lacking.length === 0) return null;
  return `${present(i.name) ? `"${i.name}"` : `intervention ${j + 1}`} in ${arm} lacks ${lacking.join(', ')}`;
}

export function interventions(d: StudyDesign): Rendering {
  const arms = d.arms ?? [];
  if (arms.length === 0) return missing('StudyDesign.arms records no arm, so no intervention is recorded.');
  if (arms.every(a => (a.interventions ?? []).length === 0)) return missing('No arm in StudyDesign.arms records an intervention.');
  const values: string[] = [];
  const unnamed: string[] = [];
  const empty: string[] = [];
  const shortfalls: string[] = [];
  arms.forEach((a, k) => {
    const list = a.interventions ?? [];
    if (!present(a.name)) unnamed.push(armLabel(a, k));
    if (list.length === 0) empty.push(armLabel(a, k));
    values.push(`${armLabel(a, k)}: ${list.length ? list.map(interventionText).join(' + ') : NO_INTERVENTION_LABEL}`);
    list.forEach((i, j) => {
      const shortfall = interventionShortfall(i, j, armRef(a, k));
      if (shortfall) shortfalls.push(shortfall);
    });
  });
  const gaps: string[] = [];
  if (unnamed.length) gaps.push(`No name is recorded for ${unnamed.join(', ')}.`);
  if (empty.length) gaps.push(`No intervention is recorded for arm(s): ${empty.join(', ')}.`);
  if (shortfalls.length) gaps.push(`${DETAIL_GAP_LEAD}: ${shortfalls.join('; ')}.`);
  return fromParts(values, gaps, 'StudyDesign.arms[].interventions', '');
}

// ─── Items 19–20: outcomes ───────────────────────────────────────────────────

interface Collection {
  /** Resolved collecting visits, in column order, each annotated when not a planned, scheduled collection. */
  labels: string[];
  /** Visit ids a collecting cell points at that resolve to no visit. */
  dangling: string[];
}

const NO_COLLECTION: Collection = Object.freeze({ labels: [], dangling: [] }) as Collection;

function visitLabel(v: SoaVisit, states: Set<SoaCellState>): string {
  const day = typeof v.studyDay === 'number' ? ` (day ${v.studyDay})` : '';
  const notes = [...(v.unscheduled ? ['unscheduled'] : []), ...(states.has('performed') ? [] : [...states])];
  return `${present(v.name) ? v.name : `visit ${v.id}`}${day}${notes.length ? ` [${notes.join(', ')}]` : ''}`;
}

/** The visits the SoA grid collects an endpoint at, read from the projected grid so an unresolved visit id is never a label. */
function collectionOf(d: StudyDesign, grid: SoaProjection, endpointName: string): Collection {
  const rows = grid.rows.filter(r => (r.activity.endpointNames ?? []).includes(endpointName));
  if (rows.length === 0) return NO_COLLECTION;
  const labels = grid.visits.flatMap((v, k) => {
    const states = new Set(rows.flatMap(r => {
      const cell = r.cells[k];
      return cell ? [cell.state] : [];
    }));
    return states.size ? [visitLabel(v, states)] : [];
  });
  const known = new Set(grid.visits.map(v => v.id));
  const producing = new Set(rows.map(r => r.activity.id));
  const cells = d.scheduleOfActivities?.cells ?? [];
  const dangling = [...new Set(cells.filter(c => producing.has(c.activityId) && !known.has(c.visitId)).map(c => String(c.visitId)))];
  return { labels, dangling };
}

interface OutcomeLine {
  /** The rendered line; null when the endpoint records neither a name nor a definition. */
  text: string | null;
  ref: string;
  named: boolean;
  stated: boolean;
  collected: boolean;
  measured: boolean;
  dangling: string[];
}

interface Entry {
  e: Endpoint;
  index: number;
}

/** Name, metric/method and timepoint — each only as the endpoint records it. */
function outcomeLine(d: StudyDesign, grid: SoaProjection, { e, index }: Entry): OutcomeLine {
  const named = present(e.name);
  const ref = named ? e.name : `StudyDesign.endpoints[${index}] (unnamed)`;
  const stated = present(e.timepoint);
  const soa = named && !stated ? collectionOf(d, grid, e.name) : NO_COLLECTION;
  const base = { ref, named, stated, collected: soa.labels.length > 0, measured: present(e.definition) || present(e.measurementMethod), dangling: soa.dangling };
  if (!named && !present(e.definition)) return { ...base, text: null };
  const parts = [present(e.definition) ? `${ref}: ${e.definition}` : ref];
  if (present(e.measurementMethod)) parts.push(`method: ${e.measurementMethod}`);
  if (stated) parts.push(`timepoint: ${e.timepoint}`);
  else if (soa.labels.length) parts.push(`collected at (Schedule of Activities): ${soa.labels.join(', ')}`);
  return { ...base, text: parts.join('; ') };
}

function outcomeGaps(lines: OutcomeLine[]): string[] {
  const shown = lines.filter(l => l.text !== null);
  const refs = (from: OutcomeLine[], keep: (l: OutcomeLine) => boolean): string => from.filter(keep).map(l => l.ref).join(', ');
  const checks: Array<[string, (ids: string) => string]> = [
    [refs(lines, l => l.text === null), ids => `Not rendered, as neither a name nor a definition is recorded: ${ids}.`],
    [refs(shown, l => !l.named), ids => `Outcome name is not recorded for: ${ids}.`],
    [refs(shown, l => !l.stated && !l.collected), ids => `Timepoint is not recorded for: ${ids}.`],
    [
      refs(shown, l => !l.stated && l.collected),
      ids => `No timepoint is stated on the endpoint for: ${ids}; the Schedule of Activities visits that collect it are shown instead ("collected at"), which does not say which of them is the timepoint of interest.`,
    ],
    [refs(shown, l => !l.measured), ids => `Metric or method of measurement is not recorded for: ${ids}.`],
  ];
  const gaps = checks.filter(([ids]) => ids.length > 0).map(([ids, say]) => say(ids));
  for (const l of lines.filter(x => x.dangling.length)) {
    gaps.push(`The Schedule of Activities schedules ${l.ref} at visit id(s) ${l.dangling.map(id => `"${id}"`).join(', ')} that resolve to no visit; they are not rendered.`);
  }
  return gaps;
}

function entriesWithRole(d: StudyDesign, role: EndpointRole): Entry[] {
  return (d.endpoints ?? []).flatMap((e, index) => (e?.role === role ? [{ e, index }] : []));
}

function outcomeRendering(d: StudyDesign, entries: Entry[], label: (e: Endpoint) => string, leadGaps: string[], source: string): Rendering {
  const grid = projectScheduleOfActivities(d);
  const lines = entries.map(entry => outcomeLine(d, grid, entry));
  const values = lines.flatMap((l, k) => (l.text === null ? [] : [`${label(entries[k].e)}${l.text}`]));
  return fromParts(values, [...leadGaps, ...outcomeGaps(lines)], source, '');
}

const TIMEPOINT_SOURCE = 'timepoint from the endpoint; Schedule of Activities collection visits shown only when it states none';

/** TRDS item 19: the endpoints with role "primary". */
export function primaryOutcomes(d: StudyDesign): Rendering {
  const entries = entriesWithRole(d, 'primary');
  if (entries.length === 0) return missing('No endpoint has role "primary".');
  return outcomeRendering(d, entries, () => '', [], `StudyDesign.endpoints (role "primary"); ${TIMEPOINT_SOURCE}`);
}

/** TRDS item 20: key secondary endpoints, then secondary ones, each labelled with its role. */
export function secondaryOutcomes(d: StudyDesign): Rendering {
  const key = entriesWithRole(d, 'key_secondary');
  const secondary = entriesWithRole(d, 'secondary');
  if (key.length + secondary.length === 0) return missing('No endpoint has role "key_secondary" or "secondary".');
  const lead = key.length
    ? []
    : [`No endpoint has role "key_secondary"; the ${secondary.length} endpoint(s) with role "secondary" are rendered as the trial's secondary outcomes, unranked.`];
  const label = (e: Endpoint): string => (e.role === 'key_secondary' ? '[key secondary] ' : '[secondary] ');
  return outcomeRendering(d, [...key, ...secondary], label, lead, `StudyDesign.endpoints (roles "key_secondary", "secondary"); ${TIMEPOINT_SOURCE}`);
}
