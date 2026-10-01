/**
 * A Vault version on the one document lifecycle (VR-13, row D5).
 *
 * A Vault version is reviewed and approved on the canonical spine, not on a
 * stage column of its own: one canonical_documents row per version, naming it
 * in source_refs.vault_documents.nativeId, advanced by the gate in
 * shared/regulatory/document-lifecycle.ts and signed by VR-12's ceremony
 * (server/routes/document-lifecycle.ts). This module holds what is particular
 * to a Vault version:
 *
 *   - its lifecycle record, found or started once per version, under an
 *     advisory lock (the unique index in
 *     migrations/20261001_canonical_documents_vault_version.sql is the
 *     database's own refusal);
 *   - what the record takes from the version: title, type and content hash,
 *     read from this organization's row, never from the request;
 *   - which records an approval supersedes: the earlier versions of the same
 *     document (the family rule of vault-version-family.ts) that are at a
 *     steady state;
 *   - the stage and sign-offs the Vault shows for each version.
 *
 * @module server/services/vault/vault-lifecycle
 */
import { readPredecessorIds, supersededSql } from './vault-version-family';

export interface LifecycleQueryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

/** The stages at which a version is the document's approved, usable one. */
export const STEADY_STAGES = ['approved', 'placed', 'packaged', 'submitted'] as const;

/** The stages at which a version's details are frozen (FD6 default: refused). */
export const FROZEN_STAGES = [...STEADY_STAGES, 'superseded'] as const;

/** A Vault version as its lifecycle record takes it. */
export interface VaultLifecycleSource {
  id: string;
  programId: string;
  title: string;
  documentType: string;
  contentHash: string;
  version: string | null;
  /** No live later version in its family. */
  current: boolean;
}

/**
 * Read one live Vault version of this organization for its lifecycle record,
 * or null. `current` is decided by the family rule, as the tree decides it.
 */
export async function readVaultLifecycleSource(
  q: LifecycleQueryable,
  organizationId: number,
  vaultId: string,
): Promise<VaultLifecycleSource | null> {
  const { rows } = await q.query(
    `SELECT d.id::text AS id, d.program_id::text AS program_id, d.document_title, d.document_type,
            d.content_hash, d.version, NOT ${supersededSql('d')} AS current
       FROM vault.documents d
      WHERE d.id = $1::uuid AND d.organization_id = $2 AND d.deleted_at IS NULL`,
    [vaultId, organizationId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    programId: r.program_id,
    title: String(r.document_title ?? '').trim() || 'Untitled document',
    documentType: String(r.document_type ?? '').trim() || 'OTHER',
    contentHash: String(r.content_hash ?? '').trim(),
    version: r.version ?? null,
    current: Boolean(r.current),
  };
}

/**
 * The lifecycle record already started for a Vault version, or null. The
 * oldest wins, should a database without the unique index hold two.
 */
export async function findVaultLifecycleRecord(
  q: LifecycleQueryable,
  organizationId: number,
  vaultId: string,
): Promise<string | null> {
  const { rows } = await q.query(
    `SELECT canonical_id FROM canonical_documents
      WHERE organization_id = $1 AND source_refs ? 'vault_documents'
        AND source_refs -> 'vault_documents' ->> 'nativeId' = $2
      ORDER BY created_at, canonical_id LIMIT 1`,
    [organizationId, vaultId],
  );
  return rows[0]?.canonical_id ?? null;
}

/**
 * Serialize starts for one version: a second start waits here, then finds the
 * first one's record. Transaction-scoped; holds only inside a transaction.
 */
export async function lockVaultLifecycleStart(
  q: LifecycleQueryable,
  organizationId: number,
  vaultId: string,
): Promise<void> {
  await q.query(`SELECT pg_advisory_xact_lock(hashtext('canonical_documents.vault_version'), hashtext($1))`, [
    `${organizationId}:${vaultId}`,
  ]);
}

/**
 * The lifecycle records an approval of `vaultId` supersedes: those of the
 * earlier versions of the same document, at a steady state, in this
 * organization. Newest first.
 */
export async function priorSteadyRecords(
  q: LifecycleQueryable,
  source: Pick<VaultLifecycleSource, 'id'>,
  organizationId: number,
): Promise<string[]> {
  const earlier = await readPredecessorIds(q, { organizationId, documentId: source.id });
  if (earlier.length === 0) return [];
  const { rows } = await q.query(
    `SELECT canonical_id, source_refs -> 'vault_documents' ->> 'nativeId' AS vault_id
       FROM canonical_documents
      WHERE organization_id = $1 AND source_refs ? 'vault_documents'
        AND source_refs -> 'vault_documents' ->> 'nativeId' = ANY($2::text[])
        AND stage = ANY($3::text[])`,
    [organizationId, earlier, [...STEADY_STAGES]],
  );
  const byVault = new Map(rows.map((r) => [r.vault_id as string, r.canonical_id as string]));
  return earlier.flatMap((id) => (byVault.has(id) ? [byVault.get(id)!] : []));
}

/** A sign-off as the Vault shows it: who, what it means, and when. */
export interface SignOffManifestation {
  /** The printed name the signature record holds (21 CFR 11.50(a)(1)). */
  printedName: string | null;
  meaning: string;
  signedAt: string;
  signatureRef: string;
  /** The signer's user id: lets the page say, before anyone signs, who may not approve. */
  signerId: number | null;
}

/** A version's lifecycle, as the Vault shows it. */
export interface VaultVersionLifecycle {
  canonicalId: string;
  stage: string;
  /** Who started the record (sent the version for review): an author for separation of duties. */
  creatorId: number | null;
  review: SignOffManifestation | null;
  approval: SignOffManifestation | null;
}

interface StoredSignOff {
  actor?: string;
  signatureRef?: string;
  signedAt?: string;
  meaning?: string;
}

const esigId = (ref: string | undefined): number | null => {
  const m = /^esig:(\d+)$/.exec(ref ?? '');
  return m ? Number(m[1]) : null;
};

/**
 * The lifecycle of each of `vaultIds` that has one, keyed by version id. A
 * version with no record is not reviewed. The printed name and meaning are
 * read from the signature record the sign-off names; the time is the one the
 * lifecycle record holds (UTC, ISO).
 */
export async function readVaultLifecycles(
  q: LifecycleQueryable,
  organizationId: number,
  vaultIds: string[],
): Promise<Map<string, VaultVersionLifecycle>> {
  const out = new Map<string, VaultVersionLifecycle>();
  if (vaultIds.length === 0) return out;
  const { rows } = await q.query(
    `SELECT DISTINCT ON (source_refs -> 'vault_documents' ->> 'nativeId')
            canonical_id, stage, review_signature, approval_signature, created_by,
            source_refs -> 'vault_documents' ->> 'nativeId' AS vault_id
       FROM canonical_documents
      WHERE organization_id = $1 AND source_refs ? 'vault_documents'
        AND source_refs -> 'vault_documents' ->> 'nativeId' = ANY($2::text[])
      ORDER BY source_refs -> 'vault_documents' ->> 'nativeId', created_at, canonical_id`,
    [organizationId, vaultIds],
  );
  const refs = rows.flatMap((r) => [esigId(r.review_signature?.signatureRef), esigId(r.approval_signature?.signatureRef)])
    .filter((x): x is number => x !== null);
  const names = new Map<number, { name: string | null; meaning: string | null }>();
  if (refs.length > 0) {
    const sig = await q.query(
      `SELECT id, signer_name, signature_meaning FROM electronic_signatures
        WHERE id = ANY($1::int[]) AND organization_id = $2`,
      [refs, organizationId],
    );
    for (const s of sig.rows) names.set(Number(s.id), { name: s.signer_name ?? null, meaning: s.signature_meaning ?? null });
  }
  const manifest = (s: StoredSignOff | null | undefined): SignOffManifestation | null => {
    if (!s?.signatureRef || !s.signedAt) return null;
    const rec = names.get(esigId(s.signatureRef) ?? -1);
    return {
      printedName: rec?.name ?? null,
      meaning: rec?.meaning ?? String(s.meaning ?? '').toUpperCase(),
      signedAt: s.signedAt,
      signatureRef: s.signatureRef,
      signerId: /^\d+$/.test(String(s.actor ?? '')) ? Number(s.actor) : null,
    };
  };
  for (const r of rows) {
    out.set(r.vault_id, {
      canonicalId: r.canonical_id,
      stage: r.stage,
      creatorId: r.created_by == null ? null : Number(r.created_by),
      review: manifest(r.review_signature),
      approval: manifest(r.approval_signature),
    });
  }
  return out;
}
