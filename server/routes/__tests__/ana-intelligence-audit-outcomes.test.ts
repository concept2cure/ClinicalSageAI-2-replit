import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  draftDocument: vi.fn(), batchDraft: vi.fn(), reviewCompliance: vi.fn(),
  analyzeGaps: vi.fn(), analyzeImage: vi.fn(), quickComplete: vi.fn(),
  executeAgenticLoop: vi.fn(), logAction: vi.fn(), recordLoopTurn: vi.fn(),
  writeTurnRecordSafely: vi.fn(), setOutputs: vi.fn(),
}));
vi.mock('../../services/ana/AnaDocumentDraftingService', () => ({ getAnaDraftingService: () => state }));
vi.mock('../../services/ana/AnaToolExecutor', () => ({ executeAgenticLoop: state.executeAgenticLoop }));
vi.mock('../../services/ana/AnaToolDefinitions', () => ({ DOCUMENT_DRAFTING_TOOLS: [] }));
vi.mock('../../services/auditService', () => ({
  default: { logAction: state.logAction }, writeChainedAuditRow: vi.fn(),
}));
vi.mock('../../services/ana/turn-record-loop.js', () => ({
  loopToolCollector: () => ({ calls: [], onToolExecution: vi.fn() }),
  recordLoopTurn: state.recordLoopTurn,
}));
vi.mock('../../services/ana/turn-record.js', () => ({
  canonicalJson: JSON.stringify,
  openTurnRecorder: () => ({ warn: vi.fn(), setModel: vi.fn(), setOutputs: state.setOutputs }),
  writeTurnRecordSafely: state.writeTurnRecordSafely,
}));

// This deliberately does not mock audit-write-outcome: its canonical conversion
// of the writer's real success/refusal/rejection is part of the API contract.
import router from '../ana-intelligence';

const CONTENT = 'Synthetic controlled draft; do not put this source text in the audit details.';
const draft = {
  content: CONTENT, model: 'approved-pinned-fixture',
  usage: { inputTokens: 13, outputTokens: 21, estimatedCostUsd: 0.01 },
  latencyMs: 17, cacheHit: false,
};
const TURN = { status: 'recorded', id: 'fixture-turn', sha256: 'a'.repeat(64) };
const failure = { error: 'DRAFT_FAILED', message: 'This section was not drafted.', sectionType: 'missing' };
const draftBody = { framework: 'ich_clinical', sectionType: 'summary', instructions: 'Fixture instructions.' };
const ordinarySurfaces = [
  { path: '/draft', method: 'draftDocument', body: draftBody },
  { path: '/review', method: 'reviewCompliance', body: { framework: 'ich_clinical', content: 'Fixture source.' } },
  { path: '/gap-analysis', method: 'analyzeGaps', body: { framework: 'ich_clinical', documentContent: 'Fixture source.', targetSections: ['summary'] } },
  { path: '/vision', method: 'analyzeImage', body: { imageData: 'fixture-base64', mediaType: 'image/png', instructions: 'Fixture instructions.' } },
  { path: '/quick', method: 'quickComplete', body: { prompt: 'Fixture prompt.' } },
  { path: '/agent', method: 'executeAgenticLoop', body: { prompt: 'Fixture prompt.' } },
] as const;

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { tenantContext: { organizationId: 7 }, user: { id: 3, organizationId: 7 } });
    next();
  });
  a.use('/api/claude', router);
  return a;
}

beforeEach(() => {
  for (const fn of Object.values(state)) fn.mockReset();
  state.logAction.mockResolvedValue({ persisted: true, chained: true, tamperProof: true });
  state.recordLoopTurn.mockResolvedValue(TURN);
  state.writeTurnRecordSafely.mockResolvedValue(TURN);
});

describe.each(ordinarySurfaces)('$path carries the actual model-provenance audit outcome', ({ path, method, body }) => {
  it.each(['recorded', 'refused', 'rejected'] as const)('%s keeps the generated output and reports the canonical outcome', async (mode) => {
    state[method].mockResolvedValue(draft);
    if (mode === 'refused') state.logAction.mockResolvedValue({ persisted: false, chained: false, tamperProof: false, error: 'private database refusal' });
    if (mode === 'rejected') state.logAction.mockRejectedValue(new Error('private database rejection'));
    const res = await request(app()).post(`/api/claude${path}`).send(body);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.content).toBe(CONTENT);
    expect(res.body.meta.auditTrail).toEqual(mode === 'recorded'
      ? { persisted: true, chained: true }
      : { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: expect.any(String) });
    expect(JSON.stringify(res.body.meta)).not.toMatch(/private database/);
    expect(state.logAction).toHaveBeenCalledTimes(1);
    expect(state.logAction).toHaveBeenCalledWith({
      action: 'ai_generation', tenantId: 7, userId: 3,
      resourceType: 'ai_drafting_surface', resourceId: path.slice(1),
      details: {
        model: draft.model, contentSha256: createHash('sha256').update(CONTENT).digest('hex'),
        inputTokens: path === '/quick' ? null : 13, outputTokens: path === '/quick' ? null : 21,
      },
    });
    expect(JSON.stringify(state.logAction.mock.calls)).not.toContain(CONTENT);
    if (path === '/agent') {
      expect(state.executeAgenticLoop).toHaveBeenCalledTimes(1);
      expect(state.recordLoopTurn).toHaveBeenCalledTimes(1);
      expect(res.body.data.turnRecord).toEqual(TURN);
    }
  });
});

it('does not send the JSON response before a delayed audit rejection, and recovers on the next request', async () => {
  state.quickComplete.mockResolvedValue(draft);
  let rejectAudit!: (error: Error) => void;
  state.logAction.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectAudit = reject; }));
  let answered = false;
  const pending = request(app()).post('/api/claude/quick').send({ prompt: 'Fixture prompt.' }).then((res) => { answered = true; return res; });
  await vi.waitFor(() => expect(state.logAction).toHaveBeenCalledTimes(1));
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(answered).toBe(false);
  rejectAudit(new Error('private delayed database rejection'));
  expect((await pending).body.meta.auditTrail.persisted).toBe(false);
  const recovered = await request(app()).post('/api/claude/quick').send({ prompt: 'Fixture prompt.' });
  expect(recovered.body.meta.auditTrail).toEqual({ persisted: true, chained: true });
});

it('distinguishes a tamper-proof-only provenance record from a retrievable chained row', async () => {
  state.draftDocument.mockResolvedValue(draft);
  state.logAction.mockResolvedValue({ persisted: true, chained: false, tamperProof: true });
  const res = await request(app()).post('/api/claude/draft').send(draftBody);
  expect(res.body.meta.auditTrail).toEqual({ persisted: true, chained: false });
});

describe('streaming provenance', () => {
  it('keeps the completion frame pending until the actual delayed audit outcome is known', async () => {
    state.draftDocument.mockImplementation(async (input: { onStream: (chunk: string) => void }) => { input.onStream(CONTENT); return draft; });
    let resolveAudit!: (result: { persisted: boolean; chained: boolean; tamperProof: boolean }) => void;
    state.logAction.mockImplementationOnce(() => new Promise((resolve) => { resolveAudit = resolve; }));
    let ended = false;
    const pending = request(app()).post('/api/claude/draft/stream').send(draftBody).then((res) => { ended = true; return res; });
    await vi.waitFor(() => expect(state.logAction).toHaveBeenCalledTimes(1));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(ended).toBe(false);
    resolveAudit({ persisted: false, chained: false, tamperProof: false });
    const frames = (await pending).text.split('\n\n').filter(Boolean).map((line) => JSON.parse(line.slice(6)));
    expect(frames.at(-1)).toMatchObject({ type: 'done', meta: { auditTrail: { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' } } });
  });

  it.each(['recorded', 'refused', 'rejected'] as const)('the done frame reports %s without turning generated content into a stream error', async (mode) => {
    state.draftDocument.mockImplementation(async (input: { onStream: (chunk: string) => void }) => { input.onStream(CONTENT); return draft; });
    if (mode === 'refused') state.logAction.mockResolvedValue({ persisted: false, chained: false, tamperProof: false });
    if (mode === 'rejected') state.logAction.mockRejectedValue(new Error('private streaming database rejection'));
    const res = await request(app()).post('/api/claude/draft/stream').send(draftBody);
    expect(res.status).toBe(200);
    const frames = res.text.split('\n\n').filter(Boolean).map((line) => JSON.parse(line.slice(6)));
    expect(frames[0]).toMatchObject({ type: 'text', content: CONTENT });
    expect(frames.at(-1)).toMatchObject({ type: 'done', model: draft.model, meta: { auditTrail: { persisted: mode === 'recorded' } } });
    expect(frames.some((frame) => frame.type === 'error')).toBe(false);
    expect(res.text).not.toContain('private streaming');
    expect(res.headers['x-audit-row-persisted']).toBeUndefined();
  });
});

describe('batch provenance', () => {
  it('awaits every drafted result, combines a loss without hiding it behind a later success, and retains per-slot failures and the turn receipt', async () => {
    const second = { ...draft, content: 'Second synthetic draft.' };
    state.batchDraft.mockResolvedValue([draft, failure, second]);
    let rejectAudit!: (error: Error) => void;
    state.logAction.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectAudit = reject; }));
    let answered = false;
    const pending = request(app()).post('/api/claude/batch').send({ requests: [draftBody, draftBody, draftBody] }).then((res) => { answered = true; return res; });
    await vi.waitFor(() => expect(state.logAction).toHaveBeenCalled());
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(answered).toBe(false);
    rejectAudit(new Error('private batch database rejection'));
    const res = await pending;
    expect(res.status).toBe(200);
    expect(state.logAction).toHaveBeenCalledTimes(2);
    expect(res.body.meta.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    expect(res.body.data.results).toEqual([{ ...draft, turnRecord: TURN }, failure, { ...second, turnRecord: TURN }]);
    expect(res.body.data.summary).toMatchObject({ total: 3, drafted: 2, failed: 1, totalInputTokens: 26 });
    expect(state.writeTurnRecordSafely).toHaveBeenCalledTimes(1);
    expect(state.setOutputs).toHaveBeenCalledWith({ drafts: [{ title: 'summary', content: CONTENT }, { title: 'summary', content: second.content }] });
    expect(JSON.stringify(res.body.meta)).not.toContain('private batch');
  });

  it('reports a successful batch only with the actual chained status of every generation', async () => {
    state.batchDraft.mockResolvedValue([draft, draft]);
    state.logAction.mockResolvedValueOnce({ persisted: true, chained: false, tamperProof: true });
    const res = await request(app()).post('/api/claude/batch').send({ requests: [draftBody, draftBody] });
    expect(res.body.meta.auditTrail).toEqual({ persisted: true, chained: false });
    expect(state.logAction).toHaveBeenCalledTimes(2);
  });

  it('does not invent an AI generation or an aggregate audit outcome when every section failed', async () => {
    state.batchDraft.mockResolvedValue([failure, failure]);
    const res = await request(app()).post('/api/claude/batch').send({ requests: [draftBody, draftBody] });
    expect(res.status).toBe(200);
    expect(res.body.data.results).toEqual([failure, failure]);
    expect(res.body.data.summary).toMatchObject({ total: 2, drafted: 0, failed: 2 });
    expect(res.body.meta?.auditTrail).toBeUndefined();
    expect(state.logAction).not.toHaveBeenCalled();
    expect(state.writeTurnRecordSafely).toHaveBeenCalledTimes(1);
  });
});

it('does not write generation provenance when drafting itself failed', async () => {
  state.draftDocument.mockRejectedValue(new Error('private drafting refusal'));
  const res = await request(app()).post('/api/claude/draft').send(draftBody);
  expect(res.status).toBe(500);
  expect(state.logAction).not.toHaveBeenCalled();
  expect(res.body.meta?.auditTrail).toBeUndefined();
});
