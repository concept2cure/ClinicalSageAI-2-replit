/**
 * What a seal's closing archive says about itself (VR-20,
 * docs/design/VAULT_CLOSING_ARCHIVE_2026-10-29.md): the manifest, the
 * printable index's header, and the audit extract.
 *
 * The bytes are staged by the route from the seal's own byte check; this module
 * describes them. The audit extract is the seal's chained rows and each sealed
 * version's, read through the one record-history reader with its chain verdict,
 * and projected as the document history projects it, so an archive shows no
 * more of the trail than the history does. A trail at the reader's ceiling is
 * refused rather than cut: an archive that silently drops audit rows would
 * claim a completeness it does not have.
 */
import type { Pool } from 'pg';
import { readRecordAuditHistory } from '../../routes/audit-trail-ledger.routes.js';
import { setTenantContextTx } from '../tenant/governed-tenant-context.js';
import { projectVaultRelationshipHistory, VaultHistoryAccessError } from './vault-history-access.js';
import type { ArchivedFile } from './vault-archive-builder.js';
import type { SealManifest, VaultSeal } from './vault-seal.service.js';

export const SEAL_ARCHIVE_SCHEMA = 'vault-closing-archive/1';
/** The record-history reader's ceiling. */
export const SEAL_ARCHIVE_AUDIT_CEILING = 1000;

export const archiveActorIdentity = (namedActors?: boolean): string => namedActors === true
  ? 'named actors and IP addresses' : 'account references; IP addresses omitted';

/** A sealed document whose file the archive does not hold, and why. */
export interface WithheldDocument {
  id: string;
  title: string | null;
  sha256: string | null;
  why: string;
}

export class SealArchiveError extends Error {
  constructor(readonly status: 409 | 503, readonly code: string, message: string) {
    super(message);
  }
}

/**
 * The audit extract an archive carries: the chained rows of the records it
 * holds, read through the one record-history reader with its chain verdict and
 * projected as the document history projects them. Shared by a seal's closing
 * archive and a folder's export. `of` names what the trail is of, in the
 * refusal a trail at the reader's ceiling gets.
 */
export async function readArchiveAuditExtract(
  pool: Pick<Pool, 'connect'>, organizationId: number, userId: number | undefined,
  record: { tableName: string; recordId: string | string[]; also?: Array<{ tableName: string; recordId: string[] }> },
  access: { of: string; namedActors?: boolean },
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, organizationId);
    const read = await readRecordAuditHistory(client, organizationId, { ...record, limit: SEAL_ARCHIVE_AUDIT_CEILING });
    if (read.data.length >= SEAL_ARCHIVE_AUDIT_CEILING) {
      throw new SealArchiveError(409, 'ARCHIVE_AUDIT_TOO_LONG',
        `The audit trail of ${access.of} has ${SEAL_ARCHIVE_AUDIT_CEILING} rows or more, which one archive cannot hold whole. No archive was built.`);
    }
    const history = await projectVaultRelationshipHistory(client, { organizationId, userId }, read);
    await client.query('COMMIT');
    if (access.namedActors === true) return history;
    return { ...history, data: history.data.map(({ ip: _ip, ...entry }) => ({ ...entry,
      actor: entry.actorRef ?? (entry.actor === 'System' ? 'System' : 'not named in this copy'),
    })) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (err instanceof VaultHistoryAccessError) throw new SealArchiveError(err.status, err.code, err.message);
    throw err;
  } finally {
    client.release();
  }
}

/** The manifest, index header and audit extract of one intact seal's archive. */
export async function buildSealArchiveContents(
  pool: Pick<Pool, 'connect'>,
  input: { organizationId: number; userId: number | undefined; seal: VaultSeal; manifest: SealManifest; withheld?: WithheldDocument[]; builtAt?: Date; namedActors?: boolean },
): Promise<{ manifest: (files: ArchivedFile[]) => Record<string, unknown>; indexHeader: string[]; attachments: Array<{ path: string; content: string }> }> {
  const { seal, manifest } = input;
  const withheld = input.withheld ?? [];
  const builtAt = (input.builtAt ?? new Date()).toISOString();
  const history = await readArchiveAuditExtract(pool, input.organizationId, input.userId, {
    tableName: 'vault_data_room_seal', recordId: seal.id,
    also: [{ tableName: 'vault_document', recordId: manifest.documents.map((d) => d.id) }],
  }, { of: 'this seal and its documents', namedActors: input.namedActors });
  const entries = [...history.data].reverse();
  const auditPath = 'audit/audit-trail.json';
  const actorIdentity = archiveActorIdentity(input.namedActors);
  const audit = {
    schema: 'vault-closing-archive-audit/1',
    actorIdentity,
    readAt: builtAt,
    order: 'oldest first',
    records: { seal: seal.id, documents: manifest.documents.map((d) => d.id) },
    chain: history.meta.chain,
    entries,
  };
  return {
    manifest: (files) => ({
      schema: SEAL_ARCHIVE_SCHEMA,
      builtAt,
      builtBy: input.userId ?? null,
      seal,
      // When built, the seal verified intact, every file it holds read again.
      verification: { verdict: 'intact', filesReadAgain: files.length, withheld: withheld.length },
      sealManifest: manifest,
      files,
      withheld,
      auditTrail: { path: auditPath, entries: entries.length, chain: history.meta.chain, actorIdentity },
    }),
    indexHeader: [
      'Closing archive of a sealed Vault',
      '',
      `Seal:                  ${seal.id}`,
      `Project:               ${seal.programId}`,
      `Sealed:                ${seal.sealedAt} by ${seal.sealedByName ?? `user ${seal.sealedBy}`}`,
      `Reason:                ${seal.reason}`,
      `Seal manifest SHA-256: ${seal.manifestSha256}`,
      `Documents:             ${seal.documentCount}`,
      `Built:                 ${builtAt}`,
      '',
      'Every file in this archive is listed in SHA256SUMS; `sha256sum -c SHA256SUMS` checks them all.',
      'manifest.json holds the seal record exactly as signed (sealManifest), whose canonical JSON hashes to the seal manifest SHA-256.',
      `Audit identities: ${actorIdentity}.`,
      `${auditPath} holds the chained audit rows of the seal and of each sealed version, oldest first.`,
      ...(withheld.length
        ? ['', `Withheld (${withheld.length}): sealed documents whose file this archive does not hold.`,
          ...withheld.map((w) => `  ${w.title ?? w.id}  ${w.sha256 ?? '-'}  ${w.why}`)]
        : []),
      '',
      'Position  Index number  Title  SHA-256  Path',
    ],
    attachments: [{ path: auditPath, content: `${JSON.stringify(audit, null, 2)}\n` }],
  };
}
