/**
 * Fixity: re-read every stored version of a program's Vault and prove its
 * bytes still match the SHA-256 recorded at ingest (plan critique 15, rows D5
 * and D2).
 *
 * Until now byte loss or alteration was found only when someone downloaded the
 * affected version: readVerifiedVaultBytes refuses to serve bytes that do not
 * match their record, but nothing asked the question of the bytes nobody
 * opened. Here a person asks it of the whole program, on demand. Each version
 * is read through the same verifier a download uses, and each verdict is
 * written to the audit chain as its own `vault.document.fixity` row, so the
 * record shows when each version was last proven intact, by whom, and with
 * what result. The run answers with the counts and lists every version that
 * failed.
 *
 * Verdicts, per version:
 *   verified      the bytes were read and hash to the recorded SHA-256;
 *   altered       the bytes were read and do not (CONTENT_HASH_MISMATCH);
 *   missing       the record exists but its bytes could not be read;
 *   unreadable    the store the bytes were written to cannot be opened here;
 *   unverifiable  no SHA-256 was recorded, so nothing can be proven.
 *
 * Scheduling it is the jobs lane's: this is the check a scheduled sweep runs.
 */
import { pool } from '../../db.js';
import { writeChainedAuditRow } from '../auditService.js';
import { programInOrganization } from '../c2c/program-access';
import { readVerifiedVaultBytes } from '../../routes/c2c/project-vault.js';

/** At most this many versions per run; the answer says when the program has more. */
export const FIXITY_BATCH_LIMIT = 500;

export type FixityVerdict = 'verified' | 'altered' | 'missing' | 'unreadable' | 'unverifiable';

export interface FixityFinding { documentId: string; title: string | null; version: string | null; verdict: FixityVerdict }

export type FixityResult =
  | {
      ok: true;
      checkedAt: string;
      checked: number;
      counts: Record<FixityVerdict, number>;
      /** Every version whose verdict is not `verified`. */
      findings: FixityFinding[];
      /** The program holds more versions than one run checks. */
      truncated: boolean;
    }
  | { ok: false; status: number; code: string; message: string };

interface VersionRow {
  id: string;
  document_title: string | null;
  version: string | null;
  content_hash: string | null;
  storage_version_id: string | null;
  s3_key: string | null;
  storage_provider: string | null;
}

const VERDICT_OF: Record<string, FixityVerdict> = {
  CONTENT_HASH_MISMATCH: 'altered',
  STORED_FILE_MISSING: 'missing',
  NO_STORED_FILE: 'missing',
  STORED_FILE_UNREADABLE: 'unreadable',
};

async function verdictFor(row: VersionRow, organizationId: number): Promise<FixityVerdict> {
  const recorded = row.content_hash ? row.content_hash.trim() : null;
  const read = await readVerifiedVaultBytes(
    { storageVersionId: row.storage_version_id, storageKey: row.s3_key, organizationId, storageProvider: row.storage_provider },
    recorded,
    row.id,
  );
  if (read.ok) return recorded ? 'verified' : 'unverifiable';
  return VERDICT_OF[read.error] ?? 'missing';
}

/** One chained row per version: the verdict, in its own transaction. */
async function recordVerdict(
  p: { organizationId: number; userId: number | null; programId: string; ipAddress?: string; userAgent?: string },
  row: VersionRow,
  verdict: FixityVerdict,
  checkedAt: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await writeChainedAuditRow(client, {
      tenantId: p.organizationId,
      userId: p.userId ?? undefined,
      action: 'vault.document.fixity',
      resourceType: 'vault_document',
      resourceId: row.id,
      ipAddress: p.ipAddress,
      userAgent: p.userAgent,
      // `description` is what the document's history shows for the event.
      details: { description: `Fixity check: ${verdict}`, programId: p.programId, version: row.version, verdict, recordedHash: row.content_hash, checkedAt },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Check every stored version of the program, newest first, up to the batch limit. */
export async function checkProgramFixity(p: {
  programId: string;
  organizationId: number;
  userId: number | null;
  ipAddress?: string;
  userAgent?: string;
}): Promise<FixityResult> {
  if (!(await programInOrganization(pool, p.programId, p.organizationId))) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'No such project.' };
  }
  const { rows } = await pool.query(
    `SELECT d.id::text AS id, d.document_title, d.version, d.content_hash,
            d.storage_version_id, d.s3_key, d.storage_provider
       FROM vault.documents d
      WHERE d.program_id = $1 AND d.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM regulatory_programs rp
                     WHERE rp.id = d.program_id AND rp.organization_id = $2 AND rp.deleted_at IS NULL)
      ORDER BY d.created_at DESC
      LIMIT $3`,
    [p.programId, p.organizationId, FIXITY_BATCH_LIMIT + 1],
  );
  const truncated = rows.length > FIXITY_BATCH_LIMIT;
  const versions = (truncated ? rows.slice(0, FIXITY_BATCH_LIMIT) : rows) as VersionRow[];
  const checkedAt = new Date().toISOString();
  const counts: Record<FixityVerdict, number> = { verified: 0, altered: 0, missing: 0, unreadable: 0, unverifiable: 0 };
  const findings: FixityFinding[] = [];
  // One at a time: each read is a whole file, and each verdict its own row.
  for (const row of versions) {
    const verdict = await verdictFor(row, p.organizationId);
    await recordVerdict(p, row, verdict, checkedAt);
    counts[verdict] += 1;
    if (verdict !== 'verified') findings.push({ documentId: row.id, title: row.document_title, version: row.version, verdict });
  }
  return { ok: true, checkedAt, checked: versions.length, counts, findings, truncated };
}
