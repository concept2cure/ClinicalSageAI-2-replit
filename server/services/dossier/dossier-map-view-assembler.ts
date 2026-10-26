/**
 * The existing project_sections module map, reached by the core dossier and
 * the legacy compatibility screen. Its recorded tracking source is separate
 * from c2c document sections and artifact-stage rollups.
 */
import { pool } from '../../db';
import { compareSectionCode, normalizeCtdCode } from '../../../shared/regulatory/section-code';
import {
  preferredTrackingStatusOf, trackingModuleStats, trackingModuleLabel, trackingSectionLabel,
  trackingSectionPlacement, TRACKING_MODULE_IDS,
  type DossierSectionTracking, type TrackingModule, type TrackedSection, type UnmappedTrackedSection,
} from '../../../shared/types/dossier-section-tracking';

export interface TrackingQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

const UNAVAILABLE_REASON = 'The recorded section-tracking store is not provisioned in this environment.';

interface TrackingRow { code: string; module: string | null; title: string; status: string | null }
const textOrder = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

function trackingRow(row: Record<string, unknown>): TrackingRow {
  if (typeof row.section_code !== 'string' || typeof row.title !== 'string' ||
      !(row.module === null || typeof row.module === 'string') ||
      !(row.status === null || typeof row.status === 'string')) {
    throw new Error('The recorded tracked-section details could not be read.');
  }
  return { code: row.section_code, module: row.module, title: row.title, status: row.status };
}


/** Duplicate identity remains the raw stored code, matching its database key. */
function selectedSection(records: TrackingRow[]): TrackedSection {
  const observedStatuses = [...new Set(records.map(row => row.status))]
    .sort((a, b) => a === b ? 0 : a === null ? -1 : b === null ? 1 : textOrder(a, b));
  const status = preferredTrackingStatusOf(observedStatuses);
  const selected = records.filter(row => row.status === status)
    .sort((a, b) => textOrder(a.title, b.title))[0];
  return { code: selected.code, title: selected.title, status, label: trackingSectionLabel(selected.code, selected.title), observedStatuses };
}

function sectionOrder(a: TrackedSection, b: TrackedSection): number {
  return compareSectionCode(normalizeCtdCode(a.code)!, normalizeCtdCode(b.code)!) || textOrder(a.code, b.code);
}

function assembleTracking(rows: Array<Record<string, unknown>>): Extract<DossierSectionTracking, { modules: TrackingModule[] }> {
  const groups = new Map<string, Map<string, TrackingRow[]>>();
  const unmapped: UnmappedTrackedSection[] = [];
  for (const raw of rows) {
    const row = trackingRow(raw);
    const destination = trackingSectionPlacement(row.code, row.module);
    if (destination.m === null) {
      unmapped.push({ ...row, label: trackingSectionLabel(row.code, row.title), reason: destination.reason });
      continue;
    }
    const module = groups.get(destination.m) ?? new Map<string, TrackingRow[]>();
    const duplicates = module.get(row.code) ?? [];
    duplicates.push(row);
    module.set(row.code, duplicates);
    groups.set(destination.m, module);
  }
  const modules = TRACKING_MODULE_IDS.flatMap(m => {
    const tracked = groups.get(m);
    if (!tracked) return [];
    const sections = [...tracked.values()].map(selectedSection).sort(sectionOrder);
    return [{ m, label: trackingModuleLabel(m)!, ...trackingModuleStats(sections), sections }];
  });
  unmapped.sort((a, b) => textOrder(a.code, b.code) || textOrder(a.module ?? '', b.module ?? '') || textOrder(a.title, b.title));
  return { basis: 'section_tracking', state: rows.length ? 'measured' : 'no_sections', modules, unmapped };
}

/** One org/project scoped read; caller supplies the currently admitted exact anchor. */
export async function readProjectSectionTracking(db: TrackingQueryable, orgId: number, projectId: number | null): Promise<DossierSectionTracking> {
  if (!Number.isSafeInteger(orgId) || orgId <= 0) throw new Error('A verified organization is required for section tracking.');
  if (projectId === null || !Number.isSafeInteger(projectId) || projectId <= 0) {
    return { basis: 'section_tracking', state: 'unanchored', modules: null, unmapped: null,
      reason: 'This project has no verified tracking record, so its tracked sections cannot be read.' };
  }
  try {
    const { rows } = await db.query(
      'SELECT ps.section_code, ps.module, ps.title, ps.status ' +
      'FROM project_sections ps JOIN projects p ON p.id = ps.project_id ' +
      'WHERE ps.organization_id = $1 AND p.organization_id = $1 ' +
      'AND ps.project_id = $2 AND p.status IS DISTINCT FROM \'archived\'',
      [orgId, projectId],
    );
    return assembleTracking(rows);
  } catch (error) {
    if (['42P01', '42703'].includes(String((error as { code?: string })?.code))) {
      return { basis: 'section_tracking', state: 'unavailable', modules: null, unmapped: null, reason: UNAVAILABLE_REASON };
    }
    throw error;
  }
}

/** Preserve the old flat card envelope through the same typed reader and rules. */
export async function assembleProjectDossierMap(orgId: number, projectId: number, db: TrackingQueryable = pool): Promise<Record<string, unknown>[]> {
  const tracking = await readProjectSectionTracking(db, orgId, projectId);
  if (tracking.modules === null) {
    throw Object.assign(new Error(tracking.reason), { code: 'SECTION_TRACKING_STORE_UNAVAILABLE' });
  }
  if (tracking.unmapped.length > 0) {
    throw Object.assign(new Error('Recorded section placement needs review before a module map can be supplied.'), { code: 'SECTION_TRACKING_REVIEW_REQUIRED' });
  }
  return tracking.modules.map(({ m, label, pct, tone, sections }) => ({ m, label, pct, tone, sections: sections.map(section => section.label) }));
}
