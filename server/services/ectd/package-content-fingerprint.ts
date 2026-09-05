/**
 * Content fingerprint of a submission package — what an assembled bundle was
 * built FROM, so the transmit gate can prove the zip still reflects the
 * package before it ships.
 *
 * Covered: the section set (row id, key and label — placement, the
 * empty-section placeholder and leaf titles depend on them), every artifact
 * mapping (which artifact ships where), each artifact's title and version
 * (both embedded in the leaf: index.xml `<title>` and the PDF heading), its
 * declared CTD section (its placement) and a digest of its content.
 * The assemble route computes the fingerprint from the rows it read; governed
 * transmit recomputes it from the database with `readPackageContentRows` and
 * refuses on any difference. The mapping routes clear a stale bundle when a
 * mapping changes, but nothing on the package changes when an artifact is
 * edited after assembly: only this comparison catches that.
 *
 * One derivation, one query. The SQL mirrors exactly what assemble reads (the
 * package's sections; mappings of this org joined to their artifact) so the
 * two sides cannot drift into spurious refusals — proven on a real engine in
 * __tests__/package-content-fingerprint.pglite.integration.test.ts. The
 * content digest is computed IN the database over the same UTF-8 bytes JS
 * hashes, so the transmit step never transports artifact content.
 */
import { createHash } from 'crypto';

/** Bumped whenever the covered fields or the encoding change, so a bundle
 *  fingerprinted under an older scheme reads as "cannot prove", never as a
 *  false match or a false drift. v2: title, version, section label, digest. */
export const CONTENT_FINGERPRINT_VERSION = 'v2';

export interface PackageContentRow {
  sectionDbId: number;
  sectionKey: string;
  sectionLabel: string;
  /** null: a section with no mapped artifact (ships as a placeholder leaf). */
  artifactDbId: number | null;
  title: string | null;
  version: number | null;
  ctdSection: string | null;
  /** sha256 hex of the artifact's content ('' hashes too); null when no artifact. */
  contentSha256: string | null;
}

/** sha256 hex of a string's UTF-8 bytes — the digest the database reproduces. */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Deterministic and order-independent: rows are encoded as JSON tuples (so a
 * `|` or newline inside a key cannot forge a boundary), sorted, then hashed.
 */
export function fingerprintPackageContent(rows: readonly PackageContentRow[]): string {
  const lines = rows.map((r) =>
    JSON.stringify([
      r.sectionDbId, r.sectionKey, r.sectionLabel, r.artifactDbId, r.title ?? null, r.version ?? null,
      r.ctdSection ?? null, r.contentSha256 ?? null,
    ]),
  );
  lines.sort();
  return `${CONTENT_FINGERPRINT_VERSION}:${sha256Hex(lines.join('\n'))}`;
}

/** True for a value produced by the CURRENT scheme; anything else is unproven. */
export function isCurrentContentFingerprint(v: unknown): v is string {
  return typeof v === 'string' && new RegExp(`^${CONTENT_FINGERPRINT_VERSION}:[0-9a-f]{64}$`).test(v);
}

/** One wording for the transmit refusal and the preflight finding alike. */
export const CONTENT_DRIFT_MESSAGE =
  'The package content changed since this bundle was assembled (an artifact edited, retitled, mapped or unmapped, ' +
  'or a section changed), so the zip no longer reflects it; re-assemble the package before transmitting.';
export const CONTENT_UNPROVEN_MESSAGE =
  'Bundle records no content fingerprint, so whether it still reflects the package is UNKNOWN; ' +
  're-assemble the package before transmitting.';

export type ContentAssessment =
  | { state: 'match'; current: string }
  | { state: 'drift'; current: string; assembled: string }
  /** The descriptor carries no fingerprint from the current scheme: nothing is read. */
  | { state: 'unproven' };

interface QueryClient {
  query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Compare a stored descriptor's fingerprint with the package's CURRENT
 * content. The single assessment behind the governed transmit gate and the
 * preflight finding, so the two can never disagree about a bundle.
 */
export async function assessPackageContent(
  client: QueryClient,
  packageDbId: number,
  orgId: number,
  storedFingerprint: unknown,
): Promise<ContentAssessment> {
  if (!isCurrentContentFingerprint(storedFingerprint)) return { state: 'unproven' };
  const current = fingerprintPackageContent(await readPackageContentRows(client, packageDbId, orgId));
  return current === storedFingerprint
    ? { state: 'match', current }
    : { state: 'drift', current, assembled: storedFingerprint };
}

/**
 * The package's content rows as assemble sees them: every section of the
 * package (one row with no artifact when nothing is mapped), and each mapping
 * of this org that resolves to an artifact — a mapping whose artifact is gone
 * is skipped, as assemble's inner join skips it. The content digest is taken
 * in the database (sha256 over the UTF-8 bytes, Postgres 11+); the content
 * itself is not transported.
 */
export async function readPackageContentRows(
  client: QueryClient,
  packageDbId: number,
  orgId: number,
): Promise<PackageContentRow[]> {
  const { rows } = await client.query(
    `SELECT s.id AS section_db_id, s.section_key, s.section_label,
            ma.artifact_db_id, ma.title, ma.version, ma.ctd_section, ma.content_sha256
       FROM c2c_package_sections s
       LEFT JOIN (
         SELECT m.section_db_id, a.id AS artifact_db_id, a.title, a.version, a.ctd_section,
                encode(sha256(convert_to(coalesce(a.content, ''), 'UTF8')), 'hex') AS content_sha256
           FROM c2c_artifact_section_map m
           JOIN concept2cure_artifacts a ON a.id = m.artifact_id
          WHERE m.org_id = $2
       ) ma ON ma.section_db_id = s.id
      WHERE s.package_db_id = $1
      ORDER BY s.id, ma.artifact_db_id`,
    [packageDbId, orgId],
  );
  return rows.map((r) => {
    const mapped = r.artifact_db_id != null;
    return {
      sectionDbId: Number(r.section_db_id),
      sectionKey: String(r.section_key ?? ''),
      sectionLabel: String(r.section_label ?? ''),
      artifactDbId: mapped ? Number(r.artifact_db_id) : null,
      title: mapped ? String(r.title ?? '') : null,
      version: mapped ? Number(r.version ?? 0) : null,
      ctdSection: r.ctd_section == null ? null : String(r.ctd_section),
      contentSha256: mapped ? String(r.content_sha256 ?? '') : null,
    };
  });
}
