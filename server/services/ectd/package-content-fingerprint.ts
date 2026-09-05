/**
 * Content fingerprint of a submission package — what an assembled bundle was
 * built FROM, so the transmit gate can prove the zip still reflects the
 * package before it ships.
 *
 * Covered: the section set (row id and key — placement and the empty-section
 * placeholder depend on them), every artifact mapping (which artifact ships
 * where), each artifact's declared CTD section (its placement) and its content.
 * The assemble route computes the fingerprint from the rows it read; governed
 * transmit recomputes it from the database with `readPackageContentRows` and
 * refuses on any difference. The mapping routes clear a stale bundle when a
 * mapping changes, but nothing on the package changes when an artifact's
 * content is edited after assembly: only this comparison catches that.
 *
 * One derivation, one query. The SQL mirrors exactly what assemble reads (the
 * package's sections; mappings of this org joined to their artifact) so the
 * two sides cannot drift into spurious refusals.
 */
import { createHash } from 'crypto';

/** Bumped whenever the covered fields or the encoding change, so a bundle
 *  fingerprinted under an older scheme reads as "cannot prove", never as a
 *  false match or a false drift. */
export const CONTENT_FINGERPRINT_VERSION = 'v1';

export interface PackageContentRow {
  sectionDbId: number;
  sectionKey: string;
  /** null: a section with no mapped artifact (ships as a placeholder leaf). */
  artifactDbId: number | null;
  ctdSection: string | null;
  content: string | null;
}

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * Deterministic and order-independent: rows are encoded as JSON tuples (so a
 * `|` or newline inside a key cannot forge a boundary), sorted, then hashed.
 * Content enters as its own digest so the joined text stays bounded.
 */
export function fingerprintPackageContent(rows: readonly PackageContentRow[]): string {
  const lines = rows.map((r) =>
    JSON.stringify([r.sectionDbId, r.sectionKey, r.artifactDbId, r.ctdSection ?? null, sha256(r.content ?? '')]),
  );
  lines.sort();
  return `${CONTENT_FINGERPRINT_VERSION}:${sha256(lines.join('\n'))}`;
}

/** True for a value produced by the CURRENT scheme; anything else is unproven. */
export function isCurrentContentFingerprint(v: unknown): v is string {
  return typeof v === 'string' && new RegExp(`^${CONTENT_FINGERPRINT_VERSION}:[0-9a-f]{64}$`).test(v);
}

export interface QueryClient {
  query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * The package's content rows as assemble sees them: every section of the
 * package (one row with no artifact when nothing is mapped), and each mapping
 * of this org that resolves to an artifact — a mapping whose artifact is gone
 * is skipped, as assemble's inner join skips it.
 */
export async function readPackageContentRows(
  client: QueryClient,
  packageDbId: number,
  orgId: number,
): Promise<PackageContentRow[]> {
  const { rows } = await client.query(
    `SELECT s.id AS section_db_id, s.section_key, ma.artifact_db_id, ma.ctd_section, ma.content
       FROM c2c_package_sections s
       LEFT JOIN (
         SELECT m.section_db_id, a.id AS artifact_db_id, a.ctd_section, a.content
           FROM c2c_artifact_section_map m
           JOIN concept2cure_artifacts a ON a.id = m.artifact_id
          WHERE m.org_id = $2
       ) ma ON ma.section_db_id = s.id
      WHERE s.package_db_id = $1
      ORDER BY s.id, ma.artifact_db_id`,
    [packageDbId, orgId],
  );
  return rows.map((r) => ({
    sectionDbId: Number(r.section_db_id),
    sectionKey: String(r.section_key ?? ''),
    artifactDbId: r.artifact_db_id == null ? null : Number(r.artifact_db_id),
    ctdSection: r.ctd_section == null ? null : String(r.ctd_section),
    content: r.content == null ? null : String(r.content),
  }));
}
