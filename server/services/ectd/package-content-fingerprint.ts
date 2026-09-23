/**
 * Content fingerprint of a submission package — what an assembled bundle was
 * built FROM, so the transmit gate can prove the zip still reflects the
 * package before it ships.
 *
 * Covered: the section set (row id, key and label — placement, the
 * empty-section placeholder and leaf titles depend on them), every artifact
 * mapping (which artifact ships where), each artifact's title and version
 * (both embedded in the leaf: index.xml `<title>` and the PDF heading), its
 * declared CTD section (its placement), a digest of its content, and whether
 * it is FILABLE — approved or locked AT its current version (artifactApproval
 * below). 2026-09-23 (W5/D7, round-2 skeptic): the approval used to be outside
 * the fingerprint, so an approval revoked after assembly (PUT …/status
 * approved → review or locked → draft, no content change) left the bundle
 * matching and the now-unapproved document was transmitted.
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
import { isFinalizedStatus } from './leaf-source-resolver';

/** Bumped whenever the covered fields or the encoding change, so a bundle
 *  fingerprinted under an older scheme reads as "cannot prove", never as a
 *  false match or a false drift. v2: title, version, section label, digest.
 *  v3: section sort order. v4 (2026-09-23, W5/D7, round-2 skeptic): each
 *  artifact's filability. A bundle assembled under v3 is therefore UNPROVEN,
 *  not stranded: where descriptor trust is enforced governed transmit refuses
 *  it as BUNDLE_CONTENT_UNPROVEN with CONTENT_SCHEME_OUTDATED_MESSAGE, which
 *  names the recovery — re-assemble the package (POST
 *  /api/submission-ops/packages/:packageId/assemble), which records a v4
 *  fingerprint and re-judges every artifact's approval. */
export const CONTENT_FINGERPRINT_VERSION = 'v4';

/**
 * Whether a concept2cure artifact may be filed with an agency — the ONE rule,
 * used by the assemble route (LEAF-UNAPPROVED) and by the fingerprint below,
 * so assembly and the transmit recompute cannot judge an artifact differently.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic). `status` alone does not say the content
 * was approved: PUT /projects/:projectId/artifacts/:artifactId refuses an edit
 * only when the artifact is 'locked', and rollback, the AnA vault content
 * update and the AnA draft-version store all bump `version` without touching
 * status, so an approved v1 edited to v2 still reads 'approved'. The status
 * route (PUT …/artifacts/:artifactId/status) records the version it approved
 * in `approved_version_id` and the version it locked in `published_version_id`.
 * Filable therefore means: finalized by the leaf-source resolver's own
 * definition (isFinalizedStatus, store 'concept2cure_artifacts' — approved |
 * locked) AND the current version is the one that status was granted to:
 * for 'approved', `approved_version_id`; for 'locked', `published_version_id`
 * AND `approved_version_id` — the version that was locked must also be the
 * version that was approved.
 * 2026-09-23 (W5/D7, round-2 skeptic, round 3): a locked artifact was judged by
 * `published_version_id` alone. The status route (approved → locked) and the
 * authoring-actions lock check only status === 'approved' and record
 * `published_version_id` = the CURRENT version, so approved v1 → PUT edit to v2
 * (status stays 'approved') → lock recorded "locked at v2" and the never-
 * reviewed v2 was filed. The lock now counts only when it covers the approval.
 * An approval (or lock) that recorded no version cannot be shown to cover the
 * current content, so it is not filable either (fail closed).
 *
 * Each refusal carries `remedy`: the status transitions that make the artifact
 * filable again, as the status route accepts them. 'approved → approved' is not
 * a valid transition, so an approved artifact is first returned to review;
 * a locked one is unlocked (locked → draft) and taken through review again.
 */
export interface ArtifactApprovalFacts {
  status: string | null | undefined;
  /** Numbers, or the strings a driver may return for integer columns. */
  version: number | string | null | undefined;
  approvedVersionId: number | string | null | undefined;
  publishedVersionId: number | string | null | undefined;
}
export type ArtifactApproval =
  | { filable: true }
  | {
      filable: false;
      reason: 'not-approved' | 'no-approved-version' | 'edited-after-approval';
      /** Completes "<artifact>: …" — says what is wrong in the operator's terms. */
      problem: string;
      /** What makes it filable again, as status transitions the status route accepts. */
      remedy: string;
    };

const versionOf = (v: number | string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

const REMEDY_FROM_DRAFT = 'take it through review and approval (draft → review → approved) so its version is recorded';
const REMEDY_FROM_APPROVED =
  'return it to review and approve it again (approved → review, then review → approved), which records the version approved';
const REMEDY_FROM_LOCKED =
  'unlock it and take it through review and approval again (locked → draft → review, then review → approved), ' +
  'then lock it (approved → locked), which records the version approved and locked';

export function artifactApproval(a: ArtifactApprovalFacts): ArtifactApproval {
  if (!isFinalizedStatus(a.status, 'concept2cure_artifacts')) {
    return {
      filable: false,
      reason: 'not-approved',
      problem: `its status is '${a.status ?? ''}', not approved`,
      remedy: REMEDY_FROM_DRAFT,
    };
  }
  const locked = String(a.status).toLowerCase() === 'locked';
  const remedy = locked ? REMEDY_FROM_LOCKED : REMEDY_FROM_APPROVED;
  const approved = versionOf(a.approvedVersionId);
  const lockedAt = locked ? versionOf(a.publishedVersionId) : null;
  const current = versionOf(a.version);
  /** The current version as the refusals print it. */
  const shownCurrent = current ?? '?';
  if (approved == null || (locked && lockedAt == null)) {
    const kind = approved == null ? 'approved' : 'locked';
    return {
      filable: false,
      reason: 'no-approved-version',
      problem:
        `its status is '${a.status}' but no ${kind} version is recorded, so its current content ` +
        `(v${shownCurrent}) cannot be shown to be the content that was ${kind}`,
      remedy,
    };
  }
  if (locked && (current !== lockedAt || lockedAt !== approved)) {
    return {
      filable: false,
      reason: 'edited-after-approval',
      problem:
        `it was edited after approval — the current content is v${shownCurrent}, the approved version is ` +
        `v${approved}, and it was locked at v${lockedAt} — so the locked content is not the content that was ` +
        `approved and what would ship is unreviewed`,
      remedy,
    };
  }
  if (current !== approved) {
    return {
      filable: false,
      reason: 'edited-after-approval',
      problem:
        `it was edited after approval — the current content is v${shownCurrent}, the approved version is v${approved} — ` +
        `so the approved version was edited since approval and what would ship is unreviewed`,
      remedy,
    };
  }
  return { filable: true };
}

export interface PackageContentRow {
  sectionDbId: number;
  sectionKey: string;
  sectionLabel: string;
  /** Assemble walks sections in this order, so it decides the order the leaves
   *  appear in the backbone's index.xml — part of what the zip was built from,
   *  even though it changes no leaf's own bytes. */
  sortOrder: number;
  /** null: a section with no mapped artifact (ships as a placeholder leaf). */
  artifactDbId: number | null;
  title: string | null;
  version: number | null;
  ctdSection: string | null;
  /** sha256 hex of the artifact's content ('' hashes too); null when no artifact. */
  contentSha256: string | null;
  /** artifactApproval(...).filable for the mapped artifact; null when no
   *  artifact. An approval revoked after assembly changes this and nothing
   *  else. (2026-09-23, W5/D7, round-2 skeptic.) */
  filable: boolean | null;
}

/** sha256 hex of a string's UTF-8 bytes — the digest the database reproduces. */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Deterministic and independent of the order the rows arrive in: rows are
 * encoded as JSON tuples (so a `|` or newline inside a key cannot forge a
 * boundary), sorted, then hashed. Note that this is not the same as being
 * blind to `sortOrder`, which is a covered VALUE — a reordered section list
 * produces a different fingerprint.
 */
export function fingerprintPackageContent(rows: readonly PackageContentRow[]): string {
  const lines = rows.map((r) =>
    JSON.stringify([
      r.sectionDbId, r.sectionKey, r.sectionLabel, r.sortOrder, r.artifactDbId, r.title ?? null,
      r.version ?? null, r.ctdSection ?? null, r.contentSha256 ?? null, r.filable ?? null,
    ]),
  );
  lines.sort();
  return `${CONTENT_FINGERPRINT_VERSION}:${sha256Hex(lines.join('\n'))}`;
}

/** True for a value produced by the CURRENT scheme; anything else is unproven. */
export function isCurrentContentFingerprint(v: unknown): v is string {
  return typeof v === 'string' && new RegExp(`^${CONTENT_FINGERPRINT_VERSION}:[0-9a-f]{64}$`).test(v);
}

/** True for a fingerprint of ANY scheme (`v<n>:<sha256 hex>`) — what a stored
 *  descriptor may carry and must carry through to assessPackageContent, which
 *  tells "older scheme" from "none". 2026-09-23 (W5/D7, round-2 skeptic): the
 *  transmit loader kept only current-scheme values, so after a version bump a
 *  bundle that records a fingerprint was refused as recording none. */
export function isContentFingerprintOfAnyScheme(v: unknown): v is string {
  return typeof v === 'string' && /^v\d+:[0-9a-f]{64}$/.test(v);
}

/** One wording for the transmit refusal and the preflight finding alike. */
export const CONTENT_DRIFT_MESSAGE =
  'The package content changed since this bundle was assembled (an artifact edited, retitled, mapped or unmapped, ' +
  'its approval revoked or its approved version edited, or a section changed), so the zip no longer reflects it; ' +
  're-assemble the package before transmitting.';
export const CONTENT_UNPROVEN_MESSAGE =
  'Bundle records no content fingerprint, so whether it still reflects the package is UNKNOWN; ' +
  're-assemble the package before transmitting.';
/** A version bump makes every stored descriptor unproven at once. Saying it
 *  "records no fingerprint" would be false for those — it records one this
 *  build cannot compare — and the remedy differs in nothing but the wording,
 *  which is exactly why the wording should be true. */
export const CONTENT_SCHEME_OUTDATED_MESSAGE =
  `Bundle was fingerprinted under an older scheme than ${CONTENT_FINGERPRINT_VERSION}, so whether it still ` +
  'reflects the package is UNKNOWN; re-assemble the package before transmitting.';

/** Which wording an unproven assessment deserves. */
export function unprovenMessage(reason: 'absent' | 'older-scheme'): string {
  return reason === 'older-scheme' ? CONTENT_SCHEME_OUTDATED_MESSAGE : CONTENT_UNPROVEN_MESSAGE;
}

export type ContentAssessment =
  | { state: 'match'; current: string }
  | { state: 'drift'; current: string; assembled: string }
  /** The descriptor carries no fingerprint from the current scheme: nothing is
   *  read. `reason` separates "never had one" from "had one this build cannot
   *  compare", which a version bump makes the common case. */
  | { state: 'unproven'; reason: 'absent' | 'older-scheme' };

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
  if (!isCurrentContentFingerprint(storedFingerprint)) {
    return { state: 'unproven', reason: isContentFingerprintOfAnyScheme(storedFingerprint) ? 'older-scheme' : 'absent' };
  }
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
 * itself is not transported. The approval facts (status, approved and
 * published version) are read and reduced by artifactApproval, as assemble
 * reduces them.
 */
export async function readPackageContentRows(
  client: QueryClient,
  packageDbId: number,
  orgId: number,
): Promise<PackageContentRow[]> {
  const { rows } = await client.query(
    `SELECT s.id AS section_db_id, s.section_key, s.section_label, s.sort_order,
            ma.artifact_db_id, ma.title, ma.version, ma.ctd_section, ma.content_sha256,
            ma.status, ma.approved_version_id, ma.published_version_id
       FROM c2c_package_sections s
       LEFT JOIN (
         SELECT m.section_db_id, a.id AS artifact_db_id, a.title, a.version, a.ctd_section,
                a.status, a.approved_version_id, a.published_version_id,
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
      // The column is nullable; assemble's `asc(sortOrder)` puts NULL last in
      // Postgres, and 0 is the schema default — both sides read it the same way.
      sortOrder: r.sort_order == null ? 0 : Number(r.sort_order),
      artifactDbId: mapped ? Number(r.artifact_db_id) : null,
      title: mapped ? String(r.title ?? '') : null,
      version: mapped ? Number(r.version ?? 0) : null,
      ctdSection: r.ctd_section == null ? null : String(r.ctd_section),
      contentSha256: mapped ? String(r.content_sha256 ?? '') : null,
      filable: mapped
        ? artifactApproval({
            status: r.status == null ? null : String(r.status),
            version: r.version as number | string | null,
            approvedVersionId: r.approved_version_id as number | string | null,
            publishedVersionId: r.published_version_id as number | string | null,
          }).filable
        : null,
    };
  });
}
