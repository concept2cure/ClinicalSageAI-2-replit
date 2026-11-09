/**
 * Expanded spike check 1 (§14.4): a parent's decision on a worker's report is
 * rebuilt from the decision audit alone, without conversation text. Acceptance
 * is proven in turn-plan-and-context.test.ts ("reconstructs assignment, peer
 * request, report, refusal and explicit parent assessment"); these are the
 * other two decisions, rework and rejection, on the same canonical tables
 * (support/coordination-fixture.ts).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { coordinationSha256, readRunCoordination } from '../run-events';
import { assignment, fixture, pool, seedCoordinationMember, setupCoordinationFixture, subject } from './support/coordination-fixture';

describe('run coordination decisions (spike check 1)', () => {
  beforeAll(() => setupCoordinationFixture(), 180_000);
  afterAll(async () => { await fixture?.close(); });
  beforeEach(seedCoordinationMember);

  it('reconstructs rework and rejection, each bound to its report, from the audit alone without the reasons', async () => {
    const { scope, source, host } = await subject();
    const drafter = await host.assign({ ...assignment('rework-draft'), source });
    const verifier = await host.assign({ ...assignment('reject-verify'), role: 'verify', parentStep: 's2', source });
    const shaOf = (kind: string) => coordinationSha256(JSON.stringify({ kind, semanticVerified: false }));
    const draftReport = await host.report(drafter.handle, { intentId: 'draft-report', reportSha256: shaOf('draft'), source,
      outcome: 'completed', completed: 2, total: 2, basisKind: 'deterministic_checks' });
    const verifyReport = await host.report(verifier.handle, { intentId: 'verify-report', reportSha256: shaOf('verify'), source,
      outcome: 'completed', completed: 1, total: 1, basisKind: 'deterministic_checks' });
    await host.assess({ intentId: 'send-back', worker: 'w1', reportEventId: draftReport.receipt.eventId, reportSha256: shaOf('draft'),
      decision: 'rework', reason: 'Section 2.7.3 omits the per-protocol population.' });
    await host.assess({ intentId: 'decline', worker: 'w2', reportEventId: verifyReport.receipt.eventId, reportSha256: shaOf('verify'),
      decision: 'rejected', reason: 'The check ran against a superseded source version.' });
    // A decision cannot be attached to a report it was not taken on.
    await expect(host.assess({ intentId: 'cross-wired', worker: 'w2', reportEventId: draftReport.receipt.eventId, reportSha256: shaOf('draft'),
      decision: 'rejected', reason: 'Bound to the other worker report.' })).rejects.toMatchObject({ code: 'COORDINATION_REPORT_CHANGED' });

    const replay = await readRunCoordination(pool, scope);
    expect(Object.fromEntries(replay.workers.map(worker => [worker.worker, worker.parentDisposition]))).toEqual({ w1: 'rework', w2: 'rejected' });
    const rows = (await pool.query("SELECT new_values FROM audit_logs WHERE record_id=$1 ORDER BY chain_seq", [scope.runId])).rows
      .map(row => row.new_values as { operation: string; worker?: string; reasonSha256?: string;
        snapshot?: { parentDisposition?: string }; basis?: Array<{ kind: string; ref: string; sha256?: string }> });
    expect(rows.map(row => row.operation)).toEqual(['assigned', 'assigned', 'report', 'report', 'disposition', 'disposition', 'refused']);
    // Each decision names the worker, the decision and the exact report it was taken on (event id and hash).
    const decisions = rows.filter(row => row.operation === 'disposition');
    expect(decisions.map(row => [row.worker, row.snapshot?.parentDisposition, row.basis?.find(b => b.kind === 'report')])).toEqual([
      ['w1', 'rework', { kind: 'report', ref: draftReport.receipt.eventId, sha256: shaOf('draft') }],
      ['w2', 'rejected', { kind: 'report', ref: verifyReport.receipt.eventId, sha256: shaOf('verify') }]]);
    expect(decisions.every(row => /^[a-f0-9]{64}$/.test(row.reasonSha256 ?? ''))).toBe(true);
    const audit = JSON.stringify(rows);
    expect(audit).not.toContain('per-protocol population');
    expect(audit).not.toContain('superseded source version');
  });
});
