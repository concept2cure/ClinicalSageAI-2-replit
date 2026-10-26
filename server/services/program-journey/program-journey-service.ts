/**
 * Existing program-journey records, read with their stored stage overlays.
 * A2.9 retires the separate creation/stage-write API and unreachable writers.
 * The org-scoped read and existing stored rows remain authoritative here.
 */
import { pool } from '../../db';

export const JOURNEY_STAGES = [
  'discovery', 'preind', 'ind', 'clinical', 'presub', 'assemble', 'review', 'approval', 'lifecycle',
] as const;
export const STAGE_STATUSES = ['done', 'active', 'upcoming'] as const;
export const JOURNEY_SEGMENTS = ['pharma', 'biotech'] as const;

export interface JourneyStageRow {
  journey_id: string;
  stage_id: string;
  status: string;
  pct: number;
}

export interface ProgramJourneyRow {
  id: string;
  organization_id: number;
  seg: string;
  seq: number;
  code: string;
  name: string | null;
  app: string | null;
  modality: string | null;
  indication: string | null;
  pathway: string | null;
  sponsor: string | null;
  agency: string | null;
  readiness: number;
  current_stage: string;
  target_label: string | null;
  target_value: string | null;
  target_agency: string | null;
  modules: unknown[];
  clock: unknown[];
  haqs: unknown[];
  contra: Record<string, unknown>;
  blockers: unknown[];
  created_by: number | null;
}

/** One journey shaped to the surface's render contract (overlay assembled from stage rows). */
export interface ProgramJourneyView {
  id: string;
  seg: string;
  code: string;
  name: string | null;
  app: string | null;
  modality: string | null;
  indication: string | null;
  pathway: string | null;
  sponsor: string | null;
  agency: string | null;
  readiness: number;
  current: string;
  target: { label: string; v: string; agency: string } | Record<string, never>;
  overlay: Record<string, [string, number]>;
  modules: unknown[];
  clock: unknown[];
  haqs: unknown[];
  contra: Record<string, unknown>;
  blockers: unknown[];
}

const PARENT_COLS = `id, organization_id, seg, seq, code, name, app, modality, indication, pathway,
  sponsor, agency, readiness, current_stage, target_label, target_value, target_agency,
  modules, clock, haqs, contra, blockers, created_by`;

function toView(parent: ProgramJourneyRow, stages: JourneyStageRow[]): ProgramJourneyView {
  const overlay: Record<string, [string, number]> = {};
  for (const s of stages) overlay[s.stage_id] = [s.status, Number(s.pct)];
  const target =
    parent.target_label != null || parent.target_value != null || parent.target_agency != null
      ? { label: parent.target_label ?? '', v: parent.target_value ?? '', agency: parent.target_agency ?? '' }
      : ({} as Record<string, never>);
  return {
    id: parent.id,
    seg: parent.seg,
    code: parent.code,
    name: parent.name,
    app: parent.app,
    modality: parent.modality,
    indication: parent.indication,
    pathway: parent.pathway,
    sponsor: parent.sponsor,
    agency: parent.agency,
    readiness: Number(parent.readiness),
    current: parent.current_stage,
    target,
    overlay,
    modules: (parent.modules as unknown[]) ?? [],
    clock: (parent.clock as unknown[]) ?? [],
    haqs: (parent.haqs as unknown[]) ?? [],
    contra: (parent.contra as Record<string, unknown>) ?? {},
    blockers: (parent.blockers as unknown[]) ?? [],
  };
}

/** List the org's journeys (display order), each with its overlay assembled from real stage rows. */
export async function listProgramJourneys(orgId: number): Promise<ProgramJourneyView[]> {
  const { rows: parents } = await pool.query<ProgramJourneyRow>(
    `SELECT ${PARENT_COLS} FROM program_journeys
      WHERE organization_id = $1 AND deleted_at IS NULL
      ORDER BY seq, seg, created_at, id`,
    [orgId],
  );
  if (parents.length === 0) return [];
  const ids = parents.map((p) => p.id);
  const { rows: stages } = await pool.query<JourneyStageRow>(
    `SELECT journey_id, stage_id, status, pct FROM program_journey_stages
      WHERE organization_id = $1 AND journey_id = ANY($2)`,
    [orgId, ids],
  );
  const byJourney = new Map<string, JourneyStageRow[]>();
  for (const s of stages) {
    const list = byJourney.get(s.journey_id) ?? [];
    list.push(s);
    byJourney.set(s.journey_id, list);
  }
  return parents.map((p) => toView(p, byJourney.get(p.id) ?? []));
}

/** Soft-delete a journey (its stage rows become invisible with it). */
export async function deleteProgramJourney(orgId: number, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE program_journeys SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId],
  );
  return (rowCount ?? 0) > 0;
}
