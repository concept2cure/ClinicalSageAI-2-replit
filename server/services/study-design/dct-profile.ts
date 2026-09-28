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
 * not done at the site. The Schedule of Activities model (`study-design-types.ts`,
 * `SoaActivity`) had no location attribute and nothing profiled decentralisation.
 *
 * This module defines the location vocabulary ({@link SoaActivityLocation}) and
 * one deterministic profile ({@link profileDecentralization}): per-activity
 * locations, the off-site share, the visits that could be run entirely off-site,
 * and four findings that name the protocol content the two documents above expect
 * for the decentralised elements the SoA actually states.
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
 *
 * Pure: no model call, no RNG, no clock, no DB.
 *
 * @module server/services/study-design/dct-profile
 */

import type { ScheduleOfActivities, SoaActivityCategory, SoaVisit } from './study-design-types';

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

/** A resolved location: a stated one, or `'unstated'` when neither source states one. */
export type DctActivityLocation = SoaActivityLocation | 'unstated';

/** True only for a member of {@link SOA_ACTIVITY_LOCATIONS}; anything else is not a location. */
export function isSoaActivityLocation(value: unknown): value is SoaActivityLocation {
  return typeof value === 'string' && (SOA_ACTIVITY_LOCATIONS as readonly string[]).includes(value);
}

/**
 * RULE: off-site = any STATED location other than `'site'`. `'unstated'` is
 * neither site nor off-site; it is excluded from both sides of every measure.
 */
function isOffSite(location: DctActivityLocation): boolean {
  return location !== 'unstated' && location !== 'site';
}

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

export type DctFindingCode = 'DCT-IMP-HOME' | 'DCT-SAFETY-REMOTE' | 'DCT-PK-OFFSITE' | 'DCT-CONSENT-REMOTE';

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

// ─── Reading locations ───────────────────────────────────────────────────────

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/**
 * Read each activity's own `location` attribute. Only a member of
 * {@link SOA_ACTIVITY_LOCATIONS} is taken; any other value (a misspelling, a
 * different case, a number, null) is ignored, so the activity stays unstated
 * rather than being coerced into a location it did not state.
 */
export function locationsFromSoa(soa: ScheduleOfActivities): Record<string, SoaActivityLocation> {
  const entries: Array<[string, SoaActivityLocation]> = [];
  for (const activity of soa?.activities ?? []) {
    const location = (activity as { location?: unknown }).location;
    if (isSoaActivityLocation(location)) entries.push([activity.id, location]);
  }
  // fromEntries defines own properties, so an id such as "__proto__" cannot reach the prototype.
  return Object.fromEntries(entries);
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface Ctx {
  rows: DctActivityProfile[];
  locationById: Map<string, DctActivityLocation>;
  visits: SoaVisit[];
  epochs: Array<{ id: string; name: string; visitIds: string[] }>;
  /** Activity ids (row order, deduplicated) scheduled at each visit. */
  scheduledAt: Map<string, string[]>;
  /** Visit ids (column order) at which each activity is scheduled. */
  visitsOf: Map<string, string[]>;
  /** Per visit: activity ids named by a cell that are not defined in the SoA. */
  undefinedAt: Map<string, string[]>;
}

function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function byOrderThenId<T extends { id: string; order: number }>(a: T, b: T): number {
  return (a.order ?? 0) - (b.order ?? 0) || compareIds(a.id, b.id);
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (!list) map.set(key, [value]);
  else if (!list.includes(value)) list.push(value);
}

/**
 * Explicit entries take precedence over the activity's own attribute. An
 * explicit value outside the vocabulary is not applied (and is reported).
 */
function resolveLocation(
  id: string,
  explicit: Record<string, SoaActivityLocation>,
  fromSoa: Record<string, SoaActivityLocation>,
): DctActivityLocation {
  if (hasOwn(explicit, id) && isSoaActivityLocation(explicit[id])) return explicit[id];
  if (hasOwn(fromSoa, id)) return fromSoa[id];
  return 'unstated';
}

function groupEpochs(soa: ScheduleOfActivities, visits: SoaVisit[]): Ctx['epochs'] {
  const defined = [...(soa.epochs ?? [])].sort(byOrderThenId);
  const referenced = [...new Set(visits.map(v => v.epochId))];
  const orphanIds = referenced.filter(id => !defined.some(e => e.id === id)).sort(compareIds);
  const ordered = [
    ...defined.map(e => ({ id: e.id, name: e.name || e.id })),
    ...orphanIds.map(id => ({ id, name: id })),
  ];
  return ordered
    .map(e => ({ ...e, visitIds: visits.filter(v => v.epochId === e.id).map(v => v.id) }))
    .filter(e => e.visitIds.length > 0);
}

/**
 * RULE (what "scheduled at a visit" means): the SoA grid is sparse and lists a
 * cell only where the activity is performed, conditional or optional at that
 * visit. Every listed cell counts as scheduled, whatever its state — a
 * conditional or optional activity that does take place still takes place
 * somewhere, so a visit is off-site capable only if it could be done off-site.
 */
function buildCtx(soa: ScheduleOfActivities, explicit: Record<string, SoaActivityLocation>): Ctx {
  const fromSoa = locationsFromSoa(soa);
  const activities = [...(soa.activities ?? [])].sort(byOrderThenId);
  const visits = [...(soa.visits ?? [])].sort(byOrderThenId);
  const rows = activities.map(a => ({
    activityId: a.id,
    name: a.name,
    category: a.category,
    location: resolveLocation(a.id, explicit, fromSoa),
  }));
  const locationById = new Map(rows.map(r => [r.activityId, r.location] as const));
  const activityRank = new Map(activities.map((a, i) => [a.id, i] as const));
  const visitRank = new Map(visits.map((v, i) => [v.id, i] as const));

  const scheduledAt = new Map<string, string[]>();
  const visitsOf = new Map<string, string[]>();
  const undefinedAt = new Map<string, string[]>();
  const cells = [...(soa.cells ?? [])]
    .filter(c => visitRank.has(c.visitId))
    .sort((a, b) =>
      (visitRank.get(a.visitId) ?? 0) - (visitRank.get(b.visitId) ?? 0) ||
      (activityRank.get(a.activityId) ?? Infinity) - (activityRank.get(b.activityId) ?? Infinity) ||
      compareIds(a.activityId, b.activityId));
  for (const cell of cells) {
    if (!activityRank.has(cell.activityId)) {
      push(undefinedAt, cell.visitId, cell.activityId);
      continue;
    }
    push(scheduledAt, cell.visitId, cell.activityId);
    push(visitsOf, cell.activityId, cell.visitId);
  }
  return { rows, locationById, visits, epochs: groupEpochs(soa, visits), scheduledAt, visitsOf, undefinedAt };
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
      return scheduled.every(id => isOffSite(ctx.locationById.get(id) ?? 'unstated'));
    })
    .map(v => v.id);
}

// ─── Findings: one activity at a time ────────────────────────────────────────

interface ActivityRule {
  code: DctFindingCode;
  severity: DctFinding['severity'];
  categories: readonly SoaActivityCategory[];
  locations: readonly SoaActivityLocation[];
  /** Plural noun for the activities the rule reads, used in the not-assessed line. */
  subject: string;
  message: (row: DctActivityProfile) => string;
}

const ACTIVITY_RULES: readonly ActivityRule[] = [
  {
    code: 'DCT-IMP-HOME',
    severity: 'warning',
    categories: ['drug_administration'],
    locations: ['home'],
    subject: 'drug-administration activities',
    message: r =>
      `Drug administration "${r.name}" takes place at the participant's home. The protocol should address ` +
      'investigational medicinal product shipment to the participant, storage and handling, who administers or ' +
      'supervises administration, and accountability and return of unused product.',
  },
  {
    code: 'DCT-PK-OFFSITE',
    severity: 'warning',
    categories: ['pk', 'biomarker'],
    locations: ['home', 'local_lab'],
    subject: 'PK and biomarker activities',
    message: r =>
      `${r.category === 'pk' ? 'PK' : 'Biomarker'} activity "${r.name}" is collected off-site (${r.location}). ` +
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
    locations: ['telehealth'],
    subject: 'administrative and eligibility activities',
    message: r =>
      `${r.category === 'eligibility' ? 'Eligibility' : 'Administrative'} activity "${r.name}" is conducted by ` +
      'telehealth. If it includes informed consent, the protocol should describe remote consent (identity ' +
      'verification, how consent is documented, and how questions are answered); if it confirms eligibility, ' +
      'how eligibility is verified remotely.',
  },
];

function activityRuleFindings(ctx: Ctx): { findings: DctFinding[]; notAssessed: string[] } {
  const findings: DctFinding[] = [];
  const notAssessed: string[] = [];
  for (const rule of ACTIVITY_RULES) {
    const inScope = ctx.rows.filter(r => rule.categories.includes(r.category));
    for (const row of inScope) {
      if (row.location === 'unstated' || !rule.locations.includes(row.location)) continue;
      const visitIds = ctx.visitsOf.get(row.activityId) ?? [];
      findings.push({
        severity: rule.severity,
        code: rule.code,
        message: rule.message(row),
        activityIds: [row.activityId],
        ...(visitIds.length > 0 ? { visitIds } : {}),
      });
    }
    const unstated = inScope.filter(r => r.location === 'unstated').map(r => r.activityId);
    if (unstated.length > 0) {
      notAssessed.push(
        `${rule.code} not assessed for ${rule.subject} without a stated location: ${unstated.join(', ')}.`,
      );
    }
  }
  return { findings, notAssessed };
}

// ─── Findings: safety oversight per epoch ────────────────────────────────────

/**
 * RULE (DCT-SAFETY-REMOTE): within an epoch, take the safety activities
 * scheduled at any of its visits. If at least one has a stated location, and
 * every one with a stated location is off-site (none at the site), warn. If none
 * has a stated location the epoch is not assessed — silence would read as clean.
 */
function safetyFindings(ctx: Ctx): { findings: DctFinding[]; notAssessed: string[] } {
  const findings: DctFinding[] = [];
  const notAssessed: string[] = [];
  const isSafety = (id: string) => ctx.rows.some(r => r.activityId === id && r.category === 'safety');
  for (const epoch of ctx.epochs) {
    const safetyVisits = epoch.visitIds.filter(v => (ctx.scheduledAt.get(v) ?? []).some(isSafety));
    const safetyIds = ctx.rows
      .filter(r => r.category === 'safety' && safetyVisits.some(v => ctx.scheduledAt.get(v)?.includes(r.activityId)))
      .map(r => r.activityId);
    if (safetyIds.length === 0) continue;
    const stated = safetyIds.filter(id => ctx.locationById.get(id) !== 'unstated');
    if (stated.length === 0) {
      notAssessed.push(
        `DCT-SAFETY-REMOTE not assessed for epoch "${epoch.name}": none of its scheduled safety activities ` +
          `has a stated location (${safetyIds.join(', ')}).`,
      );
      continue;
    }
    if (!stated.every(id => isOffSite(ctx.locationById.get(id) ?? 'unstated'))) continue;
    const unstatedCount = safetyIds.length - stated.length;
    findings.push({
      severity: 'warning',
      code: 'DCT-SAFETY-REMOTE',
      message:
        `In epoch "${epoch.name}" every scheduled safety activity with a stated location is off-site ` +
        `(${stated.join(', ')}) and none is at the site. The protocol should state how safety is overseen for ` +
        'off-site assessments: who reviews the results and when, how adverse events are identified and reported, ' +
        'and when a participant is brought to the site.' +
        (unstatedCount > 0
          ? ` ${unstatedCount} further scheduled safety ${unstatedCount === 1 ? 'activity has' : 'activities have'} ` +
            'no stated location and was not counted.'
          : ''),
      activityIds: stated,
      visitIds: safetyVisits,
    });
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
  const unstated = ctx.rows.filter(r => r.location === 'unstated').map(r => r.activityId);
  if (share.value === null) {
    gaps.push(
      'No activity has a stated location, so the off-site share is not assessed. An unstated location is not ' +
        'assumed to be the site.',
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

function explicitGaps(soa: ScheduleOfActivities, explicit: Record<string, SoaActivityLocation>): string[] {
  const known = new Set((soa.activities ?? []).map(a => a.id));
  const keys = Object.keys(explicit).sort(compareIds);
  const invalid = keys.filter(k => known.has(k) && !isSoaActivityLocation(explicit[k]));
  const unknown = keys.filter(k => !known.has(k));
  const gaps: string[] = [];
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
 * order in which activities, visits or cells are listed.
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
      ...visitGaps(ctx),
      ...explicitGaps(soa, explicit),
      ...activityRules.notAssessed,
      ...safety.notAssessed,
    ],
    basis: DCT_PROFILE_BASIS,
  };
}
