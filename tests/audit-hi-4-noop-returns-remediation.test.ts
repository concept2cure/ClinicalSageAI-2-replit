/**
 * Forensic audit HI-4 — empty/no-op service returns presented as results
 *
 * Locks in the fixes from FORENSIC_CODE_AUDIT_2026-05-29.md HI-4:
 *  - export-service: no fabricated success-probability or summary report written
 *    into a user's exported archive; the broken relative-fetch protocol path is
 *    replaced with an honest null.
 *  - eventBus: createSubmissionContainer no longer returns success:true with a
 *    fabricated containerId when nothing was created.
 *
 * Source-integrity guards (these services import the storage/DB layer at module
 * load, so behavioral import is avoided in favor of durable source assertions —
 * the same style as the repo's CI guards).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SERVER = path.resolve(__dirname, '../server');
const read = (rel: string) => fs.readFileSync(path.join(SERVER, rel), 'utf8');

describe('HI-4 · export-service does not fabricate export content', () => {
  const src = read('services/export-service.ts');

  it('getPredictionResults no longer emits a hardcoded probability', () => {
    expect(src).not.toContain('probability: 0.83');
    expect(src).not.toContain("method: 'Monte Carlo simulation'");
  });

  it('getSummaryReport no longer emits a fabricated study summary', () => {
    expect(src).not.toContain('This is a Phase 2 clinical trial');
    expect(src).not.toContain('120 participants');
  });

  it('getLatestProtocol no longer issues a server-side relative fetch', () => {
    expect(src).not.toContain("fetch(`/api/protocol/get-latest");
  });
});

describe('HI-4 · eventBus does not claim phantom success', () => {
  const src = read('services/eventBus.js');

  it('createSubmissionContainer does not return a fabricated success/containerId', () => {
    const fn = src.slice(src.indexOf('async createSubmissionContainer'));
    const body = fn.slice(0, fn.indexOf('\n  }') + 4);
    expect(body).not.toContain('success: true');
    expect(body).not.toContain('containerId: `ectd_${data.packageId}`');
    // It must report the honest, unimplemented state instead.
    expect(body).toContain('implemented: false');
  });
});
