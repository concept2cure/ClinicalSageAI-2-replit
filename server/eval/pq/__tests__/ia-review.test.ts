import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import rawBank from '../ia-review-cases.json';
import { captureIaReview, validateIaReviewBank, IA_REVIEW_DIMENSIONS, type IaReviewBank } from '../ia-review.js';
import { preflightIaReview, runIaReview } from '../run-pq.js';
import { APPROVED_MODELS } from '../../../services/ai-governance/approved-models.js';
import { ANA_INTELLIGENT_AWARENESS } from '../../../services/ana-ri/personality-core.js';

const bank = rawBank as IaReviewBank;
const entry = APPROVED_MODELS.find(m => m.id === 'claude-opus-4')!;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const single = (id = 'US-device-predicate'): IaReviewBank => ({ ...bank, cases: [bank.cases.find(c => c.id === id)!] });
const provider = (content: string, resolvedModel: string | undefined = entry.pinnedVersion, servedProvider = entry.provider) =>
  ({ content, resolvedModel, provider: servedProvider, cached: false, deterministic: false, finishReason: 'stop' }) as never;
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('source-grounded reviewer-draft IA bank integrity', () => {
  it('is valid preparation with no captured candidates, approvals or full-text-corpus claims', () => {
    expect(validateIaReviewBank(bank)).toEqual([]);
    expect(bank.status).toBe('reviewer-draft');
    expect(bank.approvedBy).toBeNull();
    expect(bank.approvedOn).toBeNull();
    expect(bank.sources.every(s => s.fullTextCorpusVerified === false)).toBe(true);
  });

  it('covers all 25 domain-market combinations without counting controls toward that coverage', () => {
    for (const market of ['EU', 'US', 'JP', 'CA', 'CN']) {
      for (const domain of ['device', 'ivd', 'biotech', 'pharma', 'cro']) {
        expect(bank.cases.filter(c => c.market === market && c.domain === domain), `${market}/${domain}`).toHaveLength(1);
      }
    }
    expect(bank.cases.filter(c => c.domain === 'control')).toHaveLength(9);
    expect(bank.cases.reduce((n, c) => n + 1 + (c.followUpUserMessages?.length ?? 0), 0)).toBe(39);
  });

  it('refuses caller-made approval, empty banks and duplicate case identities', () => {
    expect(validateIaReviewBank({ ...bank, status: 'approved', approvedBy: 'self' })).not.toEqual([]);
    expect(validateIaReviewBank({ ...bank, cases: [] })).toContain('sources and cases must both be nonempty');
    expect(validateIaReviewBank({ ...bank, cases: [bank.cases[0], bank.cases[0]] })).toContain(`duplicate case ${bank.cases[0].id}`);
  });

  it('refuses unresolved sources, invented corpus verification and candidate verdicts', () => {
    const item = bank.cases[0];
    expect(validateIaReviewBank({ ...bank, cases: [{ ...item, sourceIds: ['invented'] }] })).toContain(`${item.id}: unresolved source reference`);
    expect(validateIaReviewBank({ ...bank, sources: [{ ...bank.sources[0], fullTextCorpusVerified: true }, ...bank.sources.slice(1)] })).not.toEqual([]);
    expect(validateIaReviewBank({ ...bank, cases: [{ ...item, candidateContent: 'fiction', verdict: 'PASS' }] }))
      .toContain(`${item.id}: fabricated candidate or verdict must not be part of this bank`);
  });

  it('keeps authority types and a source revision rather than passing harmonization off as local law', () => {
    const canadian = bank.sources.find(s => s.id === 'CA-GCP')!;
    expect(canadian.authorityType).toBe('guidance');
    expect(canadian.revision).toBe('GUI-0100-v4-2026-08-14');
    const china = bank.cases.find(c => c.id === 'CN-ivd-dossier')!;
    expect(china.expectedBehavior.mustAvoid).toContain('Treating the general-device source as the complete IVD-specific rule set');
  });
});

describe('pinned IA capture is actual output and pending human review', () => {
  it.each(['max_tokens', 'tool_use', 'unknown', 'aborted'])('partial or non-text IA output is incomplete and stops follow-ups: %s', async finishReason => {
    const evaluateModel = vi.fn().mockResolvedValue({ content: 'A partial answer', resolvedModel: entry.pinnedVersion,
      provider: entry.provider, cached: false, deterministic: false, finishReason });
    const result = await captureIaReview(single('US-device-predicate'), entry, { evaluateModel: evaluateModel as never });
    expect(result.status).toBe('INCOMPLETE'); expect(result.attributableTurns).toBe(0); expect(evaluateModel).toHaveBeenCalledTimes(1);
    expect(result.cases[0].turns[0]).toMatchObject({ finishReason, attributionVerified: false, errorCode: 'incomplete-provider-output' });
  });
  it('uses only the canonical IA policy and source context, keeping expected answers out of the prompt', async () => {
    const evaluateModel = vi.fn().mockResolvedValue(provider('Which diagnostic claim do you intend?'));
    const b = single('IA-clear-definition');
    const result = await captureIaReview(b, entry, { evaluateModel });
    const [model, request] = evaluateModel.mock.calls[0];
    expect(model).toBe(entry.id);
    expect(request.messages[0]).toEqual({ role: 'system', origin: 'app', content: ANA_INTELLIGENT_AWARENESS });
    expect(request.messages.at(-1).content).toBe(b.cases[0].initialUserMessage);
    expect(JSON.stringify(request.messages)).not.toContain(JSON.stringify(b.cases[0].expectedBehavior));
    expect(request.taskType).toBe('regulatory_review');
    expect(request.riskTier).toBe('high');
    expect(result.status).toBe('PENDING_REVIEW');
    expect(result.policySha256).toBe(hash(ANA_INTELLIGENT_AWARENESS));
    // The stub above asks an unnecessary question on purpose. The runner must
    // capture it for reviewer criticism rather than declaring the model correct.
    expect(result.cases[0].reviewer.status).toBe('pending');
    expect(Object.values(result.cases[0].reviewer.dimensionScores)).toEqual(IA_REVIEW_DIMENSIONS.map(() => null));
    expect(result.cases[0].reviewer.criticalFailures).toBeNull();
    expect(JSON.stringify(result)).not.toContain('"PASS"');
  });

  it('carries the real earlier assistant reply and user correction into a follow-up request', async () => {
    const evaluateModel = vi.fn()
      .mockResolvedValueOnce(provider('First real output: the intended-use comparison remains open.'))
      .mockResolvedValueOnce(provider('Second real output: the diagnostic claim materially changes this review.'));
    const result = await captureIaReview(single(), entry, { evaluateModel });
    const second = evaluateModel.mock.calls[1][1].messages;
    expect(second.at(-2)).toEqual({ role: 'assistant', content: 'First real output: the intended-use comparison remains open.' });
    expect(second.at(-1).content).toContain('atrial fibrillation diagnosis');
    const turns = result.cases[0].turns;
    expect(turns[0].requestMessages).toHaveLength(3);
    expect(turns[1].requestMessages).toHaveLength(5);
    expect(turns[0].response).toContain('First real output');
    expect(turns[0].requestSha256).toBe(hash(JSON.stringify(turns[0].requestMessages)));
    expect(turns[1].responseSha256).toBe(hash(turns[1].response!));
    expect(result.attributableTurns).toBe(2);
    expect(result.status).toBe('PENDING_REVIEW');
  });

  it('copies dispatch messages so provider mutation cannot rewrite the recorded request', async () => {
    const evaluateModel = vi.fn(async (_model, request) => {
      request.messages[0].content = 'mutated by provider';
      return provider('captured response');
    });
    const result = await captureIaReview(single('IA-clear-definition'), entry, { evaluateModel });
    expect(result.cases[0].turns[0].requestMessages[0].content).toBe(ANA_INTELLIGENT_AWARENESS);
  });

  it.each([
    ['wrong version', 'another-model-version', entry.provider],
    ['unreported version', undefined, entry.provider],
    ['wrong provider', entry.pinnedVersion, 'openai'],
  ])('withholds attribution and follow-up on %s', async (_label, model, servedProvider) => {
    const evaluateModel = vi.fn().mockResolvedValue({ content: 'Output from the provider', resolvedModel: model, provider: servedProvider, cached: false, deterministic: false, finishReason: 'stop' } as never);
    const result = await captureIaReview(single(), entry, { evaluateModel });
    expect(evaluateModel).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('INCOMPLETE');
    expect(result.capturedTurns).toBe(1);
    expect(result.attributableTurns).toBe(0);
    expect(result.cases[0].plannedTurns).toBe(2);
    expect(result.cases[0].turns[0].executionStatus).toBe('unattributable');
  });

  it('does not invent a response or export raw secrets when the provider refuses execution', async () => {
    const evaluateModel = vi.fn().mockRejectedValue(new Error('secret-token-MUST-NOT-EXPORT'));
    const result = await captureIaReview(single(), entry, { evaluateModel });
    expect(result.status).toBe('NOT_EXECUTED');
    expect(evaluateModel).toHaveBeenCalledTimes(1);
    expect(result.capturedTurns).toBe(0);
    expect(result.cases[0].turns[0].response).toBeNull();
    expect(result.cases[0].turns[0].errorCode).toBe('gateway-call-failed');
    expect(JSON.stringify(result)).not.toContain('secret-token');
  });

  it('records a partially executed conversation as incomplete and preserves the successful turn', async () => {
    const evaluateModel = vi.fn().mockResolvedValueOnce(provider('Real first response')).mockRejectedValueOnce(new Error('failed'));
    const result = await captureIaReview(single(), entry, { evaluateModel });
    expect(result.status).toBe('INCOMPLETE');
    expect(result.capturedTurns).toBe(1);
    expect(result.cases[0].turns[1].response).toBeNull();
    expect(result.cases[0].turns[0].response).toBe('Real first response');
  });

  it('does not count an empty response as an executed assessment', async () => {
    const evaluateModel = vi.fn().mockResolvedValue(provider(' \n '));
    const result = await captureIaReview(single('IA-clear-definition'), entry, { evaluateModel });
    expect(result.status).toBe('NOT_EXECUTED');
    expect(result.cases[0].turns[0].errorCode).toBe('empty-response');
  });

  it('refuses an invalid bank before spending tokens', async () => {
    const evaluateModel = vi.fn();
    await expect(captureIaReview({ ...bank, cases: [] }, entry, { evaluateModel })).rejects.toThrow('case bank refused');
    expect(evaluateModel).not.toHaveBeenCalled();
  });
});

describe('existing PQ runner supplemental mode', () => {
  it('writes a separate transcript record that cannot claim to be passed PQ evidence', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'ana-ia-review-'));
    directories.push(directory);
    const evaluateModel = vi.fn().mockResolvedValue(provider('Actual captured stub output; expertise not graded.'));
    const result = await runIaReview({ modelId: entry.id, record: true, outDir: directory, gateway: { evaluateModel } });
    const record = JSON.parse(readFileSync(result.recordPath!, 'utf8'));
    expect(evaluateModel).toHaveBeenCalledTimes(39);
    expect(record.kind).toBe('ia-review-capture');
    expect(record.bankStatus).toBe('reviewer-draft');
    expect(record.verdict).toBeUndefined();
    expect(record.status).toBe('PENDING_REVIEW');
    expect(record.bankSha256).toBe(hash(readFileSync(path.resolve('server/eval/pq/ia-review-cases.json'), 'utf8')));
    expect(record.cases.every((c: { reviewer: { status: string } }) => c.reviewer.status === 'pending')).toBe(true);
    expect(record.sources).toHaveLength(20);
  });

  it('refuses an unknown model before dispatch', async () => {
    const evaluateModel = vi.fn();
    await expect(runIaReview({ modelId: 'unregistered-model', gateway: { evaluateModel } })).rejects.toThrow('not in approved-models');
    expect(evaluateModel).not.toHaveBeenCalled();
  });

  it('preflights without a provider and exposes only credential presence, never values', () => {
    for (const name of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'MOONSHOT_API_KEY', 'GOOGLE_API_KEY']) vi.stubEnv(name, '');
    vi.stubEnv('OPENAI_API_KEY', 'secret-value-not-for-records');
    const result = preflightIaReview();
    expect(result.status).toBe('PREPARED_NOT_QUALIFIED');
    expect(result.caseCount).toBe(34);
    expect(result.plannedTurns).toBe(39);
    expect(result.credentialPresence.OPENAI_API_KEY).toBe(true);
    expect(result.credentialPresence.ANTHROPIC_API_KEY).toBe(false);
    expect(JSON.stringify(result)).not.toContain('secret-value');
    expect(result.protocol.status).toBe('draft');
  });
});
