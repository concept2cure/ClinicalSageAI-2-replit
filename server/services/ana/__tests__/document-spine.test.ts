import { beforeEach, describe, it, expect, vi } from 'vitest';
// 2026-09-28: a confirm-class call now also needs an editor role, read from
// organization_users (AnaToolExecutor writeRoleRefusal). The database is mocked
// here, so the confirming person is modelled as a 'member'. The role gate itself
// is tested in confirmed-write-role-gate.test.ts.
const { resolveSignerOrgRole } = vi.hoisted(() => ({
  resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member'),
}));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));
beforeEach(() => resolveSignerOrgRole.mockClear());

// The tool's handler runs the real spine (defaultSpineDeps). Its database, its
// version write, its ledger row and the per-person project admission are
// doubles here, so the suite sees WHAT the handler hands each of them: which
// project, which conversation and which model. The real admission is tested
// on PostgreSQL in ana-vault-tools-project-scope.pglite.test.ts.
const io = vi.hoisted(() => ({
  upsertVersion: vi.fn(async (..._a: unknown[]) => ({ artifactId: 'artifact_1', artifactPk: 42, version: 2, created: true, contentHash: 'hash' })),
  recordGovernedAction: vi.fn(async (..._a: unknown[]) => ({ actionId: 'act_test', auditId: 'aud_test', sha256Chain: '' })),
  admit: vi.fn(),
}));
vi.mock('../../../db', () => {
  const client = { query: async () => ({ rows: [], rowCount: 0 }), release: () => undefined };
  const pool = { query: async () => ({ rows: [], rowCount: 0 }), connect: async () => client };
  return { pool, getPool: () => pool };
});
vi.mock('../artifactVersionStore', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  upsertDocumentArtifactVersionTx: io.upsertVersion,
}));
vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction: io.recordGovernedAction }));
vi.mock('../project-readiness-aggregator', () => ({ getProjectReadinessAggregate: async () => ({ score: 64, notAssessed: [] }) }));
vi.mock('../project-scope-admission', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  admitAnaProjectScope: io.admit,
}));

import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import {
  COMMIT_DOCUMENT_REVISION,
  commitCanonicalRevision,
  type SpineDeps,
  type CanonicalRevisionRequest,
} from '../document-spine.js';
import { AnaProjectScopeError } from '../project-scope-admission';
import { approvedToolHandler } from './support/approved-tool-handler';

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
      return { score: 71, notAssessed: ['consistency'] };
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
  // The person's stated reason: the spine records no other (2026-09-29).
  reasonForChange: 'Aligned 2.5 with the final CSR.',
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
      provenanceLinks: 2, readiness: { score: 71, notAssessed: ['consistency'] },
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

  /* It used to record `AnA revised "<title>" (v<n>)` as the reason whenever
     none was passed, so the ledger said a person had given a reason nobody
     gave. Any caller of the core, not only the tool, is held to the rule. */
  it.each([
    ['no reason', undefined],
    ['a blank reason', '   '],
    ['a reason under 8 characters once trimmed', '  fix  '],
  ])('refuses %s before touching the transaction, and records nothing', async (_label, reasonForChange) => {
    const { deps, calls } = makeDeps();
    await expect(
      commitCanonicalRevision({ ...baseReq, reasonForChange } as unknown as CanonicalRevisionRequest, deps),
    ).rejects.toMatchObject({ name: 'ReasonNotStatedError', field: 'reason_for_change' });
    expect(calls).toHaveLength(0);
  });

  it('records exactly the stated reason, trimmed, on the version and the ledger row', async () => {
    const seen: { version?: string; ledger?: string } = {};
    const { deps } = makeDeps({
      async writeVersionTx(_client, req) {
        seen.version = req.reasonForChange;
        return { artifactId: 'artifact_1', artifactPk: 42, version: 3, created: true, contentHash: 'hash' };
      },
      async recordGovernedActionTx(_client, args) {
        seen.ledger = args.reason;
        return { actionId: 'act_1', auditId: 'audit_1' };
      },
    });
    await commitCanonicalRevision({ ...baseReq, reasonForChange: '  Aligned 2.5 with the final CSR.  ' }, deps);
    expect(seen).toEqual({ version: 'Aligned 2.5 with the final CSR.', ledger: 'Aligned 2.5 with the final CSR.' });
  });
});

describe('commit_document_revision — tool registration + guards', () => {
  it('is registered and defined', () => {
    expect(typeof getToolHandler('commit_document_revision')).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === 'commit_document_revision')).toBe(true);
  });

  it('refuses without tenant + user context', async () => {
    const out = JSON.parse(
      await approvedToolHandler('commit_document_revision')!({ title: 'X', content: 'Y' }, { humanConfirmed: true } as any),
    );
    // 2026-09-28: the registry now refuses a confirm-class call with no identified
    // member before the handler (and its own tenant + user guard) runs.
    expect(out.error).toMatch(/needs an identified member of the organization/);
    expect(out.error).toMatch(/Nothing was changed/);
    expect(resolveSignerOrgRole).not.toHaveBeenCalled();
  });

  it('requires title and content', async () => {
    const out = JSON.parse(
      await approvedToolHandler('commit_document_revision')!(
        { title: '' },
        { organizationId: 1, userId: 1, humanConfirmed: true } as any,
      ),
    );
    expect(out.error).toMatch(/title and non-empty content/);
  });
});

/* 2026-11-10 (security review). The handler took three things from the MODEL's
   input that the server already knew: `project_id` (the input won over the
   open project, and only the organization was checked after it, so a revision
   could be saved into a project of the organization the person cannot open),
   `ana_thread_id` (the artifact is keyed on organization, project, thread and
   title, so a chosen thread added a version to another conversation's
   document) and `ai_model_used` (a name the model gave for itself, recorded on
   the sealed AI-action ledger). The model reads documents other people wrote;
   its input is not where a record's project, conversation or author come from. */
describe('commit_document_revision — the project, the conversation and the model are the server\'s', () => {
  const PROGRAM = '11111111-1111-4111-8111-111111111111';
  const SERVED = { provider: 'anthropic', model: 'claude-opus-5', requestId: 'req-7' };
  /** The turn as the server pinned it: project 10 open, in conversation thread-open, answered by SERVED. */
  const OPEN = {
    organizationId: 1, userId: 5, humanConfirmed: true,
    projectId: 10, projectRef: '10', threadId: 'thread-open', turnId: 'run-1', servingModel: SERVED,
  };
  const INPUT = { title: 'Clinical Overview', content: 'Section 2.5 body', reason_for_change: 'Aligned 2.5 with the final CSR.' };

  const commit = async (input: Record<string, unknown>, ctx: Record<string, unknown> = OPEN) =>
    JSON.parse(await getToolHandler('commit_document_revision')!({ ...INPUT, ...input }, ctx as never));
  /** What the version store was handed, and the ledger row's payload. */
  const versionWrites = () => io.upsertVersion.mock.calls.map(([, v]) => v as Record<string, unknown>);
  const ledgerPayloads = () =>
    io.recordGovernedAction.mock.calls.map(([, entry]) => (entry as { payload: Record<string, unknown> }).payload);
  const nothingWritten = () => {
    expect(versionWrites()).toEqual([]);
    expect(ledgerPayloads()).toEqual([]);
  };

  beforeEach(() => {
    io.upsertVersion.mockClear();
    io.recordGovernedAction.mockClear();
    io.admit.mockReset();
    // The person may open project 10 (program PROGRAM). Project 77 is the
    // organization's, and closed to them: admission refuses it.
    io.admit.mockImplementation(async (_q: unknown, scope: { projectId?: unknown; projectRef?: unknown }) => {
      const ref = scope.projectRef ?? scope.projectId;
      if (ref === undefined || ref === null || ref === '') return { projectId: null, programId: null, projectRef: null };
      if (String(ref) === '10' || String(ref) === PROGRAM) return { projectId: 10, programId: PROGRAM, projectRef: PROGRAM };
      throw new AnaProjectScopeError(403, 'ANA_PROJECT_ACCESS_DENIED', 'You do not have current access to this project.');
    });
  });

  it('saves in the open project and the current conversation, as the person who confirmed it', async () => {
    const out = await commit({});
    expect(out.ok).toBe(true);
    expect(versionWrites()).toEqual([
      expect.objectContaining({ organizationId: 1, projectId: 10, userId: 5, anaThreadId: 'thread-open' }),
    ]);
    // Admitted for THIS person now, not on the strength of an earlier turn.
    expect(io.admit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ organizationId: 1, userId: 5, projectId: 10, projectRef: '10' }));
  });

  it('saves a project opened as a program (the v2 shell: no integer in context) under its verified project', async () => {
    const out = await commit({}, { ...OPEN, projectId: null, projectRef: PROGRAM });
    expect(out.ok).toBe(true);
    expect(versionWrites()).toEqual([expect.objectContaining({ projectId: 10, anaThreadId: 'thread-open' })]);
  });

  it('refuses a project_id that names another project, and writes nothing', async () => {
    const out = await commit({ project_id: 77 });
    expect(out.ok).toBe(false);
    expect(out.code).toBe('REVISION_PROJECT_MISMATCH');
    expect(out.error).toMatch(/nothing was saved/i);
    // The id is the model's; it is not repeated back into the conversation.
    expect(JSON.stringify(out)).not.toContain('77');
    nothingWritten();
  });

  it('refuses a project_id when the conversation is not in a project, even one the person can open', async () => {
    const out = await commit({ project_id: 10 }, { ...OPEN, projectId: null, projectRef: null });
    expect(out.ok).toBe(false);
    expect(out.code).toBe('REVISION_PROJECT_REQUIRED');
    nothingWritten();
  });

  it('refuses when the open project is closed to the person, in the admission\'s words', async () => {
    const out = await commit({}, { ...OPEN, projectId: 77, projectRef: '77' });
    expect(out.code).toBe('ANA_PROJECT_ACCESS_DENIED');
    expect(out.error).toMatch(/do not have current access/);
    nothingWritten();
  });

  it('refuses an ana_thread_id that names another conversation, and writes nothing', async () => {
    const out = await commit({ ana_thread_id: 'thread-of-someone-else' });
    expect(out.ok).toBe(false);
    expect(out.code).toBe('REVISION_CONVERSATION_MISMATCH');
    expect(out.error).toMatch(/nothing was saved/i);
    expect(JSON.stringify(out)).not.toContain('thread-of-someone-else');
    nothingWritten();
  });

  it('refuses when the conversation is not known to the server, whatever thread the input names', async () => {
    const out = await commit({ ana_thread_id: 'thread-open' }, { ...OPEN, threadId: null });
    expect(out.ok).toBe(false);
    expect(out.code).toBe('REVISION_CONVERSATION_REQUIRED');
    nothingWritten();
  });

  it('accepts a project_id and ana_thread_id that only repeat the server\'s own (a call held before they left the schema)', async () => {
    const out = await commit({ project_id: 10, ana_thread_id: ' thread-open ' });
    expect(out.ok).toBe(true);
    expect(versionWrites()).toEqual([expect.objectContaining({ projectId: 10, anaThreadId: 'thread-open' })]);
  });

  it('records the model the server was served by, never the name the model gives for itself', async () => {
    const out = await commit({ ai_model_used: 'gpt-made-up-9' });
    expect(out.ok).toBe(true);
    const [payload] = ledgerPayloads();
    expect(JSON.stringify(payload)).not.toContain('gpt-made-up-9');
    // The agent-audit shape (agentAuditDetails): provider and model, and the
    // gateway request that joins this row to its ai.gateway_audit_log row.
    expect(payload).toMatchObject({
      servingModel: { provider: 'anthropic', model: 'claude-opus-5' },
      gatewayRequestId: 'req-7',
    });
    expect(payload).not.toHaveProperty('aiModelUsed');
  });

  it('no longer offers project_id, ana_thread_id or ai_model_used to the model', () => {
    const offered = Object.keys(COMMIT_DOCUMENT_REVISION.input_schema.properties ?? {});
    expect(offered).not.toContain('project_id');
    expect(offered).not.toContain('ana_thread_id');
    expect(offered).not.toContain('ai_model_used');
    expect(offered).toEqual(expect.arrayContaining(['title', 'content', 'reason_for_change']));
  });
});

describe('commitCanonicalRevision — the model on the ledger row', () => {
  const payloadOf = async (req: CanonicalRevisionRequest) => {
    let payload: Record<string, unknown> = {};
    const { deps } = makeDeps({
      async recordGovernedActionTx(_client, args) {
        payload = args.payload;
        return { actionId: 'act_1', auditId: 'audit_1' };
      },
    });
    await commitCanonicalRevision(req, deps);
    return payload;
  };

  it('records the served model call it was given', async () => {
    const payload = await payloadOf({ ...baseReq, servingModel: { provider: 'anthropic', model: 'claude-opus-5', requestId: 'req-7' } });
    expect(payload).toMatchObject({ servingModel: { provider: 'anthropic', model: 'claude-opus-5' }, gatewayRequestId: 'req-7' });
  });

  it('records that no model is known (null) when the caller was told of none', async () => {
    const payload = await payloadOf(baseReq);
    expect(payload).toMatchObject({ servingModel: { provider: null, model: null }, gatewayRequestId: null });
  });

  it('hands the lineage recorder the served model, or none', async () => {
    const seen: Array<CanonicalRevisionRequest['servingModel']> = [];
    const { deps } = makeDeps({
      async persistProvenance(req) {
        seen.push(req.servingModel);
        return 1;
      },
    });
    await commitCanonicalRevision({ ...baseReq, servingModel: { provider: 'anthropic', model: 'claude-opus-5' } }, deps);
    await commitCanonicalRevision(baseReq, deps);
    expect(seen).toEqual([{ provider: 'anthropic', model: 'claude-opus-5' }, undefined]);
  });
});
