/**
 * Deterministic deficiency scan — runs the REAL pattern registry through the
 * registered handler (no LLM, no DB, no mocks). Asserts known trigger phrases
 * fire and that filtering/empty cases behave.
 */
import { describe, it, expect } from 'vitest';
// Importing the executor registers every handler as a side effect.
import { getToolHandler } from '../AnaToolExecutor';

const handler = () => getToolHandler('scan_regulatory_deficiencies')!;

describe('scan_regulatory_deficiencies (deterministic, no LLM)', () => {
  it('is registered', () => {
    expect(typeof getToolHandler('scan_regulatory_deficiencies')).toBe('function');
  });

  it('fires on a known reviewer-trigger phrase and labels itself LLM-free', async () => {
    const raw = await handler()(
      {
        text: 'The therapy produced a clinically meaningful improvement in the primary endpoint.',
        location: '2.5 Clinical Overview',
      },
      {}
    );
    const res = JSON.parse(raw);
    expect(res.engine).toBe('deterministic pattern registry (no LLM)');
    expect(res.findingsCount).toBeGreaterThan(0);
    // Each finding carries actionable, citable detail.
    const f = res.findings[0];
    expect(f).toHaveProperty('severity');
    expect(f).toHaveProperty('reviewerQuestion');
    expect(f).toHaveProperty('remediation');
    expect(res.location).toBe('2.5 Clinical Overview');
  });

  it('returns an honest empty result (no false negatives implied) for benign text', async () => {
    const raw = await handler()(
      { text: 'The table of contents lists each appendix in numerical order.' },
      {}
    );
    const res = JSON.parse(raw);
    expect(res.findingsCount).toBe(0);
    expect(res.message).toMatch(/not proof of soundness/i);
  });

  it('requires non-empty text', async () => {
    const res = JSON.parse(await handler()({ text: '   ' }, {}));
    expect(res.error).toMatch(/requires text/i);
  });

  it('is deterministic — identical input yields identical findings count', async () => {
    const input = { text: 'Preliminary stability data supports a shelf life of 24 months.' };
    const a = JSON.parse(await handler()(input, {}));
    const b = JSON.parse(await handler()(input, {}));
    expect(a.findingsCount).toBe(b.findingsCount);
  });
});
