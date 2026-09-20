/**
 * Move a tenant's vault bytes onto the canonical storage provider.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Vault ingest used to write bytes straight to
 * `uploads/vault/{programId}/{contentHash}{ext}` and keep that relative PATH in
 * `s3_key`, bypassing `server/services/storage/` — the seam everything else
 * stores through. It writes through the provider now and records
 * `storage_version_id`, but NO BYTES WERE MOVED when that changed: the read path
 * is a dual read, so every row written before it keeps working by path.
 *
 * This sweep is what lets those rows join the new path. Until it runs they are
 * correct and readable; they simply cannot be fetched by the eCTD packager,
 * which only knows how to ask the provider.
 *
 * ── Rules, all of them fail-closed ──────────────────────────────────────────
 *   - DRY RUN unless `apply`. The dry run does the same reads and the same
 *     verification and writes nothing, so the report can be argued with before
 *     a byte moves.
 *   - A document is migrated only when its bytes on disk HASH TO THE VALUE THE
 *     RECORD ALREADY CLAIMS. A mismatch is reported and left alone: the row
 *     says these bytes are that document, and copying bytes that contradict it
 *     into the governed store would launder the contradiction into a fresh,
 *     provider-minted record that looks clean.
 *   - Missing bytes are reported, never "migrated". A row whose file is gone is
 *     a real problem and must stay visible as one.
 *   - A row with no recorded hash is migrated but reported SEPARATELY as
 *     unverified. Refusing it would strand it forever (nothing can ever supply
 *     the missing hash); migrating it silently would imply a check happened.
 *   - THE OLD FILE IS NEVER DELETED. Deleting the only other copy of a
 *     regulatory document, in the same pass that writes a new one, is not a
 *     risk worth taking for disk. Reclaiming it is a separate decision.
 *   - Idempotent and resumable: rows that already carry a `storage_version_id`
 *     are not candidates, so a second run finds nothing and a partial run
 *     continues.
 *
 * ── Tenancy ─────────────────────────────────────────────────────────────────
 * The organization is read from the document's PROGRAM, not from
 * `vault.documents.organization_id` — that column is nullable by design (rows
 * it could not attribute are quarantined) and the provider's `put`/`get` take
 * an integer org that must be right. A document whose program does not resolve
 * to an organization is reported unattributed and skipped, because there is no
 * tenant to store it under and inventing one is how bytes end up in the wrong
 * customer's directory.
 *
 * @module server/services/vault/storage-migration.service
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';

/** Minimal pg-shaped executor: a Pool, a PoolClient, or PGlite in the test. */
export interface MigrationExecutor {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** The slice of IStorageProvider this sweep needs. Injected so the test can
 *  assert what was stored without writing to a real provider. */
export interface MigrationStorage {
  put(opts: {
    orgId: number;
    projectId: string;
    filename: string;
    bytes: Buffer;
    mime: string;
    metadata?: Record<string, string>;
  }): Promise<{ vaultFileId: string; vaultVersionId: string; provider: string }>;
}

export type SkipReason =
  | 'no_storage_key'
  | 'bytes_missing'
  | 'hash_mismatch'
  | 'key_escapes_root'
  | 'unattributed';

export interface VaultStorageMigrationReport {
  organizationId: number;
  apply: boolean;
  /** Candidates examined (rows with no storage_version_id). */
  examined: number;
  /** Migrated (apply) or that would be migrated (dry run). */
  migrated: number;
  /** Migrated WITHOUT a recorded hash to check them against. */
  migratedUnverified: number;
  /** Left alone, with why. */
  skipped: Array<{ documentId: string; reason: SkipReason; detail?: string }>;
}

export interface VaultStorageMigrationOptions {
  organizationId: number;
  apply: boolean;
  /** Maximum candidates per run. */
  limit?: number;
  /** Root the legacy relative keys resolve against. Defaults to process.cwd(). */
  cwd?: string;
}

interface CandidateRow {
  id: string;
  program_id: string;
  s3_key: string | null;
  content_hash: string | null;
  file_name: string | null;
  mime_type: string | null;
  document_code: string | null;
  org_id: number | null;
}

export async function migrateVaultStorage(
  exec: MigrationExecutor,
  storage: MigrationStorage,
  opts: VaultStorageMigrationOptions,
): Promise<VaultStorageMigrationReport> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 1000);
  const cwd = opts.cwd ?? process.cwd();
  const report: VaultStorageMigrationReport = {
    organizationId: opts.organizationId,
    apply: opts.apply,
    examined: 0,
    migrated: 0,
    migratedUnverified: 0,
    skipped: [],
  };

  // Candidates: this tenant's vault documents that are still path-addressed.
  // The org comes from the PROGRAM (authoritative) and is also the predicate,
  // so a row belonging to another tenant is not a candidate at all.
  const res = await exec.query(
    `SELECT d.id, d.program_id, d.s3_key, d.content_hash, d.file_name,
            d.mime_type, d.document_code, rp.organization_id AS org_id
       FROM vault.documents d
       LEFT JOIN regulatory_programs rp
         ON rp.id = d.program_id AND rp.deleted_at IS NULL
      WHERE d.storage_version_id IS NULL
        AND d.deleted_at IS NULL
        AND rp.organization_id = $1
      ORDER BY d.created_at ASC
      LIMIT $2`,
    [opts.organizationId, limit],
  );

  for (const raw of res.rows) {
    const row = raw as unknown as CandidateRow;
    report.examined += 1;

    if (row.org_id == null) {
      report.skipped.push({ documentId: row.id, reason: 'unattributed' });
      continue;
    }
    if (!row.s3_key) {
      report.skipped.push({ documentId: row.id, reason: 'no_storage_key' });
      continue;
    }

    // Same guard the read path applies: a key that escapes the uploads root is
    // refused rather than read. A backfill is exactly where a bad key would be
    // followed without anyone watching.
    const resolved = path.resolve(cwd, row.s3_key);
    const root = path.resolve(cwd, 'uploads');
    if (!resolved.startsWith(root + path.sep)) {
      report.skipped.push({ documentId: row.id, reason: 'key_escapes_root', detail: row.s3_key });
      continue;
    }

    let bytes: Buffer;
    try {
      bytes = await fs.readFile(resolved);
    } catch {
      report.skipped.push({ documentId: row.id, reason: 'bytes_missing', detail: row.s3_key });
      continue;
    }

    let unverified = false;
    if (row.content_hash) {
      const actual = createHash('sha256').update(bytes).digest('hex');
      if (actual !== row.content_hash) {
        report.skipped.push({
          documentId: row.id,
          reason: 'hash_mismatch',
          detail: `recorded ${row.content_hash.slice(0, 12)}, actual ${actual.slice(0, 12)}`,
        });
        continue;
      }
    } else {
      unverified = true;
    }

    if (!opts.apply) {
      report.migrated += 1;
      if (unverified) report.migratedUnverified += 1;
      continue;
    }

    const stored = await storage.put({
      orgId: row.org_id,
      projectId: row.program_id,
      filename: row.file_name || `document-${row.id}`,
      bytes,
      mime: row.mime_type || 'application/octet-stream',
      metadata: {
        ...(row.content_hash ? { contentHash: row.content_hash } : {}),
        ...(row.document_code ? { documentCode: row.document_code } : {}),
      },
    });

    // The org predicate is repeated on the UPDATE. The row was selected under
    // it, but a write that re-states its own scope cannot be widened later by
    // someone changing the SELECT above.
    await exec.query(
      `UPDATE vault.documents d
          SET storage_version_id = $1,
              storage_provider   = $2,
              s3_key             = $3,
              s3_bucket          = $2,
              updated_at         = NOW()
        WHERE d.id = $4
          AND d.storage_version_id IS NULL
          AND EXISTS (
            SELECT 1 FROM regulatory_programs rp
             WHERE rp.id = d.program_id AND rp.organization_id = $5
          )`,
      [stored.vaultVersionId, stored.provider, stored.vaultFileId, row.id, opts.organizationId],
    );

    report.migrated += 1;
    if (unverified) report.migratedUnverified += 1;
  }

  return report;
}
