/**
 * A failed Shadow Review run records why it failed (P-34, docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-15).
 *
 * P-34 offers a signed waiver only when the newest run failed because every AI
 * provider failed or was overloaded. Until now a failed run kept no reason:
 * runShadowReview set status 'failed' and nothing else, wrote no audit row, and
 * threw PROVIDER_UNAVAILABLE for every failure but a JSON syntax error — a
 * placement refusal, a governance refusal, a rate limit and "no provider
 * configured" all read as an outage. And the prompt was read outside the try,
 * so a prompt that could not be read left the run 'running' for ever.
 *
 * Over PGlite with the REAL shadow_review_runs migrations (20260604 + the P-34
 * columns, applied twice to prove the replay) and the REAL gateway error
 * classes; only the gateway's route() and the audit writer are stubbed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({
  db: null as any,
  route: null as null | (() => Promise<{ model: string; content: string }>),
  prompt: null as null | (() => Promise<string>),
}));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) } }));
vi.mock('../../ai-gateway', () => ({
  getGateway: () => ({ route: () => (holder.route ? holder.route() : Promise.resolve({ model: 'm', content: '{"findings":[],"summary":"s"}' })) }),
}));
vi.mock('fs', async (orig) => {
  const real = await orig<typeof import('fs')>();
  const readFile = (...a: Parameters<typeof real.promises.readFile>) =>
    holder.prompt && String(a[0]).includes('shadow-review') ? holder.prompt() : real.promises.readFile(...a);
  return { ...real, default: { ...real, promises: { ...real.promises, readFile } }, promises: { ...real.promises, readFile } };
});

import { runShadowReview, listShadowReviewRuns } from '../shadow-review-service';
import auditService from '../../auditService';
import {
  GatewayAllProvidersFailedError,
  GatewayNoProviderError,
  GatewayPolicyError,
  ModelNotApprovedError,
} from '../../ai-gateway/gateway';

let h: IndPgliteDb;
const ORG = 7;
const USER = 3;
const SEQ = 1;

function migration(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../../', rel), 'utf8');
}

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, programSpine: true });
  holder.db = h.db;
  await h.pglite.exec(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT);`);
  await h.pglite.exec(`INSERT INTO organizations (id, name) VALUES (${ORG}, 'Org') ON CONFLICT DO NOTHING; INSERT INTO users (id) VALUES (${USER});`);
  await h.pglite.exec(migration('migrations/20260604_shadow_review.sql'));
  // Every migration re-runs on every deploy (CLAUDE.md RULE 1): twice.
  await h.pglite.exec(migration('migrations/20261015_shadow_review_waiver.sql'));
  await h.pglite.exec(migration('migrations/20261015_shadow_review_waiver.sql'));
  await h.pglite.exec(`
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by)
      VALUES (1,'A','ind','biotech','fda',${ORG},${USER});
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by)
      VALUES (${SEQ},1,'fda','0000',${ORG},${USER});
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, organization_id, created_by)
      VALUES (${SEQ},'m2.5','CO','new',${ORG},${USER});
  `);
}, 120_000);

afterAll(async () => {
  await h.close();
});

beforeEach(() => {
  holder.route = null;
  holder.prompt = null;
  vi.mocked(auditService.logAction).mockClear();
});

/** The newest run's recorded state. */
async function newestRun() {
  const r = await h.pglite.query<{ id: number; status: string; failure_code: string | null }>(
    `SELECT id, status, failure_code FROM shadow_review_runs WHERE sequence_id=$1 ORDER BY id DESC LIMIT 1`,
    [SEQ],
  );
  return r.rows[0];
}

/** The AI_GENERATE_FAILED audit entries written, by run. */
function failedAuditRows() {
  return vi
    .mocked(auditService.logAction)
    .mock.calls.map(([entry]) => entry as { action: string; resourceType: string; resourceId: number; details: Record<string, unknown> })
    .filter((e) => e.action === 'AI_GENERATE_FAILED');
}

const fails = (err: unknown) => () => Promise.reject(err);
const outcome = (p: Promise<unknown>) => p.then(() => null, (e: any) => e);

describe('a failed run records a closed failure code and an audit row', () => {
  it('every provider failed: provider_unavailable, waivable, audited, PROVIDER_UNAVAILABLE to the caller', async () => {
    holder.route = fails(new GatewayAllProvidersFailedError('All models failed. Tried: claude-opus-4-7. Last error: 500 Internal Server Error.'));
    const err = await outcome(runShadowReview({ sequenceId: SEQ, organizationId: ORG, userId: USER }));
    expect(err).toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    const run = await newestRun();
    expect(run).toMatchObject({ status: 'failed', failure_code: 'provider_unavailable' });
    expect(failedAuditRows()).toEqual([
      expect.objectContaining({
        resourceType: 'shadow_review_run',
        resourceId: run.id,
        details: expect.objectContaining({ sequenceId: SEQ, failureCode: 'provider_unavailable', waivable: true }),
      }),
    ]);
  });

  it('every provider overloaded (529): provider_overloaded, waivable', async () => {
    holder.route = fails(new GatewayAllProvidersFailedError('All models failed. Tried: claude-opus-4-7. Last error: 529 Overloaded.'));
    const err = await outcome(runShadowReview({ sequenceId: SEQ, organizationId: ORG, userId: USER }));
    expect(err).toMatchObject({ code: 'OVERLOADED' });
    expect(await newestRun()).toMatchObject({ status: 'failed', failure_code: 'provider_overloaded' });
    expect(failedAuditRows()[0]?.details).toMatchObject({ failureCode: 'provider_overloaded', waivable: true });
  });

  it('a reply that was not JSON: invalid_ai_response, not waivable', async () => {
    holder.route = async () => ({ model: 'm', content: 'I could not review this sequence.' });
    const err = await outcome(runShadowReview({ sequenceId: SEQ, organizationId: ORG, userId: USER }));
    expect(err).toMatchObject({ code: 'INVALID_AI_RESPONSE' });
    expect(await newestRun()).toMatchObject({ status: 'failed', failure_code: 'invalid_ai_response' });
    expect(failedAuditRows()[0]?.details).toMatchObject({ failureCode: 'invalid_ai_response', waivable: false });
  });

  it('a reply with no findings array: invalid_ai_response, not waivable', async () => {
    holder.route = async () => ({ model: 'm', content: '{"summary":"Reviewed."}' });
    await outcome(runShadowReview({ sequenceId: SEQ, organizationId: ORG, userId: USER }));
    expect(await newestRun()).toMatchObject({ status: 'failed', failure_code: 'invalid_ai_response' });
  });

  it('a rate limit inside "all providers failed" is rate_limited, never an outage', async () => {
    holder.route = fails(new GatewayAllProvidersFailedError('All models failed. Tried: gpt-4o. Last error: 429 Too Many Requests.'));
    const err = await outcome(runShadowReview({ sequenceId: SEQ, organizationId: ORG, userId: USER }));
    expect(err).toMatchObject({ code: 'RATE_LIMITED' });
    expect(await newestRun()).toMatchObject({ failure_code: 'rate_limited' });
    expect(failedAuditRows()[0]?.details).toMatchObject({ waivable: false });
  });

  it('a safety-classifier decline on the way down is not an outage', async () => {
    holder.route = fails(new GatewayAllProvidersFailedError(
      'All models failed. Tried: claude-opus-4-7, gpt-4o. Last error: 500 Internal Server Error. Declined by the safety classifier on: claude-opus-4-7 (bio).',
    ));
    await outcome(runShadowReview({ sequenceId: SEQ, organizationId: ORG, userId: USER }));
    expect(await newestRun()).toMatchObject({ failure_code: 'policy_blocked' });
  });
});

describe('a refusal is not an outage, and the caller is told what it was', () => {
  it('no provider configured: no_provider_configured, not waivable', async () => {
    holder.route = fails(new GatewayNoProviderError('No AI provider is configured.'));
    await outcome(runShadowReview({ sequenceId: SEQ, organizationId: ORG, userId: USER }));
    expect(await newestRun()).toMatchObject({ status: 'failed', failure_code: 'no_provider_configured' });
    expect(failedAuditRows()[0]?.details).toMatchObject({ failureCode: 'no_provider_configured', waivable: false });
  });

  it('a placement refusal: placement_refused, answered PLACEMENT_REFUSED rather than "provider unavailable"', async () => {
    const refusal = Object.assign(new GatewayPolicyError('The organization placement policy excludes every lane for this request.'), {
      reasonCode: 'residency', stage: 'placement',
    });
    holder.route = fails(refusal);
    const err = await outcome(runShadowReview({ sequenceId: SEQ, organizationId: ORG, userId: USER }));
    expect(err).toMatchObject({ code: 'PLACEMENT_REFUSED' });
    expect(await newestRun()).toMatchObject({ failure_code: 'placement_refused' });
  });

  it('no approved model: model_not_qualified, answered MODEL_NOT_QUALIFIED', async () => {
    holder.route = fails(new ModelNotApprovedError('regulatory_review' as never, ['gpt-4o'], 'no-approved-model'));
    const err = await outcome(runShadowReview({ sequenceId: SEQ, organizationId: ORG, userId: USER }));
    expect(err).toMatchObject({ code: 'MODEL_NOT_QUALIFIED' });
    expect(await newestRun()).toMatchObject({ failure_code: 'model_not_qualified' });
  });

  it('any other gateway policy refusal: policy_blocked', async () => {
    holder.route = fails(new GatewayPolicyError('Blocked by content policy.'));
    await outcome(runShadowReview({ sequenceId: SEQ, organizationId: ORG, userId: USER }));
    expect(await newestRun()).toMatchObject({ failure_code: 'policy_blocked' });
    expect(failedAuditRows()[0]?.details).toMatchObject({ waivable: false });
  });

  it('a fault of ours (the prompt cannot be read) fails the run as internal; it is never left running', async () => {
    holder.prompt = () => Promise.reject(Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }));
    const err = await outcome(runShadowReview({ sequenceId: SEQ, organizationId: ORG, userId: USER }));
    expect(err).toMatchObject({ code: 'INTERNAL' });
    expect(String(err?.message)).not.toMatch(/ENOENT/);
    expect(await newestRun()).toMatchObject({ status: 'failed', failure_code: 'internal' });
  });
});

describe('the runs read returns the failure code', () => {
  it('a failed run carries failureCode; a complete run carries none', async () => {
    holder.route = async () => ({ model: 'm', content: '{"findings":[],"summary":"No issues found."}' });
    await runShadowReview({ sequenceId: SEQ, organizationId: ORG, userId: USER });
    const runs = await listShadowReviewRuns(SEQ, { organizationId: ORG });
    expect(runs[0]).toMatchObject({ status: 'complete', failureCode: null });
    expect(runs.find((r) => r.status === 'failed')).toMatchObject({ failureCode: expect.any(String) });
  });
});

/* One vocabulary (zero duplication): the codes, which are waivable and what each
   says live in shared/constants/shadow-review-failure.ts, which the browser
   loads, so it imports nothing; the server classifier re-exports the same
   objects rather than a copy. */
describe('the failure vocabulary is shared and browser-safe', () => {
  it('the server classifier re-exports the shared objects, and the shared module imports nothing', async () => {
    const shared = await import('../../../../shared/constants/shadow-review-failure');
    const server = await import('../shadow-review-failure');
    expect(server.SHADOW_REVIEW_FAILURE_CODES).toBe(shared.SHADOW_REVIEW_FAILURE_CODES);
    expect(server.SHADOW_REVIEW_FAILURE_CLAUSE).toBe(shared.SHADOW_REVIEW_FAILURE_CLAUSE);
    expect(server.isWaivableShadowReviewFailure).toBe(shared.isWaivableShadowReviewFailure);
    expect(Object.keys(shared.SHADOW_REVIEW_FAILURE_CLAUSE).sort()).toEqual([...shared.SHADOW_REVIEW_FAILURE_CODES].sort());
    expect([...shared.WAIVABLE_SHADOW_REVIEW_FAILURE_CODES]).toEqual(['provider_unavailable', 'provider_overloaded']);
    const src = fs.readFileSync(path.resolve(__dirname, '../../../../shared/constants/shadow-review-failure.ts'), 'utf8');
    expect(src, 'the shared vocabulary must load in the browser').not.toMatch(/^\s*(import|export\s+\*\s+from|export\s+\{[^}]*\}\s+from)\s/m);
  });
});
