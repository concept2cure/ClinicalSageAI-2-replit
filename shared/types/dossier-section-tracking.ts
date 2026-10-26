/** Recorded section tracking has its own source and lifecycle, separate from artifacts. */
import type { SectionStatus } from '../../services/regulatory/ind-ectd-sections';
import { normalizeCtdCode } from '../regulatory/section-code';

export interface TrackedSection {
  code: string;
  title: string;
  status: string | null;
  label: string;
  /** Raw observations retained when defensive duplicate selection was required. */
  observedStatuses: Array<string | null>;
}

export interface TrackingModule {
  m: string;
  label: string;
  counted: number;
  complete: number;
  unknownCount: number;
  pct: number | null;
  tone: 'ok' | 'warn' | 'idle' | null;
  sections: TrackedSection[];
}

export interface UnmappedTrackedSection {
  code: string;
  title: string;
  status: string | null;
  label: string;
  module: string | null;
  reason: 'INVALID_SECTION_CODE' | 'INVALID_MODULE' | 'MODULE_MISMATCH';
}

export type DossierSectionTracking =
  | { basis: 'section_tracking'; state: 'measured' | 'no_sections'; modules: TrackingModule[]; unmapped: UnmappedTrackedSection[] }
  | { basis: 'section_tracking'; state: 'unavailable' | 'unanchored'; reason: string; code?: 'STORE_UNAVAILABLE' | 'READ_FAILED'; modules: null; unmapped: null };

/** Existing map reference labels, relocated for one server/client interpretation. */
const MODULE_LABEL = new Map([
  ['1', 'Administrative & prescribing'], ['2', 'CTD summaries'], ['3', 'Quality'],
  ['4', 'Nonclinical study reports'], ['5', 'Clinical study reports'],
]);
export const TRACKING_MODULE_IDS: readonly string[] = Object.freeze([...MODULE_LABEL.keys()]);
export const trackingModuleLabel = (m: string): string | null => MODULE_LABEL.get(m) ?? null;

export function trackingSectionLabel(code: string, title: string): string {
  const display = code.replace(/^m/i, '');
  return title.trim() ? display + ' ' + title.trim() : display;
}

/** Syntax recognition is not a claim that a code exists in a filing outline. */
export function trackingSectionPlacement(code: string, module: string | null):
  { m: string; reason: null } | { m: null; reason: UnmappedTrackedSection['reason'] } {
  const normalized = normalizeCtdCode(code);
  if (!normalized) return { m: null, reason: 'INVALID_SECTION_CODE' };
  if (module === null || !module.trim()) return { m: normalized[0], reason: null };
  const stated = normalizeCtdCode(module);
  if (!stated || stated.length !== 1) return { m: null, reason: 'INVALID_MODULE' };
  return stated === normalized[0] ? { m: stated, reason: null } : { m: null, reason: 'MODULE_MISMATCH' };
}

/** Relocated from the existing map assembler; typed by the existing tracking owner. */
const RANK = new Map<SectionStatus, number>([
  ['not_started', 0], ['data_gathering', 1], ['drafting', 2],
  ['revision', 3], ['internal_review', 3], ['qa_review', 4],
  ['approved', 5], ['signed', 6], ['locked', 7],
]);

export function trackingStatusRank(status: string | null): number | null {
  return status === null ? null : RANK.get(status.toLowerCase() as SectionStatus) ?? null;
}

const textOrder = (a: string | null, b: string | null): number => a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1;

/** Known duplicates retain the furthest stage. An unknown observation cannot be hidden. */
export function preferredTrackingStatusOf(statuses: readonly (string | null)[]): string | null {
  const unknown = statuses.filter(status => trackingStatusRank(status) === null).sort(textOrder);
  if (unknown.length) return unknown[0];
  return [...statuses].sort((a, b) => (trackingStatusRank(b) ?? -1) - (trackingStatusRank(a) ?? -1) || textOrder(a, b))[0] ?? null;
}

/** Server figures and client consistency checks share this one recorded-source rule. */
export function trackingModuleStats(sections: readonly Pick<TrackedSection, 'status' | 'observedStatuses'>[]):
  Pick<TrackingModule, 'counted' | 'complete' | 'unknownCount' | 'pct' | 'tone'> {
  const unknown = (section: Pick<TrackedSection, 'status' | 'observedStatuses'>) =>
    trackingStatusRank(section.status) === null || section.observedStatuses.length === 0 ||
    section.observedStatuses.some(status => trackingStatusRank(status) === null);
  const counted = sections.length;
  const unknownCount = sections.filter(unknown).length;
  const complete = sections.filter(section => !unknown(section) && (trackingStatusRank(section.status) ?? -1) >= 5).length;
  const pct = unknownCount || counted === 0 ? null : Math.round(100 * complete / counted);
  const tone = pct === null ? null : pct === 100 ? 'ok' : pct > 0 ? 'warn' : 'idle';
  return { counted, complete, unknownCount, pct, tone };
}
