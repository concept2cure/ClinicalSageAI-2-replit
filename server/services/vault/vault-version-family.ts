/**
 * A Vault document's versions, read as one family (VR-09, row D2).
 *
 * vault.documents is row-per-version. A version names the one it replaces in
 * `supersedes_id`, and since VR-08 the database admits that link only inside
 * the family: same program, same document code, same organization, one live
 * successor (migrations/20260930_vault_documents_version_lineage.sql). Older
 * rows were written before that rule. So every reader here applies the same
 * rule as the guard: a pointer that would not pass it is not lineage. Its row
 * stands as its own document, and the version list marks it unverified rather
 * than drawing a link the database would refuse today.
 *
 * Three readers share these fragments, so the Vault never answers "which
 * versions belong together" two ways:
 *   - the tree (project-vault GET /:id) lists current versions only, each with
 *     its version count, and counts documents, not rows;
 *   - search hides superseded versions unless asked;
 *   - the version list and the family's history (readVersionFamily).
 *
 * @module server/services/vault/vault-version-family
 */

/** `s` succeeds `p` as the database rules admit it. Both aliases are vault.documents rows. */
const VALID_LINK = (s: string, p: string) =>
  `${s}.supersedes_id = ${p}.id
     AND ${s}.program_id = ${p}.program_id
     AND ${s}.document_code IS NOT DISTINCT FROM ${p}.document_code
     AND ${s}.organization_id = ${p}.organization_id
     AND ${s}.deleted_at IS NULL AND ${p}.deleted_at IS NULL`;

/** SQL: row `alias` has a live successor in its family, so it is not the current version. */
export const supersededSql = (alias: string) =>
  // tenant-isolation-safe: a correlated fragment; VALID_LINK requires succ.organization_id = <alias>.organization_id, and every caller filters <alias> to the caller's organization.
  `EXISTS (SELECT 1 FROM vault.documents succ WHERE ${VALID_LINK('succ', alias)})`;

/**
 * SQL: a LATERAL join giving `version_count`, the number of versions from row
 * `alias` back through its valid predecessors. Bounded, so a cycle legacy data
 * might hold cannot run away.
 */
export const versionCountLateral = (alias: string) => `LEFT JOIN LATERAL (
       WITH RECURSIVE back AS (
         SELECT ${alias}.id, ${alias}.supersedes_id, ${alias}.program_id, ${alias}.document_code,
                ${alias}.organization_id, ${alias}.deleted_at, 1 AS n
         UNION ALL
         SELECT p.id, p.supersedes_id, p.program_id, p.document_code, p.organization_id, p.deleted_at, b.n + 1
           FROM back b JOIN vault.documents p ON ${VALID_LINK('b', 'p')}
          WHERE b.n < 1000
       )
       SELECT count(*)::int AS version_count FROM back
     ) vc ON TRUE`;

/**
 * SQL: a LATERAL join giving `current_version`, the version label at the end of
 * row `alias`'s valid successor chain (its own when nothing supersedes it).
 * Bounded like versionCountLateral. What the data room names a filed file's
 * successor by (VR-16).
 */
export const currentVersionLateral = (alias: string) => `LEFT JOIN LATERAL (
       WITH RECURSIVE fwd AS (
         SELECT ${alias}.id, ${alias}.version, ${alias}.program_id, ${alias}.document_code,
                ${alias}.organization_id, ${alias}.deleted_at, 0 AS n
         UNION ALL
         SELECT x.id, x.version, x.program_id, x.document_code, x.organization_id, x.deleted_at, f.n + 1
           FROM fwd f JOIN vault.documents x ON ${VALID_LINK('x', 'f')}
          WHERE f.n < 1000
       )
       SELECT version AS current_version FROM fwd ORDER BY n DESC LIMIT 1
     ) cv ON TRUE`;

/** One version as the version list shows it. */
export interface FamilyVersion {
  id: string;
  version: string | null;
  contentHash: string | null;
  fileSize: number | null;
  fileName: string | null;
  uploader: string | null;
  /** The uploader's user id: what names them when their name can no longer be read. */
  uploaderId: number | null;
  createdAt: string;
  /** No live successor in the family: the version the Vault lists. */
  current: boolean;
  /** 'verified' when it names a predecessor the rules admit; 'unverified' when it names one they refuse. */
  link: 'none' | 'verified' | 'unverified';
}

export interface FamilyQueryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

/**
 * Every version in the family of `documentId`, newest first: back through its
 * valid predecessors and forward through its valid successors. Null when the
 * document is not a live version of this program in this organization.
 */
export async function readVersionFamily(
  q: FamilyQueryable,
  p: { programId: string; organizationId: number; documentId: string },
): Promise<FamilyVersion[] | null> {
  const { rows } = await q.query(
    `WITH RECURSIVE
       named AS (
         SELECT d.* FROM vault.documents d
          WHERE d.id = $1::uuid AND d.program_id = $2::uuid AND d.deleted_at IS NULL
            AND EXISTS (SELECT 1 FROM regulatory_programs rp
                         WHERE rp.id = d.program_id AND rp.organization_id = $3 AND rp.deleted_at IS NULL)
       ),
       back AS (
         SELECT named.id, named.supersedes_id, named.program_id, named.document_code, named.organization_id,
                named.deleted_at, 0 AS n FROM named
         UNION ALL
         SELECT x.id, x.supersedes_id, x.program_id, x.document_code, x.organization_id, x.deleted_at, b.n + 1
           FROM back b JOIN vault.documents x ON ${VALID_LINK('b', 'x')}
          WHERE b.n < 1000
       ),
       fwd AS (
         SELECT named.id, named.supersedes_id, named.program_id, named.document_code, named.organization_id,
                named.deleted_at, 0 AS n FROM named
         UNION ALL
         SELECT x.id, x.supersedes_id, x.program_id, x.document_code, x.organization_id, x.deleted_at, f.n + 1
           FROM fwd f JOIN vault.documents x ON ${VALID_LINK('x', 'f')}
          WHERE f.n < 1000
       ),
       members AS (SELECT id FROM back UNION SELECT id FROM fwd)
     SELECT d.id::text AS id, d.version, d.content_hash, d.file_size, d.file_name, d.created_at, d.created_by,
            COALESCE(u.name, u.email) AS uploader,
            NOT ${supersededSql('d')} AS current,
            CASE
              WHEN d.supersedes_id IS NULL THEN 'none'
              WHEN EXISTS (SELECT 1 FROM vault.documents pred WHERE ${VALID_LINK('d', 'pred')}) THEN 'verified'
              ELSE 'unverified'
            END AS link
       FROM vault.documents d
       JOIN members m ON m.id = d.id
       LEFT JOIN LATERAL public.actor_name(d.created_by) u ON TRUE
      ORDER BY d.created_at DESC, d.version DESC`,
    [p.documentId, p.programId, p.organizationId],
  );
  if (rows.length === 0) return null;
  return rows.map((r) => ({
    id: r.id,
    version: r.version ?? null,
    contentHash: r.content_hash ? String(r.content_hash).trim() : null,
    fileSize: r.file_size == null ? null : Number(r.file_size),
    fileName: r.file_name ?? null,
    uploader: r.uploader ?? null,
    uploaderId: r.created_by == null ? null : Number(r.created_by),
    createdAt: new Date(r.created_at).toISOString(),
    current: Boolean(r.current),
    link: r.link,
  }));
}

/**
 * The versions before `documentId` in its family, newest first: its valid
 * predecessors, back to the first. What an approval of it supersedes (VR-13).
 */
export async function readPredecessorIds(
  q: FamilyQueryable,
  p: { organizationId: number; documentId: string },
): Promise<string[]> {
  const { rows } = await q.query(
    `WITH RECURSIVE back AS (
       SELECT d.id, d.supersedes_id, d.program_id, d.document_code, d.organization_id, d.deleted_at, 0 AS n
         FROM vault.documents d
        WHERE d.id = $1::uuid AND d.organization_id = $2 AND d.deleted_at IS NULL
       UNION ALL
       SELECT x.id, x.supersedes_id, x.program_id, x.document_code, x.organization_id, x.deleted_at, b.n + 1
         FROM back b JOIN vault.documents x ON ${VALID_LINK('b', 'x')}
        WHERE b.n < 1000
     )
     SELECT id::text AS id FROM back WHERE n > 0 ORDER BY n`,
    [p.documentId, p.organizationId],
  );
  return rows.map((r) => r.id);
}

