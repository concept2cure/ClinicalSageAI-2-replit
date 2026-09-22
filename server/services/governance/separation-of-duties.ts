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
 * ── A failed lookup is not an un-modelled target (2026-09-22) ─────────────────
 * The resolver used to catch EVERY query error and return null, the same value
 * it returns for "no owner column modelled". `assertSignerIsNotAuthor` reads
 * null as allow, so a statement timeout, a dropped connection or an RLS refusal
 * let an author sign their own record, and the signature row carried no trace
 * that the four-eyes check had not run.
 *
 * The 42P01 / 42703 carve-out ("table or column not migrated") went too, and
 * for a reason this file had already recorded: the `c2c_blockers` query once
 * named `organization_id` where the column is `org_id`, and that 42703 is
 * exactly what "silently degraded the un-disableable SoD check to allow". In a
 * deployed database an undefined column is a code defect, not an unmigrated
 * environment, and a code defect in this check must be loud.
 *
 * So now: an un-modelled target type returns null WITHOUT querying; any error
 * while querying a modelled type propagates, and `assertSignerIsNotAuthor`
 * turns it into `SeparationOfDutiesUnverifiedError`. Nothing is signed, and the
 * route answers 503 with a code that says the check could not run, which is
 * different from a 403 that says the check ran and refused.
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

/**
 * The owner lookup for a MODELLED target type failed, so authorship could not be
 * checked. Deliberately not a subclass of `SeparationOfDutiesError`: that one
 * means "the check ran and you are the author"; this one means "the check did
 * not run". A caller that maps both to the same response tells the user
 * something false either way.
 */
export class SeparationOfDutiesUnverifiedError extends Error {
  readonly code = 'SEPARATION_OF_DUTIES_UNVERIFIED';
  constructor(target: string, cause: string) {
    super(
      `Separation of duties could not be verified for "${target}" (${cause}). ` +
        'Nothing was signed. Retry; if this persists, the owner lookup for this record type is failing.',
    );
    this.name = 'SeparationOfDutiesUnverifiedError';
  }
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseInt(v, 10) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve the author/owner user id of a governed target, org-scoped. Returns
 * null when the target type has no modelled owner column, or when the row is
 * missing or records no owner. THROWS when the lookup itself fails: that is not
 * an answer about the owner, and must not be read as one.
 */
export async function resolveTargetOwnerId(target: string, orgId: number): Promise<number | null> {
  const colonIdx = target.indexOf(':');
  if (colonIdx === -1) return null;
  const prefix = target.slice(0, colonIdx);
  const rest = target.slice(colonIdx + 1);

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
}

/**
 * Enforce author≠signer. Throws SeparationOfDutiesError when the signer owns /
 * authored the target. Un-disableable. Throws SeparationOfDutiesUnverifiedError
 * when the owner lookup fails. Degrades (logs, allows) only when there is no
 * owner to compare against — an un-modelled target type, or a row that records
 * no owner.
 */
export async function assertSignerIsNotAuthor(
  target: string,
  orgId: number,
  signerId: number,
): Promise<void> {
  let ownerId: number | null;
  try {
    ownerId = await resolveTargetOwnerId(target, orgId);
  } catch (err: unknown) {
    const e = err as { code?: unknown; message?: unknown } | null;
    const cause = typeof e?.code === 'string' ? `database error ${e.code}` : 'owner lookup failed';
    console.error(`[governance/SoD] owner lookup failed for "${target}"; refusing to sign:`, e?.message);
    throw new SeparationOfDutiesUnverifiedError(target, cause);
  }
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
