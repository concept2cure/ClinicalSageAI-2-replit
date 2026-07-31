/**
 * Program-journey service — the REAL write + read path over `program_journeys` +
 * `program_journey_stages` (migration 20260801_program_journey_store.sql).
 *
 * This is what makes the v2 BiopharmaJourney surface real rather than demo-ware: a
 * live tenant records a program's regulatory journey (createProgramJourney, via POST
 * /api/program-journey) and advances its lifecycle stages (updateJourneyStage, via
 * POST /api/program-journey/:id/stages/:stageId); the read assembles each journey's
 * per-stage overlay from the REAL stage rows — one row per stage, not an overlay blob.
 *
 * The 9-stage lifecycle catalog (labels, gates, deliverables) is definitional and
 * lives in the surface; this store holds only per-org instance state. The
 * intelligence-panel display lists (modules/clock/haqs/contra/blockers) are nested
 * display payloads on the parent (the reg_change_items `affects` idiom), shape-checked
 * on write so a malformed payload can never break the render loop.
 *
 * Raw-SQL + tenant-scoped, mirroring cmc-change-control-service.ts. The route layer
 * writes the Part 11 audit entry.
 *
 * @module server/services/program-journey/program-journey-service
 */
import { pool } from '../../db';

export const JOURNEY_STAGES = [
  'discovery', 'preind', 'ind', 'clinical', 'presub', 'assemble', 'review', 'approval', 'lifecycle',
] as const;
export const STAGE_STATUSES = ['done', 'active', 'upcoming'] as const;
export const JOURNEY_SEGMENTS = ['pharma', 'biotech'] as const;

export class ProgramJourneyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProgramJourneyValidationError';
  }
}

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

export interface CreateProgramJourneyInput {
  seg: string;
  code: string;
  seq?: number | null;
  name?: string | null;
  app?: string | null;
  modality?: string | null;
  indication?: string | null;
  pathway?: string | null;
  sponsor?: string | null;
  agency?: string | null;
  readiness?: number | null;
  currentStage: string;
  target?: { label?: unknown; v?: unknown; agency?: unknown } | null;
  /** Optional initial per-stage overlay: { stageId: [status, pct] }. Stages not named default to 'upcoming'/0. */
  overlay?: Record<string, unknown> | null;
  modules?: unknown;
  clock?: unknown;
  haqs?: unknown;
  contra?: unknown;
  blockers?: unknown;
  createdBy?: number | null;
}

const PARENT_COLS = `id, organization_id, seg, seq, code, name, app, modality, indication, pathway,
  sponsor, agency, readiness, current_stage, target_label, target_value, target_agency,
  modules, clock, haqs, contra, blockers, created_by`;

function asArray(v: unknown, field: string): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ProgramJourneyValidationError(`${field} must be an array.`);
  return v;
}
function asObject(v: unknown, field: string): Record<string, unknown> {
  if (v === undefined || v === null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new ProgramJourneyValidationError(`${field} must be an object.`);
  return v as Record<string, unknown>;
}
function clampPct(v: unknown): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Parse an overlay entry ([status, pct]) with validation. */
function parseOverlayEntry(stageId: string, raw: unknown): { status: string; pct: number } {
  if (!Array.isArray(raw) || raw.length < 1) {
    throw new ProgramJourneyValidationError(`overlay.${stageId} must be [status, pct].`);
  }
  const status = String(raw[0]);
  if (!(STAGE_STATUSES as readonly string[]).includes(status)) {
    throw new ProgramJourneyValidationError(`overlay.${stageId} status must be one of: ${STAGE_STATUSES.join(', ')}.`);
  }
  return { status, pct: clampPct(raw[1]) };
}

/**
 * Record a program journey: the parent row plus one REAL row per lifecycle stage
 * (all 9, defaulted to upcoming/0 unless the initial overlay names them).
 */
export async function createProgramJourney(orgId: number, input: CreateProgramJourneyInput): Promise<ProgramJourneyView> {
  if (!input.code || input.code.trim() === '') throw new ProgramJourneyValidationError('code is required.');
  if (!(JOURNEY_SEGMENTS as readonly string[]).includes(input.seg)) {
    throw new ProgramJourneyValidationError(`seg must be one of: ${JOURNEY_SEGMENTS.join(', ')}.`);
  }
  if (!(JOURNEY_STAGES as readonly string[]).includes(input.currentStage)) {
    throw new ProgramJourneyValidationError(`currentStage must be one of: ${JOURNEY_STAGES.join(', ')}.`);
  }
  const overlayIn = input.overlay ?? {};
  const stages = JOURNEY_STAGES.map((stageId) => {
    const raw = (overlayIn as Record<string, unknown>)[stageId];
    return raw === undefined ? { stageId, status: 'upcoming', pct: 0 } : { stageId, ...parseOverlayEntry(stageId, raw) };
  });
  for (const k of Object.keys(overlayIn)) {
    if (!(JOURNEY_STAGES as readonly string[]).includes(k)) {
      throw new ProgramJourneyValidationError(`overlay names an unknown stage '${k}'.`);
    }
  }
  const modules = asArray(input.modules, 'modules');
  const clock = asArray(input.clock, 'clock');
  const haqs = asArray(input.haqs, 'haqs');
  const contra = asObject(input.contra, 'contra');
  const blockers = asArray(input.blockers, 'blockers');
  const target = input.target ?? null;

  const { rows } = await pool.query<ProgramJourneyRow>(
    `INSERT INTO program_journeys (
       organization_id, seg, seq, code, name, app, modality, indication, pathway, sponsor, agency,
       readiness, current_stage, target_label, target_value, target_agency,
       modules, clock, haqs, contra, blockers, created_by
     ) VALUES ($1,$2,COALESCE($3,0),$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12,0),$13,$14,$15,$16,
               $17::jsonb,$18::jsonb,$19::jsonb,$20::jsonb,$21::jsonb,$22)
     RETURNING ${PARENT_COLS}`,
    [
      orgId, input.seg, input.seq ?? null, input.code, input.name ?? null, input.app ?? null,
      input.modality ?? null, input.indication ?? null, input.pathway ?? null,
      input.sponsor ?? null, input.agency ?? null,
      input.readiness != null ? clampPct(input.readiness) : null, input.currentStage,
      target?.label != null ? String(target.label) : null,
      target?.v != null ? String(target.v) : null,
      target?.agency != null ? String(target.agency) : null,
      JSON.stringify(modules), JSON.stringify(clock), JSON.stringify(haqs),
      JSON.stringify(contra), JSON.stringify(blockers), input.createdBy ?? null,
    ],
  );
  const parent = rows[0];

  for (const s of stages) {
    await pool.query(
      `INSERT INTO program_journey_stages (organization_id, journey_id, stage_id, status, pct)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (journey_id, stage_id) DO UPDATE SET status = EXCLUDED.status, pct = EXCLUDED.pct, updated_at = now()`,
      [orgId, parent.id, s.stageId, s.status, s.pct],
    );
  }
  return toView(parent, stages.map((s) => ({ journey_id: parent.id, stage_id: s.stageId, status: s.status, pct: s.pct })));
}

/** Advance/set one lifecycle stage of a journey (tenant-scoped; journey must be live). */
export async function updateJourneyStage(
  orgId: number, journeyId: string, stageId: string, status: string, pct: unknown,
): Promise<JourneyStageRow> {
  if (!(JOURNEY_STAGES as readonly string[]).includes(stageId)) {
    throw new ProgramJourneyValidationError(`stageId must be one of: ${JOURNEY_STAGES.join(', ')}.`);
  }
  if (!(STAGE_STATUSES as readonly string[]).includes(status)) {
    throw new ProgramJourneyValidationError(`status must be one of: ${STAGE_STATUSES.join(', ')}.`);
  }
  const parent = await pool.query(
    `SELECT id FROM program_journeys WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [journeyId, orgId],
  );
  if (parent.rows.length === 0) return Promise.reject(new ProgramJourneyValidationError('Journey not found for this organization.'));
  const { rows } = await pool.query<JourneyStageRow>(
    `INSERT INTO program_journey_stages (organization_id, journey_id, stage_id, status, pct)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (journey_id, stage_id) DO UPDATE SET status = EXCLUDED.status, pct = EXCLUDED.pct, updated_at = now()
     RETURNING journey_id, stage_id, status, pct`,
    [orgId, journeyId, stageId, status, clampPct(pct)],
  );
  return rows[0];
}

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
