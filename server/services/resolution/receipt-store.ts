/**
 * Bundle execution receipt store (ADR-0009, conflict C-4).
 *
 * The executor's receipt was previously "persisted" only as pretty-printed JSON
 * in the MUTABLE resolution_bundles.resolution_memo text column — overwritable,
 * unhashed, unverifiable. This module writes the receipt to the append-only
 * bundle_execution_receipts table with two integrity hashes, and verifies it
 * later by recomputing hashes and re-resolving the asserted object states.
 *
 * Master WO-03's integrity rule governs the verifier: "Do not treat a status
 * field such as `completed` as proof by itself. Receipt verification must
 * resolve the linked object, current version, expected prior/new state, and
 * hashes or durable transition evidence." Nothing in verify() reads a status
 * column as evidence — it compares durable state against the snapshot the
 * receipt asserted at execution time.
 */

import { createHash } from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import type { BundleExecutionReceipt } from '../../../shared/types/resolution';

// ── Canonical JSON + hashing ─────────────────────────────────────────────────

/**
 * Deterministic serialization: object keys sorted recursively, arrays kept in
 * order. Hashes are computed over exactly this form, so the same receipt always
 * produces the same hash regardless of property insertion order.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const body = keys
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
  return `{${body.join(',')}}`;
}

export function sha256Hex(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

// ── Object-state snapshot ────────────────────────────────────────────────────

/**
 * One entry per durable object the receipt asserts something about. Captured at
 * persist time; re-resolved at verify time.
 */
export interface ObjectStateEntry {
  kind: 'artifact' | 'supersession';
  id: string;
  /** Live values at persist time (artifact status/updated_at, supersession state). */
  observed: Record<string, unknown> | null;
}

type DbHandle = NonNullable<typeof db>;

async function rows<T>(database: DbHandle, q: ReturnType<typeof sql>): Promise<T[]> {
  const res = await database.execute(q);
  return ((res as { rows?: T[] }).rows ?? (res as unknown as T[]));
}

/**
 * Resolve the durable state of every object the receipt claims to have touched.
 * A claimed-updated artifact that does not exist, or a claimed supersession with
 * no supersession_records row, is captured as observed: null — visible at
 * persist time and permanently recorded.
 */
export async function captureObjectStateSnapshot(
  database: DbHandle,
  organizationId: number,
  receipt: BundleExecutionReceipt,
): Promise<ObjectStateEntry[]> {
  const entries: ObjectStateEntry[] = [];

  for (const artifactId of receipt.updatedArtifacts) {
    const found = await rows<{ artifact_id: string; status: string; updated_at: string }>(
      database,
      sql`SELECT artifact_id::text, status, updated_at::text
          FROM concept2cure_artifacts
          WHERE artifact_id::text = ${artifactId}
            AND organization_id = ${organizationId}`,
    );
    entries.push({
      kind: 'artifact',
      id: artifactId,
      observed: found[0] ? { status: found[0].status, updatedAt: found[0].updated_at } : null,
    });
  }

  for (const supersededId of receipt.supersededObjects) {
    const found = await rows<{ id: string; state: string }>(
      database,
      sql`SELECT id::text, state::text
          FROM supersession_records
          WHERE superseded_object_id::text = ${supersededId}
            AND organization_id = ${organizationId}
          ORDER BY created_at DESC
          LIMIT 1`,
    );
    entries.push({
      kind: 'supersession',
      id: supersededId,
      observed: found[0] ? { recordId: found[0].id, state: found[0].state } : null,
    });
  }

  return entries;
}

// ── Persist ──────────────────────────────────────────────────────────────────

export interface PersistedReceiptRef {
  receiptId: string;
  receiptHash: string;
  objectStateHash: string;
}

export async function persistBundleExecutionReceipt(input: {
  organizationId: number;
  projectId: number;
  bundleId: string;
  planId?: string | null;
  decisionId?: string | null;
  executedBy: number;
  receipt: BundleExecutionReceipt;
}): Promise<PersistedReceiptRef> {
  if (!db) throw new Error('Database unavailable — receipt cannot be persisted');

  const snapshot = await captureObjectStateSnapshot(db, input.organizationId, input.receipt);

  const receiptCanonical = canonicalJson(input.receipt);
  const snapshotCanonical = canonicalJson(snapshot);
  const receiptHash = sha256Hex(receiptCanonical);
  const objectStateHash = sha256Hex(snapshotCanonical);

  const inserted = await rows<{ id: string }>(
    db,
    sql`INSERT INTO bundle_execution_receipts
          (organization_id, project_id, bundle_id, plan_id, decision_id,
           receipt_body, object_state_snapshot, receipt_hash, object_state_hash,
           executed_by)
        VALUES (${input.organizationId}, ${input.projectId}, ${input.bundleId},
                ${input.planId ?? null}, ${input.decisionId ?? null},
                ${receiptCanonical}::jsonb, ${snapshotCanonical}::jsonb,
                ${receiptHash}, ${objectStateHash}, ${input.executedBy})
        RETURNING id::text`,
  );

  return { receiptId: inserted[0].id, receiptHash, objectStateHash };
}

// ── Verify ───────────────────────────────────────────────────────────────────

export interface ObjectVerdict {
  kind: ObjectStateEntry['kind'];
  id: string;
  /**
   * matches-snapshot: live durable state equals the persisted snapshot.
   * changed-since-execution: object exists but differs — expected over an
   *   artifact's later legitimate lifecycle; informational, not tampering.
   * missing: the object (or supersession record) no longer resolves — a red
   *   flag for regulated history.
   * was-missing-at-execution: the receipt claimed it but it did not resolve
   *   even at persist time (observed: null in the snapshot).
   */
  state: 'matches-snapshot' | 'changed-since-execution' | 'missing' | 'was-missing-at-execution';
}

export interface ReceiptVerification {
  receiptId: string;
  bundleId: string;
  /** receipt_body re-hashes to receipt_hash — the receipt has not been altered. */
  receiptIntact: boolean;
  /** object_state_snapshot re-hashes to object_state_hash. */
  snapshotIntact: boolean;
  objects: ObjectVerdict[];
  /** Overall: both hashes intact AND no object 'missing'. */
  verified: boolean;
}

export async function verifyBundleExecutionReceipt(
  receiptId: string,
  organizationId: number,
): Promise<ReceiptVerification | null> {
  if (!db) throw new Error('Database unavailable — receipt cannot be verified');

  // Tenant-scoped load: a receipt from another organization does not exist here.
  const found = await rows<{
    id: string;
    bundle_id: string;
    receipt_body: unknown;
    object_state_snapshot: unknown;
    receipt_hash: string;
    object_state_hash: string;
  }>(
    db,
    sql`SELECT id::text, bundle_id::text, receipt_body, object_state_snapshot,
               receipt_hash, object_state_hash
        FROM bundle_execution_receipts
        WHERE id = ${receiptId} AND organization_id = ${organizationId}`,
  );
  const row = found[0];
  if (!row) return null;

  const receiptIntact = sha256Hex(canonicalJson(row.receipt_body)) === row.receipt_hash;
  const snapshotIntact =
    sha256Hex(canonicalJson(row.object_state_snapshot)) === row.object_state_hash;

  const snapshot = (row.object_state_snapshot as ObjectStateEntry[]) ?? [];
  const objects: ObjectVerdict[] = [];

  for (const entry of snapshot) {
    if (entry.observed === null) {
      objects.push({ kind: entry.kind, id: entry.id, state: 'was-missing-at-execution' });
      continue;
    }
    if (entry.kind === 'artifact') {
      const live = await rows<{ status: string; updated_at: string }>(
        db,
        sql`SELECT status, updated_at::text
            FROM concept2cure_artifacts
            WHERE artifact_id::text = ${entry.id} AND organization_id = ${organizationId}`,
      );
      if (!live[0]) objects.push({ kind: entry.kind, id: entry.id, state: 'missing' });
      else if (
        live[0].status === entry.observed.status &&
        live[0].updated_at === entry.observed.updatedAt
      )
        objects.push({ kind: entry.kind, id: entry.id, state: 'matches-snapshot' });
      else objects.push({ kind: entry.kind, id: entry.id, state: 'changed-since-execution' });
    } else {
      const live = await rows<{ id: string; state: string }>(
        db,
        sql`SELECT id::text, state::text
            FROM supersession_records
            WHERE id = ${String(entry.observed.recordId)}
              AND organization_id = ${organizationId}`,
      );
      if (!live[0]) objects.push({ kind: entry.kind, id: entry.id, state: 'missing' });
      else if (live[0].state === entry.observed.state)
        objects.push({ kind: entry.kind, id: entry.id, state: 'matches-snapshot' });
      else objects.push({ kind: entry.kind, id: entry.id, state: 'changed-since-execution' });
    }
  }

  const verified =
    receiptIntact && snapshotIntact && objects.every((o) => o.state !== 'missing');

  return {
    receiptId: row.id,
    bundleId: row.bundle_id,
    receiptIntact,
    snapshotIntact,
    objects,
    verified,
  };
}
