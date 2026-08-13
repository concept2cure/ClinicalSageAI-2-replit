/**
 * Contract: the legacy fabricated-FDA-submission surface stays deleted.
 *
 * server/routes/medical-device-routes.js carried POST
 * /api/medical-devices/510k/:submissionId/submit, which historically fabricated
 * an FDA agency response with no environment gate: a minted `ACK<timestamp>`
 * identifier, a synthetic K-number, a fabricated "Submission Received" status
 * with a 90-day review estimate, and a "510(k) submitted to FDA successfully"
 * message — and it wrote submissionStatus 'submitted' to the database for a
 * transmission that never happened.
 *
 * In the Phase 1 consolidation the whole route file was deleted (zero client
 * callers; the canonical 510(k) surface is /api/510k/estar/* + /api/510k/device/*
 * and the honest transmission seam is ESGSubmissionService — see
 * tests/fda-submission-honesty.contract.test.ts). An earlier version of this
 * file exercised the router's layers; with the router gone, this contract pins
 * the deletion itself so the fabrication cannot quietly return:
 *
 *   1. the route file does not exist on disk;
 *   2. nothing under server/bootstrap/ references it (so it cannot be mounted);
 *   3. no route code under server/ contains the fabrication strings
 *      (comment-stripped, same idiom as tests/regulatory-honesty.contract.test.ts).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Source with comments removed. Assertions here are about what the CODE does —
 * files may legitimately quote the removed fabrication strings in comments as
 * the record of why the endpoint is gone (same idiom as
 * tests/regulatory-honesty.contract.test.ts).
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Recursively collect source files under a directory. */
function sourceFilesUnder(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') stack.push(full);
      } else if (/\.(ts|js|mjs|cjs)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

describe('the legacy fabricated 510(k) FDA submit surface stays deleted', () => {
  it('server/routes/medical-device-routes.js does not exist', () => {
    expect(
      fs.existsSync(path.join(REPO_ROOT, 'server/routes/medical-device-routes.js')),
      'medical-device-routes.js is back on disk — the deleted fabrication surface has been reintroduced',
    ).toBe(false);
  });

  it('no bootstrap registrar references medical-device-routes', () => {
    const bootstrapFiles = sourceFilesUnder(path.join(REPO_ROOT, 'server/bootstrap'));
    // Guard against the sweep silently matching nothing.
    expect(bootstrapFiles.length).toBeGreaterThan(3);

    for (const file of bootstrapFiles) {
      const src = fs.readFileSync(file, 'utf8');
      expect(
        src.includes('medical-device-routes'),
        `${path.relative(REPO_ROOT, file)} references medical-device-routes — nothing may mount the deleted route file`,
      ).toBe(false);
    }
  });

  it('no route code under server/ contains the fabrication strings (comment-stripped)', () => {
    // Scope: route-layer code — server/**/routes/** and server/bootstrap/**.
    // Deliberately NOT all of server/: 'Submission Received' is a legitimate
    // PDUFA milestone name in server/services/global-ri/global-review-timeline.ts
    // (FDA receipt of an NDA/BLA — a real agency event, not a fabricated 510(k)
    // acknowledgement).
    const routeFiles = sourceFilesUnder(path.join(REPO_ROOT, 'server')).filter((f) => {
      const rel = path.relative(REPO_ROOT, f).replace(/\\/g, '/');
      return /\/routes\//.test(rel) || rel.startsWith('server/bootstrap/');
    });
    // Guard against the sweep silently matching nothing.
    expect(routeFiles.length).toBeGreaterThan(100);

    for (const file of routeFiles) {
      const stripped = stripComments(fs.readFileSync(file, 'utf8'));
      const rel = path.relative(REPO_ROOT, file);
      expect(
        stripped,
        `${rel} claims a 510(k) was submitted to FDA — that fabrication was deleted and must not return`,
      ).not.toMatch(/submitted to FDA successfully/i);
      expect(
        stripped,
        `${rel} fabricates a 'Submission Received' agency status in route code`,
      ).not.toMatch(/Submission Received/i);
    }
  });
});
