/**
 * A Shadow Review covers the leaves it read, and reads their text (2026-10-25,
 * row D7; shadow-review-coverage.ts, shadow-review-input.ts).
 *
 * Before: the reviewer was sent `{ sectionCode, title, lifecycleOp }` per leaf,
 * and the dispatch gate counted every completed run a sequence ever had, so a
 * review of earlier leaves cleared a sequence whose documents had since
 * changed, while a waiver over the same sequence lapsed.
 *
 * Over PGlite with the REAL Shadow Review migrations (20260604, 20261015,
 * 20261015b, 20261025), the REAL leaf materializer and text extractor, and the
 * REAL classifier. Only the AI gateway is stubbed, and it records what it was
 * sent.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({
  db: null as any,
  sent: [] as Array<{ leaves: Array<Record<string, unknown>> }>,
  refuseText: false,
}));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../../db.js', () => ({ get db() { return holder.db; } }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));
vi.mock('../../ai-gateway', async () => {
  const { GatewayPolicyError } = await import('../../ai-gateway/gateway');
  return {
    getGateway: () => ({
      route: async (req: { messages: Array<{ role: string; content: string }> }) => {
        const payload = JSON.parse(req.messages.find((m) => m.role === 'user')!.content);
        holder.sent.push(payload);
        if (holder.refuseText && payload.leaves.some((l: { text?: string }) => l.text)) {
          throw Object.assign(new GatewayPolicyError('The organization placement policy excludes every lane for this request.'), {
            reasonCode: 'residency', stage: 'placement',
          });
        }
        return { model: 'stub', content: '{"findings":[],"summary":"No deficiencies found."}' };
      },
    }),
  };
});

import { runShadowReview } from '../shadow-review-service';
import { reviewedLeavesDigest, shadowReviewCurrency } from '../shadow-review-coverage';
import {
  evaluateShadowPresenceWithWaiver,
  staleShadowReviewBlocker,
  UNDETERMINED_SHADOW_COVERAGE_BLOCKER,
} from '../../ectd/shadow-review-waiver';

const ORG = 7;
const USER = 3;
let h: IndPgliteDb;
const q = (text: string, params: unknown[] = []) => h.pglite.query<any>(text, params);
const queryable = { query: q };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const migration = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../../../', rel), 'utf8');

let nextSubmission = 500;
async function sequence(): Promise<number> {
  const sub = nextSubmission++;
  await q(
    `INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by)
     VALUES ($1, 'Coverage', 'ind', 'biotech', 'fda', $2, $3)`,
    [sub, ORG, USER],
  );
  return Number((await q(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, organization_id, created_by)
     VALUES ($1, 'fda', '0000', $2, $3) RETURNING id`,
    [sub, ORG, USER],
  )).rows[0].id);
}

/** A leaf over an approved, pinned coauthor document holding `body`. */
async function leaf(sequenceId: number, sectionCode: string, title: string, body: string): Promise<number> {
  const doc = await q(
    `INSERT INTO coauthor_documents (organization_id, title, content, module_number, status) VALUES ($1, $2, $3, $4, 'approved') RETURNING id`,
    [ORG, title, body, sectionCode],
  );
  return Number((await q(
    `INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, document_content_sha256, organization_id, created_by)
     VALUES ($1, $2, $3, 'new', 'coauthor_documents', $4, $5, $6, $7) RETURNING id`,
    [sequenceId, sectionCode, title, Number(doc.rows[0].id), sha(body), ORG, USER],
  )).rows[0].id);
}

const storedRun = async (id: number) =>
  (await q(`SELECT status, leaf_manifest_digest, input_coverage FROM shadow_review_runs WHERE id = $1`, [id])).rows[0] as {
    status: string; leaf_manifest_digest: string | null; input_coverage: any;
  };

const CLINICAL = 'The primary endpoint was met: progression-free survival HR 0.62 (95% CI 0.48 to 0.80), n = 212. ' +
  'Questions about this overview go to dana.reyes@example.com or (301) 796-3400.';

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true });
  holder.db = h.db;
  await h.pglite.exec(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT);`);
  await h.pglite.exec(`INSERT INTO organizations (id, name) VALUES (${ORG}, 'Org') ON CONFLICT DO NOTHING; INSERT INTO users (id) VALUES (${USER});`);
  for (const f of [
    'migrations/20260604_shadow_review.sql',
    'migrations/20261015_shadow_review_waiver.sql',
    'migrations/20261015b_shadow_finding_disposition.sql',
    'migrations/20261025_shadow_review_run_coverage.sql',
  ]) await h.pglite.exec(migration(f));
}, 120_000);

afterAll(async () => {
  await h?.close?.();
});

describe('the reviewer reads the leaves\' text', () => {
  it('sends each leaf\'s text from the rendered leaf, with contact details masked, and records what it read', async () => {
    const seq = await sequence();
    await leaf(seq, 'm2.5', 'Clinical Overview', CLINICAL);
    holder.sent = [];
    const result = await runShadowReview({ sequenceId: seq, organizationId: ORG, userId: USER });

    const [sent] = holder.sent;
    expect(sent.leaves).toHaveLength(1);
    // The rendered leaf wraps lines, so the sentence is compared with its spacing folded.
    expect(String(sent.leaves[0].text).replace(/\s+/g, ' ')).toContain('HR 0.62 (95% CI 0.48 to 0.80), n = 212');
    expect(String(sent.leaves[0].text)).not.toMatch(/dana\.reyes@example\.com|796-3400/);

    const run = await storedRun(result.runId);
    expect(run.status).toBe('complete');
    expect(run.input_coverage).toMatchObject({ version: 1, textSent: true, leafDigest: 'recorded' });
    expect(run.input_coverage.leaves[0]).toMatchObject({ sectionCode: 'm2.5', status: 'read' });
    expect(result.coversCurrentLeaves).toBe(true);
  });

  it('withholds a leaf whose text still holds a patient identifier, and says why', async () => {
    const seq = await sequence();
    await leaf(seq, 'm5.3.5.1', 'CSR narrative', 'Subject 1001-003, DOB: 1958-04-12, experienced grade 3 neutropenia on day 14.');
    holder.sent = [];
    const result = await runShadowReview({ sequenceId: seq, organizationId: ORG, userId: USER });
    expect(holder.sent[0].leaves[0].text).toBeUndefined();
    expect(String(holder.sent[0].leaves[0].notRead)).toMatch(/^Withheld: .*PHI/);
    expect((await storedRun(result.runId)).input_coverage.leaves[0].status).toBe('withheld');
  });

  it('when the gateway refuses the text, reviews the titles instead and records that the text was withheld', async () => {
    const seq = await sequence();
    await leaf(seq, 'm2.5', 'Clinical Overview', CLINICAL);
    holder.sent = [];
    holder.refuseText = true;
    try {
      const result = await runShadowReview({ sequenceId: seq, organizationId: ORG, userId: USER });
      expect(holder.sent).toHaveLength(2);
      expect(holder.sent[1].leaves[0]).toEqual({ sectionCode: 'm2.5', title: 'Clinical Overview', lifecycleOp: 'new' });
      const run = await storedRun(result.runId);
      expect(run.status).toBe('complete');
      expect(run.input_coverage).toMatchObject({ textSent: false });
      expect(String(run.input_coverage.textWithheld)).toMatch(/refused the leaves' text/);
    } finally {
      holder.refuseText = false;
    }
  });
});

describe('a review covers the leaves it read', () => {
  it('counts as current while the leaves stand, and as stale once a leaf is added', async () => {
    const seq = await sequence();
    await leaf(seq, 'm2.5', 'Clinical Overview', CLINICAL);
    const { runId } = await runShadowReview({ sequenceId: seq, organizationId: ORG, userId: USER });
    expect((await storedRun(runId)).leaf_manifest_digest).toBe(await reviewedLeavesDigest(queryable, seq, ORG));
    expect(await shadowReviewCurrency(queryable, { sequenceId: seq, organizationId: ORG })).toEqual({
      current: 1, stale: 0, newestStaleRunId: null, undetermined: false,
    });

    await leaf(seq, 'm2.7.3', 'Summary of Clinical Efficacy', 'Efficacy was consistent across subgroups.');
    const after = await shadowReviewCurrency(queryable, { sequenceId: seq, organizationId: ORG });
    expect(after).toEqual({ current: 0, stale: 1, newestStaleRunId: runId, undetermined: false });

    const presence = evaluateShadowPresenceWithWaiver(after.current, { state: 'none' }, after);
    expect(presence).toEqual({ cleared: false, blockers: [staleShadowReviewBlocker(runId)] });
  });

  it('a changed content pin makes the review stale too', async () => {
    const seq = await sequence();
    const leafId = await leaf(seq, 'm2.5', 'Clinical Overview', CLINICAL);
    await runShadowReview({ sequenceId: seq, organizationId: ORG, userId: USER });
    await q(`UPDATE submission_leaves SET document_content_sha256 = $1 WHERE id = $2`, [sha('a revised overview'), leafId]);
    expect((await shadowReviewCurrency(queryable, { sequenceId: seq, organizationId: ORG })).current).toBe(0);
  });

  it('a run recorded before runs carried a digest covers nothing that can be shown', async () => {
    const seq = await sequence();
    await leaf(seq, 'm2.5', 'Clinical Overview', CLINICAL);
    const legacy = Number((await q(
      `INSERT INTO shadow_review_runs (sequence_id, region, lens, status, organization_id, created_by)
       VALUES ($1, 'fda', 'fda_filing', 'complete', $2, $3) RETURNING id`,
      [seq, ORG, USER],
    )).rows[0].id);
    expect(await shadowReviewCurrency(queryable, { sequenceId: seq, organizationId: ORG })).toEqual({
      current: 0, stale: 1, newestStaleRunId: legacy, undetermined: false,
    });
  });

  it('a sequence whose leaves cannot be read counts no review as current, and says so', async () => {
    const seq = await sequence();
    await q(
      `INSERT INTO shadow_review_runs (sequence_id, region, lens, status, organization_id, created_by, leaf_manifest_digest)
       VALUES ($1, 'fda', 'fda_filing', 'complete', $2, $3, 'abc')`,
      [seq, ORG, USER],
    );
    await q(`UPDATE ectd_sequences SET deleted_at = now() WHERE id = $1`, [seq]);
    const c = await shadowReviewCurrency(queryable, { sequenceId: seq, organizationId: ORG });
    expect(c).toMatchObject({ current: 0, undetermined: true });
    expect(evaluateShadowPresenceWithWaiver(0, { state: 'none' }, c).blockers).toEqual([UNDETERMINED_SHADOW_COVERAGE_BLOCKER]);
  });
});
