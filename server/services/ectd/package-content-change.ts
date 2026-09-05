/**
 * Package content change — the ONE implementation of "this package's content
 * moved, so what was derived from it is no longer valid".
 *
 * A submission package's transmittable state is derived: the assemble route
 * writes a bundle descriptor (and preflight a summary of it) from the sections,
 * mappings and artifacts as they stood at that moment. Anything that changes
 * that content invalidates both. There is exactly one way to record it, here,
 * because every partial version of this rule has been a defect:
 *
 *   - clearing the descriptor alone let an assembly already past its content
 *     read store a zip built from the old content right afterwards, so the
 *     content REVISION is bumped too and assemble compares it under the lock;
 *   - doing the row write and the bump in two transactions left the old bundle
 *     transmittable when the second failed, so `change` runs on the LOCKED
 *     client and commits with the bump;
 *   - leaving the preflight summary behind let the portfolio keep aggregating a
 *     run that described a bundle the package no longer had, so it goes too.
 *
 * The transmit-time content fingerprint (./package-content-fingerprint) is the
 * backstop for changes that never reach a package row at all; this module is
 * how a change that CAN be known at write time invalidates immediately.
 *
 * @module server/services/ectd/package-content-change
 */
import { and, eq } from 'drizzle-orm';

import { db, pool } from '../../db';
import { recordGovernedAction } from '../../routes/c2c/actions';
import {
  c2cArtifactSectionMap,
  c2cPackageSections,
  c2cSubmissionPackages,
  concept2cureArtifacts,
} from '../../../shared/schema';

/** The pool client inside a package row-lock transaction: a `mutate` callback
 *  may run the row writes that must commit together with the metadata. */
export type LockClient = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/**
 * Serialize EVERY writer of a package's metadata on the row itself: a
 * transaction, SELECT … FOR UPDATE, compute the new metadata from what is
 * current UNDER THE LOCK, write, commit. A re-read followed by a separate
 * UPDATE still lost a write that landed between the two statements — an
 * identifier recorded while a bundle was being assembled was reverted, and a
 * backbone built with the old application number was stored as transmittable.
 * `mutate` returns the metadata to write, or null to write nothing (the
 * decision is still made against the locked row).
 */
export async function withPackageMetadataLock<T>(
  packageDbId: number,
  mutate: (current: Record<string, unknown>, client: LockClient) =>
    | Promise<{ metadata: Record<string, unknown> | null; result: T }>
    | { metadata: Record<string, unknown> | null; result: T },
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT metadata FROM c2c_submission_packages WHERE id = $1 FOR UPDATE',
      [packageDbId],
    );
    const raw = rows[0]?.metadata;
    const current: Record<string, unknown> =
      raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : typeof raw === 'string' ? JSON.parse(raw) : {};
    const out = await mutate(current, client as LockClient);
    if (out.metadata) {
      await client.query(
        'UPDATE c2c_submission_packages SET metadata = $2::json, updated_at = now() WHERE id = $1',
        [packageDbId, JSON.stringify(out.metadata)],
      );
    }
    await client.query('COMMIT');
    return out.result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * The package's content revision: bumped under the row lock by every content
 * change and compared by assemble before a bundle is stored. Absent (packages
 * created before the revision existed) reads as 0, never NaN.
 */
export function contentRevisionOf(metadata: Record<string, unknown>): number {
  const raw = metadata.contentRevision;
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? raw : 0;
}

/**
 * Record that a package's content changed, in ONE transaction with the row
 * write that changes it: `change` runs on the locked client, the revision is
 * bumped, and the stored bundle descriptor and its preflight summary are
 * dropped. A failure anywhere rolls the row write back with the bump.
 */
export async function markContentChanged<R = undefined>(
  packageDbId: number,
  change?: (client: LockClient) => Promise<R>,
): Promise<{ staleBundleCleared: boolean; result: R }> {
  return withPackageMetadataLock(packageDbId, async (current, client) => {
    const result = (change ? await change(client) : undefined) as R;
    const { bundle: stale, preflight: _orphan, ...rest } = current;
    return {
      metadata: { ...rest, contentRevision: contentRevisionOf(current) + 1 },
      result: { staleBundleCleared: stale !== undefined, result },
    };
  });
}

/**
 * Record a governed action for a package mutation, in its own transaction via
 * the shared ledger primitive. Returns true when the ledger could NOT be
 * written: the mutation itself is kept (a bundle or an identifier change must
 * not be lost over an audit outage) and the caller must SAY so in its response
 * — never report a clean success over a missing audit row.
 */
export async function recordPackageGovernedAction(params: {
  orgId: number;
  userId: number;
  packageDbId: number;
  reason: string;
  payload: Record<string, unknown>;
  surface?: string;
}): Promise<boolean> {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await recordGovernedAction(client as any, {
        orgId: params.orgId,
        userId: params.userId,
        command: 'transition',
        target: `submission:${params.packageDbId}`,
        reason: params.reason,
        payload: params.payload,
        domain: 'mdx',
        surface: params.surface ?? 'submission-gateway',
      });
      await client.query('COMMIT');
      return false;
    } catch (ledgerErr) {
      try { await client.query('ROLLBACK'); } catch { /* noop */ }
      throw ledgerErr;
    } finally {
      client.release();
    }
  } catch (ledgerErr) {
    console.error(
      '[package-content-change] governed-action-ledger-write-failed',
      ledgerErr instanceof Error ? ledgerErr.message : ledgerErr,
    );
    return true;
  }
}

/* ─── An artifact changed ────────────────────────────────────────── */

/** What about the artifact changed. Named in the audit row, so an auditor can
 *  see WHY a transmittable bundle stopped being one. */
export type ArtifactChangeCause = 'content' | 'placement' | 'rollback';

export interface ArtifactChangeOutcome {
  /** Packages the artifact is mapped into (all of them are invalidated). */
  packagesAffected: number;
  /** Of those, the ones that were holding a transmittable bundle. */
  bundlesInvalidated: number;
  /** True when the invalidation could not be completed — the stored bundle may
   *  still be there. Never thrown at the caller: the artifact edit itself
   *  succeeded and must not be lost, and the transmit-time content fingerprint
   *  refuses such a bundle anyway. The caller SAYS this rather than implying a
   *  clean invalidation. */
  failed: boolean;
  /** True when a bundle was invalidated but its audit row could not be written. */
  ledgerWriteFailed: boolean;
}

/**
 * An artifact's own content, title, version or declared placement changed:
 * invalidate every package it is mapped into.
 *
 * Nothing on a package row changes when an artifact is edited, so without this
 * a zip built from the old text stayed stored and transmittable until the
 * transmit gate recomputed the content fingerprint — the operator learned of
 * it inside the transmit ceremony rather than at the edit. This is the
 * write-time half of that rule; the fingerprint remains the backstop for
 * anything that changes content without passing through here.
 *
 * Fail-safe by construction: it never throws. The edit that called it has
 * already happened and must not be rolled back over an invalidation failure,
 * and a bundle that survives one is still refused at transmit.
 */
export async function markPackagesContentChangedForArtifact(
  artifactDbId: number,
  orgId: number,
  opts: { userId: number; cause: ArtifactChangeCause },
): Promise<ArtifactChangeOutcome> {
  const outcome: ArtifactChangeOutcome = {
    packagesAffected: 0, bundlesInvalidated: 0, failed: false, ledgerWriteFailed: false,
  };
  let packageIds: number[];
  try {
    const rows = await db
      .selectDistinct({ packageDbId: c2cPackageSections.packageDbId })
      .from(c2cArtifactSectionMap)
      .innerJoin(c2cPackageSections, eq(c2cPackageSections.id, c2cArtifactSectionMap.sectionDbId))
      .where(and(eq(c2cArtifactSectionMap.artifactId, artifactDbId), eq(c2cArtifactSectionMap.orgId, orgId)));
    packageIds = rows.map((r) => Number(r.packageDbId)).filter((n) => Number.isSafeInteger(n) && n > 0);
  } catch (e) {
    console.error(
      '[package-content-change] artifact-change-package-lookup-failed',
      e instanceof Error ? e.message : e,
    );
    return { ...outcome, failed: true };
  }

  for (const packageDbId of packageIds) {
    try {
      const { staleBundleCleared } = await markContentChanged(packageDbId);
      outcome.packagesAffected += 1;
      if (!staleBundleCleared) continue;
      outcome.bundlesInvalidated += 1;
      // Clearing a transmittable bundle is a mutation of regulated state: it is
      // recorded like any other. The reason states the machine cause — the
      // operator's own reason belongs to the artifact edit that triggered it.
      const ledgerWriteFailed = await recordPackageGovernedAction({
        orgId,
        userId: opts.userId,
        packageDbId,
        reason: `Bundle invalidated: mapped artifact ${artifactDbId} had its ${opts.cause} changed`,
        payload: { change: 'bundle-invalidated', cause: opts.cause, artifactDbId, staleBundleCleared: true },
        surface: 'artifact-editor',
      });
      if (ledgerWriteFailed) outcome.ledgerWriteFailed = true;
    } catch (e) {
      outcome.failed = true;
      console.error(
        '[package-content-change] artifact-change-invalidation-failed',
        { packageDbId, artifactDbId, message: e instanceof Error ? e.message : String(e) },
      );
    }
  }
  return outcome;
}

/* ─── Mapping an artifact into a package section ─────────────────── */

/** A c2c_artifact_section_map row from `RETURNING *`, in the API's shape. */
export function mappingRowToApi(r: Record<string, unknown>) {
  return {
    id: Number(r.id),
    orgId: r.org_id,
    artifactId: r.artifact_id,
    sectionDbId: r.section_db_id,
    documentFamily: r.document_family ?? null,
    ownerUserId: r.owner_user_id ?? null,
    ownerRole: r.owner_role ?? null,
    ownerFunction: r.owner_function ?? null,
    ownershipType: r.ownership_type ?? null,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

/** Thrown inside a mapping transaction to roll it back without bumping. */
class MappingConflict extends Error { readonly name = 'MappingConflict'; }

export type MapArtifactResult =
  | {
      ok: true;
      mapping: ReturnType<typeof mappingRowToApi>;
      /** The mapping already existed: nothing was written, nothing invalidated. */
      duplicate: boolean;
      packageDbId: number;
      staleBundleCleared: boolean;
      ledgerWriteFailed: boolean;
    }
  | { ok: false; code: 'ARTIFACT_NOT_FOUND' | 'SECTION_NOT_FOUND' | 'PROJECT_MISMATCH'; message: string };

/**
 * Map an artifact into a package section — the ONE governed implementation.
 *
 * Tenant-scoped on both sides, one mapping per (artifact, section), and the row
 * commits in the same transaction as the package's content-change bump and
 * stale-bundle clear. A second, ungoverned copy of this used to live in the
 * biostatistics workflow integrator: it wrote the mapping row with no audit
 * row, no revision bump and no stale-bundle clear, so a package could ship a
 * zip that predated a document the platform had itself attached.
 *
 * Errors are returned as typed codes rather than HTTP statuses so a non-HTTP
 * caller maps them onto its own vocabulary without pretending to be a request.
 */
export async function mapArtifactToSection(params: {
  orgId: number;
  artifactDbId: number;
  sectionDbId: number;
  actorUserId: number;
  /** The caller's stated reason — recorded on the governed action. */
  reason: string;
  documentFamily?: string | null;
  ownerUserId?: number | null;
  ownerRole?: string | null;
  ownerFunction?: string | null;
  ownershipType?: string | null;
  surface?: string;
}): Promise<MapArtifactResult> {
  const { orgId, artifactDbId, sectionDbId, actorUserId } = params;

  const [artifact] = await db
    .select({ id: concept2cureArtifacts.id, projectId: concept2cureArtifacts.projectId })
    .from(concept2cureArtifacts)
    .where(and(eq(concept2cureArtifacts.id, artifactDbId), eq(concept2cureArtifacts.organizationId, orgId)));
  if (!artifact) {
    return { ok: false, code: 'ARTIFACT_NOT_FOUND', message: 'Artifact not found for organization' };
  }

  const [section] = await db
    .select({ id: c2cPackageSections.id, packageDbId: c2cPackageSections.packageDbId })
    .from(c2cPackageSections)
    .innerJoin(
      c2cSubmissionPackages,
      and(eq(c2cSubmissionPackages.id, c2cPackageSections.packageDbId), eq(c2cSubmissionPackages.orgId, orgId)),
    )
    .where(eq(c2cPackageSections.id, sectionDbId));
  if (!section) {
    return { ok: false, code: 'SECTION_NOT_FOUND', message: 'Section not found for organization' };
  }

  const [pkg] = await db
    .select({ id: c2cSubmissionPackages.id, projectId: c2cSubmissionPackages.projectId })
    .from(c2cSubmissionPackages)
    .where(and(eq(c2cSubmissionPackages.id, section.packageDbId), eq(c2cSubmissionPackages.orgId, orgId)));
  if (!pkg) {
    return { ok: false, code: 'SECTION_NOT_FOUND', message: 'Package not found for section' };
  }
  if (artifact.projectId !== pkg.projectId) {
    return {
      ok: false,
      code: 'PROJECT_MISMATCH',
      message: 'Artifact and target section package must belong to the same project',
    };
  }

  // One mapping per (artifact, section): a repeat is answered with the existing
  // row, not a second row that would ship the document twice.
  const [existing] = await db
    .select()
    .from(c2cArtifactSectionMap)
    .where(
      and(
        eq(c2cArtifactSectionMap.artifactId, artifactDbId),
        eq(c2cArtifactSectionMap.sectionDbId, sectionDbId),
        eq(c2cArtifactSectionMap.orgId, orgId),
      ),
    );
  if (existing) {
    return {
      ok: true, mapping: existing as any, duplicate: true, packageDbId: pkg.id,
      staleBundleCleared: false, ledgerWriteFailed: false,
    };
  }

  // The mapping row and the package's content change commit together. The
  // unique index is the backstop for a duplicate that races past the pre-check.
  let outcome: { staleBundleCleared: boolean; result: Record<string, unknown> };
  try {
    outcome = await markContentChanged(pkg.id, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO c2c_artifact_section_map
           (org_id, artifact_id, section_db_id, document_family, owner_user_id, owner_role, owner_function, ownership_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (artifact_id, section_db_id) DO NOTHING
         RETURNING *`,
        [
          orgId, artifactDbId, sectionDbId, params.documentFamily ?? null,
          params.ownerUserId || actorUserId || null, params.ownerRole ?? null,
          params.ownerFunction ?? null, params.ownershipType ?? null,
        ],
      );
      if (rows.length === 0) throw new MappingConflict('mapping already exists');
      return rows[0] as Record<string, unknown>;
    });
  } catch (e) {
    if (!(e instanceof MappingConflict)) throw e;
    // Rolled back: nothing changed, so nothing is bumped or recorded.
    const [raced] = await db
      .select()
      .from(c2cArtifactSectionMap)
      .where(
        and(
          eq(c2cArtifactSectionMap.artifactId, artifactDbId),
          eq(c2cArtifactSectionMap.sectionDbId, sectionDbId),
          eq(c2cArtifactSectionMap.orgId, orgId),
        ),
      );
    return {
      ok: true, mapping: (raced ?? null) as any, duplicate: true, packageDbId: pkg.id,
      staleBundleCleared: false, ledgerWriteFailed: false,
    };
  }

  const mapping = mappingRowToApi(outcome.result);
  const ledgerWriteFailed = await recordPackageGovernedAction({
    orgId,
    userId: actorUserId,
    packageDbId: pkg.id,
    reason: params.reason,
    payload: {
      change: 'artifact-mapped',
      mappingId: mapping.id,
      artifactId: artifactDbId,
      sectionDbId,
      documentFamily: params.documentFamily ?? null,
      staleBundleCleared: outcome.staleBundleCleared,
    },
    surface: params.surface,
  });

  return {
    ok: true,
    mapping,
    duplicate: false,
    packageDbId: pkg.id,
    staleBundleCleared: outcome.staleBundleCleared,
    ledgerWriteFailed,
  };
}
