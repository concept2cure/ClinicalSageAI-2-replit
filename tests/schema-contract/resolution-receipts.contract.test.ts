/**
 * ADR-0009 / C-4 / C-10 acceptance tests: the REAL bundle executor and receipt
 * store against the REAL canonical DDL.
 *
 * The db module is mocked only to redirect the handle at an in-process Postgres
 * (PGlite) carrying:
 *   - db/migrations/20260725_resolution_orchestration_tables.sql (C-10 port —
 *     without it, executeBundle throws on its FIRST query, which is exactly the
 *     deployed-production condition this fixes)
 *   - db/migrations/20260725_bundle_execution_receipts.sql (ADR-0009)
 *
 * What these prove:
 *   1. executeBundle runs end-to-end against canonical DDL (the resolution
 *      layer's storage is real for the first time).
 *   2. Every execution persists an append-only, hashed receipt row.
 *   3. Verification detects receipt tampering and missing objects, and reports
 *      snapshot/live divergence — without ever reading a status field as proof.
 *   4. Receipts are tenant-scoped: another organization cannot verify them.
 *   5. Receipt-persistence failure makes execution FAIL LOUDLY, not report
 *      local-only success.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DB_TIMEOUT_MS = 120_000;
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../server/db', () => ({
  get db() {
    return h.db;
  },
  get pool() {
    return null;
  },
}));

import { executeBundle } from '../../server/services/resolution/bundle-executor';
import {
  persistBundleExecutionReceipt,
  verifyBundleExecutionReceipt,
  canonicalJson,
  sha256Hex,
} from '../../server/services/resolution/receipt-store';
import { resolutionBundles, resolutionBundleItems } from '../../shared/schema/resolution';

let pglite: import('@electric-sql/pglite').PGlite;

async function q<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pglite.query<T>(text, params);
  return r.rows;
}

beforeAll(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');

  pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
    CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT);
    CREATE TABLE projects (id SERIAL PRIMARY KEY, organization_id INTEGER, name TEXT);
    CREATE TABLE concept2cure_artifacts (id SERIAL PRIMARY KEY, artifact_id UUID DEFAULT gen_random_uuid(), organization_id INTEGER, status TEXT, updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE concept2cure_artifact_versions (id SERIAL PRIMARY KEY, artifact_id INTEGER);
    INSERT INTO organizations (id, name) VALUES (1, 'org-one'), (2, 'org-two');
    INSERT INTO users (id, email) VALUES (1, 'runner@example.com');
    INSERT INTO projects (id, organization_id, name) VALUES (1, 1, 'p1');
  `);
  for (const f of [
    'db/migrations/20260725_resolution_orchestration_tables.sql',
    'db/migrations/20260725_bundle_execution_receipts.sql',
  ]) {
    await pglite.exec(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'));
  }
  h.db = drizzle(pglite);
}, DB_TIMEOUT_MS);

afterAll(async () => {
  await pglite?.close();
});

/** Seed a bundle with one already-completed item; returns bundle id. */
async function seedBundle(): Promise<string> {
  const database = h.db as typeof import('../../server/db').db;
  const [bundle] = await database!
    .insert(resolutionBundles)
    .values({
      organizationId: 1,
      projectId: 1,
      title: 'Receipt acceptance bundle',
      state: 'in_progress',
      createdById: 1,
    } as never)
    .returning();
  await database!
    .insert(resolutionBundleItems)
    .values({
      bundleId: (bundle as { id: string }).id,
      actionType: 'supersede',
      objectType: 'assumption',
      objectId: 'obj-legacy-1',
      objectTitle: 'Legacy effect-size assumption',
      actionDescription: 'Supersede the legacy effect-size assumption',
      status: 'completed',
    } as never)
    .returning();
  return (bundle as { id: string }).id;
}

describe('C-10 + ADR-0009: the real executor against canonical DDL', () => {
  let bundleId: string;
  let receiptId: string;

  it(
    'executeBundle completes and persists a hashed receipt row',
    async () => {
      bundleId = await seedBundle();
      const receipt = await executeBundle(1, 1, bundleId);

      expect(receipt.bundleId).toBe(bundleId);
      expect(receipt.executedSteps.length).toBe(1);
      // ADR-0009: the returned receipt carries its durable identity.
      expect(receipt.receiptId).toBeTruthy();
      expect(receipt.receiptHash).toMatch(/^[0-9a-f]{64}$/);
      receiptId = receipt.receiptId!;

      const rows = await q<{ receipt_hash: string; executed_by: number }>(
        `SELECT receipt_hash, executed_by FROM bundle_execution_receipts WHERE id = $1`,
        [receiptId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].receipt_hash).toBe(receipt.receiptHash);
      expect(rows[0].executed_by).toBe(1);
    },
    DB_TIMEOUT_MS,
  );

  it(
    'the persisted receipt verifies: hashes intact, no missing objects',
    async () => {
      const v = await verifyBundleExecutionReceipt(receiptId, 1);
      expect(v).not.toBeNull();
      expect(v!.receiptIntact).toBe(true);
      expect(v!.snapshotIntact).toBe(true);
      expect(v!.verified).toBe(true);
    },
    DB_TIMEOUT_MS,
  );

  it(
    'tenant isolation: org 2 cannot see or verify org 1 receipts',
    async () => {
      const v = await verifyBundleExecutionReceipt(receiptId, 2);
      expect(v).toBeNull();
    },
    DB_TIMEOUT_MS,
  );

  it(
    'tampering with the stored receipt body is detected by the hash',
    async () => {
      await q(
        `UPDATE bundle_execution_receipts
            SET receipt_body = jsonb_set(receipt_body, '{contradictionState}', '"resolved_all"')
          WHERE id = $1`,
        [receiptId],
      );
      const v = await verifyBundleExecutionReceipt(receiptId, 1);
      expect(v!.receiptIntact).toBe(false);
      expect(v!.verified).toBe(false);
    },
    DB_TIMEOUT_MS,
  );
});

describe('ADR-0009: object-state verification never trusts a status field', () => {
  it(
    'a receipt asserting an updated artifact detects the artifact going missing',
    async () => {
      const [{ artifact_id }] = await q<{ artifact_id: string }>(
        `INSERT INTO concept2cure_artifacts (organization_id, status)
         VALUES (1, 'approved') RETURNING artifact_id::text`,
      );

      const receipt = {
        bundleId: '00000000-0000-4000-8000-000000000001',
        executedSteps: [],
        preparedSteps: [],
        blockedSteps: [],
        supersededObjects: [],
        updatedArtifacts: [artifact_id],
        requiresReview: [],
        requiresReapproval: [],
        contradictionState: 'unchanged',
        summary: { totalItems: 0, executed: 0, prepared: 0, blocked: 0 },
        timestamp: '2026-07-25T00:00:00.000Z',
      };

      const ref = await persistBundleExecutionReceipt({
        organizationId: 1,
        projectId: 1,
        bundleId: receipt.bundleId,
        executedBy: 1,
        receipt,
      });

      // Intact while the artifact exists…
      let v = await verifyBundleExecutionReceipt(ref.receiptId, 1);
      expect(v!.verified).toBe(true);
      expect(v!.objects).toEqual([
        { kind: 'artifact', id: artifact_id, state: 'matches-snapshot' },
      ]);

      // …a later legitimate change is reported, not treated as tampering…
      await q(`UPDATE concept2cure_artifacts SET status = 'review', updated_at = NOW() WHERE artifact_id::text = $1`, [artifact_id]);
      v = await verifyBundleExecutionReceipt(ref.receiptId, 1);
      expect(v!.objects[0].state).toBe('changed-since-execution');
      expect(v!.verified).toBe(true);

      // …but a vanished artifact fails verification outright.
      await q(`DELETE FROM concept2cure_artifacts WHERE artifact_id::text = $1`, [artifact_id]);
      v = await verifyBundleExecutionReceipt(ref.receiptId, 1);
      expect(v!.objects[0].state).toBe('missing');
      expect(v!.verified).toBe(false);
    },
    DB_TIMEOUT_MS,
  );

  it(
    'canonical JSON is key-order independent, so hashes are reproducible',
    () => {
      const a = canonicalJson({ b: 1, a: { d: [2, 1], c: null } });
      const b = canonicalJson({ a: { c: null, d: [2, 1] }, b: 1 });
      expect(a).toBe(b);
      expect(sha256Hex(a)).toBe(sha256Hex(b));
      // Arrays keep order — [2,1] is NOT [1,2].
      expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
    },
  );
});

describe('ADR-0009: receipt persistence failure is loud, never silent', () => {
  it(
    'execution FAILS (throws with context) when the receipt table is unreachable',
    async () => {
      const bundleId = await seedBundle();
      await pglite.exec(`ALTER TABLE bundle_execution_receipts RENAME TO ber_gone`);
      try {
        await expect(executeBundle(1, 1, bundleId)).rejects.toThrow(
          /receipt could not be persisted/i,
        );
      } finally {
        await pglite.exec(`ALTER TABLE ber_gone RENAME TO bundle_execution_receipts`);
      }
    },
    DB_TIMEOUT_MS,
  );
});
