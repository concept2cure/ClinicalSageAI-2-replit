/**
 * scripts/demo/ivd-lifecycle-walkthrough.ts imports and runs (2026-10-15).
 *
 * The walkthrough imported buildPsur from server/services/postmarket/report-authoring.ts,
 * which was retired on 2026-10-05 (the one PSUR builder is gspr-postmarket/
 * post-market-authoring.ts authorPostMarketDocument), so `npx tsx` failed at import
 * with "does not provide an export named 'buildPsur'". Nothing ran it: scripts/ is in
 * neither the typecheck nor the test include. The PSUR step now names that builder and
 * runs nothing (it persists to the database, and this walkthrough is database-free).
 */
import { it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

it('imports and runs to the end, naming the canonical PSUR builder instead of building one', async () => {
  const lines: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });

  await import('../../scripts/demo/ivd-lifecycle-walkthrough');

  const out = lines.join('\n');
  expect(out).toMatch(/IVD LIFECYCLE WALKTHROUGH/);
  expect(out).toMatch(/EU market access — IVDR registration/);
  // The PSUR step names the one builder and its route; it does not report a PSUR it never built.
  expect(out).toMatch(/authorPostMarketDocument/);
  expect(out).toMatch(/\/documents\/psur\/generate/);
  expect(out).not.toMatch(/PSUR valid:/);
  // §524B is not applied to a device whose cyber-device status the scenario does not state.
  expect(out).toMatch(/§524B: undetermined/);
}, 60_000);
