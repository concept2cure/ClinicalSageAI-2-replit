/**
 * Separation of duties — the un-disableable Part 11 invariant.
 *
 * The signer / approver of a governed target MUST NOT be its author / owner.
 * There is NO flag to turn this off. Per the governance contract, Admin may only
 * *tighten* (add approvers / four-eyes), never *loosen* — so this lives as a hard
 * code path, not a permission row. A rush is exactly when an override becomes a
 * finding.
 *
 * `resolveTargetOwnerId` mirrors the org-scoped resolver in
 * `server/routes/c2c/actions.ts` but returns the target's author/owner user id
 * (the real owner column per table). When a target type has no modelled owner
 * column, it returns null and the SoD check degrades to log-and-allow rather than
 * blocking every signature on an un-modelled target — i.e. it fires wherever the
 * author is known (the common, signable path: documents / sections / work items /
 * blockers / programs), and never silently blocks the whole signing surface.
 *
 * @module server/services/governance/separation-of-duties
 */
import { pool } from '../../db.js';

export class SeparationOfDutiesError extends Error {
  readonly code = 'SEPARATION_OF_DUTIES';
  constructor(message: string) {
    super(message);
    this.name = 'SeparationOfDutiesError';
  }
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseInt(v, 10) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve the author/owner user id of a governed target, org-scoped. Returns
 * null when the target is missing, inaccessible, or has no modelled owner column.
 */
export async function resolveTargetOwnerId(target: string, orgId: number): Promise<number | null> {
  const colonIdx = target.indexOf(':');
  if (colonIdx === -1) return null;
  const prefix = target.slice(0, colonIdx);
  const rest = target.slice(colonIdx + 1);

  try {
    switch (prefix) {
      case 'document': {
        const r = await pool.query(
          `SELECT owner_id FROM c2c_documents WHERE id = $1 AND org_id = $2 LIMIT 1`,
          [rest, orgId],
        );
        return intOrNull(r.rows[0]?.owner_id);
      }
      case 'section': {
        const parts = rest.split(':');
        if (parts.length < 2) return null;
        const [docId, ...keyParts] = parts;
        const sectionKey = keyParts.join(':');
        const r = await pool.query(
          `SELECT s.owner_id
             FROM c2c_document_sections s
             JOIN c2c_documents d ON d.id = s.document_id
            WHERE s.document_id = $1 AND s.section_key = $2 AND d.org_id = $3
            LIMIT 1`,
          [docId, sectionKey, orgId],
        );
        return intOrNull(r.rows[0]?.owner_id);
      }
      case 'task': {
        const r = await pool.query(
          `SELECT owner_id FROM c2c_project_work_items WHERE id = $1 AND org_id = $2 LIMIT 1`,
          [rest, orgId],
        );
        return intOrNull(r.rows[0]?.owner_id);
      }
      case 'blocker': {
        const r = await pool.query(
          `SELECT owner_user_id FROM c2c_blockers WHERE blocker_id = $1 AND org_id = $2 LIMIT 1`,
          [rest, orgId],
        );
        return intOrNull(r.rows[0]?.owner_user_id);
      }
      case 'ectd-sequence': {
        // The one target the Part 11 freeze/dispatch/transmit chain signs. It
        // had no case here, so the check resolved no owner and allowed the
        // preparer to sign their own sequence.
        const r = await pool.query(
          `SELECT created_by FROM ectd_sequences WHERE id = $1 AND organization_id = $2 LIMIT 1`,
          [rest, orgId],
        );
        return intOrNull(r.rows[0]?.created_by);
      }
      case 'program': {
        const r = await pool.query(
          `SELECT created_by FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
          [rest, orgId],
        );
        return intOrNull(r.rows[0]?.created_by);
      }
      default:
        // submission / specification / unknown — owner column not modelled here.
        return null;
    }
  } catch (err: any) {
    // 42P01 undefined_table / 42703 undefined_column → target family not migrated;
    // degrade. Any other error is logged but still degrades (SoD must not 500 a sign).
    if (err?.code !== '42P01' && err?.code !== '42703') {
      console.warn('[governance/SoD] owner resolution failed (degraded):', err?.message);
    }
    return null;
  }
}

/**
 * Enforce author≠signer. Throws SeparationOfDutiesError when the signer owns /
 * authored the target. Un-disableable. When the owner cannot be resolved, the
 * check degrades (logs, allows) rather than blocking every signature.
 */
export async function assertSignerIsNotAuthor(
  target: string,
  orgId: number,
  signerId: number,
): Promise<void> {
  const ownerId = await resolveTargetOwnerId(target, orgId);
  if (ownerId !== null && ownerId === signerId) {
    throw new SeparationOfDutiesError(
      'Separation of duties: you authored or own this record and cannot sign, approve, or lock it. ' +
        'A different, authorized user must sign.',
    );
  }
  if (ownerId === null) {
    console.warn(
      `[governance/SoD] author/owner unresolved for target "${target}"; SoD check degraded (allowed).`,
    );
  }
}
