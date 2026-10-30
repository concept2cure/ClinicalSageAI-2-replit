/**
 * Seal a project's Vault: a hash-verified record of every current document as
 * it stands, which nothing can alter, and which anyone in the organisation can
 * verify later (VR-19, docs/design/VAULT_DATA_ROOM_SEAL_2026-10-29.md).
 *
 * The seal is an e-signed act (FD9): the route records it through
 * signGovernedAct, whose signature binds this manifest's SHA-256 through the
 * `vault-data-room-seal` content binder. This module holds only the record:
 * what is listed, how it is hashed, the append-only row and its chained audit
 * row, and the verdict.
 *
 * The documents are the ones the Vault shows: the read model's predicate
 * (program, organisation, not deleted, data eligible, the program's own
 * organisation) at their current versions (VR-09). Each entry carries the index
 * number the tree gives it (VR-15), which the caller passes in, since the
 * numbering belongs to the tree.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { stableStringify } from '../../../shared/canonical-json.js';
import { writeChainedAuditRow } from '../auditService.js';
import { vaultBinaryAvailableSql, vaultDataEligibleSql } from '../document-data-disposition/eligibility.js';
import { supersededSql } from './vault-version-family.js';
import { vaultLifecycleStageSql } from './vault-document-filter.js';
import { programInOrganization } from '../c2c/program-access.js';

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

/** The manifest's own schema id: a verifier knows which recipe it reads. */
export const SEAL_MANIFEST_SCHEMA = 'vault-data-room-seal/1';

/** One document as the seal records it. */
export interface SealDocument {
  id: string;
  documentCode: string | null;
  title: string | null;
  version: string | null;
  contentHash: string | null;
  folderId: string | null;
  ctdSection: string | null;
  indexNumber: string | null;
  placementStatus: string;
  lifecycleStage: string | null;
}

export interface SealManifest {
  schema: typeof SEAL_MANIFEST_SCHEMA;
  programId: string;
  documents: SealDocument[];
}

export interface VaultSeal {
  id: string;
  programId: string;
  reason: string;
  manifestSha256: string;
  documentCount: number;
  sealedBy: number;
  sealedByName: string | null;
  sealedAt: string;
}

export type SealVerdict = 'intact' | 'changed' | 'could_not_verify';

export interface SealVerification {
  verdict: SealVerdict;
  /** Documents whose record no longer matches the seal: removed, or a different hash. */
  changed: Array<{ id: string; title: string | null; why: 'removed' | 'content_changed' }>;
  /** Documents whose stored file could not be read or did not match (bytes check only). */
  unreadable: Array<{ id: string; title: string | null; why: string }>;
  /** True when the stored manifest still hashes to the recorded hash. */
  manifestIntact: boolean;
  bytesChecked: boolean;
}

/** A refusal the route maps to a status. */
export class VaultSealError extends Error {
  constructor(public readonly code: 'SEAL_NOT_FOUND' | 'SEAL_PROGRAM_NOT_FOUND' | 'SEAL_REASON_REQUIRED', message: string) {
    super(message);
  }
}

/** Equality of two recorded digests in constant time; a missing one equals only another missing one. */
function sameDigest(x: string | null, y: string | null): boolean {
  if (x === null || y === null) return x === y;
  const a = Buffer.from(x, 'utf8');
  const b = Buffer.from(y, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** SHA-256 of the manifest's canonical form: the one recipe a seal and its verifier share. */
export function sealManifestSha256(manifest: SealManifest): string {
  return createHash('sha256').update(stableStringify(manifest), 'utf8').digest('hex');
}

/**
 * The project's current documents with what a seal records, as rows the tree
 * can number. Read on the caller's client, so a seal reads what its own
 * transaction sees.
 */
export async function readSealDocumentRows(q: Queryable, organizationId: number, programId: string): Promise<Array<Record<string, unknown>>> {
  if (!(await programInOrganization(q, programId, organizationId))) {
    throw new VaultSealError('SEAL_PROGRAM_NOT_FOUND', 'Project not found in this organization. Nothing was sealed.');
  }
  const { rows } = await q.query(
    `SELECT d.id::text AS id, d.document_code, d.document_title, d.document_type, d.version, d.file_name,
            d.content_hash, d.folder_id, d.evidence_kind, d.ctd_section, d.placement_status,
            ${vaultLifecycleStageSql('d')} AS lifecycle_stage
       FROM vault.documents d
      WHERE d.program_id = $1::uuid AND d.organization_id = $2 AND d.deleted_at IS NULL
        AND ${vaultDataEligibleSql('d')}
        AND NOT ${supersededSql('d')}
      ORDER BY d.id`,
    [programId, organizationId],
  );
  return rows;
}

/** The manifest of those rows, in a stable order, each with its index number. */
export function sealManifest(programId: string, rows: Array<Record<string, unknown>>, indexNumberOf: (id: string) => string | null): SealManifest {
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const documents = rows.map((r): SealDocument => ({
    id: String(r.id),
    documentCode: str(r.document_code),
    title: str(r.document_title) ?? str(r.file_name),
    version: str(r.version),
    contentHash: str(r.content_hash)?.toLowerCase() ?? null,
    folderId: str(r.folder_id),
    ctdSection: str(r.ctd_section),
    indexNumber: indexNumberOf(String(r.id)),
    placementStatus: str(r.placement_status) ?? 'unfiled',
    lifecycleStage: str(r.lifecycle_stage),
  })).sort((a, b) => a.id.localeCompare(b.id));
  return { schema: SEAL_MANIFEST_SCHEMA, programId, documents };
}

/**
 * Record the seal on the signing transaction: the append-only row and its
 * chained audit row, both carrying the manifest's hash.
 */
export async function recordSeal(
  q: Queryable,
  input: { id: string; organizationId: number; programId: string; userId: number; reason: string; manifest: SealManifest },
): Promise<VaultSeal> {
  const reason = input.reason.trim();
  if (!reason) throw new VaultSealError('SEAL_REASON_REQUIRED', 'A seal needs a reason. Nothing was sealed.');
  const manifestSha256 = sealManifestSha256(input.manifest);
  const { rows } = await q.query(
    `INSERT INTO public.vault_data_room_seals
       (id, organization_id, program_id, reason, manifest, manifest_sha256, document_count, sealed_by)
     VALUES ($1::uuid, $2, $3::uuid, $4, $5::jsonb, $6, $7, $8)
     RETURNING id::text, sealed_at`,
    [input.id, input.organizationId, input.programId, reason, stableStringify(input.manifest), manifestSha256,
      input.manifest.documents.length, input.userId],
  );
  await writeChainedAuditRow(q, {
    tenantId: input.organizationId,
    userId: input.userId,
    action: 'vault.data_room.seal',
    resourceType: 'vault_data_room_seal',
    resourceId: input.id,
    details: { programId: input.programId, manifestSha256, documentCount: input.manifest.documents.length, reason },
  });
  return {
    id: String(rows[0].id), programId: input.programId, reason, manifestSha256,
    documentCount: input.manifest.documents.length, sealedBy: input.userId, sealedByName: null,
    sealedAt: new Date(rows[0].sealed_at as string).toISOString(),
  };
}

function sealOf(r: Record<string, unknown>): VaultSeal {
  return {
    id: String(r.id), programId: String(r.program_id), reason: String(r.reason),
    manifestSha256: String(r.manifest_sha256), documentCount: Number(r.document_count),
    sealedBy: Number(r.sealed_by), sealedByName: typeof r.sealed_by_name === 'string' ? r.sealed_by_name : null,
    sealedAt: new Date(r.sealed_at as string).toISOString(),
  };
}

/** The project's seals, newest first. */
export async function listSeals(q: Queryable, organizationId: number, programId: string): Promise<VaultSeal[]> {
  const { rows } = await q.query(
    `SELECT s.id::text, s.program_id::text, s.reason, s.manifest_sha256, s.document_count, s.sealed_by, s.sealed_at,
            COALESCE(u.name, u.email) AS sealed_by_name
       FROM public.vault_data_room_seals s
       LEFT JOIN LATERAL public.actor_name(s.sealed_by) u ON TRUE
      WHERE s.organization_id = $1 AND s.program_id = $2::uuid
      ORDER BY s.sealed_at DESC, s.id`,
    [organizationId, programId],
  );
  return rows.map(sealOf);
}

/** The bytes check's reader: the one verified reader, or a refusal in its words. */
export type SealByteCheck = (doc: SealDocument, recorded: Record<string, unknown>) => Promise<string | null>;

/**
 * Verify a seal against the Vault as it is now. Intact only when the stored
 * manifest still hashes to its recorded hash, every sealed document is still
 * recorded with the same hash, and, when bytes are checked, every stored file
 * reads and matches. Anything that could not be read makes the answer
 * could_not_verify, never intact.
 */
export async function verifySeal(
  q: Queryable,
  input: { organizationId: number; programId: string; sealId: string; checkBytes?: SealByteCheck },
): Promise<{ seal: VaultSeal; manifest: SealManifest; verification: SealVerification }> {
  const { rows } = await q.query(
    `SELECT s.id::text, s.program_id::text, s.reason, s.manifest, s.manifest_sha256, s.document_count, s.sealed_by, s.sealed_at,
            COALESCE(u.name, u.email) AS sealed_by_name
       FROM public.vault_data_room_seals s
       LEFT JOIN LATERAL public.actor_name(s.sealed_by) u ON TRUE
      WHERE s.id = $1::uuid AND s.organization_id = $2 AND s.program_id = $3::uuid`,
    [input.sealId, input.organizationId, input.programId],
  );
  if (!rows.length) throw new VaultSealError('SEAL_NOT_FOUND', 'Seal not found in this project.');
  const seal = sealOf(rows[0]);
  const manifest = rows[0].manifest as SealManifest;
  const manifestIntact = sameDigest(sealManifestSha256(manifest), seal.manifestSha256);
  const docs = Array.isArray(manifest?.documents) ? manifest.documents : [];
  const now = docs.length
    ? (await q.query(
      `SELECT d.id::text AS id, d.content_hash, d.file_name, d.storage_version_id, d.s3_key, d.storage_provider,
              ${vaultBinaryAvailableSql('d')} AS binary_available
         FROM vault.documents d
        WHERE d.id = ANY($1::uuid[]) AND d.organization_id = $2 AND d.program_id = $3::uuid AND d.deleted_at IS NULL`,
      [docs.map((d) => d.id), input.organizationId, input.programId],
    )).rows
    : [];
  const byId = new Map(now.map((r) => [String(r.id), r]));
  const changed: SealVerification['changed'] = [];
  const unreadable: SealVerification['unreadable'] = [];
  for (const doc of docs) {
    const row = byId.get(doc.id);
    if (!row) { changed.push({ id: doc.id, title: doc.title, why: 'removed' }); continue; }
    const hash = typeof row.content_hash === 'string' ? row.content_hash.trim().toLowerCase() : null;
    if (!sameDigest(hash, doc.contentHash)) { changed.push({ id: doc.id, title: doc.title, why: 'content_changed' }); continue; }
    if (input.checkBytes) {
      const refusal = await input.checkBytes(doc, row);
      if (refusal) unreadable.push({ id: doc.id, title: doc.title, why: refusal });
    }
  }
  const verdict: SealVerdict = !manifestIntact || unreadable.length
    ? 'could_not_verify'
    : changed.length ? 'changed' : 'intact';
  return { seal, manifest, verification: { verdict, changed, unreadable, manifestIntact, bytesChecked: Boolean(input.checkBytes) } };
}
