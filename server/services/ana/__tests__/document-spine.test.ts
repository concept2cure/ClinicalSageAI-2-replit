import { describe, it, expect, vi } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import {
  commitCanonicalRevision,
  type SpineDeps,
  type CanonicalRevisionRequest,
} from '../document-spine.js';

const SENTINEL_CLIENT = { __tx: true } as any;

/** A recording SpineDeps: logs the call order and which client the tx steps saw. */
function makeDeps(overrides: Partial<SpineDeps> = {}): {
  deps: SpineDeps;
  calls: string[];
  txClients: unknown[];
} {
  const calls: string[] = [];
  const txClients: unknown[] = [];
  const deps: SpineDeps = {
    async withTransaction(_orgId, fn) {
      calls.push('withTransaction:begin');
      const r = await fn(SENTINEL_CLIENT);
      calls.push('withTransaction:commit');
      return r;
    },
    async writeVersionTx(client, _req) {
      calls.push('writeVersionTx');
      txClients.push(client);
      return { artifactId: 'artifact_1', artifactPk: 42, version: 3, created: true, contentHash: 'hash' };
    },
    async recordGovernedActionTx(client, _args) {
      calls.push('recordGovernedActionTx');
      txClients.push(client);
      return { actionId: 'act_1', auditId: 'audit_1' };
    },
    async setReviewStatusTx(client, _pk, _org) {
      calls.push('setReviewStatusTx');
      txClients.push(client);
      return 'review';
    },
    async setPlacementTx(client, _pk, _org, ctd) {
      calls.push('setPlacementTx');
      txClients.push(client);
      return ctd ?? '2.5';
    },
    async persistProvenance(_req, _artifactId) {
      calls.push('persistProvenance');
      return 2;
    },
    async recomputeReadiness(_org, _proj) {
      calls.push('recomputeReadiness');
      return 71;
    },
    emitRefresh(_event) {
      calls.push('emitRefresh');
    },
    ...overrides,
  };
  return { deps, calls, txClients };
}

const baseReq: CanonicalRevisionRequest = {
  organizationId: 1,
  projectId: 10,
  userId: 5,
  anaThreadId: 'thread-1',
  title: 'Clinical Overview',
  content: 'Section 2.5 body',
  ctdSection: '2.5',
  provenance: [{ any: 'record' }],
};

describe('commitCanonicalRevision — the atomic spine', () => {
  it('runs all seven steps in the canonical order', async () => {
    const { deps, calls } = makeDeps();
    const result = await commitCanonicalRevision(baseReq, deps);
    expect(result.steps).toEqual([
      'version', 'ai_action', 'audit', 'review', 'placement', 'provenance', 'readiness', 'ui_refresh',
    ]);
    // The governed-core writes happen inside the transaction; the derived/notify
    // steps happen after commit.
    const commitIdx = calls.indexOf('withTransaction:commit');
    expect(calls.indexOf('writeVersionTx')).toBeLessThan(commitIdx);
    expect(calls.indexOf('setPlacementTx')).toBeLessThan(commitIdx);
    expect(calls.indexOf('persistProvenance')).toBeGreaterThan(commitIdx);
    expect(calls.indexOf('recomputeReadiness')).toBeGreaterThan(commitIdx);
    expect(calls.indexOf('emitRefresh')).toBeGreaterThan(commitIdx);
  });

  it('runs the version, AI-action/audit, review and placement inside ONE transaction', async () => {
    const { deps, txClients } = makeDeps();
    await commitCanonicalRevision(baseReq, deps);
    // Every governed-core step received the same transaction client.
    expect(txClients).toHaveLength(4);
    expect(txClients.every((c) => c === SENTINEL_CLIENT)).toBe(true);
  });

  it('surfaces the connected result (ids, status, placement, readiness)', async () => {
    const { deps } = makeDeps();
    const r = await commitCanonicalRevision(baseReq, deps);
    expect(r).toMatchObject({
      artifactId: 'artifact_1', artifactPk: 42, version: 3, created: true,
      status: 'review', ctdSection: '2.5', actionId: 'act_1', auditId: 'audit_1',
      provenanceLinks: 2, readiness: 71,
    });
  });

  it('rolls back and does NOT run post-commit steps when a core step fails', async () => {
    const { deps, calls } = makeDeps({
      async recordGovernedActionTx() {
        throw new Error('audit chain broke');
      },
    });
    await expect(commitCanonicalRevision(baseReq, deps)).rejects.toThrow('audit chain broke');
    expect(calls).toContain('writeVersionTx');
    expect(calls).not.toContain('setReviewStatusTx');
    expect(calls).not.toContain('recomputeReadiness');
    expect(calls).not.toContain('emitRefresh');
    expect(calls).not.toContain('withTransaction:commit');
  });

  it('skips the review step and stays draft when trigger_review is false', async () => {
    const { deps, calls } = makeDeps();
    const r = await commitCanonicalRevision({ ...baseReq, triggerReview: false }, deps);
    expect(calls).not.toContain('setReviewStatusTx');
    expect(r.steps).not.toContain('review');
    expect(r.status).toBe('draft');
  });

  it('skips provenance when no records are supplied', async () => {
    const { deps, calls } = makeDeps();
    const r = await commitCanonicalRevision({ ...baseReq, provenance: [] }, deps);
    expect(calls).not.toContain('persistProvenance');
    expect(r.steps).not.toContain('provenance');
    expect(r.provenanceLinks).toBe(0);
  });

  it('validates required inputs before touching the transaction', async () => {
    const { deps, calls } = makeDeps();
    await expect(
      commitCanonicalRevision({ ...baseReq, content: '' }, deps),
    ).rejects.toThrow(/content/);
    expect(calls).toHaveLength(0);
  });
});

describe('commit_document_revision — tool registration + guards', () => {
  it('is registered and defined', () => {
    expect(typeof getToolHandler('commit_document_revision')).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === 'commit_document_revision')).toBe(true);
  });

  it('refuses without tenant + user context', async () => {
    const out = JSON.parse(
      await getToolHandler('commit_document_revision')!({ title: 'X', content: 'Y' }, {} as any),
    );
    expect(out.error).toMatch(/tenant \+ user context/);
  });

  it('requires title and content', async () => {
    const out = JSON.parse(
      await getToolHandler('commit_document_revision')!(
        { title: '' },
        { organizationId: 1, userId: 1 } as any,
      ),
    );
    expect(out.error).toMatch(/title and non-empty content/);
  });
});
