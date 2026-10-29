/**
 * Human-factors engineering (HFE/UE) file service — the REAL write + read path
 * over `hf_engineering_files` (migration 20260801_hf_files_store.sql).
 *
 * This is what makes the v2 HumanFactors surface's HFE/UE file real rather than
 * demo-ware: a live tenant records its IEC 62366-1 file (createHfFile, via
 * POST /api/human-factors), it persists here org-scoped and soft-delete aware, and
 * GET /api/human-factors reads it back — no seed-only c2c_hf_files blob, no fixture.
 * The surface computes file completeness deterministically from the stored
 * element-presence map; this service never stores a completeness verdict.
 *
 * Complements the hazard-related use-scenario store (c2c_hf_scenarios), which has
 * its own real writer (POST /api/human-factors/scenarios); a scenario references
 * the HFE/UE file it attaches to by this row's id.
 *
 * Raw-SQL + tenant-scoped, mirroring cmc/cmc-change-control-service.ts and
 * reg-change/reg-change-service.ts. The route layer writes the Part 11 audit entry.
 *
 * @module server/services/human-factors/hf-files-service
 */
import { pool } from '../../db';

// The canonical IEC 62366-1 HFE/UE file elements. The stored `present` map is
// normalized to exactly these keys (booleans), so the surface's completeness
// (present / total) is computed against a stable element set — an unknown key
// never inflates the denominator and a malformed map never persists.
export const HF_ELEMENT_KEYS = [
  'useSpecification',
  'userProfiles',
  'useEnvironments',
  'userInterfaceCharacteristics',
  'knownUseProblems',
  'hazardRelatedUseScenarios',
  'criticalTasks',
  'formativeEvaluation',
  'summativeEvaluation',
  'hfeUeReport',
] as const;

export class HfFileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HfFileValidationError';
  }
}

/** The stored HFE/UE file row with identity/audit. */
export interface HfEngineeringFileRow {
  id: string;
  organization_id: number;
  /** The project (regulatory_programs.id) the file belongs to. NULL for a file
   *  recorded without one: the organization's unscoped file, which no project
   *  read returns (migrations/20261029_hf_engineering_files_program_key.sql). */
  program_id: string | null;
  device: string;
  framework: string;
  present: Record<string, boolean>;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateHfFileInput {
  device: string;
  framework?: string | null;
  /** Element→boolean presence map; normalized to the canonical HF_ELEMENT_KEYS. */
  present?: unknown;
  createdBy?: number | null;
  /** The project the file is recorded for. The caller has already established
   *  that the organization owns it (programInOrganization); the database's
   *  same-organization key refuses any other. Absent: an unscoped file. */
  programId?: string | null;
}

/** Narrows a list to one project's files. Absent: every file of the organization. */
export interface ListHfFilesOptions {
  programId?: string | null;
}

const SELECT_COLS =
  'id, organization_id, program_id, device, framework, present, created_by, created_at, updated_at';

/**
 * Normalize the element presence map to exactly the canonical keys as booleans.
 * Absent → every element false (a brand-new file with nothing recorded yet, an
 * honest empty completeness). A non-object (string/number/array) is rejected —
 * the surface reads present[key] for each element unconditionally, so a malformed
 * map must never persist. Unknown keys are dropped.
 */
function normalizePresent(raw: unknown): Record<string, boolean> {
  if (raw === undefined || raw === null) {
    return Object.fromEntries(HF_ELEMENT_KEYS.map((k) => [k, false]));
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HfFileValidationError('present must be an element→boolean map.');
  }
  const src = raw as Record<string, unknown>;
  return Object.fromEntries(HF_ELEMENT_KEYS.map((k) => [k, src[k] === true]));
}

/** Record an HFE/UE file. Validates the device; normalizes the element map. */
export async function createHfFile(
  orgId: number,
  input: CreateHfFileInput,
): Promise<HfEngineeringFileRow> {
  if (!input.device || input.device.trim() === '') {
    throw new HfFileValidationError('device is required.');
  }
  const framework =
    input.framework && input.framework.trim() !== '' ? input.framework : 'IEC 62366-1';
  const present = normalizePresent(input.present);

  const { rows } = await pool.query<HfEngineeringFileRow>(
    `INSERT INTO hf_engineering_files (organization_id, device, framework, present, created_by, program_id)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6)
     RETURNING ${SELECT_COLS}`,
    [orgId, input.device, framework, JSON.stringify(present), input.createdBy ?? null, input.programId ?? null],
  );
  return rows[0];
}

/**
 * List the org's HFE/UE files, newest first (soft-deleted excluded). With a
 * `programId`, only that project's files: a file recorded without a project
 * (program_id NULL) never matches, so it is never shown as a project's. The
 * project is a bind parameter, never SQL text (ci:sql-interpolation); the
 * caller has already checked it is a project id the organization owns.
 */
export async function listHfFiles(
  orgId: number,
  options: ListHfFilesOptions = {},
): Promise<HfEngineeringFileRow[]> {
  const { rows } = await pool.query<HfEngineeringFileRow>(
    `SELECT ${SELECT_COLS} FROM hf_engineering_files
      WHERE organization_id = $1 AND deleted_at IS NULL
        AND ($2::uuid IS NULL OR program_id = $2::uuid)
      ORDER BY created_at DESC, id`,
    [orgId, options.programId ?? null],
  );
  return rows;
}

/** Get one HFE/UE file (tenant-scoped). */
export async function getHfFile(orgId: number, id: string): Promise<HfEngineeringFileRow | null> {
  const { rows } = await pool.query<HfEngineeringFileRow>(
    `SELECT ${SELECT_COLS} FROM hf_engineering_files
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId],
  );
  return rows[0] ?? null;
}

/**
 * Set the element-presence map on an HFE/UE file (the governed element write).
 *
 * The v2 HumanFactors surface renders a file-completeness percentage derived
 * from `present`. Before this existed the surface's element tiles moved that
 * percentage in React state only, so a reviewer read a completeness figure the
 * record did not hold. Completeness is still never STORED — only the element
 * map is — so the derived figure and the record cannot disagree.
 *
 * Returns the refreshed row, or null when the file does not belong to the org
 * (fails closed rather than creating one).
 */
export async function setHfFileElements(
  orgId: number,
  id: string,
  present: unknown,
): Promise<HfEngineeringFileRow | null> {
  const normalized = normalizePresent(present);
  const { rows } = await pool.query<HfEngineeringFileRow>(
    `UPDATE hf_engineering_files SET present = $1::jsonb, updated_at = now()
      WHERE id = $2 AND organization_id = $3 AND deleted_at IS NULL
      RETURNING ${SELECT_COLS}`,
    [JSON.stringify(normalized), id, orgId],
  );
  return rows[0] ?? null;
}

/** Soft-delete an HFE/UE file (keeps the row for the audit trail). */
export async function deleteHfFile(orgId: number, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE hf_engineering_files SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId],
  );
  return (rowCount ?? 0) > 0;
}
