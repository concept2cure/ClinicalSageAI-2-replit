/**
 * Regulatory-change intelligence service — the REAL write + read path over
 * `reg_change_items` (migration 20260801_reg_change_store.sql).
 *
 * This is what makes the v2 RegChange horizon-scan surface real rather than
 * demo-ware: a live tenant records tracked regulatory changes (createRegChange,
 * via POST /api/reg-change), they persist here org-scoped and soft-delete aware,
 * and GET /api/reg-change reads them back shaped to the surface's render
 * contract — no seed-only blob, no fixture.
 *
 * Raw-SQL + tenant-scoped, mirroring cmc/cmc-change-control-service.ts. The
 * route layer writes the Part 11 audit entry.
 *
 * @module server/services/reg-change/reg-change-service
 */
import { pool } from '../../db';

// Runtime validation sets for the two REQUIRED display classifiers: `kind`
// drives the surface's badge (regulation | guidance | standard) and `sev`
// drives its severity pill + "Action required" KPI (high → Action required,
// med → Review, low → Monitor). Optional display fields pass through.
export const REG_CHANGE_KINDS = ['regulation', 'guidance', 'standard'] as const;
export const REG_CHANGE_SEVERITIES = ['high', 'med', 'low'] as const;

export class RegChangeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegChangeValidationError';
  }
}

/** One per-device portfolio-impact entry in a change's affects[] list. */
export interface RegChangeAffect {
  dev: string;
  what: string;
  sub: string;
}

/** The stored row with identity/audit. `when_label` rehydrates as `when` at the route. */
export interface RegChangeItemRow {
  id: string;
  organization_id: number;
  title: string;
  src: string | null;
  kind: string;
  when_label: string | null;
  sev: string;
  live: boolean;
  summary: string | null;
  affects: RegChangeAffect[];
  action: string | null;
  doc: string | null;
  owner: string | null;
  due: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRegChangeInput {
  title: string;
  kind: string;
  sev: string;
  src?: string | null;
  whenLabel?: string | null;
  live?: boolean | null;
  summary?: string | null;
  affects?: unknown;
  action?: string | null;
  doc?: string | null;
  owner?: string | null;
  due?: string | null;
  createdBy?: number | null;
}

const SELECT_COLS = `id, organization_id, title, src, kind, when_label, sev, live, summary,
  affects, action, doc, owner, due, created_by, created_at, updated_at`;

/**
 * Normalize the per-device impact list. Absent → []; anything that is not an
 * array of { dev, what } entries is rejected — the surface maps over affects[]
 * unconditionally, so a malformed list must never persist.
 */
function normalizeAffects(raw: unknown): RegChangeAffect[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new RegChangeValidationError('affects must be an array of { dev, what, sub } entries.');
  }
  return raw.map((entry) => {
    const e = entry as Record<string, unknown> | null;
    if (!e || typeof e !== 'object' || typeof e.dev !== 'string' || e.dev.trim() === '' || typeof e.what !== 'string' || e.what.trim() === '') {
      throw new RegChangeValidationError('each affects entry needs string dev and what fields.');
    }
    return { dev: e.dev, what: e.what, sub: typeof e.sub === 'string' ? e.sub : '' };
  });
}

/** Record a tracked regulatory change. Validates title + the display classifiers. */
export async function createRegChange(orgId: number, input: CreateRegChangeInput): Promise<RegChangeItemRow> {
  if (!input.title || input.title.trim() === '') {
    throw new RegChangeValidationError('title is required.');
  }
  if (!(REG_CHANGE_KINDS as readonly string[]).includes(input.kind)) {
    throw new RegChangeValidationError(`kind must be one of: ${REG_CHANGE_KINDS.join(', ')}.`);
  }
  if (!(REG_CHANGE_SEVERITIES as readonly string[]).includes(input.sev)) {
    throw new RegChangeValidationError(`sev must be one of: ${REG_CHANGE_SEVERITIES.join(', ')}.`);
  }
  const affects = normalizeAffects(input.affects);

  const { rows } = await pool.query<RegChangeItemRow>(
    `INSERT INTO reg_change_items (
       organization_id, title, src, kind, when_label, sev, live,
       summary, affects, action, doc, owner, due, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,false),$8,$9::jsonb,$10,$11,$12,$13,$14)
     RETURNING ${SELECT_COLS}`,
    [
      orgId, input.title, input.src ?? null, input.kind, input.whenLabel ?? null,
      input.sev, input.live ?? null, input.summary ?? null, JSON.stringify(affects),
      input.action ?? null, input.doc ?? null, input.owner ?? null, input.due ?? null,
      input.createdBy ?? null,
    ],
  );
  return rows[0];
}

/**
 * List the org's tracked regulatory changes (soft-deleted excluded), ordered
 * as a worklist: action-required first (sev high → med → low), newest first
 * within a band.
 */
export async function listRegChanges(orgId: number): Promise<RegChangeItemRow[]> {
  const { rows } = await pool.query<RegChangeItemRow>(
    `SELECT ${SELECT_COLS} FROM reg_change_items
      WHERE organization_id = $1 AND deleted_at IS NULL
      ORDER BY CASE sev WHEN 'high' THEN 0 WHEN 'med' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
               created_at DESC, id`,
    [orgId],
  );
  return rows;
}

/** Get one tracked change (tenant-scoped). */
export async function getRegChange(orgId: number, id: string): Promise<RegChangeItemRow | null> {
  const { rows } = await pool.query<RegChangeItemRow>(
    `SELECT ${SELECT_COLS} FROM reg_change_items
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId],
  );
  return rows[0] ?? null;
}

/** Soft-delete a tracked change (keeps the row for the audit trail). */
export async function deleteRegChange(orgId: number, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE reg_change_items SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId],
  );
  return (rowCount ?? 0) > 0;
}
