/**
 * EvidenceManagementService.extractDataFromFile — a failed extraction must not
 * be reported as an empty one.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * The method used to end with:
 *
 *     const extracted = JSON.parse(response.choices[0]?.message?.content || '{}');
 *     return { test_type: extracted.test_type || this.inferTestType(fileName),
 *              test_standard: extracted.test_standard || null, …,
 *              ai_extracted: true };
 *
 * A model reply that was empty, truncated, or wrapped in prose parsed to `{}`
 * (or threw into a catch that at least degraded honestly). On the `{}` path
 * every field fell through to null — and `ai_extracted: true` still claimed the
 * model had read the document. Downstream, "the AI examined this test report and
 * found no test standard, no date and no laboratory" is indistinguishable from
 * "the call did not work", and for a 510(k) evidence file the two have opposite
 * consequences: one is a gap the submitter must fill, the other is a retry.
 *
 * That is precisely what this repo's working agreement forbids — "fail closed,
 * never fabricate … an error is never rendered as an empty result".
 *
 * The fallback path is honest and already existed: basicDataExtraction() returns
 * `ai_extracted: false`. The defect was never reaching it.
 *
 * The same change routed this call through the governed AI gateway (WO-6); it
 * had been sending 4,000 characters of an uploaded customer file straight to
 * gpt-4o, where the gateway's PII/PHI screen never saw it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { completeSpy } = vi.hoisted(() => ({ completeSpy: vi.fn() }));

vi.mock('../../lib/unified-ai-client', () => ({
  aiComplete: completeSpy,
  ai: { complete: completeSpy },
  default: { complete: completeSpy },
}));

vi.mock('../../db', () => {
  const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
  return { pool, db: { execute: vi.fn().mockResolvedValue({ rows: [] }) } };
});

import { EvidenceManagementService } from '../EvidenceManagementService';

const svc = new EvidenceManagementService();

const REPORT = 'Biocompatibility per ISO 10993-5. Test date 2026-03-04. Result: Pass.';

beforeEach(() => {
  completeSpy.mockReset();
});

describe('extractDataFromFile distinguishes "found nothing" from "did not work"', () => {
  it('reports ai_extracted: false when the model returns an empty object', async () => {
    completeSpy.mockResolvedValue('{}');

    const out = await svc.extractDataFromFile(REPORT, 'iso-10993-5.pdf', 'application/pdf');

    // The old code returned ai_extracted: true here, with every field null.
    expect(out.ai_extracted).toBe(false);
  });

  it('reports ai_extracted: false when the model returns unparseable text', async () => {
    completeSpy.mockResolvedValue('Sure! Here is the JSON you asked for: {test_type:');

    const out = await svc.extractDataFromFile(REPORT, 'iso-10993-5.pdf', 'application/pdf');

    expect(out.ai_extracted).toBe(false);
  });

  it('reports ai_extracted: false when the call throws', async () => {
    completeSpy.mockRejectedValue(new Error('gateway refused: content screen'));

    const out = await svc.extractDataFromFile(REPORT, 'iso-10993-5.pdf', 'application/pdf');

    expect(out.ai_extracted).toBe(false);
  });

  /**
   * The other edge. A service that answered `ai_extracted: false` to everything
   * would pass all three cases above and be useless — so pin the success path
   * too, including a null field, which is a legitimate extraction result and
   * must NOT be mistaken for a failure.
   */
  it('reports ai_extracted: true on a real extraction, nulls included', async () => {
    completeSpy.mockResolvedValue(
      JSON.stringify({
        test_type: 'biocompatibility',
        test_standard: 'ISO 10993-5',
        test_date: '2026-03-04',
        testing_laboratory: null,
        device_component: null,
        test_results: 'Pass',
        key_findings: null,
        deviations: null,
      }),
    );

    const out = await svc.extractDataFromFile(REPORT, 'iso-10993-5.pdf', 'application/pdf');

    expect(out.ai_extracted).toBe(true);
    expect(out.test_standard).toBe('ISO 10993-5');
    expect(out.results).toBe('Pass');
    expect(out.test_lab).toBeNull();
  });

  it('sends the document as a user turn, not inside the instructions', async () => {
    completeSpy.mockResolvedValue('{"test_type":"bench test"}');

    await svc.extractDataFromFile(REPORT, 'iso-10993-5.pdf', 'application/pdf');

    const { messages } = completeSpy.mock.calls[0][0];
    const system = messages.find((m: { role: string }) => m.role === 'system');
    const user = messages.find((m: { role: string }) => m.role === 'user');

    // An uploaded evidence file comes from a contract lab or a supplier — it is
    // untrusted input. Interpolating it into the instruction block, as the old
    // prompt did, let the document restate the instructions.
    expect(system).toBeTruthy();
    expect(user.content).toContain('ISO 10993-5');
    expect(system.content).not.toContain('ISO 10993-5');
  });

  it('caps how much of the file is sent to the provider', async () => {
    completeSpy.mockResolvedValue('{"test_type":"bench test"}');

    await svc.extractDataFromFile('x'.repeat(50_000), 'huge.pdf', 'application/pdf');

    const { messages } = completeSpy.mock.calls[0][0];
    const user = messages.find((m: { role: string }) => m.role === 'user');
    expect(user.content.length).toBeLessThan(5_000);
  });
});
