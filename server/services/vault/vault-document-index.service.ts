/**
 * Vault document index — the read model behind the public API's `documents:read`.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * `documents:read` was grantable in shared/schema/api-keys.ts, offered in the
 * admin key editor (AdminSurfaces.tsx), and advertised by the public API's own
 * /docs response — and enforced by NO route anywhere in the codebase. An
 * operator could tick it, hand the key to an integrator, and reasonably believe
 * programmatic document access was switched on; the integrator had nothing to
 * call, and no error explained why, because there was no endpoint to receive
 * the call. A permission that unlocks nothing is worse than a missing one: it
 * reads as a decision somebody made. This service is what the scope always
 * claimed to grant.
 *
 * It lives here rather than inline in the route because every other data route
 * on server/routes/public-api.ts reaches its data through a service
 * (csrSearchService, precedentEngine, the endpoint recommender). Not one of
 * them holds a pool. Keeping that true is what lets the router's contract test
 * mock the data layer in the established way.
 *
 * ── METADATA ONLY, DELIBERATELY ─────────────────────────────────────────────
 * Nothing here returns document bytes or `extracted_text`. Shipping the full
 * text of a regulated document out of something named "index" is a content
 * egress wearing a metadata endpoint's name, and it would route around the
 * byte-level gates the in-app vault read path enforces (project-vault.ts ->
 * readVerifiedVaultBytes: provider org boundary, content-hash match, %PDF-
 * magic). Whether a bearer API key may pull regulated content at all is a
 * separate policy decision about egress, and it is not made here.
 *
 * Storage addressing (s3_bucket, s3_key, s3_version_id, storage_version_id,
 * storage_provider) is withheld for the same reason: it is infrastructure, not
 * document metadata, and there is no use an external client has for a bucket
 * and key that is not an attempt to reach the bytes without passing the gates.
 *
 * ── TENANT SCOPE ────────────────────────────────────────────────────────────
 * The predicate joins through `regulatory_programs` and does NOT trust
 * `vault.documents.organization_id`. That column is nullable by design ("NULL =
 * unattributable", shared/schema/vault.ts) and its own comment records that it
 * "does NOT by itself isolate tenants" — vault.documents is ENABLE ROW LEVEL
 * SECURITY without FORCE, which the owner role bypasses. This is the same
 * predicate the in-app vault surface uses, chosen for the same reason.
 *
 * @module server/services/vault/vault-document-index.service
 */

import { pool } from '../../db/runtime';
import { documentClassification } from '../../../shared/schema/vault';

/** Enum domain read from the schema rather than restated, so a value can never
 *  pass a caller's membership check and then fail the cast in Postgres. */
export const VAULT_CLASSIFICATIONS = documentClassification.enumValues as readonly string[];

/*
 * processing_status is deliberately NOT part of this read model (2026-09-24).
 * It names ingest stages — PENDING → EXTRACTING → VECTORIZING → INDEXED — and
 * nothing in the repository advances the column off its PENDING default:
 * vault-ingest extracts and indexes INSIDE the upload request, records the
 * outcome in the catalog tier, and writes PENDING here on every write
 * (routes/mdx-vault.ts reached the same conclusion and stopped reporting it).
 * Exposed, it told every API client that every document was still waiting for
 * work that had already run — or already failed — and its filter returned no
 * rows for INDEXED. Report ingest state from where it is recorded, or not at all.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * The vault schema is absent from this environment (42P01 undefined_table /
 * 42703 undefined_column).
 *
 * A TYPED ERROR, not a `[]` and not a boolean flag on a result object. The one
 * failure mode a document index must never have is reporting an infrastructure
 * fault as "this organization has no documents", and a caller that has to
 * remember to check a flag will eventually forget. Throwing makes the honest
 * outcome the default and the dishonest one impossible to reach by omission.
 */
export class VaultStoreUnavailableError extends Error {
  readonly code: string;
  constructor(pgCode: string | undefined) {
    super('The vault document store is not available in this environment.');
    this.name = 'VaultStoreUnavailableError';
    this.code = pgCode ?? 'unknown';
  }
}

function rethrow(err: unknown): never {
  const code = (err as { code?: string })?.code;
  if (code === '42P01' || code === '42703') throw new VaultStoreUnavailableError(code);
  throw err;
}

/** The disclosable column list. Every omission documented above is deliberate;
 *  adding a column here is a disclosure decision, not a convenience. */
const DOCUMENT_COLUMNS = `d.id, d.program_id, d.document_code, d.document_title,
         d.document_type, d.version, d.file_name, d.file_size, d.mime_type,
         d.content_hash, d.classification,
         d.page_count, d.word_count, d.language,
         d.retention_policy, d.retention_until,
         d.folder_id, d.evidence_kind, d.ctd_section, d.placement_status,
         d.created_at, d.updated_at`;

/** The tenant predicate. Built once and shared by the page and its count — a
 *  total taken over a different set than the rows is how a window lies. */
const TENANT_WHERE = `d.deleted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM regulatory_programs rp
            WHERE rp.id = d.program_id
              AND rp.organization_id = $1
              AND rp.deleted_at IS NULL
         )`;

export interface VaultDocumentSummary {
  id: string;
  programId: string;
  documentCode: string;
  title: string;
  documentType: string;
  version: string | null;
  fileName: string;
  fileSize: number | null;
  mimeType: string;
  contentHash: string;
  classification: string;
  pageCount: number | null;
  wordCount: number | null;
  language: string | null;
  retention: { policy: string | null; until: string | null };
  placement: {
    folderId: string | null;
    evidenceKind: string | null;
    ctdSection: string | null;
    status: string;
  };
  createdAt: string;
  updatedAt: string;
}

function project(r: Record<string, unknown>): VaultDocumentSummary {
  return {
    id: String(r.id),
    programId: String(r.program_id),
    documentCode: String(r.document_code),
    title: String(r.document_title),
    documentType: String(r.document_type),
    version: (r.version as string) ?? null,
    fileName: String(r.file_name),
    // bigint: node-postgres hands this back as a string, not a number.
    fileSize: r.file_size == null ? null : Number(r.file_size),
    mimeType: String(r.mime_type),
    contentHash: String(r.content_hash),
    classification: String(r.classification),
    pageCount: (r.page_count as number) ?? null,
    wordCount: (r.word_count as number) ?? null,
    language: (r.language as string) ?? null,
    retention: {
      policy: (r.retention_policy as string) ?? null,
      until: r.retention_until == null ? null : String(r.retention_until),
    },
    placement: {
      folderId: (r.folder_id as string) ?? null,
      evidenceKind: (r.evidence_kind as string) ?? null,
      ctdSection: (r.ctd_section as string) ?? null,
      status: String(r.placement_status),
    },
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export interface ListVaultDocumentsQuery {
  organizationId: number;
  programId?: string;
  classification?: string;
  documentType?: string;
  ctdSection?: string;
  limit: number;
  offset: number;
}

export interface ListVaultDocumentsResult {
  documents: VaultDocumentSummary[];
  total: number;
}

export async function listVaultDocuments(
  q: ListVaultDocumentsQuery,
): Promise<ListVaultDocumentsResult> {
  const params: unknown[] = [q.organizationId];
  let where = TENANT_WHERE;

  if (q.programId !== undefined) {
    params.push(q.programId);
    where += ` AND d.program_id = $${params.length}::uuid`;
  }
  if (q.classification !== undefined) {
    params.push(q.classification);
    where += ` AND d.classification = $${params.length}::vault.document_classification`;
  }
  if (q.documentType !== undefined) {
    params.push(q.documentType);
    where += ` AND d.document_type = $${params.length}`;
  }
  if (q.ctdSection !== undefined) {
    params.push(q.ctdSection);
    where += ` AND d.ctd_section = $${params.length}`;
  }

  try {
    // `d.id` breaks ties so OFFSET paging over equal updated_at values cannot
    // repeat or skip a row between pages.
    const [rows, counted] = await Promise.all([
      // tenant-isolation-safe: `where` always begins with TENANT_WHERE (see its
      // definition above), which requires an EXISTS on regulatory_programs with
      // rp.organization_id = $1. The org predicate is in the statement; the
      // scanner cannot see it because it arrives through the interpolated
      // constant rather than as literal text here.
      pool.query(
        `SELECT ${DOCUMENT_COLUMNS}
           FROM vault.documents d
          WHERE ${where}
          ORDER BY d.updated_at DESC, d.id
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, q.limit, q.offset],
      ),
      // tenant-isolation-safe: the SAME `where`, deliberately — a total taken
      // over a different set than the rows is how a window lies. Same
      // TENANT_WHERE org predicate, same reason the scanner cannot see it.
      pool.query(
        `SELECT COUNT(*)::int AS total FROM vault.documents d WHERE ${where}`,
        params,
      ),
    ]);
    return {
      documents: rows.rows.map(project),
      total: counted.rows[0]?.total ?? 0,
    };
  } catch (err) {
    rethrow(err);
  }
}

/**
 * One document by id, scoped to the organization.
 *
 * Returns null both when no such document exists and when it belongs to another
 * tenant. The caller must not distinguish them: a separate response for the
 * second confirms the id is real somewhere else.
 */
export async function getVaultDocument(
  organizationId: number,
  id: string,
): Promise<VaultDocumentSummary | null> {
  try {
    const result = await pool.query(
      `SELECT ${DOCUMENT_COLUMNS}
         FROM vault.documents d
        WHERE ${TENANT_WHERE}
          AND d.id = $2::uuid
        LIMIT 1`,
      [organizationId, id],
    );
    return result.rows.length === 0 ? null : project(result.rows[0]);
  } catch (err) {
    rethrow(err);
  }
}
