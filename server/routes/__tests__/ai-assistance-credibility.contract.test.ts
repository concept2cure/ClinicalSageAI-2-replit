/**
 * A credibility score must come from the verification, not from the source.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * POST /api/ai-assistance/verify builds a prompt ending "Rate credibility
 * 0-100.", sends it to the model, and then never parsed a score out of the
 * reply. Every branch returned a constant:
 *
 *   AI-Gateway / Claude success   credibility: 85
 *   legacy OpenAI success         credibility: 85
 *   template fallback             credibility: 75  // "Default template credibility"
 *   catch (service failed)        credibility: 0
 *
 * So the number a regulatory reviewer read was fixed before the request was
 * made. The 75 is the starkest — no model ran at all in that branch — and the 0
 * is the most misleading, because zero credibility is a verdict about the
 * content when what happened was that the verifier crashed.
 *
 * Two more inventions in the same object:
 *   - `sources_verified: sources.length` counted the sources the CALLER
 *     supplied. Nothing checks that any of them exists; they are interpolated
 *     into the prompt as text. Renamed `sources_supplied`.
 *   - `recommendations` was the model's prose split on newlines, first five
 *     non-empty lines, relabelled as recommendations. Removed — the full
 *     `analysis` was already returned alongside it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const complete = vi.fn();
// The route does `const mod = await import('../lib/unified-ai-client.js');
// unifiedAI = mod.ai;` at module load, so the mock must expose `ai` and must
// match the '.js'-suffixed specifier.
vi.mock('../../lib/unified-ai-client.js', () => ({
  ai: { complete: (...a: unknown[]) => complete(...a) },
}));

let router: express.Router;
beforeEach(async () => {
  vi.resetModules();
  complete.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  router = (await import('../ai-assistance')).default as express.Router;
  // The dynamic import that assigns `unifiedAI` resolves on a microtask.
  await new Promise(r => setImmediate(r));
});
afterEach(() => vi.restoreAllMocks());

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/ai-assistance', router);
  return a;
}

const BODY = { content: 'The device met its primary endpoint.', sources: ['a.pdf', 'b.pdf'] };

describe('POST /verify never invents a credibility score', () => {
  it('does not return 85 for every successful verification', async () => {
    complete.mockResolvedValue('Credibility: 42\nThe claim is unsupported by the cited sources.');

    const res = await request(app()).post('/api/ai-assistance/verify').send(BODY);

    // The load-bearing assertion: the score tracks the model, not a literal.
    expect(res.body.credibility).toBe(42);
    expect(res.body.credibility).not.toBe(85);
    expect(res.body.credibilityBasis).toMatch(/parsed from the model/i);
  });

  it('reports no score when the model did not give one', async () => {
    complete.mockResolvedValue('This content contains several unsupported claims.');

    const res = await request(app()).post('/api/ai-assistance/verify').send(BODY);

    expect(res.body.credibility).toBeNull();
    expect(res.body.credibilityBasis).toMatch(/did not return a parseable/i);
    // Absent, not defaulted to something plausible.
    expect(res.body.credibility).not.toBe(85);
    expect(res.body.credibility).not.toBe(0);
  });

  it('counts sources supplied, and does not call them verified', async () => {
    complete.mockResolvedValue('Credibility: 60');

    const res = await request(app()).post('/api/ai-assistance/verify').send(BODY);

    expect(res.body.sources_supplied).toBe(2);
    expect(res.body.sources_verified).toBeUndefined();
  });

  it('does not relabel the model prose as recommendations', async () => {
    complete.mockResolvedValue('Credibility: 60\nline one\nline two\nline three');

    const res = await request(app()).post('/api/ai-assistance/verify').send(BODY);

    expect(res.body.recommendations).toBeUndefined();
    // The analysis itself is still returned in full.
    expect(res.body.analysis).toContain('line two');
  });
});

describe('the branches where nothing verified anything', () => {
  it('scores nothing when every provider is unavailable', async () => {
    complete.mockRejectedValue(new Error('provider down'));

    const res = await request(app()).post('/api/ai-assistance/verify').send(BODY);

    // Was `credibility: 75`, commented "Default template credibility".
    expect(res.body.credibility).toBeNull();
    expect(res.body.isRealAI).toBe(false);
    expect(res.body.credibilityBasis).toMatch(/no verification was performed/i);
    // The checklist survives but is named for what it is.
    expect(Array.isArray(res.body.genericChecklist)).toBe(true);
    expect(res.body.note).toMatch(/identical for every input/i);
  });

  it('never presents the standing checklist as a finding about the content', async () => {
    complete.mockRejectedValue(new Error('provider down'));

    const res = await request(app()).post('/api/ai-assistance/verify').send(BODY);

    expect(res.body.analysis).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('Template-based verification.');
  });
});
