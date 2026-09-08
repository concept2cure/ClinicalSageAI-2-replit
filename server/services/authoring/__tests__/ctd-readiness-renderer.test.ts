/**
 * CTD readiness PDF renderer — produces valid, deterministic PDF bytes from a
 * rollup verdict.
 */

import { describe, it, expect } from 'vitest';
import { renderCtdReadinessPdf, readinessVerdict } from '../ctd-readiness-renderer';
import type { CtdAuthoringReadinessResult } from '../ctd-authoring-readiness';

const ready: CtdAuthoringReadinessResult = {
  ready: true,
  assessed: true,
  modules: [
    { module: 'M1', present: true, ready: true, errors: 0, warnings: 0 },
    { module: 'M2', present: true, ready: true, errors: 0, warnings: 1 },
    { module: 'M5', present: false, ready: false, errors: 0, warnings: 0 },
  ],
  findings: [{ area: 'M2', severity: 'warning', code: 'LOW_COMPLETENESS', message: '2.3 completeness 60%.' }],
  counts: { errors: 0, warnings: 1 },
};

const notReady: CtdAuthoringReadinessResult = {
  ready: false,
  assessed: true,
  modules: [{ module: 'M4', present: true, ready: false, errors: 1, warnings: 0 }],
  findings: [{ area: 'M4', severity: 'error', code: 'MODULE_NOT_READY', message: 'Module 4 not ready.' }],
  counts: { errors: 1, warnings: 0 },
};

describe('renderCtdReadinessPdf', () => {
  it('renders valid PDF bytes', async () => {
    const pdf = await renderCtdReadinessPdf(ready);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('is deterministic for the same verdict', async () => {
    const a = await renderCtdReadinessPdf(ready);
    const b = await renderCtdReadinessPdf(ready);
    expect(a.equals(b)).toBe(true);
  });

  it('renders a not-ready verdict without throwing', async () => {
    const pdf = await renderCtdReadinessPdf(notReady);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('handles an empty rollup (no modules / findings) — and never calls it ready', async () => {
    const empty: CtdAuthoringReadinessResult = { ready: false, assessed: false, modules: [], findings: [], counts: { errors: 0, warnings: 0 } };
    const pdf = await renderCtdReadinessPdf(empty);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // The verdict used to be "READY — no blocking findings" over nothing assessed.
    expect(readinessVerdict(empty)).toMatch(/^NOT ASSESSED/);
    expect(readinessVerdict(empty)).not.toMatch(/READY — no blocking/);
    expect(readinessVerdict(ready)).toBe('READY — no blocking findings');
    expect(readinessVerdict(notReady)).toBe('NOT READY — blocking findings present');
  });
});
