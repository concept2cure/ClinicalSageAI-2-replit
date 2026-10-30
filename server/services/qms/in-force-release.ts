/**
 * The version of a controlled document that is in force (MR-12 Stage 2,
 * CAT2-18; 21 CFR 820.40, ISO 13485 §4.2.4).
 *
 * A register row is the document's working copy. Revising an effective SOP
 * turns that row into the next version's draft (controlled-document-service.ts
 * `reviseControlledQmsDocument`) and clears its approval stamps, so every
 * reader that asked the row "are you effective?" lost the SOP for as long as
 * the revision was open: it left training coverage and readiness, and its
 * read-and-understood acknowledgement was refused, although the approved
 * version had not stopped governing the work. An inspector reads that as a
 * document-control failure.
 *
 * The approved version was never lost: approval writes it, as the row stood
 * once approved, to the immutable qms_document_versions
 * (`persistQmsSignedVersion`), and a revision of an entry that predates
 * authored content retains the approved row it was opened from as a
 * 'legacy-registry' version (controlled-document-service.ts). Either is the
 * row exactly as approved; whether its approval signature still stands is
 * decided by the reader that uses it (current-release-approval.ts), never
 * assumed here. So the release in force is:
 *   - the row itself, while it is effective;
 *   - while it is under revision (draft or in review), its latest signed
 *     version, the one the revision was opened from;
 *   - nothing once it is retired, or when no version was ever signed.
 * The successor takes over only when its own signed approval makes the row
 * effective again; the earlier version is then superseded by that fact, with
 * no row to rewrite.
 *
 * Every reader of "in force" resolves through this module. A release that
 * does not reconcile with its row (another document, another organization, a
 * snapshot that was not effective) is not in force: unknown is not current.
 */
import type { QmsDocumentRow } from './document-approval-signature';

export interface InForceSqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** Working-copy states during which the last signed version stays in force. */
export const QMS_UNDER_REVISION_STATES: ReadonlySet<string> = new Set(['draft', 'in_review']);

export interface InForceRelease {
  /** The release in force, as approved: the row itself, or its signed snapshot. */
  release: QmsDocumentRow;
  /** True when the row is a successor in draft or review and `release` is its signed predecessor. */
  underRevision: boolean;
  /** True when the row is approved with a future effective date and `release` is its signed predecessor (CAT2-19). */
  pendingEffective?: boolean;
}

/** The UTC day, YYYY-MM-DD. */
const utcDay = (v: unknown, fallback: string) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : fallback;

/**
 * Approved, but effective from a later day (CAT2-19, 2026-10-29): the version
 * was signed with a future effective date. It is not in force until that day;
 * its signed predecessor, if any, is.
 */
export function isPendingEffective(row: QmsDocumentRow, today = new Date().toISOString().slice(0, 10)): boolean {
  return row.status === 'effective' && utcDay(row.effective_date, today) > today;
}

function openedAsRevision(row: QmsDocumentRow): boolean {
  const revision = (row.metadata as Record<string, unknown> | null | undefined)?.lastRevision;
  return revision !== null && typeof revision === 'object' && typeof (revision as Record<string, unknown>).from === 'string';
}

function asRelease(live: QmsDocumentRow, snapshot: unknown): QmsDocumentRow | null {
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const release = snapshot as QmsDocumentRow;
  return release.id === live.id && release.organization_id === live.organization_id
    && release.status === 'effective' && release.version !== live.version ? release : null;
}

/**
 * The release in force for each row, by document id. Rows with none are absent.
 * One query for every row under revision; effective rows need none.
 */
export async function readInForceReleases(
  client: InForceSqlClient,
  organizationId: number,
  rows: readonly QmsDocumentRow[],
): Promise<Map<number, InForceRelease>> {
  const result = new Map<number, InForceRelease>();
  const revising: QmsDocumentRow[] = [];
  const pending = new Set<number>();
  for (const row of rows) {
    if (row.organization_id !== organizationId || row.deleted_at) continue;
    if (isPendingEffective(row)) { revising.push(row); pending.add(row.id); }
    else if (row.status === 'effective') result.set(row.id, { release: row, underRevision: false });
    // Only a revision has a predecessor: both revise paths record metadata.lastRevision
    // (controlled-document-service.ts). A first draft has nothing in force to look up.
    else if (QMS_UNDER_REVISION_STATES.has(row.status) && openedAsRevision(row)) revising.push(row);
  }
  if (!revising.length) return result;
  const { rows: versions } = await client.query(
    `SELECT DISTINCT ON (document_id) document_id, controlled_document
       FROM qms_document_versions
      WHERE organization_id = $1 AND document_id = ANY($2::int[]) AND record_kind IN ('signed', 'legacy-registry')
        AND version IS DISTINCT FROM (SELECT d.version FROM qms_documents d WHERE d.id = document_id AND d.organization_id = $1)
      ORDER BY document_id, approved_at DESC, id DESC`,
    [organizationId, revising.map((row) => row.id)],
  );
  const latest = new Map(versions.map((v) => [Number(v.document_id), v.controlled_document]));
  for (const live of revising) {
    const release = asRelease(live, latest.get(live.id));
    if (release) result.set(live.id, pending.has(live.id)
      ? { release, underRevision: false, pendingEffective: true } : { release, underRevision: true });
  }
  return result;
}

/** The release in force for one row, or null. */
export async function resolveInForceRelease(client: InForceSqlClient, live: QmsDocumentRow): Promise<InForceRelease | null> {
  return (await readInForceReleases(client, live.organization_id, [live])).get(live.id) ?? null;
}

/** Where a signed version stands today: what the version history says of it (CAT2-18). */
export type QmsVersionStanding =
  | { state: 'in-force'; effectiveFrom: string | null }
  | { state: 'pending-effective'; effectiveFrom: string | null }
  | { state: 'superseded'; by: string; from: string | null }
  | { state: 'retired'; at: string | null }
  | { state: 'not-in-force' };

/** Dotted versions in numeric order ('1.10' after '1.9'); a part that is not a number compares as text. */
export function compareQmsVersions(a: string, b: string): number {
  const pa = a.split('.'); const pb = b.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? '0'; const y = pb[i] ?? '0';
    const diff = /^\d+$/.test(x) && /^\d+$/.test(y) ? Number(x) - Number(y) : x.localeCompare(y);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** A stored date (a pg DATE, or a snapshot's JSON string) as its UTC day, or null. */
export const dayOrNull = (v: unknown) => (v == null ? null : utcDay(v, '') || null);

/**
 * The standing of each recorded version of `live`, by version. In force is
 * the resolver's (`inForce`, from readInForceReleases), never re-derived. A
 * version is superseded by the next signed version, from that version's
 * effective date: there is no row to rewrite (the store is immutable), so this
 * is read, not recorded. Once the document is retired, its newest signed
 * version is the one retired.
 */
export function qmsVersionStandings(
  live: QmsDocumentRow,
  versions: ReadonlyArray<{ version: string; controlled_document?: unknown }>,
  inForce: InForceRelease | null,
): Map<string, QmsVersionStanding> {
  const effectiveOn = new Map<string, unknown>();
  for (const v of versions) effectiveOn.set(v.version, (v.controlled_document as QmsDocumentRow | null)?.effective_date ?? null);
  const retired = (live.metadata as { retired?: { at?: unknown; fromStatus?: unknown } } | null | undefined)?.retired;
  // The row's own version is signed once approved, listed or not; a draft retired with it never was.
  if (live.status === 'effective' || (live.status === 'retired' && retired?.fromStatus === 'effective')) {
    effectiveOn.set(live.version, live.effective_date ?? null);
  }
  const signed = [...effectiveOn.keys()].sort(compareQmsVersions);
  const ctx = { live, inForce, signed, effectiveOn, retiredAt: live.status === 'retired' ? dayOrNull(retired?.at) : undefined };
  return new Map(versions.map(({ version }) => [version, standingOf(version, ctx)]));
}

function standingOf(version: string, ctx: {
  live: QmsDocumentRow; inForce: InForceRelease | null; signed: string[]; effectiveOn: Map<string, unknown>; retiredAt: string | null | undefined;
}): QmsVersionStanding {
  const { live, inForce, signed } = ctx;
  if (ctx.retiredAt !== undefined && version === signed[signed.length - 1]) return { state: 'retired', at: ctx.retiredAt };
  if (inForce && version === inForce.release.version) return { state: 'in-force', effectiveFrom: dayOrNull(inForce.release.effective_date) };
  if (inForce?.pendingEffective && version === live.version) return { state: 'pending-effective', effectiveFrom: dayOrNull(live.effective_date) };
  const successor = signed.find((s) => compareQmsVersions(s, version) > 0);
  return successor ? { state: 'superseded', by: successor, from: dayOrNull(ctx.effectiveOn.get(successor)) } : { state: 'not-in-force' };
}

/** What the register shows of a predecessor still in force while its successor is drafted. */
export function inForceSummary(entry: InForceRelease | undefined): Record<string, unknown> | null {
  // A successor in draft or review, or one approved and effective from a later day (CAT2-19).
  if (!entry?.underRevision && !entry?.pendingEffective) return null;
  const { release } = entry;
  return {
    version: release.version,
    effectiveDate: release.effective_date ?? null,
    approvedAt: release.approved_at ?? null,
    approverId: release.approver_id ?? null,
  };
}
