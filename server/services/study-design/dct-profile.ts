/**
 * Decentralised-trial (DCT) profile of the Schedule of Activities.
 *
 * ── The need ──────────────────────────────────────────────────────────────────
 * FDA's guidance "Conducting Clinical Trials With Decentralized Elements" (final,
 * 2024) and the EMA/HMA/EC recommendation paper on decentralised elements in
 * clinical trials (2022) both expect a protocol with off-site elements to say
 * WHERE each trial activity happens (site, participant's home, a local health-care
 * provider or laboratory, a telehealth contact, a mobile unit) and, for the
 * off-site ones, to address IMP shipment and administration, remote consent, data
 * provenance for off-site samples, and how safety is overseen when assessments are
 * not done at the site. `SoaActivity.location` (`study-design-types.ts`) carries
 * the attribute; this module owns its vocabulary ({@link SoaActivityLocation}).
 *
 * One deterministic profile ({@link profileDecentralization}): per-activity
 * locations, the off-site share, the visits that could be run entirely off-site,
 * and four findings that name the protocol content the two documents above expect
 * for the decentralised elements the SoA actually states. Each per-activity
 * finding fires for EVERY stated off-site location, worded for that location.
 *
 * ── Honesty contract (CLAUDE.md — fail closed, never fabricate) ──────────────
 *   - An activity with no stated location is `'unstated'`. It is NOT assumed to
 *     be at the site: "the grid does not say" and "the grid says site" are
 *     different statements and never collapse into one another.
 *   - Unstated activities are excluded from the off-site share's DENOMINATOR.
 *     The share is over stated locations only, and says so in its `basis`.
 *   - No stated location at all → the share's value is `null` (not 0) and
 *     `notAssessed` says why. No SoA → every count is 0, the share is `null`
 *     and `notAssessed` names the missing Schedule of Activities.
 *   - A visit is listed as fully off-site capable only when EVERY activity
 *     scheduled at it has a stated off-site location. One unstated activity
 *     disqualifies it; a visit with nothing scheduled is never listed.
 *   - A finding that could not be evaluated because the relevant activities carry
 *     no location is reported in `notAssessed` — its absence from `findings` is
 *     not a clean result.
 *   - Structural defects are reported, never guessed through. An activity id
 *     defined more than once cannot be told apart by the cells, findings and
 *     explicit entries that name it, so every row carrying it resolves
 *     `'unstated'`. A duplicated visit id's cells, and a cell naming an undefined
 *     visit, are not counted. A visit with no epoch id, or naming an undefined or
 *     duplicated epoch, is grouped under no epoch and never given one. Each case
 *     is listed in `notAssessed`. (`analyzeScheduleOfActivities` reports the same
 *     defects as SOA-013/014/016; this profile only refuses to guess through them.)
 *   - Output does not depend on input order: rows, columns and epochs sort by
 *     `order`, then id (then name and category, so duplicated ids sort too).
 *
 * Pure: no model call, no RNG, no clock, no DB. The input is never mutated.
 *
 * @module server/services/study-design/dct-profile
 */

import type { ScheduleOfActivities, SoaActivity, SoaActivityCategory, SoaVisit } from './study-design-types';
import { uniqueIndex } from './usdm-types';

export const DCT_PROFILE_BASIS =
  'FDA guidance: Conducting Clinical Trials With Decentralized Elements (2024); ' +
  'EMA/HMA/EC recommendation paper on decentralised elements in clinical trials (2022)';

// ─── Vocabulary ──────────────────────────────────────────────────────────────

/** Where an SoA activity is performed. `site` is the investigator site; everything else is off-site. */
export type SoaActivityLocation = 'site' | 'home' | 'local_provider' | 'local_lab' | 'telehealth' | 'mobile_unit';

export const SOA_ACTIVITY_LOCATIONS: readonly SoaActivityLocation[] = [
  'site',
  'home',
  'local_provider',
  'local_lab',
  'telehealth',
  'mobile_unit',
] as const;

/** A resolved location: a stated one, or `'unstated'` when no location can be attributed. */
export type DctActivityLocation = SoaActivityLocation | 'unstated';

type OffSiteLocation = Exclude<SoaActivityLocation, 'site'>;

/** True only for a member of {@link SOA_ACTIVITY_LOCATIONS}; anything else is not a location. */
export function isSoaActivityLocation(value: unknown): value is SoaActivityLocation {
  return typeof value === 'string' && (SOA_ACTIVITY_LOCATIONS as readonly string[]).includes(value);
}

/**
 * RULE: off-site = any STATED location other than `'site'`. `'unstated'` is
 * neither site nor off-site; it is excluded from both sides of every measure.
 */
function isOffSite(location: DctActivityLocation | undefined): location is OffSiteLocation {
  return location !== undefined && location !== 'unstated' && location !== 'site';
}

/** How each off-site location reads in a finding. */
const WHERE: Record<OffSiteLocation, string> = {
  home: "at the participant's home",
  local_provider: 'by a local health-care provider',
  local_lab: 'at a local laboratory',
  telehealth: "by telehealth, with the participant at their own location",
  mobile_unit: 'by a mobile unit',
};

/** How the investigational product reaches each off-site location. */
const IMP_ROUTE: Record<OffSiteLocation, string> = {
  home: 'direct-to-participant shipment',
  local_provider: 'shipment to the local health-care provider',
  local_lab: 'shipment to the local laboratory',
  telehealth: 'direct-to-participant shipment',
  mobile_unit: 'transport by the mobile unit',
};

// ─── Profile model ───────────────────────────────────────────────────────────

export interface DctActivityProfile {
  activityId: string;
  name: string;
  category: SoaActivityCategory;
  location: DctActivityLocation;
}

export interface DctOffSiteShare {
  /** numerator / denominator, or `null` when no activity has a stated location. Never 0-for-unknown. */
  value: number | null;
  /** Activities with a stated off-site location. */
  numerator: number;
  /** Activities with any stated location. Unstated activities are not in it. */
  denominator: number;
  basis: 'stated locations only';
}

export interface DctMeasures {
  activitiesTotal: number;
  activitiesWithStatedLocation: number;
  offSiteShare: DctOffSiteShare;
  /** Visit ids (column order) at which every scheduled activity has a stated off-site location. */
  visitsFullyOffSiteCapable: string[];
}

export type DctFindingCode = 'DCT-IMP-OFFSITE' | 'DCT-SAFETY-REMOTE' | 'DCT-PK-OFFSITE' | 'DCT-CONSENT-REMOTE';

export interface DctFinding {
  severity: 'info' | 'warning';
  code: DctFindingCode;
  message: string;
  activityIds?: string[];
  visitIds?: string[];
}

export interface DctProfile {
  activities: DctActivityProfile[];
  measures: DctMeasures;
  findings: DctFinding[];
  /** What could not be assessed, and why. Empty only when nothing was left unassessed. */
  notAssessed: string[];
  basis: string;
}

// ─── Ordering and ids ────────────────────────────────────────────────────────

function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Order, then id, then name — a total order even over duplicated ids. */
function byOrderThenId<T extends { id: string; order: number; name: string }>(a: T, b: T): number {
  return (a.order ?? 0) - (b.order ?? 0) || compareIds(a.id, b.id) || compareIds(String(a.name ?? ''), String(b.name ?? ''));
}

function byActivity(a: SoaActivity, b: SoaActivity): number {
  return byOrderThenId(a, b) || compareIds(String(a.category ?? ''), String(b.category ?? ''));
}

/** Ids that occur more than once (sorted). Uses the shared {@link uniqueIndex}. */
function duplicateIds(items: readonly { id: string }[]): string[] {
  const index = uniqueIndex(items, i => i.id);
  return [...new Set(items.map(i => i.id).filter(id => index.ambiguous(id)))].sort(compareIds);
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (!list) map.set(key, [value]);
  else if (!list.includes(value)) list.push(value);
}

// ─── Reading locations ───────────────────────────────────────────────────────

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/**
 * An activity's own `location`. Only a member of {@link SOA_ACTIVITY_LOCATIONS}
 * is taken; any other value (a misspelling, a different case, a number, null) is
 * ignored, so the activity stays unstated rather than being coerced.
 */
function ownLocation(activity: SoaActivity): SoaActivityLocation | null {
  const location: unknown = activity.location;
  return isSoaActivityLocation(location) ? location : null;
}

/**
 * Each activity's own stated location, keyed by id. An id defined more than once
 * is omitted: a map can hold one location per id, and picking one would be a guess.
 */
export function locationsFromSoa(soa: ScheduleOfActivities): Record<string, SoaActivityLocation> {
  const activities = soa?.activities ?? [];
  const duplicated = new Set(duplicateIds(activities));
  const entries: Array<[string, SoaActivityLocation]> = [];
  for (const activity of activities) {
    const location = ownLocation(activity);
    if (location && !duplicated.has(activity.id)) entries.push([activity.id, location]);
  }
  // fromEntries defines own properties, so an id such as "__proto__" cannot reach the prototype.
  return Object.fromEntries(entries);
}

/**
 * RULE: a duplicated id resolves `'unstated'`. Otherwise an explicit entry takes
 * precedence over the row's own attribute; an explicit value outside the
 * vocabulary is not applied (and is reported).
 */
function resolveLocation(
  activity: SoaActivity,
  explicit: Record<string, SoaActivityLocation>,
  duplicated: boolean,
): DctActivityLocation {
  if (duplicated) return 'unstated';
  if (hasOwn(explicit, activity.id) && isSoaActivityLocation(explicit[activity.id])) return explicit[activity.id];
  return ownLocation(activity) ?? 'unstated';
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface Structure {
  duplicateActivityIds: Set<string>;
  duplicateVisitIds: string[];
  duplicateEpochIds: string[];
  /** Cells naming a duplicated visit id: not attributable to one visit. */
  ambiguousVisitCells: number;
  /** Per undefined visit id (sorted): the activity ids its cells name. */
  strayCells: Map<string, string[]>;
  /** Visits (column order) in no uniquely defined epoch, each with the reason. */
  orphanVisits: string[];
}

interface Placement {
  /** Activity ids (row order, deduplicated) scheduled at each visit. */
  scheduledAt: Map<string, string[]>;
  /** Visit ids (column order) at which each activity is scheduled. */
  visitsOf: Map<string, string[]>;
  /** Per visit: activity ids named by a cell that are not defined in the SoA. */
  undefinedAt: Map<string, string[]>;
  strayCells: Map<string, string[]>;
  ambiguousVisitCells: number;
}

interface Ctx extends Placement {
  rows: DctActivityProfile[];
  locationById: Map<string, DctActivityLocation>;
  /** Visits with a unique id, in column order. */
  visits: SoaVisit[];
  epochs: Array<{ id: string; name: string; visitIds: string[] }>;
  structure: Structure;
}

/**
 * RULE (what "scheduled at a visit" means): the SoA grid is sparse and lists a
 * cell only where the activity is performed, conditional or optional at that
 * visit. Every listed cell counts as scheduled, whatever its state — a
 * conditional or optional activity that does take place still takes place
 * somewhere, so a visit is off-site capable only if it could be done off-site.
 */
function placeCells(
  soa: ScheduleOfActivities,
  activityRank: Map<string, number>,
  visitRank: Map<string, number>,
  duplicateVisits: Set<string>,
): Placement {
  const p: Placement = {
    scheduledAt: new Map(), visitsOf: new Map(), undefinedAt: new Map(), strayCells: new Map(), ambiguousVisitCells: 0,
  };
  const cells = [...(soa.cells ?? [])].sort((a, b) =>
    (visitRank.get(a.visitId) ?? Infinity) - (visitRank.get(b.visitId) ?? Infinity) ||
    compareIds(a.visitId, b.visitId) ||
    (activityRank.get(a.activityId) ?? Infinity) - (activityRank.get(b.activityId) ?? Infinity) ||
    compareIds(a.activityId, b.activityId));
  for (const cell of cells) {
    if (duplicateVisits.has(cell.visitId)) p.ambiguousVisitCells += 1;
    else if (!visitRank.has(cell.visitId)) push(p.strayCells, cell.visitId, cell.activityId);
    else if (!activityRank.has(cell.activityId)) push(p.undefinedAt, cell.visitId, cell.activityId);
    else {
      push(p.scheduledAt, cell.visitId, cell.activityId);
      push(p.visitsOf, cell.activityId, cell.visitId);
    }
  }
  return p;
}

function whyNoEpoch(epochId: unknown, duplicated: Set<string>): string {
  if (typeof epochId !== 'string' || epochId === '') return 'no epoch id';
  return duplicated.has(epochId) ? `epoch "${epochId}" is defined more than once` : `epoch "${epochId}" is not defined`;
}

/** RULE: a visit is grouped only under an epoch defined exactly once; no epoch is ever synthesised. */
function groupEpochs(soa: ScheduleOfActivities, visits: SoaVisit[], duplicated: Set<string>) {
  const defined = (soa.epochs ?? []).filter(e => !duplicated.has(e.id)).sort(byOrderThenId);
  const definedIds = new Set(defined.map(e => e.id));
  const epochs = defined
    .map(e => ({ id: e.id, name: e.name || e.id, visitIds: visits.filter(v => v.epochId === e.id).map(v => v.id) }))
    .filter(e => e.visitIds.length > 0);
  const orphanVisits = visits
    .filter(v => !definedIds.has(v.epochId))
    .map(v => `${v.id} (${whyNoEpoch(v.epochId, duplicated)})`);
  return { epochs, orphanVisits };
}

function buildCtx(soa: ScheduleOfActivities, explicit: Record<string, SoaActivityLocation>): Ctx {
  const duplicateActivityIds = new Set(duplicateIds(soa.activities ?? []));
  const duplicateVisitIds = duplicateIds(soa.visits ?? []);
  const duplicateEpochIds = duplicateIds(soa.epochs ?? []);
  const dupVisits = new Set(duplicateVisitIds);
  const activities = [...(soa.activities ?? [])].sort(byActivity);
  const visits = (soa.visits ?? []).filter(v => !dupVisits.has(v.id)).sort(byOrderThenId);
  const rows = activities.map(a => ({
    activityId: a.id,
    name: a.name,
    category: a.category,
    location: resolveLocation(a, explicit, duplicateActivityIds.has(a.id)),
  }));
  const placement = placeCells(
    soa,
    new Map(activities.map((a, i) => [a.id, i] as const)),
    new Map(visits.map((v, i) => [v.id, i] as const)),
    dupVisits,
  );
  const { epochs, orphanVisits } = groupEpochs(soa, visits, new Set(duplicateEpochIds));
  return {
    ...placement,
    rows,
    locationById: new Map(rows.map(r => [r.activityId, r.location] as const)),
    visits,
    epochs,
    structure: {
      duplicateActivityIds,
      duplicateVisitIds,
      duplicateEpochIds,
      ambiguousVisitCells: placement.ambiguousVisitCells,
      strayCells: placement.strayCells,
      orphanVisits,
    },
  };
}

// ─── Measures ────────────────────────────────────────────────────────────────

/**
 * RULES: the denominator is activities with a STATED location (unstated are
 * excluded, never counted as site); the numerator is those stated off-site;
 * zero stated → value null, because 0 would claim "all at site".
 */
function offSiteShare(rows: DctActivityProfile[]): DctOffSiteShare {
  const stated = rows.filter(r => r.location !== 'unstated');
  const numerator = stated.filter(r => isOffSite(r.location)).length;
  const denominator = stated.length;
  return {
    value: denominator === 0 ? null : numerator / denominator,
    numerator,
    denominator,
    basis: 'stated locations only',
  };
}

/**
 * RULE: listed only when the visit schedules at least one activity, names no
 * undefined activity, and every scheduled activity has a stated off-site location.
 */
function fullyOffSiteVisits(ctx: Ctx): string[] {
  return ctx.visits
    .filter(v => {
      const scheduled = ctx.scheduledAt.get(v.id) ?? [];
      if (scheduled.length === 0 || ctx.undefinedAt.has(v.id)) return false;
      return scheduled.every(id => isOffSite(ctx.locationById.get(id)));
    })
    .map(v => v.id);
}

// ─── Findings: one activity at a time ────────────────────────────────────────

interface ActivityRule {
  code: DctFindingCode;
  severity: DctFinding['severity'];
  categories: readonly SoaActivityCategory[];
  /** Plural noun for the activities the rule reads, used in the not-assessed line. */
  subject: string;
  message: (row: DctActivityProfile, where: OffSiteLocation) => string;
}

/** RULE: each fires for every stated OFF-SITE location of an activity in its categories — never for site or unstated. */
const ACTIVITY_RULES: readonly ActivityRule[] = [
  {
    code: 'DCT-IMP-OFFSITE',
    severity: 'warning',
    categories: ['drug_administration'],
    subject: 'drug-administration activities',
    message: (r, where) =>
      `Drug administration "${r.name}" takes place off-site, ${WHERE[where]}. The protocol should address how the ` +
      `investigational product reaches that location (${IMP_ROUTE[where]}), its storage and handling there, who ` +
      'administers or supervises administration, and accountability and return of unused product.',
  },
  {
    code: 'DCT-PK-OFFSITE',
    severity: 'warning',
    categories: ['pk', 'biomarker'],
    subject: 'PK and biomarker activities',
    message: (r, where) =>
      `${r.category === 'pk' ? 'PK' : 'Biomarker'} activity "${r.name}" is collected off-site, ${WHERE[where]}. ` +
      (where === 'telehealth'
        ? 'A telehealth contact does not itself collect a sample, so the protocol should say who collects it and where. '
        : '') +
      'The protocol should address sample collection timing, processing, storage and shipment conditions, ' +
      'chain of custody, and the provenance of the resulting data.',
  },
  {
    // Nearest real categories: the SoA vocabulary has no "consent" category —
    // consent is an 'administrative' activity and eligibility is 'eligibility'.
    // Both are read, by category, never by keyword-matching activity names.
    code: 'DCT-CONSENT-REMOTE',
    severity: 'info',
    categories: ['administrative', 'eligibility'],
    subject: 'administrative and eligibility activities',
    message: (r, where) =>
      `${r.category === 'eligibility' ? 'Eligibility' : 'Administrative'} activity "${r.name}" is conducted ` +
      `off-site, ${WHERE[where]}. If it includes informed consent, the protocol should describe remote consent ` +
      '(identity verification, how consent is documented, and how questions are answered); if it confirms ' +
      'eligibility, how eligibility is verified away from the site.',
  },
];

function activityRuleFindings(ctx: Ctx): { findings: DctFinding[]; notAssessed: string[] } {
  const findings: DctFinding[] = [];
  const notAssessed: string[] = [];
  for (const rule of ACTIVITY_RULES) {
    const inScope = ctx.rows.filter(r => rule.categories.includes(r.category));
    for (const row of inScope) {
      if (!isOffSite(row.location)) continue;
      const visitIds = ctx.visitsOf.get(row.activityId) ?? [];
      findings.push({
        severity: rule.severity,
        code: rule.code,
        message: rule.message(row, row.location),
        activityIds: [row.activityId],
        ...(visitIds.length > 0 ? { visitIds } : {}),
      });
    }
    // Duplicated ids are unstated too; the structural gap line names them.
    const unstated = inScope
      .filter(r => r.location === 'unstated' && !ctx.structure.duplicateActivityIds.has(r.activityId))
      .map(r => r.activityId);
    if (unstated.length > 0) {
      notAssessed.push(
        `${rule.code} not assessed for ${rule.subject} without a stated location: ${unstated.join(', ')}.`,
      );
    }
  }
  return { findings, notAssessed };
}

// ─── Findings: safety oversight per epoch ────────────────────────────────────

function notCounted(ids: string[], one: string, many: string): string {
  if (ids.length === 0) return '';
  const n = ids.length;
  return ` ${n} further scheduled safety ${n === 1 ? `activity ${one}` : `activities ${many}`} ` +
    `(${ids.join(', ')}) and ${n === 1 ? 'was' : 'were'} not counted.`;
}

function safetyFinding(ctx: Ctx, epoch: Ctx['epochs'][number], safetyIds: string[], stated: string[]): DctFinding {
  const unresolved = safetyIds.filter(id => !stated.includes(id));
  const duplicated = unresolved.filter(id => ctx.structure.duplicateActivityIds.has(id));
  const unstated = unresolved.filter(id => !ctx.structure.duplicateActivityIds.has(id));
  return {
    severity: 'warning',
    code: 'DCT-SAFETY-REMOTE',
    message:
      `In epoch "${epoch.name}" every scheduled safety activity with a stated location is off-site ` +
      `(${stated.join(', ')}) and none is at the site. The protocol should state how safety is overseen for ` +
      'off-site assessments: who reviews the results and when, how adverse events are identified and reported, ' +
      'and when a participant is brought to the site.' +
      notCounted(unstated, 'has no stated location', 'have no stated location') +
      notCounted(duplicated, 'has an id defined more than once', 'have ids defined more than once'),
    activityIds: stated,
    // RULE: the visits that schedule a STATED safety activity — not those scheduling only unresolved ones.
    visitIds: epoch.visitIds.filter(v => (ctx.scheduledAt.get(v) ?? []).some(id => stated.includes(id))),
  };
}

/**
 * RULE (DCT-SAFETY-REMOTE): within an epoch, take the safety activities
 * scheduled at any of its visits. If at least one has a stated location, and
 * every one with a stated location is off-site (none at the site), warn. If none
 * has a stated location the epoch is not assessed — silence would read as clean.
 */
function safetyFindings(ctx: Ctx): { findings: DctFinding[]; notAssessed: string[] } {
  const findings: DctFinding[] = [];
  const notAssessed: string[] = [];
  for (const epoch of ctx.epochs) {
    const scheduled = new Set(epoch.visitIds.flatMap(v => ctx.scheduledAt.get(v) ?? []));
    const safetyIds = [
      ...new Set(ctx.rows.filter(r => r.category === 'safety' && scheduled.has(r.activityId)).map(r => r.activityId)),
    ];
    if (safetyIds.length === 0) continue;
    const stated = safetyIds.filter(id => ctx.locationById.get(id) !== 'unstated');
    if (stated.length === 0) {
      notAssessed.push(
        `DCT-SAFETY-REMOTE not assessed for epoch "${epoch.name}": none of its scheduled safety activities ` +
          `has a stated location that can be attributed to it (${safetyIds.join(', ')}).`,
      );
      continue;
    }
    if (stated.every(id => isOffSite(ctx.locationById.get(id)))) findings.push(safetyFinding(ctx, epoch, safetyIds, stated));
  }
  return { findings, notAssessed };
}

// ─── Gap ledger ──────────────────────────────────────────────────────────────

function coverageGaps(ctx: Ctx, share: DctOffSiteShare): string[] {
  const gaps: string[] = [];
  if (ctx.rows.length === 0) {
    gaps.push('The Schedule of Activities lists no activities; the off-site share is not assessed.');
    return gaps;
  }
  const unstated = ctx.rows
    .filter(r => r.location === 'unstated' && !ctx.structure.duplicateActivityIds.has(r.activityId))
    .map(r => r.activityId);
  if (share.value === null) {
    gaps.push(
      'No activity has a stated location that can be attributed to it, so the off-site share is not assessed. ' +
        'An unstated location is not assumed to be the site.',
    );
  }
  if (unstated.length > 0) {
    gaps.push(
      `${unstated.length} of ${ctx.rows.length} activities have no stated location (${unstated.join(', ')}); ` +
        'they are excluded from the off-site share and are not counted as site.',
    );
  }
  return gaps;
}

function structureGaps(s: Structure): string[] {
  const gaps: string[] = [];
  if (s.duplicateActivityIds.size > 0) {
    gaps.push(
      `Activity id(s) ${[...s.duplicateActivityIds].join(', ')} are defined more than once; a cell, finding or ` +
        'explicit location naming such an id cannot be attributed to one activity, so every row carrying it is ' +
        'resolved unstated: excluded from the off-site share and from every finding, and a visit scheduling it ' +
        'is not counted as fully off-site capable.',
    );
  }
  if (s.duplicateVisitIds.length > 0) {
    gaps.push(
      `Visit id(s) ${s.duplicateVisitIds.join(', ')} are defined more than once; the ${s.ambiguousVisitCells} ` +
        'cell(s) naming them cannot be attributed to one visit and are not counted, and those visits are not ' +
        'assessed for off-site capability or safety oversight.',
    );
  }
  if (s.duplicateEpochIds.length > 0) {
    gaps.push(
      `Epoch id(s) ${s.duplicateEpochIds.join(', ')} are defined more than once; no visit is grouped under them.`,
    );
  }
  if (s.strayCells.size > 0) {
    const named = [...s.strayCells].map(([visitId, ids]) => `${visitId}: ${ids.join(', ')}`).join('; ');
    gaps.push(
      `Cells name visit(s) not defined in the Schedule of Activities (${named}); they are not counted toward ` +
        'visit capability or safety oversight.',
    );
  }
  if (s.orphanVisits.length > 0) {
    gaps.push(
      `Visit(s) ${s.orphanVisits.join(', ')} belong to no uniquely defined epoch; they are grouped under no epoch, ` +
        'so DCT-SAFETY-REMOTE is not assessed for them.',
    );
  }
  return gaps;
}

function visitGaps(ctx: Ctx): string[] {
  const gaps: string[] = [];
  const empty = ctx.visits.filter(v => (ctx.scheduledAt.get(v.id) ?? []).length === 0 && !ctx.undefinedAt.has(v.id));
  if (empty.length > 0) {
    gaps.push(
      `Visit(s) ${empty.map(v => v.id).join(', ')} schedule no activity; off-site capability is not assessed ` +
        'for them.',
    );
  }
  for (const v of ctx.visits) {
    const undefinedIds = ctx.undefinedAt.get(v.id);
    if (!undefinedIds) continue;
    gaps.push(
      `Visit ${v.id} has cells for activities not defined in the Schedule of Activities ` +
        `(${undefinedIds.join(', ')}); it is not counted as fully off-site capable.`,
    );
  }
  return gaps;
}

function explicitGaps(soa: ScheduleOfActivities, explicit: Record<string, SoaActivityLocation>, dup: Set<string>): string[] {
  const known = new Set((soa.activities ?? []).map(a => a.id));
  const keys = Object.keys(explicit).sort(compareIds);
  const ambiguous = keys.filter(k => dup.has(k));
  const invalid = keys.filter(k => known.has(k) && !dup.has(k) && !isSoaActivityLocation(explicit[k]));
  const unknown = keys.filter(k => !known.has(k));
  const gaps: string[] = [];
  if (ambiguous.length > 0) {
    gaps.push(`Explicit location(s) for ${ambiguous.join(', ')} were not applied: the id is defined more than once.`);
  }
  if (invalid.length > 0) {
    gaps.push(`Explicit location(s) for ${invalid.join(', ')} are not recognised locations and were not applied.`);
  }
  if (unknown.length > 0) {
    gaps.push(`Explicit location(s) were supplied for ids that are not SoA activities (${unknown.join(', ')}); not applied.`);
  }
  return gaps;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

function noSoaProfile(): DctProfile {
  return {
    activities: [],
    measures: {
      activitiesTotal: 0,
      activitiesWithStatedLocation: 0,
      offSiteShare: { value: null, numerator: 0, denominator: 0, basis: 'stated locations only' },
      visitsFullyOffSiteCapable: [],
    },
    findings: [],
    notAssessed: ['No Schedule of Activities is attached; the decentralisation profile cannot be assessed.'],
    basis: DCT_PROFILE_BASIS,
  };
}

/**
 * Profile the decentralised elements of a Schedule of Activities. `locations`
 * entries take precedence over each activity's own `location` attribute.
 * Deterministic: the same input yields the same profile, independent of the
 * order in which activities, visits, epochs or cells are listed.
 */
export function profileDecentralization(
  soa: ScheduleOfActivities | null | undefined,
  locations: Record<string, SoaActivityLocation> = {},
): DctProfile {
  if (!soa) return noSoaProfile();
  const explicit = locations ?? {};
  const ctx = buildCtx(soa, explicit);
  const share = offSiteShare(ctx.rows);
  const activityRules = activityRuleFindings(ctx);
  const safety = safetyFindings(ctx);
  return {
    activities: ctx.rows,
    measures: {
      activitiesTotal: ctx.rows.length,
      activitiesWithStatedLocation: share.denominator,
      offSiteShare: share,
      visitsFullyOffSiteCapable: fullyOffSiteVisits(ctx),
    },
    findings: [...activityRules.findings, ...safety.findings],
    notAssessed: [
      ...coverageGaps(ctx, share),
      ...structureGaps(ctx.structure),
      ...visitGaps(ctx),
      ...explicitGaps(soa, explicit, ctx.structure.duplicateActivityIds),
      ...activityRules.notAssessed,
      ...safety.notAssessed,
    ],
    basis: DCT_PROFILE_BASIS,
  };
}
