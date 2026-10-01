/**
 * audit/chain-anchor — the audit_logs chain head, recorded OUTSIDE the database.
 *
 * Security audit 2026-09-24, finding DP-04; plan item P0-8. The chain walk
 * (chain.ts walkAuditChain) proves every row derives from the row before it.
 * It cannot see the newest rows removed: what is left is still a valid chain
 * that ends earlier. Nothing outside the database recorded where each chain
 * ended, so deleting the newest rows, or rewriting the tail and re-chaining it
 * with the published recipe, could not be detected.
 *
 * The anchor. Once a day (the integrity sweep, server/jobs/auditChainIntegritySweep.ts,
 * after it has verified everything else) and on demand (writeAuditChainAnchor),
 * every organisation's chain head is written as ONE JSON object to the
 * object-locked compliance evidence bucket (terraform/modules/compliance-evidence;
 * COMPLIANCE retention in production) under a dated key in anchors/audit-chain/.
 * Per organisation: its id, the head row's id, chain_seq and sha256_chain, the
 * number of chained rows at or before the head, and the head's time; plus the
 * time of the anchor. Object lock means no one can change or delete an anchor
 * for the retention period, the application included.
 *
 * The verifier compares the database against the LATEST anchor:
 *   head_missing   the anchored head row is gone (truncation of the head)
 *   head_differs   it is there with another hash, chain position or tenant
 *   rows_missing   fewer chained rows at or before the head than anchored
 *   rows_added     more: a row back-dated into the anchored span
 * Rows after the head are the chain growing; the walk verifies those. A
 * shortfall that public.audit_log_archives accounts for (the ledger of the only
 * DELETE door, audit_logs_archive_delete(), whose batches span organisations)
 * is reported as `archived`: not tampering, and not verified either.
 *
 * The ledger is append-only, not door-only: the runtime role may INSERT into
 * it, and an owner past the triggers writes what it likes. Until the fix round
 * of 2026-10-01 (finding DP-68) one forged ledger row (cutoff 2100-01-01) turned
 * a truncated head from `broken` into `archived`, and the sweep then anchored
 * the truncation. Now a ledger row counts only if the door could have written
 * it, and no head inside the door's 24-month hot window is ever excused,
 * whatever the ledger says (archiveAllowance, splitByArchive).
 *
 * Statuses: ok, broken, not_anchored (nothing written yet), unverifiable (the
 * anchor records no head, or only archived shortfalls). An unreadable store or
 * an anchor that does not parse THROWS: an error is never "nothing to verify".
 *
 * Not covered: the task role that writes anchors could write a newer, forged
 * one. It cannot change or remove an older one (object lock), and every write
 * is a CloudTrail data event on the evidence bucket.
 *
 * 21 CFR Part 11 §11.10(c)(e); EU GMP Annex 11 §7.1, §9.
 */

import { randomBytes } from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { createS3Client, listS3Keys, readS3Object, type S3Sender } from '../storage/s3-client.js';
import {
  AUDIT_CHAIN_HEAD_ORDER_SQL,
  AuditChainPartialViewError,
  connectionIsTenantScoped,
  type PoolClient,
} from './chain.js';

export const AUDIT_ANCHOR_FORMAT = 'c2c.audit-chain-anchor/1' as const;
/** Under the anchors/ prefix the task role is granted (terraform/modules/compliance-evidence). */
export const AUDIT_ANCHOR_KEY_PREFIX = 'anchors/audit-chain/';
const ANCHORED_STORE = 'public.audit_logs' as const;

/**
 * The archive door's hot window: audit_logs_archive_delete() (v_floor, in
 * db/migrations/20260617_audit_logs_immutability.sql) refuses a cutoff later
 * than now() - 24 months and stamps archived_at = now(). chain-anchor.test.ts
 * pins this value to the door's declaration.
 */
export const AUDIT_ARCHIVE_HOT_WINDOW = '24 months';

export interface AnchoredChainHead {
  organizationId: number;
  rowId: string;
  /** null when the head is a legacy (pre-chain_seq) row. */
  chainSeq: string | null;
  sha256Chain: string;
  /** Chained rows of this organisation at or before the head when anchored. */
  rowCount: number;
  headOccurredAt: string;
}

export interface AuditChainAnchor {
  format: typeof AUDIT_ANCHOR_FORMAT;
  store: typeof ANCHORED_STORE;
  anchoredAt: string;
  heads: AnchoredChainHead[];
}

/** Where anchors live: put never overwrites in effect (object lock), latest is the newest key. */
export interface AuditAnchorStore {
  readonly location: string;
  put(key: string, body: string): Promise<void>;
  latest(): Promise<{ key: string; body: string } | null>;
}

export type AnchorBreakKind = 'head_missing' | 'head_differs' | 'rows_missing' | 'rows_added';

export interface AnchorBreak {
  organizationId: number;
  rowId: string;
  kind: AnchorBreakKind;
  anchoredRows: number;
  /** null when it cannot be counted (a legacy head that is gone). */
  currentRows: number | null;
}

export interface AnchorVerification {
  status: 'ok' | 'broken' | 'not_anchored' | 'unverifiable';
  anchorKey: string | null;
  anchoredAt: string | null;
  organizations: number;
  /** Tampering: a head missing or different, rows missing or added. */
  breaks: AnchorBreak[];
  /** Shortfalls the archive ledger accounts for since the anchor. */
  archived: AnchorBreak[];
  reason: string;
}

export class AuditAnchorMalformedError extends Error {
  readonly code = 'AUDIT_ANCHOR_MALFORMED';
  constructor(key: string, detail: string) {
    super(`audit chain anchor ${key} is malformed: ${detail}`);
  }
}

// ── The document ─────────────────────────────────────────────────────────────

/** A dated key that sorts in time order: anchors/audit-chain/YYYY/MM/DD/<iso>-<rand>.json */
export function anchorObjectKey(at: Date): string {
  const iso = at.toISOString();
  const day = iso.slice(0, 10).replace(/-/g, '/');
  return `${AUDIT_ANCHOR_KEY_PREFIX}${day}/${iso.replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}.json`;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WHOLE_NUMBER = /^\d+$/;

const isTime = (v: unknown): boolean => typeof v === 'string' && !Number.isNaN(Date.parse(v));

const HEAD_CHECKS: ReadonlyArray<readonly [string, (h: Record<string, unknown>) => boolean]> = [
  ['organizationId is not an integer', (h) => Number.isSafeInteger(h.organizationId)],
  ['rowId is not a uuid', (h) => typeof h.rowId === 'string' && UUID.test(h.rowId)],
  ['chainSeq is neither null nor a whole number', (h) => h.chainSeq === null || (typeof h.chainSeq === 'string' && WHOLE_NUMBER.test(h.chainSeq))],
  ['sha256Chain is not a lowercase sha-256 hex digest', (h) => typeof h.sha256Chain === 'string' && SHA256_HEX.test(h.sha256Chain)],
  ['rowCount is not a positive integer', (h) => Number.isSafeInteger(h.rowCount) && (h.rowCount as number) >= 1],
  ['headOccurredAt is not a time', (h) => isTime(h.headOccurredAt)],
];

function parseHead(raw: unknown, index: number, key: string): AnchoredChainHead {
  if (!raw || typeof raw !== 'object') throw new AuditAnchorMalformedError(key, `head ${index + 1} is not an object`);
  const h = raw as Record<string, unknown>;
  const failed = HEAD_CHECKS.find(([, ok]) => !ok(h));
  if (failed) throw new AuditAnchorMalformedError(key, `head ${index + 1}: ${failed[0]}`);
  return {
    organizationId: h.organizationId as number,
    rowId: h.rowId as string,
    chainSeq: h.chainSeq as string | null,
    sha256Chain: h.sha256Chain as string,
    rowCount: h.rowCount as number,
    headOccurredAt: h.headOccurredAt as string,
  };
}

/** The anchor as written, or AuditAnchorMalformedError: a defective anchor verifies nothing. */
export function parseAuditChainAnchor(body: string, key: string): AuditChainAnchor {
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(body);
  } catch {
    throw new AuditAnchorMalformedError(key, 'not JSON');
  }
  if (doc?.format !== AUDIT_ANCHOR_FORMAT) throw new AuditAnchorMalformedError(key, `format is not ${AUDIT_ANCHOR_FORMAT}`);
  if (doc.store !== ANCHORED_STORE) throw new AuditAnchorMalformedError(key, `store is not ${ANCHORED_STORE}`);
  if (!isTime(doc.anchoredAt)) throw new AuditAnchorMalformedError(key, 'anchoredAt is not a time');
  if (!Array.isArray(doc.heads)) throw new AuditAnchorMalformedError(key, 'heads is not a list');
  const heads = doc.heads.map((h, i) => parseHead(h, i, key));
  const orgs = new Set(heads.map((h) => h.organizationId));
  if (orgs.size !== heads.length) throw new AuditAnchorMalformedError(key, 'an organisation appears twice');
  return { format: AUDIT_ANCHOR_FORMAT, store: ANCHORED_STORE, anchoredAt: doc.anchoredAt as string, heads };
}

// ── Reading the database ─────────────────────────────────────────────────────

/** A tenant-scoped connection would anchor, or verify, a subset and call it the chain. */
async function refusePartialView(client: PoolClient): Promise<void> {
  if (await connectionIsTenantScoped(client)) throw new AuditChainPartialViewError();
}

/** Every organisation's chain head and its row count, in one statement (one snapshot). */
export async function readAuditChainHeads(client: PoolClient): Promise<AnchoredChainHead[]> {
  await refusePartialView(client);
  // tenant-isolation-safe: the anchor records EVERY organisation's chain head; refusePartialView refuses a tenant-scoped connection
  const { rows } = await client.query(
    `SELECT h.tenant_id AS organization_id, h.id::text AS row_id, h.chain_seq::text AS chain_seq,
            h.sha256_chain, h.occurred_at, c.row_count::text AS row_count
       FROM (SELECT DISTINCT ON (tenant_id) tenant_id, id, chain_seq, sha256_chain, occurred_at
               FROM audit_logs
              WHERE sha256_chain IS NOT NULL AND tenant_id IS NOT NULL
              ORDER BY tenant_id, ${AUDIT_CHAIN_HEAD_ORDER_SQL}) h
       JOIN (SELECT tenant_id, count(*) AS row_count
               FROM audit_logs
              WHERE sha256_chain IS NOT NULL AND tenant_id IS NOT NULL
              GROUP BY tenant_id) c ON c.tenant_id = h.tenant_id
      ORDER BY h.tenant_id`,
  );
  return rows.map((r) => ({
    organizationId: Number(r.organization_id),
    rowId: String(r.row_id),
    chainSeq: r.chain_seq == null ? null : String(r.chain_seq),
    sha256Chain: String(r.sha256_chain),
    rowCount: Number(r.row_count),
    headOccurredAt: new Date(r.occurred_at as string | Date).toISOString(),
  }));
}

/**
 * Anchor every organisation's chain head now. `at` is taken before the heads
 * are read, so an archive batch recorded in between counts as "since the
 * anchor" (the lenient side) rather than as a shortfall.
 */
export async function writeAuditChainAnchor(
  client: PoolClient,
  store: AuditAnchorStore,
  at: Date = new Date(),
): Promise<{ key: string; organizations: number }> {
  const heads = await readAuditChainHeads(client);
  const anchor: AuditChainAnchor = { format: AUDIT_ANCHOR_FORMAT, store: ANCHORED_STORE, anchoredAt: at.toISOString(), heads };
  const key = anchorObjectKey(at);
  await store.put(key, JSON.stringify(anchor));
  return { key, organizations: heads.length };
}

// ── Verifying ────────────────────────────────────────────────────────────────

function breakOf(head: AnchoredChainHead, row: Record<string, unknown> | undefined): AnchorBreak | null {
  const currentRows = row?.current_rows == null ? null : Number(row.current_rows);
  const at = { organizationId: head.organizationId, rowId: head.rowId, anchoredRows: head.rowCount, currentRows };
  if (row?.present !== true) return { ...at, kind: 'head_missing' };
  const same =
    Number(row.head_tenant) === head.organizationId &&
    ((row.head_seq as string | null) ?? null) === head.chainSeq &&
    row.head_sha === head.sha256Chain;
  if (!same) return { ...at, kind: 'head_differs' };
  if (currentRows !== null && currentRows < head.rowCount) return { ...at, kind: 'rows_missing' };
  if (currentRows !== null && currentRows > head.rowCount) return { ...at, kind: 'rows_added' };
  return null;
}

/** Each anchored head against the database: present, identical, and the rows at or before it counted. */
async function compareAnchoredHeads(client: PoolClient, heads: AnchoredChainHead[]): Promise<AnchorBreak[]> {
  // tenant-isolation-safe: compares EVERY anchored organisation's head; refusePartialView refuses a tenant-scoped connection
  const { rows } = await client.query(
    `SELECT a.ord, h.id IS NOT NULL AS present, h.tenant_id AS head_tenant,
            h.chain_seq::text AS head_seq, h.sha256_chain AS head_sha,
            (CASE
               WHEN a.chain_seq IS NOT NULL THEN
                 (SELECT count(*) FROM audit_logs r
                   WHERE r.tenant_id = a.organization_id AND r.sha256_chain IS NOT NULL
                     AND (r.chain_seq <= a.chain_seq OR r.chain_seq IS NULL))
               WHEN h.id IS NOT NULL THEN
                 (SELECT count(*) FROM audit_logs r
                   WHERE r.tenant_id = a.organization_id AND r.sha256_chain IS NOT NULL
                     AND r.chain_seq IS NULL AND (r.occurred_at, r.id) <= (h.occurred_at, h.id))
             END)::text AS current_rows
       FROM unnest($1::int[], $2::uuid[], $3::bigint[]) WITH ORDINALITY AS a(organization_id, row_id, chain_seq, ord)
       LEFT JOIN audit_logs h ON h.id = a.row_id
      ORDER BY a.ord`,
    [heads.map((h) => h.organizationId), heads.map((h) => h.rowId), heads.map((h) => h.chainSeq)],
  );
  const breaks: AnchorBreak[] = [];
  heads.forEach((head, i) => {
    const b = breakOf(head, rows[i]);
    if (b) breaks.push(b);
  });
  return breaks;
}

/** What the archive door can have removed since an anchor. */
interface ArchiveAllowance {
  /** Rows recorded by ledger rows the door could have written. */
  rows: number;
  /** A head can only have been archived if older than this: min(their latest cutoff, now - 24 months). */
  excusableBefore: number | null;
}

/**
 * Rows audit_logs_archive_delete() can have removed since the anchor, from its
 * ledger. A ledger row counts only if the door could have written it: archived
 * after the anchor and not after `now` (the verifier's clock), with a cutoff at
 * least the hot window before its archived_at, as the door enforces. Whatever
 * the ledger says, nothing inside the hot window on the verifier's clock is
 * excusable.
 */
async function archiveAllowance(client: PoolClient, anchoredAt: string, now: Date): Promise<ArchiveAllowance> {
  const present = await client.query(`SELECT to_regclass('public.audit_log_archives') IS NOT NULL AS present`);
  if (present.rows[0]?.present !== true) return { rows: 0, excusableBefore: null };
  // tenant-isolation-safe: the archive ledger is not tenant data (no organization_id; a batch spans tenants by design)
  const { rows } = await client.query(
    `SELECT count(*)::int AS batches, COALESCE(sum(row_count), 0)::text AS rows,
            LEAST(max(cutoff), $2::timestamptz - $3::interval) AS excusable_before
       FROM public.audit_log_archives
      WHERE archived_at > $1::timestamptz
        AND archived_at <= $2::timestamptz
        AND cutoff <= archived_at - $3::interval`,
    [anchoredAt, now.toISOString(), AUDIT_ARCHIVE_HOT_WINDOW],
  );
  if (Number(rows[0]?.batches ?? 0) === 0) return { rows: 0, excusableBefore: null };
  return {
    rows: Number(rows[0].rows),
    excusableBefore: new Date(rows[0].excusable_before as string | Date).getTime(),
  };
}

/**
 * Separate what the archive door can account for from tampering. Only a
 * shortfall can be archived — rows missing before an intact head, or a head
 * older than archive.excusableBefore — and only up to the rows the counted
 * ledger rows recorded. A head inside the 24-month hot window is never the
 * archive's.
 */
function splitByArchive(
  found: AnchorBreak[],
  heads: AnchoredChainHead[],
  archive: ArchiveAllowance,
): { breaks: AnchorBreak[]; archived: AnchorBreak[] } {
  const before = archive.excusableBefore;
  if (archive.rows === 0 || before === null) return { breaks: found, archived: [] };
  const headOf = new Map(heads.map((h) => [h.organizationId, h]));
  const breaks: AnchorBreak[] = [];
  const archived: AnchorBreak[] = [];
  let budget = archive.rows;
  for (const b of found) {
    const headTime = Date.parse(headOf.get(b.organizationId)?.headOccurredAt ?? '');
    const oldHead = b.kind === 'head_missing' && headTime < before;
    const shortfall = b.anchoredRows - (b.currentRows ?? 0);
    if ((b.kind === 'rows_missing' || oldHead) && shortfall <= budget) {
      budget -= shortfall;
      archived.push(b);
    } else {
      breaks.push(b);
    }
  }
  return { breaks, archived };
}

function verdictOf(breaks: AnchorBreak[], archived: AnchorBreak[], key: string): Pick<AnchorVerification, 'status' | 'reason'> {
  if (breaks.length > 0) {
    return { status: 'broken', reason: `${breaks.length} anchored chain head(s) missing or different against ${key}` };
  }
  if (archived.length > 0) {
    return {
      status: 'unverifiable',
      reason:
        `${archived.length} organisation(s) are short of the rows anchored in ${key} by what ` +
        'audit_logs_archive_delete() recorded since; an archive batch spans organisations, so they are not verified',
    };
  }
  return { status: 'ok', reason: `every anchored head is present and unchanged (${key})` };
}

/**
 * The database against the latest anchor. Throws when the store or the anchor
 * cannot be read. `now` is the verifier's clock: the hot window is measured
 * from it, never from a time the database supplies.
 */
export async function verifyAuditChainAnchor(
  client: PoolClient,
  store: AuditAnchorStore,
  now: Date = new Date(),
): Promise<AnchorVerification> {
  await refusePartialView(client);
  const latest = await store.latest();
  if (!latest) {
    return {
      status: 'not_anchored', anchorKey: null, anchoredAt: null, organizations: 0, breaks: [], archived: [],
      reason: `no anchor has been written to ${store.location}`,
    };
  }
  const anchor = parseAuditChainAnchor(latest.body, latest.key);
  const base = { anchorKey: latest.key, anchoredAt: anchor.anchoredAt, organizations: anchor.heads.length };
  if (anchor.heads.length === 0) {
    return { ...base, status: 'unverifiable', breaks: [], archived: [], reason: `the latest anchor (${latest.key}) records no chain head` };
  }
  const found = await compareAnchoredHeads(client, anchor.heads);
  const { breaks, archived } = splitByArchive(found, anchor.heads, await archiveAllowance(client, anchor.anchoredAt, now));
  return { ...base, ...verdictOf(breaks, archived, latest.key), breaks, archived };
}

// ── The store: the object-locked evidence bucket ─────────────────────────────

/** Anchors in `bucket` under anchors/audit-chain/, through the vault's S3 client (storage/s3-client.ts). */
export function createS3AuditAnchorStore(bucket: string, client: S3Sender = createS3Client()): AuditAnchorStore {
  return {
    location: `s3://${bucket}/${AUDIT_ANCHOR_KEY_PREFIX}`,
    async put(key, body) {
      // The bucket's default SSE-KMS key and object-lock retention apply. A put
      // under object lock needs an integrity checksum; the SDK computes it and
      // S3 refuses a body that does not match.
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'application/json',
        ChecksumAlgorithm: 'SHA256',
      }));
    },
    async latest() {
      const keys = (await listS3Keys(client, bucket, AUDIT_ANCHOR_KEY_PREFIX)).filter((k) => k.endsWith('.json'));
      if (keys.length === 0) return null;
      const key = keys.reduce((newest, k) => (k > newest ? k : newest));
      return { key, body: (await readS3Object(client, bucket, key)).toString('utf8') };
    },
  };
}

/** The configured anchor store, or null: AUDIT_ANCHOR_BUCKET unset means "anchor not configured". */
export function resolveAuditAnchorStore(env: NodeJS.ProcessEnv = process.env): AuditAnchorStore | null {
  const bucket = (env.AUDIT_ANCHOR_BUCKET ?? '').trim();
  return bucket ? createS3AuditAnchorStore(bucket) : null;
}
