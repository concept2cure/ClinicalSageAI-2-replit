/**
 * Post-approval CMC change-control service — the REAL write + read path over
 * `cmc_change_controls` (migration 20260730_cmc_change_control_store.sql).
 *
 * This is what makes the Lifecycle "CMC change control" card real rather than
 * demo-ware: a live tenant proposes changes (createCmcChange, via POST
 * /api/cmc-changes), they persist here org-scoped and soft-delete aware, and the read
 * path projects them through the deterministic SUPAC/variations classifier
 * (cmc-change-view.ts) — no stored verdict, no seed-only blob.
 *
 * Raw-SQL + tenant-scoped, mirroring qms/changeControl.service.ts. The route layer
 * writes the Part 11 audit entry.
 *
 * @module server/services/cmc/cmc-change-control-service
 */
import { pool } from '../../db';
import type { CmcChangeRow } from './cmc-change-view';

// Runtime validation sets for the two REQUIRED classifier inputs (mirror the union
// types in supac-classifier.ts). Optional attributes pass through — the classifier
// treats an absent/unknown optional as "not specified".
export const DOSAGE_FORM_FAMILIES = [
  'immediate_release_oral_solid', 'modified_release_oral_solid', 'nonsterile_semisolid',
  'sterile_injectable', 'biologic', 'inhalation', 'transdermal', 'other',
] as const;
export const CHANGE_CATEGORIES = [
  'components_composition', 'manufacturing_site', 'scale_up', 'manufacturing_process',
  'equipment', 'container_closure', 'specifications', 'analytical_method', 'stability_protocol',
] as const;
export const CMC_CHANGE_STATUSES = ['evaluating', 'planned', 'implemented'] as const;

export class CmcChangeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CmcChangeValidationError';
  }
}

/** The stored row (a superset of the projector's CmcChangeRow) with identity/audit. */
export interface CmcChangeControlRow extends CmcChangeRow {
  id: string;
  organization_id: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCmcChangeInput {
  title: string;
  dosageFormFamily: string;
  changeCategory: string;
  area?: string | null;
  programs?: string | null;
  scaleChangeFactor?: string | null;
  excipientLevelChange?: string | null;
  siteChangeKind?: string | null;
  processChangeKind?: string | null;
  touchesCriticalStep?: boolean | null;
  affects?: string | null;
  hasComparabilityData?: boolean | null;
  status?: string | null;
  description?: string | null;
  createdBy?: number | null;
}

const SELECT_COLS = `id, organization_id, title, area, programs, dosage_form_family, change_category,
  scale_change_factor, excipient_level_change, site_change_kind, process_change_kind,
  touches_critical_step, affects, has_comparability_data, status, description,
  created_by, created_at, updated_at`;

/** Propose a CMC change. Validates the required classifier inputs. */
export async function createCmcChange(orgId: number, input: CreateCmcChangeInput): Promise<CmcChangeControlRow> {
  if (!input.title || input.title.trim() === '') {
    throw new CmcChangeValidationError('title is required.');
  }
  if (!(DOSAGE_FORM_FAMILIES as readonly string[]).includes(input.dosageFormFamily)) {
    throw new CmcChangeValidationError(`dosageFormFamily must be one of: ${DOSAGE_FORM_FAMILIES.join(', ')}.`);
  }
  if (!(CHANGE_CATEGORIES as readonly string[]).includes(input.changeCategory)) {
    throw new CmcChangeValidationError(`changeCategory must be one of: ${CHANGE_CATEGORIES.join(', ')}.`);
  }
  const status = input.status && (CMC_CHANGE_STATUSES as readonly string[]).includes(input.status) ? input.status : 'evaluating';

  const { rows } = await pool.query<CmcChangeControlRow>(
    `INSERT INTO cmc_change_controls (
       organization_id, title, area, programs, dosage_form_family, change_category,
       scale_change_factor, excipient_level_change, site_change_kind, process_change_kind,
       touches_critical_step, affects, has_comparability_data, status, description, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,false),$12,COALESCE($13,false),$14,$15,$16)
     RETURNING ${SELECT_COLS}`,
    [
      orgId, input.title, input.area ?? null, input.programs ?? null,
      input.dosageFormFamily, input.changeCategory,
      input.scaleChangeFactor ?? null, input.excipientLevelChange ?? null,
      input.siteChangeKind ?? null, input.processChangeKind ?? null,
      input.touchesCriticalStep ?? null, input.affects ?? null,
      input.hasComparabilityData ?? null, status, input.description ?? null,
      input.createdBy ?? null,
    ],
  );
  return rows[0];
}

/** List the org's proposed CMC changes, newest first (soft-deleted excluded). */
export async function listCmcChanges(orgId: number): Promise<CmcChangeControlRow[]> {
  const { rows } = await pool.query<CmcChangeControlRow>(
    `SELECT ${SELECT_COLS} FROM cmc_change_controls
      WHERE organization_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC, id`,
    [orgId],
  );
  return rows;
}

/** Get one CMC change (tenant-scoped). */
export async function getCmcChange(orgId: number, id: string): Promise<CmcChangeControlRow | null> {
  const { rows } = await pool.query<CmcChangeControlRow>(
    `SELECT ${SELECT_COLS} FROM cmc_change_controls
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId],
  );
  return rows[0] ?? null;
}

/** Soft-delete a CMC change (keeps the row for the audit trail). */
export async function deleteCmcChange(orgId: number, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE cmc_change_controls SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId],
  );
  return (rowCount ?? 0) > 0;
}
