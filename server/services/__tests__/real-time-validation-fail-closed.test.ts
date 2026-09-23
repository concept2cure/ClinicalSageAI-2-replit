/**
 * run_validation must not report "validated" for content it did not validate.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Three stacked catches turned an AI failure into a pass:
 *   1. analyzeContentWithAI caught everything and returned no issues;
 *   2. performValidation wrapped that in another catch that only logged;
 *   3. the run_validation handler caught a service failure, ran two regexes,
 *      and still set the target 'validated' with "Validation passed — promote".
 * A refusal, an outage or an unparseable reply all came out `isValid: true`.
 * The AI also only ever saw the first 3,000 characters and said nothing about
 * the rest. And it pinned gpt-4o, which is not approved for regulatory review.
 *
 * The unified AI client is the only thing replaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const chat = vi.fn();
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: (...a: unknown[]) => chat(...a) } }));

let registered: any = null;
vi.mock('../ai-actions/action-registry', () => ({
  registerActionHandler: (h: unknown) => {
    registered = h;
  },
}));

import { AI_ANALYSIS_MAX_CHARS, realTimeValidationService } from '../realTimeValidationService';
import { ModelNotApprovedError } from '../ai-gateway/gateway';

const clean = JSON.stringify({ issues: [], suggestions: [] });
let seq = 0;
const validate = (content: string) =>
  realTimeValidationService.validateContent(`s-${(seq += 1)}`, content, 'regulatory_submission', true);

/**
 * Make the next AI call fail.
 *
 * There is deliberately no `beforeEach(() => chat.mockReset())` here. Under
 * vitest 4.1.7 that reset makes a test fail on an AI rejection even when the
 * code under test catches it — measured in isolation: the same product code
 * resolved `isValid: false` in every variant, and only the variants with the
 * reset were reported failing. Each test sets its own implementation, and
 * tests/setup.ts clears call history after every test.
 */
function rejectWith(err: Error) {
  chat.mockImplementation(async () => {
    throw err;
  });
}

describe('the validation service', () => {
  it('control — a short document the AI analysed in full, with nothing wrong, is valid', async () => {
    chat.mockResolvedValue({ content: clean });
    const r = await validate('Introduction. The device is intended for...');
    expect(r.aiAnalysis.status).toBe('complete');
    expect(r.isValid).toBe(true);
  });

  it('routes the analysis as regulatory review, with no model pinned', async () => {
    chat.mockResolvedValue({ content: clean });
    await validate('Introduction.');
    const [req] = chat.mock.calls[0] as [Record<string, unknown>];
    expect(req.taskType).toBe('regulatory_review');
    expect(req.model).toBeUndefined();
  });

  it('a model-approval refusal is NOT a pass', async () => {
    rejectWith(new ModelNotApprovedError('regulatory_review', ['gpt-4o'], 'no-approved-model'));
    const r = await validate('Introduction.');
    expect(r.isValid).toBe(false);
    expect(r.aiAnalysis.status).toBe('not_run');
    expect(r.aiAnalysis.note).toMatch(/did not run/);
  });

  it('an outage is NOT a pass', async () => {
    rejectWith(new Error('ECONNRESET'));
    expect((await validate('Introduction.')).isValid).toBe(false);
  });

  it('an unparseable reply is NOT a pass', async () => {
    chat.mockResolvedValue({ content: 'Sure! Here are some thoughts on your document…' });
    const r = await validate('Introduction.');
    expect(r.isValid).toBe(false);
    expect(r.aiAnalysis.status).toBe('not_run');
  });

  it('a reply with no issues list is NOT "no issues"', async () => {
    chat.mockResolvedValue({ content: '{}' });
    expect((await validate('Introduction.')).isValid).toBe(false);
  });

  it('content longer than the analysis window is partial, says how much was read, and is not valid', async () => {
    chat.mockResolvedValue({ content: clean });
    const long = `Introduction. ${'x'.repeat(AI_ANALYSIS_MAX_CHARS + 500)}`;
    const r = await validate(long);
    expect(r.aiAnalysis.status).toBe('partial');
    expect(r.aiAnalysis.analysedChars).toBe(AI_ANALYSIS_MAX_CHARS);
    expect(r.aiAnalysis.totalChars).toBe(long.length);
    expect(r.aiAnalysis.note).toMatch(/was not analysed/);
    expect(r.isValid).toBe(false);
    const [req] = chat.mock.calls[0] as [{ messages: Array<{ content: string }> }];
    expect(req.messages[1].content.length).toBe(AI_ANALYSIS_MAX_CHARS);
  });
});

describe('the run_validation action', () => {
  const ctx = { db: {}, actionId: 'a-1', user: { userId: 1, organizationId: 2 } } as any;
  const run = (content: string) =>
    registered.execute({ actionType: 'run_validation', targetType: 'artifact', payload: { content } }, ctx);

  beforeEach(async () => {
    await import('../ai-actions/handlers/run-validation');
    expect(registered, 'handler did not register').toBeTruthy();
  });

  it('control — a complete, clean validation marks the target validated and offers promotion', async () => {
    chat.mockResolvedValue({ content: clean });
    const r = await run('Introduction. Purpose of this submission.');
    expect(r.updatedObjects[0].status).toBe('validated');
    expect(r.nextActions?.some((a: any) => a.actionType === 'promote_artifact') ?? true).toBe(true);
  });

  it('when the AI analysis did not run, the target is needs_review and the author is told why', async () => {
    rejectWith(new Error('provider down'));
    const r = await run('Introduction. Purpose of this submission.');
    expect(r.updatedObjects[0].status).toBe('needs_review');
    expect(r.warnings.join(' ')).toMatch(/did not run/);
    expect(JSON.stringify(r)).not.toMatch(/Validation passed/);
  });

  it('the degraded fallback is never a validation', async () => {
    const spy = vi.spyOn(realTimeValidationService, 'validateContent').mockRejectedValueOnce(new Error('service unavailable'));
    const r = await run('Introduction. Purpose of this submission.');
    expect(r.updatedObjects[0].status).toBe('needs_review');
    expect(r.warnings.join(' ')).toMatch(/not a validation/);
    expect(JSON.stringify(r)).not.toMatch(/Validation passed/);
    spy.mockRestore();
  });
});
