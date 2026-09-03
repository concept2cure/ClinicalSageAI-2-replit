/**
 * `expectBlocked` files a thrown error as the block the step exists to prove,
 * because that is how a service-level block manifests. It must not extend that
 * courtesy to the test's own assertions: an `expect` failing inside a known-bad
 * step is the journey failing, and before this test it was recorded as
 * `blocked-as-expected` (found while closing ledger L146 — a guard that could
 * never fire).
 */
import { describe, it, expect } from 'vitest';
import { JourneyRecorder } from '../harness';

const recorder = () => new JourneyRecorder('recorder-test', 'unit test of expectBlocked');

describe('JourneyRecorder.expectBlocked', () => {
  it('records a thrown non-assertion error as the block (service-level semantics)', async () => {
    const R = recorder();
    const evidence = await R.expectBlocked('service-throws', async () => {
      throw new Error('forbidden: cross-tenant read');
    });
    expect(evidence).toEqual({ thrown: 'forbidden: cross-tenant read' });
    expect(R.manifest().summary.blockedAsExpected).toBe(1);
  });

  it('rethrows an assertion failure inside the step and files the step as failed', async () => {
    const R = recorder();
    await expect(
      R.expectBlocked('assertion-fails-inside', async () => {
        expect(1).toBe(2);
        return { blocked: true };
      }),
    ).rejects.toMatchObject({ name: 'AssertionError' });
    const m = R.manifest();
    expect(m.summary.failed).toBe(1);
    expect(m.summary.blockedAsExpected).toBe(0);
  });

  it('rejects a step that returns blocked: false', async () => {
    const R = recorder();
    await expect(
      R.expectBlocked('allowed', async () => ({ blocked: false })),
    ).rejects.toThrow(/expected a block/);
    expect(R.manifest().summary.failed).toBe(1);
  });
});
